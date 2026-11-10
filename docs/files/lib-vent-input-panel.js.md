# `lib/vent/input-panel.js`

Emacs' input panel: Form, Live and Text modes, intents and their forms, `intent.run`.

**Takes part in**: [D-decode-emacs](lib-vent-decode-table.js.md#d-decode-emacs), [D-intent-resolution](lib-vent-resolver.js.md#d-intent-resolution), [D-next-keystroke](lib-vent-output-panel.js.md#d-next-keystroke), [D-run-table](lib-task-run-table.js.md#d-run-table), [D-single-input](lib-vent-protocol.js.md#d-single-input)

## Notes from verification

**Spec** — Form capture `preventDefault`s and turns into notation only modifier codes, function keys and Home / End / PageUp / PageDown; arrows
and Space are left alone (they collide with page scrolling, are short to type as `<up>` / `SPC`, and the reason to intercept — stopping
browser shortcuts — is weak). Live mode toggles with `Escape` (a personal setup where Fn+CapsLock sends Escape); `C-[` is the escape hatch
to send one.

**Does not** — `kbd` parsing (`kbd.js`), text encoding (`text.js`), running intents (`resolver.js`).

**Pitfalls** — `doSend()` **always tries** `resolver.lookup(text)` first: a `kbd` notation that happens to equal an intent id goes to the
resolver. A binding with no intent behind it logs `out-drop` and **does not** fall back to a raw send (a configuration mistake is not
hidden), unlike a missing binding (raw send). `buildParamField`'s `"selection"` reads `window.getSelection()` when the form opens, not when it
is sent. A `"list-item"` `<select>` is disabled with "(not fetched yet)" until `resolver.getLastResult(from.of)` is an array; its Fetch button
dispatches the intent — the only user of the resolver's one-shot `onSettle`. It also answers `intent.run` (`D-decode-emacs`, `D-run-table`).

*Verified 2026-09-06 (before `intent.run`).*

## Selection and revision notes

(Moved from the comments of `lib/vent/input-panel.js`, 2026-09-10.)

Input panel: browser -> emacs-vent-in (browser only).

Two modes, toggled at the top:

  Form (default) -- compose a key description in Emacs `kbd' notation
    ("C-x C-f", "M-x", "C-x C-f /tmp/x RET") and press S-Enter or Send to
    transmit it as ONE {"kind":"input"} message whose `sequence` carries
    every event. Pipeline: kbd.parse -> middleware.run -> protocol.encodeInput
    -> ws.send. Plain Enter in the field appends a `RET` token instead of
    sending -- the submit-key rule is isolated in `submitAction' (this is the
    "empty step" seam the notation flow was meant to hang off; swap it there
    to make plain Enter transmit).

    Form capture (keyboard-complete composing): focusing the field turns
    capture ON. A real modifier chord (C-f, M-x), a function key, or
    Home/End/PageUp/PageDown is then intercepted -- preventDefault, so a
    browser shortcut like Ctrl+F never fires -- and appended to the field
    as `kbd' notation. Bare printable typing still goes in as text, so file
    paths / M-x names / M-: expressions type naturally. Esc exits (capture
    OFF + blur); Tab toggles capture without leaving the field; Tab from
    outside the field focuses it. Nothing is sent until S-Enter / Send.

  Live -- every keydown is captured and sent immediately as a length-1
    sequence (browser-as-Emacs-terminal). Escape toggles capture (this
    machine's Fn+CapsLock emits Escape); send `C-[` to get ESC into Emacs.

  Text -- a raw text block (paste, an `M-:' expression, an `M-x' name, a
    search string). text.encode() turns it into one InputEvent per character
    (design doc §5.4 / §7.4) and S-Enter / Send transmits it as ONE
    {"kind":"input"} message. No `kbd' parsing, no prefix, no trailing RET --
    Text mode only turns characters into events; the caller adds `M-:' etc.

All three modes feed the same outbound log and pass currentContext to
middleware.
Submit-key policy for the form field. 'send' transmits, 'ret' appends a
RET token, null lets the keystroke through. Swap the Enter branch to make
plain Enter transmit.
--- mode switching ---
the focus handler turns Form capture ON
--- form mode ---
Resolver first: does this key sequence match a binding_map entry?
No binding: send the raw InputEvents unchanged (empty middleware seam).
--- intent dispatch (resolver) ---
One field per param, shaped by params[].from (resolver.js never looks
at `from` itself -- this is the only place that does):

  "user-input" (default if `from` is missing) -- a plain text input.
  "selection"  -- a plain text input, pre-filled from the browser's
    current text selection (window.getSelection()). Still editable --
    this panel has no dedicated editor pane to select *from*, so
    "whatever text is selected anywhere on the page" is the honest,
    generic reading of the schema for a reference-implementation panel.
  "list-item"  -- a <select> populated from resolver.getLastResult(of).
    If that intent has not been run yet (or its last result was not an
    array), the select stays disabled with a placeholder option and a
    "Fetch" button next to it dispatches `of` and fills the select in
    once it resolves.

Returns the form control; every case has a .value the submit-time
collector already reads uniformly (input and select both do).
no selection API / nothing selected -- leave blank
The submit-time collector reads `.value` / calls `.focus()` on
whatever we hand back; delegate both to the actual <select>.
"user-input", and the fallback for any unrecognised from.kind.
A tiny form, one field per param -- see buildParamField() for how each
param's `from` becomes a form control.
Append one whitespace-delimited token to the field and refresh preview.
Clicking Send should not blur the field first -- keeps capture ON for
mouse users; keyboard users send with S-Enter and never lose focus.
Focus drives Form capture: in the field -> ON, out of it -> OFF.
Esc: leave capture and the field entirely.
Tab / Shift-Tab: toggle capture, stay in the field.
Submit / RET-append / history -- available whether or not capturing.
Past here: only when capturing keys into the field.
IME composition and unresolved keys: leave to the browser.
Lone modifier press: swallow, add nothing.
Bare printable: normal text entry (paths, M-x names, M-: expressions).
Bare Backspace/Delete: edit the field (fix a mistaken token). To send a
literal delete, type DEL / <backspace> / <delete> with capture OFF.
Everything else -- modifier chords, function keys, Home/End/PageUp/
PageDown -- is intercepted (so Ctrl+F etc. never reach the browser) and
appended as kbd notation for review before Send.
--- live mode ---
Form mode: Tab from outside the field brings focus back to it
(keyboard re-entry after Esc). Tab inside the field is the capture
toggle, handled by the field's own keydown listener.
Modifier state is read off each event, so there is nothing to clear on blur.
--- text mode ---
Raw text -> one InputEvent per character (Tezcatl.text.encode, design doc
§5.4). No prefix, no trailing RET -- that is the caller's job (§7.4).
Keep textarea focus for mouse users (see Form's Send).
S-Enter transmits; plain Enter stays a normal newline in the textarea.
The resolver logs its outbound / correlation lines into this panel's log
and sends through this panel's socket.
C-g: unstick a wedged Emacs (an M-: that landed in a minibuffer, a slow
eval). Goes through the resolver so it can also mark the most-recent
pending eval entry `aborted`; falls back to a bare C-g keystroke when no
resolver is wired. mousedown preventDefault keeps focus where it was.
Feed every inbound message here so the resolver can match `tez:` lines.
