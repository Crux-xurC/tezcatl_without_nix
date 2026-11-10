# `lib/skin/frame-dock.js`

The frame's dock (D-unified-dock, D-dock): one unit of the skin, beside its lines -- by default (docks/standard.json) the map of the skin (panel_abstract), the input_target (where the input form sends), the input form (a lead-key form, lib/skin/lead-form.js) with the receiving side, the virtual keyboard, and boxes for …

**Decisions homed here**: [D-unified-dock](#d-unified-dock)

**Takes part in**: [D-dock](lib-skin-dock-layout.js.md#d-dock), [D-suggestions](lib-skin-suggest.js.md#d-suggestions)

<a id="d-unified-dock"></a>

## D-unified-dock — the dock's input line has a destination and the receiving side a source, each shown on one line; it takes in Emacs' input and output and the remote window's A, A' and B

**Decided**: the dock is the ground used everywhere in the frame. The input line is not only for tezcatl commands: **where to send** is the
input line's, **where to receive from** the receiving side's.

- **The first step**: the dock below holds `input_target` and the virtual keyboard; the frame's input line `#line` became a lead-key input
  (the same part as `input_leadkey`, `lib/skin/lead-form.js`). It is not replaced by an iframe, so the frame input line's own behaviours
  stay (where the leave key returns, empty-line `Enter`/`Esc`, `Alt+p/n`, `:`, `code_editor`'s `:#`). The input line always sends through the
  dock's `input_target`, whose first destination is **tezcatl** (`input_target/tezcatl.json`: the line comes back to the frame through the
  skin port's `runLine` and runs as a command, as always — characters only; keys with modifiers are refused; a final Return is the end of
  the line, so a line pasted with its newline, ending in `;e`, works). Until the dock's `input_target` is ready, the frame runs lines
  directly. `;i` (`dock.target`) jumps to it; a letter chooses and comes back (`lead.chosen`). Until a choice, it sends to the first that
  can take keys. The lone `input_leadkey` stays (with no `input_target` in its skin it sends to the dock's: the skin port's `dockTarget`)
- **A chooser and one line each** for the input and the receiving side (as the candidates: one letter chooses and goes back to the input
  line). `;i` the input's destination, `;o` the receiving side's source, `;g` the candidates' source. Destinations: tezcatl's commands,
  emacs-vent, xpras in the frame; the line shows which, where in Emacs (`buffer-name`, `window`, `frame` — `D-next-keystroke`) and whether
  it is reachable
- **So in the frame Emacs' `input` and `output` panels are no longer needed**; of `D-remote-window`'s five, B becomes the input line, A
  its line, A' the receiving side; C (the virtual keyboard) and D (xpra's screen) remain panels
- **When the destination is not tezcatl, lines are read as lead-key notation** (`D-lead-key`). **Real modifier keys are Tezcatl's,
  lead-key modifiers the destination's** — `Alt+p`/`Alt+n` and switching destinations reach Tezcatl whatever the destination, and keys reach
  the destination whether or not the browser would take them. **Only the lead key is read in the input line**: characters go through it,
  so Japanese confirmed by an IME can be sent too (the old Live mode caught raw keys and dropped those during conversion)
- **Destinations and sources are tables** (name → how to send, what to show on the line, colour); the frame knows neither Emacs nor X
- **The receiving side follows the input's destination until a source is chosen**; more precisely, while the keyboard is in the input
  line, `@gsel` or `@sugg`, it follows `lead.chosen`; elsewhere it shows what was chosen in `output_target` (`;o` = `dock.recv`)
- **The receiving side's source is the panel `output_target`** (the counterpart of `input_target`; sources in `output_target/index.json`
  and `output_target/<id>.json`, read by `lib/recv/<id>.js` registered as `Tezcatl.recvSources[<id>]`). Source ids are those of
  `input_target`, and so are candidate keys (an xterm is its panel's bus id), so a destination chosen points at its source directly.
  Sources: `tezcatl` (the frame's own receiving side — the frame keeps it), `emacs-vent` (its own connection: context and events, one line
  each, as `output.html`), `xterm` (`terminal.data` of the skin's terminals as text lines through `lib/recv/term-text.js`: colours and
  cursor moves dropped, `\r` overwrites from the line's start). The frame asks `recv.show {id, key, follow}` and draws `recv.lines` over
  the receiving side (`#recvx`, the first line saying whose). Tezcatl's lines stay in `#recv` (`go on` and references unchanged). A
  destination with no source (`code_editor`) shows tezcatl's with "no source for …". **A tezcatl error (`!` lines) is put in whatever is
  shown**, so a failed command is never hidden
- **Where the dock is**: chosen by the frame's variant (left, below, right), with sizes and inner layout per side; on the sides the parts
  stack vertically and the candidates' shape is the dock's. On the left and right, from the top: How_to_use with the map, the virtual
  keyboard, the input with its destination, the candidates with their source, a clock, the receiving side's source, the receiving side
  (longest). Below: the same parts. Choosers open where the candidates are. **The dock does not move**: the rest of the screen changes
  content (no several live areas switched — panels to keep alive are added and made small)

**Alternatives**: one receiving side marking each line's destination; several areas switched.

**Why not**: sources are not mixed (as candidates: where a line came from shows). Switching areas keeps hidden panels running, needs "the
current `code_editor`" and a window name per area, and overlaps with arranging windows by the window manager (`D-session-service`).

**Kept**: `panels/resident/input.html` and `output.html` still work in their own windows and in prototype skins.

**Undecided**: a notation to send one line to tezcatl without switching; where to break the receiving side's line; how the input panel's
intent resolution, Text and the `C-g` button are handled in the dock; a command to make things small.

**Files**: `lib/skin/frame-dock.js`, `lib/skin/lead-form.js`, `lib/skin/input-target-page.js`, `lib/skin/output-target-page.js`,
`input_target/`, `output_target/`, `lib/target/`, `lib/recv/`, `lib/skin/frame-page.js`, `panels/skins/frame.html`,
`test/e2e/frame_dock.mjs`, `test/e2e/frame_recv.mjs`.
