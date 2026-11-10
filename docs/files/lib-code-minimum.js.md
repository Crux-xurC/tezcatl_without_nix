# `lib/code/minimum.js`

Code_vi_minimum (D-minimum), the pure parts: where `:m` sends what was written.

**Decisions homed here**: [D-minimum](#d-minimum)

<a id="d-minimum"></a>

## D-minimum — a small editor for one text; `:m <destination>` delivers it

**Decided**: where a short text — a commit message, a path, one line for a terminal — is written with vim before it is delivered. What
writing in scratch and pasting did, done by naming the destination.

- **`code_vi_minimum`**: a small vim editor with no file (no language server, no copy). `minimum [what it is for]` in the input line
  (`minimum.open`) adds one at **the end of the frame's last line**; its heading says what it is for
- **`:m <destination>`** ("mail" — `w` turned over; `:w` reads as "saved". Inside this editor it replaces vim's `:m` / `:move`):
  `:m input` into the input line (`cmd.focus`, as `code_editor`'s `:#`), `:m xterm` pasted into the xterm focused last (not run — `insert`),
  `:m code_editor <file>` one line at the end of that file's `code_editor` as an unsaved change (`code.append`), `:m` back to the panel that asked
  (`minimum.done`), else the kill ring. Delivered text is cleared and the panel stays for the next one; `:q` throws it away
- **A panel can ask**: `minimum.ask {req, purpose, text}` to the frame adds one; `:m` answers `minimum.done {req, text}` (`:q` `cancel`).
  decode_emacs' `ask` keys do (Magit's commit message: `C`, then `:m` runs `magit.commit` — [D-decode-emacs](lib-vent-decode-table.js.md#d-decode-emacs))

**Alternatives**: writing in the one-line input; a `code_editor` as scratch; pasting through the kill ring.

**Why not**: the input line is one line without vim. `code_editor` is a file editor, with copies, language servers and saving attached.
Through the kill ring a person still opens the destination and pastes — returning to the asking panel directly is surer.

**Files**: `lib/code/minimum.js` (pure), `lib/code/minimum-page.js`, `panels/resident/code_vi_minimum.html`, `lib/code/code-editor.js`
(`code.append`), `lib/skin/frame-code.js` (`minimum`, `minimum.ask`, `:m input`), `lib/skin/frame-lines.js`,
`command/command_map.json`, `bus/messages.json`, `test/minimum.test.js`, `test/e2e/decode_emacs.mjs`, `test/e2e/decode_emacs_magit.mjs`.
