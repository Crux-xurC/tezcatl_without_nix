# `config.json`

The relay's URL, the terminal's shell and font, keys (leave, lead, F row, shortcuts, suggestions), windows at start.

**Takes part in**: [D-lead-key](lib-core-lead.js.md#d-lead-key), [D-pty-in-elixir](lib-relay-pty_socket.exs.md#d-pty-in-elixir), [D-session-service](panels-invisible-daemon.html.md#d-session-service), [D-skin-as-container](lib-core-panes.js.md#d-skin-as-container), [D-suggestions](lib-skin-suggest.js.md#d-suggestions)

## Notes from verification

**Spec** — `connections` is an array only so that an entry can carry a `dialect` (the selector for `kbd.js` and future key dialects). The
PTY is not in `connections`: a PTY is not vent (it streams bytes and never structures keys); in the same array `dialect` would lose its
meaning. `resolver.js` builds the intent path from `connections[0].dialect` — the first real use of the field. `pty.shell` is
`["bash", "-l"]`. `ui.keys.leave` (default `["Escape","Escape"]`) and `ui.keys.leaveTimeoutMs` (400) are the chord read by
`panel-frame.js`; `ui.keys.lead`, `fnRow`, `leadBindings`, `suggestSelect` belong to the lead key and the candidates. `ui.terminal.fontFamily`
is `"PlemolJP Console, monospace"`. `ui.startup.clipboardMirror` (default `true`) arms the opt-in clipboard mirror (`D-session-service`).
There is no `theme` key.

**Does not** — validate values at run time (each page does: `firstConnectionUrl` …).

*Verified 2026-09-06; `ui.startup` (2026-09-09) and later keys not re-verified.*
