# `lib/target/frame.js`

Another frame as a destination of input_target (`input_target/frame.json`); its roster is shared with `lib/recv/frame.js` (the source).

**Decisions homed here**: [D-bridge](#d-bridge)

<a id="d-bridge"></a>

## D-bridge — one frame's dock drives another: a destination and a source, not a dock of its own

**Decided** (2026-10-24, crux): the dock is not made a panel of its own. A frame elsewhere — another tab, Poca's split view — is a
destination of input_target (`f`) and a source of output_target (`f`), the same id, so that while the keyboard is in the input form the
receiving side follows it with that frame's lines. A frame holding little but its dock (the main skin) is then the dock of the frame
beside it.

- Finding the frames: `frame.ask` to every window; each frame answers `frame.here {name}` to the asker. Asked when the list starts and
  every 3 s; one silent for 7 s drops out. The frame the input_target is in is left out (its parent's bus id)
- Sending: `skin.line {line}` to that frame's bus id. The frame takes only one addressed to it (`meta.to` is its id — `onMine` would also
  take an unaddressed one, and every frame would run it) and runs it as a line typed in its own input form (`run`, after the catalog is
  read). A line is chars only, as for tezcatl (`lib/target/tezcatl.js`)
- Reading: every line a frame says is already posted (`recv.out`); the source keeps one record per frame of the roster (the last 200
  lines), from when it was opened

**Why**: the parts of the dock (the input form, the suggestions, the lead key, where it sends, the receiving side) already exist in every
frame and stay drawn by it; what was missing was only a way to reach another frame. Both input_target and output_target load their
destinations and sources from a file each (`input_target/<id>.json`, `output_target/<id>.json`), so the bridge is two small modules
and two messages, and nothing in the dock changes.

**Not covered**: the map (`panel_abstract`) and the focus moves of the dock (`skin focus abs`, `;:`) stay the dock's own frame's — they
go through the parent window directly. A line sent to another frame runs there, but the map shown is this frame's.

**Alternatives**: a dock page of its own (a second copy of every part, and the input form's link to its frame — the skin port — made a
bus link); a bridge panel with an input line of its own (a third input form, without the lead key and the suggestions).
