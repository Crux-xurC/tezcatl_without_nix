# `lib/vent/protocol.js`

The vent wire: encoding input, parsing messages.

**Decisions homed here**: [D-inject-as-is](#d-inject-as-is), [D-results-not-display](#d-results-not-display), [D-single-input](#d-single-input)

<a id="d-inject-as-is"></a>

## D-inject-as-is — append to `unread-command-events`

**Decided**: the InputEvents received are built into a `kbd` string (e.g. `"C-M-<f5>"`) and `kbd` itself does the modifier bits; the
result is appended to `unread-command-events`.

**Alternatives**: `execute-kbd-macro`; resolve a command name and `funcall` it; a daemon with a dedicated frame.

**Why not**: appended, the command loop picks them up as usual and keymaps are interpreted in Emacs — principle 4 holds
**structurally** (it cannot work otherwise), and the order is kept. Leaving the bits to `kbd` structurally guarantees a modifier is
never split from its key.

**What it removed**: the debate over "how much may be interpreted": there is no line to draw.

**Files**: `emacs-vent-in.el` (emacs-vent).

<a id="d-results-not-display"></a>

## D-results-not-display — carry computed results, never what is displayed

**Decided**

Output is sorted by its nature:

| Nature of the output | Examples | Treatment |
|---|---|---|
| structured data can be had directly | `magit-unstaged-files`, `directory-files-and-attributes`, `git ls-files -s` | use it |
| text in a specified format | unified diff, `git status --porcelain`, `path:line:col` | may be parsed |
| display formatted for people | Emacs overlays and faces, `tree`'s box drawing, `ls -l`'s columns, the `magit-status` buffer | **not carried — find another way** |

Never on the wire: buffer text, faces, text properties, overlays, `invisible` / `display` / `before-string` / `after-string`,
fringes, window splits.

**Alternatives**: send Emacs' buffer contents and display attributes and reproduce them faithfully in the browser (a second UI of
Emacs in the browser).

**Why not**: reproducing means taking on overlays' non-orthogonality (order and priority work in combination), the many shapes of
faces, position units (Emacs counts characters from 1, JS UTF-16 units from 0), and mode-specific drawing knowledge (reproducing
`magit-status` means knowing Magit's drawing rules). These grow with every Emacs package: there is no end.

**What it removed**: all four, and the endless question "how much must be synchronised".

**Earlier**: the first requirement documents said the opposite (Emacs owns the buffer, the browser is a display-only mirror). This
was **reversed**: the browser (CodeMirror) owns editing and Emacs displays nothing. The value of Magit is git porcelain's *logic*,
not its UI — that was the turning point.

**When instructing an LLM**: "do not carry display state" alone lets a parser of `tree`'s box drawing be written — and it works, so
the breach goes unseen. Give it the table above and this flow:

```
what data does the feature need (list it)
  → is there a function returning structured data   → query it; Tezcatl translates
  → is there an equivalent on the web side          → done in the browser
  → is it text in a specified format                → may be parsed
  → is it display formatted for people              → not carried; find another way
  → none of these                                   → discuss
```

**The same computation on both sides (syntax trees: tree-sitter / Lezer)**: syntax trees do not cross the wire. The parsing a
display or editing needs belongs to that surface (the browser's Lezer); Emacs' `treesit` is for Emacs' own editing. To use a
structural query only Emacs has, install that extension and write an intent: its result travels as values (ranges, kinds) and does
not compete with the browser's tree.

**Where diagnostics come from**: the browser's diagnostics have one source of truth, LSP. Emacs checkers drawn with overlays
(flymake, flycheck) are out by this decision. To see one in the browser, merge it through an opt-in intent after checking it
returns structured data — never an automatic stream.

**Files**: the whole design; in particular the Magit / dired / org views and the terminal outside Emacs (`D-pty-in-elixir`).

<a id="d-single-input"></a>

## D-single-input — vent-in takes one kind only: `input`

**Decided**: the only message kind from outside to Emacs is `input`. What is to be done is encoded on Tezcatl's side as a sequence
of InputEvents.

| To | Send |
|---|---|
| paste | the text as InputEvents |
| evaluate an expression | `M-:` + the expression's text + `RET` |
| run a command | `M-x` + its name + `RET` |
| open a file | `C-x C-f` + the path + `RET` |

**Alternatives**: a kind per purpose. `clipboard` (paste) and `eval` were made once and **removed**; `command.execute`,
`buffer.open`, `buffer.save` were candidates earlier.

**Why not**: each kind makes vent-in know a *meaning*, eroding principle 4 (do not interpret). Encoded as `M-:` and `M-x`, all the
meaning is Emacs' keymaps' and minibuffer's.

**What it removed**: branching per kind, judgement of meaning on Emacs' side, the debate over adding kinds.

**Trade-off (accepted)**: N characters = N events, the command loop turning N times. Emacs' uses (minibuffer, commit messages,
search) stay within hundreds of characters.

**Earlier**: the input schema itself was undecided (IME, paste, mouse, selection, drag and drop all open). With one kind, paste is
solved (text encoding) and mouse and drag are "not carried yet".

**Verified**: text input from the browser to Emacs (with blanks) works on the real machine.

**Files**: `emacs-vent-in.el` (emacs-vent), `lib/vent/protocol.js`, `lib/core/text.js`, `lib/core/kbd.js`, `lib/vent/input-panel.js`.

## Notes from verification

**Spec** — `parseMessage` returns `null`, never throws, for invalid JSON, a non-object, or a `kind` that is not a string: it does not rely on
emacs-vent-out never sending broken frames, and **validates in exactly one place on the receiving side** (mirroring vent-out's own stance,
per the comment).

**Does not** — interpret each `kind` (`context`, `event`, `flush`, `hello` are branched in each panel).

**Pitfalls** — arrays are excluded explicitly (`JSON.parse('[1,2]')` is an `object` but can have no `kind`) — a guard kept for its intent.
`encodeInput` copies `e.modifiers.slice()` (the caller's array is never changed). `{"kind":"input","sequence":[...]}` was checked against
emacs-vent-in's `emacs-vent-in--on-message` (`(plist-get msg :kind)`, `(plist-get msg :sequence)`).

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/vent/protocol.js`, 2026-09-10.)

Tezcatl <-> emacs-vent wire protocol (browser global + CommonJS module).

Outbound (browser -> emacs-vent-in): the "input" message, whose shape is
exactly what emacs-vent-in.el parses (design doc emacs-vent-in v0.2 §7;
field names -- kind / sequence / key / modifiers -- mirror emacs-vent-out's
own :kind convention, since the doc only pins key/modifiers at field level):

  {"kind":"input","sequence":[{"key":"x","modifiers":["meta"]}, ...]}

One keystroke is one message with a length-1 sequence; longer sequences are
only ever produced by the middleware layer.

Inbound (emacs-vent-out -> browser): hello / context / event / flush, each a
JSON object with a string "kind". parseMessage drops anything malformed
(returns null) rather than throwing -- mirrors vent-out's own posture.
events: array of normalized {key, modifiers} (see keymap.js). Returns the
wire message object; the caller serializes it (JSON.stringify).
text: a raw inbound frame. Returns the parsed message object, or null if
it is not valid JSON / not an object / has no string "kind".
