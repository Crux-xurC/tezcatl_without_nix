# `lib/core/panel-frame.js`

What every panel loads: the leave key, the fixed bus vocabulary, the roster, and the skin port.

**Decisions homed here**: [D-say-side-effects](#d-say-side-effects)

**Takes part in**: [D-session-service](panels-invisible-daemon.html.md#d-session-service), [D-skin-as-container](lib-core-panes.js.md#d-skin-as-container), [D-work-list](lib-core-work-log.js.md#d-work-list)

<a id="d-say-side-effects"></a>

## D-say-side-effects — what happens along the way of a command is shown on the receiving side with a reference, without asking leave

**Decided**:

- In Tezcatl, things move only because a person gave a command (tables do not refresh by themselves, autosave is off by default, nothing
  polls). Residents (`cursor`, `killring`, the work recorder) only listen and keep
- What is left are things done **along the way**: reading a `code_editor` with no edits again after another's save (`file_changes`), opening a
  new window when nobody takes a command (`fallback`), adding a `code_editor` for `gd` or a rename across files, opening a clone on `:e` of
  an open file, asking a language server again after a timeout. Each is **said as one line with a reference on the receiving side**
  (`D-references`; `go on` goes there)
- **The common mouth is the bus's `recv.say {text, cls?, ref?}`**: a panel says it, and **only the frame that holds the panel** shows it,
  with the panel's place at the head. Said by a panel alone in a window, nobody shows it (its own heading has it)
- **`{kind: "bus", id, name}` references**: a panel points at another by bus id; the frame turns it into a `panel` reference when it is
  its own (`@2 1`), else keeps it (`@<name>`), and `go on` sends `code.reveal` / focus to the other window
- Only `file_changes`' reading again can be switched off, by one setting (`"fileChanges": {"reload": false}` in `code.json`: then a
  `code_editor` with no edits is told instead — `plan(change, editors, {reload})` in `lib/code/file-changes.js`)
- **One door to the skin** (panels looking at `window.parent` or sibling iframes directly were gathered): **`Tezcatl.skinPort`** in
  `lib/core/panel-frame.js` (every panel loads it) — `inSkin(w)`, `id(w)` (the skin's bus id), `siblings(w)` (the bus identities of the
  skin's panels), `hasRole(w, role)`, `synthesis(w)`, `block(w)` (the asker's block as kept, read only — a panel can read its settings from the text; 2026-10-23),
  `of(w)` / `ofOpener(w)` (what the skin registered), `register(w, port)`. The frame registers `openNew`
  and `panels()` (with places), `runLine`, `dockTarget`, `synthesisOf`, `blockOf`. Behaviour did not change. Kept as it is: the frame touching its own children's
  windows (reading bus ids, `themaSet`, `abstractSet`, focus) — the container's own work; children to parent use `postMessage`
  (`tezcatl.pane.reveal`, `tezcatl.abstract`, `tezcatl.thema.inner`)

**Alternatives**: a switch per behaviour, asked once and remembered (`allow list`, `allow <behaviour> always|once|never`).

**Why not**: things are now set in motion explicitly, and for the few behaviours left, building ask, remember and configure is not worth
it. The harm is "what went outside is not seen by the person"; seeing it and being able to go there is enough.

**Files**: `lib/skin/recv-refs.js` (`bus`), `lib/skin/frame-page.js` (`recv.say`, `go on`, `skinPort.register`), `lib/core/commands.js`
(`said`), `lib/core/panel-frame.js` (`skinPort`), `lib/code/file-changes.js`, `lib/code/file-changes-page.js`,
`lib/code/code-editor/lsp-actions.js`, `lib/code/code-editor/file-ops.js`, `lib/code/lsp-log-page.js`, `lib/code/code-locate.js`,
`lib/xipe/matrix-page.js`, `test/recv-refs.test.js`, `test/file-changes.test.js`, `test/panel-frame.test.js`, `test/e2e/clone.mjs`.

## Notes from verification

**Spec** — two jobs. **(1) The leave key**: the moment the script runs, one capture-phase `keydown` on `window` sees every key **before**
the panel's own handlers and any forwarding to Emacs. A match of `ui.keys.leave` (chord descriptors) is `preventDefault` +
`stopImmediatePropagation` and a `yield` on the bus. A one-chord sequence is prevented at once; longer ones must come within
`ui.keys.leaveTimeoutMs` (400 ms), and the leading keys pass — so with `["Escape","Escape"]` a single Escape reaches Emacs and only a quick
double leaves. **(2) The receiving side of the fixed vocabulary**: `init(meta)` calls `bus.identify`, then listens (`onMine`) for `focus`,
`insert`, `command`, so a panel wires nothing itself (`onFocus`, `onInsert`, `onCommand`, `setFocusTarget`, `replyTo`, `reportCursor`). On
every native `focus` it posts `focus.changed {id, role, name}` with the **bus id** (meaningful in any skin or window). It names the panel to
the roster (`panel.open` / `panel.close`, `D-work-list`), arms the opt-in clipboard mirror (`ui.startup.clipboardMirror`: each panel reads
`navigator.clipboard.readText()` on its own `focus` / `visibilitychange` and posts `killring.add` when it changed — Chromium only), and
holds `Tezcatl.skinPort`, the one door a panel uses to look at its skin (`D-say-side-effects`).

**Does not** — move between panels after leaving (the skin's job on `yield`); encode keys for Emacs; the vent wire. The chord matching is
pure (`_chord`, `_evChord`, `_sameChord`, `_matchTail`) and unit-tested (`test/panel-frame.test.js`); the DOM side is E2E.

**Pitfalls** — until `config.json` is read (and if fetching fails) the sequence is a double Escape. `ev.isComposing || ev.repeat` return early,
so IME conversion and auto-repeat never leave. The `recent` buffer drops entries older than the window each time, so "slow Escape → another
key → Escape" is not a double.

*Verified 2026-09-06; the clipboard mirror, `focus.changed` and `skinPort` came later.*

## Selection and revision notes

(Moved from the comments of `lib/core/panel-frame.js`, 2026-09-10.)

Panel frame -- the shared bootstrap every Tezcatl panel loads (browser
only). One <script src="../lib/core/panel-frame.js"> near the top of each
panels/*.html, after lib/core/config.js and lib/core/panel-bus.js.

It does two things, and deliberately no more:

 1. Reserved key sequences. A single capture-phase `keydown` listener on
    `window`, registered the instant this script runs -- so it sees every
    key BEFORE the panel's own handlers and before any Emacs-forwarding
    code, no matter what the panel does with Escape. Two sequences by
    default, each posting a bus event the skin acts on:
      ui.keys.leave    (["Escape","Escape"]) -> `yield`     (pane/window nav)
      ui.keys.killring (["Escape","y"])      -> `killring`  (kill-ring picker)
    The panel never has to cooperate or reserve a key -- these are the
    globally-reserved bindings, owned by the skin, enforced from inside
    every frame. Everything after the event happens in the skin.

    Each is a list of chord descriptors. Length 1 = a single chord
    (prevented immediately). Length >= 2 = a sequence within
    `ui.keys.leaveTimeoutMs` (default 400ms); the earlier keys pass
    through untouched -- so a lone Escape still reaches Emacs / the
    terminal, and only the quick completion fires. Descriptor grammar:
    `C-` control, `M-` meta/alt, `S-` shift, `s-` super, then a key name
    (`Escape`, `Tab`, `;`, `x`, ... matched against KeyboardEvent.key,
    case-insensitive, plus the Emacs-ish aliases `escape`/`return`/`tab`).

 2. The parts side of the fixed bus vocabulary. Helpers so a panel can
    receive `focus` / `insert` aimed at it and reply with `result` back
    to whoever asked -- without every panel re-implementing the wiring.
    Vocabulary: yield, killring, focus, insert, result, cursor.

This is NOT the vent wire. Nothing here reaches emacs-vent.
--- leave-key detection ------------------------------------------------
(helpers first -- `seq`'s initializer below calls chord())
KeyboardEvent.key lowercased is what we match on ("Escape" -> "escape",
"Enter" -> "enter", ";" -> ";"). A few Emacs-ish aliases so a config
written as "return" / "esc" / "spc" also resolves.
Reserved key sequences, checked capture-phase ahead of every panel. Each
fires a bus event when its chord list completes within windowMs; earlier
keys of a multi-chord sequence pass through untouched (so a lone Escape
still reaches Emacs / the terminal). config.json ui.keys.<key> overrides
the chord list.
  leave    -> `yield`     (skin: pane / window navigator)
  killring -> `killring`  (skin: the kill-ring picker)
Defaults chosen so a lone Escape does nothing here; Escape-Escape leaves,
Escape-y opens the kill-ring -- same "quick double tap" feel.
recent { key, mods, at } within windowMs, oldest first.
The tail of `hist` matches `wanted` and spans <= winMs. Pure -- the
instance check calls it with the live (recent, seq, windowMs).
keep only what could still form the longest sequence
A sequence fires only on its final chord (length>=2: the earlier keys
already passed through; prevent only on completion). First match wins.
Capture phase + registered now = ahead of any element listener the panel
adds later, and ahead of bubble-phase Emacs forwarding.
--- config ----------------------------------------------------------
--- clipboard mirror (opt-in: config.json ui.keys is unrelated; this is
ui.startup.clipboardMirror) ------------------------------------------------
Whichever Tezcatl window you focus reads the system clipboard once and
feeds anything new to the kill ring -- so "copy from a web page, switch to
Tezcatl, use it" works. readText() requires document focus (that is why
this is per-panel, not a background daemon window) and a secure context
(127.0.0.1 is one). Chromium honours it after a one-time permission grant;
Firefox rejects without a user gesture -- that path just no-ops there.
killring.html dedups identical text to the front, so several panels all
reading on focus is harmless (no duplicate entries).
not focused / no permission / Firefox
keep the double-Escape default
--- parts-side bus vocabulary --------------------------------------
element or () => element, focused on `focus`
Reply to whoever sent us a message: post `type` addressed back to
meta.from.id, tagging our own identity as the origin.
Broadcast a caret/selection report (editing panels: CodeMirror, xterm).
cursor.html aggregates these. `info` is free-form but by convention:
  { surface, target, cell:{x,y}, pixel:{x,y,h}, selection:<string> }
pure helpers -- exposed for unit tests (test/panel-frame.test.js) and
introspection. No DOM, no bus.
