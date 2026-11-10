# `lib/core/lead.js`

The lead-key notation (`;cx`): its table, reader and parser.

**Decisions homed here**: [D-lead-key](#d-lead-key)

<a id="d-lead-key"></a>

## D-lead-key — keys pressed at the destination are written as a one-character prefix and one character; `;` by default

**Decided**: combinations browsers or the OS take (`Ctrl+W`, `Alt+x` …) and keys that are not characters in a form (arrows, `Return`) are
written as characters nobody takes and sent to the destination — the **lead key**.

- **The default is `;`**: in the same place on JIS and US layouts, no Shift needed. `ui.keys.lead` in `config.json` changes it (one
  printable character, not a letter)
- **After `;` always one character**; no `<…>` names. A character or key after a modifier is sent together with it. Modifiers stack
  (`;a;c;s;f5` is `C-M-S-<f5>`); the same modifier twice is an error

  | Kind | Written | Meaning |
  |---|---|---|
  | modifier (on the next key) | `;c` `;a` `;s` `;w` | Ctrl, Alt (Meta), Shift, Super. `;cx` is `C-x`, `;c;ax` `C-M-x`, `;c;h` `C-<left>` |
  | key (pressed at the destination) | `;h` `;j` `;k` `;l` | ← ↓ ↑ → |
  | | `;e` / `;q` | `Return` / `Escape` |
  | | `;t` / `;b` / `;d` | `Tab` / `Backspace` / `Delete` |
  | | `;f` and one character | F1–F12, the characters `1234567890-=` (the US number row; `ui.keys.fnRow`). `;c;f5` is `C-<f5>` |
  | character | `;;` | a plain `;` |
  | shortcut | `;:` and others | a tezcatl command bound to it (below) |
  | reserved | capitals (`;C` …) | an error for now (kept for held modifiers) |
  | — | a letter not in the table, a `;` at the end, a modifier with no key, an unclosed notation | an error; the line is not sent |

- **`;s` and printable characters**: as in the input panel (`normalize` of `lib/core/keymap.js`), a printable character is written as it
  is after Shift (`Y` is Shift+y; `;cY` Ctrl+Shift+y); `;s` goes on keys that are not characters (`;s;t` is `S-<tab>`); `;sa` is an error
- **Only ASCII takes modifiers**; kana without modifiers are sent as they are
- **Two tiers of characters**: **protected** (never rebound) — `;` `c` `a` `s` `w` `f` `h` `j` `k` `l` `e` `q` `t` `b` `d` and every
  capital; **bindable** — the rest. Defaults are in code; config lays over them (as `keys` in `code.json`; `""` removes); binding a
  protected one is an error on loading
- **Shortcuts extend "`:` goes to the map"**: Tezcatl reads after `;`, so commands can be bound there. **They act when typed** (no Enter;
  nothing enters the input line). The behaviour is a tezcatl command and the key names it (`D-command-target`); the value is "the command's
  name and arguments", arguments in `command_map.json`'s `args` order (`;:` is `skin.focus abs`)
- **What comes out is a sequence of `{key, modifiers}`** (the same as `kbd.parse`); whether a modifier is Emacs' Meta or X's Alt is the
  destination's
- **Meaning is not read**: only "which key"; what it does is the destination's (the "operating scheme of one's own" `D-empty-middleware`
  foresaw)

**The lead-key input panel `input_leadkey`** (`lib/core/lead.js` reads; `lib/skin/lead-form.js` is the form shared with the frame):

- **Two lines**: above what was typed (`ls ;cd x`), below what will be sent (`ls C-d x`, keys with modifiers coloured). **The lower line is
  the truth** (`;` is also the shell's separator: `ls;cd x` reads as `C-d` — look and fix)
- **A real `Enter` sends to the destination**; real arrows, `Backspace`, `Tab` edit the input and never go out. Every key for the
  destination is written with the lead key. An unreadable line is not sent. Sent lines are cleared; ↑↓ recall earlier ones; a real `Esc`
  is still the leave key
- **It has no destination**: it takes it from the skin's `input_target` panel and sends without looking: `lead.send {id, events}` to that
  `input_target`, answered `lead.sent {id, ok, error}`. An `input_target` alone in a window takes only what is addressed to it (otherwise
  every lone `input_target` would send once each). **Destinations are `input_target/`**: `index.json` (order and the letter that picks:
  `t` tezcatl, `e` emacs-vent, `c` code_editor, `x` xterm), `<id>.json` (label, the scripts of its way `lib/target/<id>.js` — `candidates()`,
  `start`, `send`). The page reads the index and never scans the directory (`test/input-target-dir.test.js` finds drift). The list is
  kinds × candidates (one emacs-vent; as many xterms as are open in the skin), picked by letter (`x1` `x2` when several); a chosen one that
  disappears sends nothing and says so. To an xterm the keys become a terminal's control sequences (`terminal.keys` → `lib/term/keys.js`;
  arrows follow the application cursor mode a TUI set). To a `code_editor`, `code.keys`: each key as a real `keydown` to the editor (vim, the
  keymap and `code.json`'s `keys` take it as typed); a character nobody takes (insert mode) goes in as text; vim's mode is posted with
  `code.here`'s `mode` and `code.mode`
- **Pasted text goes in with `;` doubled** (`beforeinput`'s `insertFromPaste`): the input can always be read as lead-key notation
- **Each key typed lights the dock's virtual keyboard** (the receiver draws; nothing polls). `;` sends nothing (waiting), `c` ctrl, `Y`
  shift and y, `e` Enter. Pastes and editing keys send nothing; sending with `Enter` sends nothing either

**The virtual keyboard** (`D-remote-window`'s C): the 87 keys of a US layout without a numeric pad as ASCII art (black and `#2bd5d5`,
changeable). **A push-down frame of the last five keys received**, lit newest first `#d56a00` `#ff8000` `#ff952b` `#ffaa55` `#ffbf80`
(the same key twice: the newer colour). **Every 2 s it pushes an empty one itself**, so without typing it fades one step at a time — no
"clear" signal needed; typing and the timer are independent. It takes only `lead.keys` (`{keys}`, `lead.js`'s `lights`). `;cY;e` lights
ctrl, shift, y, Enter; `;;;;;` two `;` (the last `;` waits). **It lights what the destination receives**, not the notation's characters.

**From the old input and output panels**: the input line and `composed` → `input_leadkey`'s two lines; the destination's state
(`context`'s `buffer-name`, `window`, `frame`) and the connection → `input_target`; the log of what was sent → the virtual keyboard. Live
and Text modes disappear (per-key display is the keyboard's; a newline is `;e`).

**Undecided**: held modifiers (capitals; for xpra's Ctrl+click — a mouse action has no "next key"; Emacs has no press and release, so it
needs a meaning there too); Home, End, PageUp, PageDown (when needed); whether a click on the virtual keyboard puts its notation into the
input line.

**Alternatives**: `|`, `` ` ``, a non-character key (Muhenkan, `無変換`), named keys (`;<f11>`), a second prefix (`#1` for F1), sending at every
key.

**Why not**: `|` needs Shift and hits pipes and `||`. `` ` `` sits differently on JIS and US. Non-character keys exist only on JIS and need
another character in lines and logs. Named keys cannot be told from `<` after a modifier (`;c<f5>`), and one character each reads better.
The second prefix became `;f`. Sending at every key makes real arrows and `Backspace` fight between the destination and the input —
per-key sending is only the virtual keyboard's display.

**Files**: `lib/core/lead.js`, `lib/skin/lead-form.js`, `panels/extra/input_leadkey.html`, `lib/skin/input-leadkey-page.js`,
`panels/extra/input_target.html`, `lib/skin/input-target-page.js`, `input_target/`, `lib/target/`, `lib/term/keys.js`,
`panels/extra/virtual_keyboard.html`, `lib/core/virtual-keyboard.js`, `lib/skin/virtual-keyboard-page.js`, `config.json` (`ui.keys.lead`,
`ui.keys.fnRow`, `ui.keys.leadBindings`), `test/lead.test.js`, `test/input-target-dir.test.js`, `test/term-keys.test.js`,
`test/virtual-keyboard.test.js`, `test/e2e/input_leadkey.mjs`, `test/e2e/input_target.mjs`, `test/e2e/input_code_editor.mjs`,
`test/e2e/virtual_keyboard.mjs`.
