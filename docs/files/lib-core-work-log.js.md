# `lib/core/work-log.js`

The record of what is running and who is open the pure part.

**Decisions homed here**: [D-work-list](#d-work-list)

<a id="d-work-list"></a>

## D-work-list — running work and open panels are shown from a record that matches bus messages by a table of start–end pairs

**Decided**:

- **An invisible store records** (as `killring`): it keeps listening to the bus and turns messages that match the pair table into rows
  "number, who fired it, when, what, status". Who fired it is the sender the bus puts on every message. **Matching is by type and key
  (`req` …), never by text**
- No `work.start` / `work.end` asked of each process; only processes not on the bus get a start message (LSP requests). Xipe Totec's
  evaluation is recorded at the grain "sent, waiting for the answer" (lines are not read)
- **The pair table is `work.json`**: `{name, start, where?, end: [type…], fail?: [type…], failWhere?, key, text?, slowMs?, expireMs?,
  cancel?}`. A row opens on `start` (whose payload matches `where`) and closes when one of `end` comes with the same key — a payload
  field's name, or `"@from"` (the sender's bus id); `fail` / `failWhere` close it `failed`. Pairs now: `panel` (the roster), `command`
  (`command` → `command.taken`), `save`, `check`, `open` (`code.open` → `code.opened` / `code.openFailed`, keyed by path), `table`
  (`matrix.load` → `matrix.loaded`), `lsp`, `xipe`
- **Only three new messages were needed**: `code_editor`'s LSP requests (`lsp.request {req, name, path, method}` → `lsp.response {req, ok,
  message}`), the dialogue window's "one line sent, waiting" (`xipe.sent {req}` → `xipe.answered {req, ok}`), and panels naming
  themselves (below). `code.file` sent from the input line got a `req`, pairing with `code.saved`
- **The record is pure** (`lib/core/work-log.js`): rows `{n, pair, key, from, at, text, status, endAt}`; `slow` (over `slowMs`) and
  `orphan` (the firer is not in the roster) are computed when read; over 300 rows, the oldest finished ones go. **Rows that never end
  close by time**: pairs whose end may never come (a `command` nobody took, `code.open` of a file already open — the frame just goes there,
  no `code.opened`) have `expireMs` (`command` 2000, `open` 10000) and become `expired` (`endAt` = start + `expireMs`), computed like
  `slow` — no timer runs. A Xipe Totec restart closes waiting rows with `xipe.answered {ok: false}` instead
- **One recorder** (`panels/invisible/work.html`, `lib/core/work-page.js`, beside `cursor` and `killring` in the frame): every window's
  recorder asks for the same Web Lock (`tezcatl:work`); only the one holding it records, and the next takes over when its window closes
  (empty; a roll call rebuilds the roster). **Nothing is kept** (not even in `localStorage`). So a row's number is the same in every
  window — with "each window keeps its own and the newest answer wins" (as `cursor`), `work cancel <n>` would point at different rows
- **The roster (`who`) is the same record**: `panel-frame.js` names a panel on `init` (`panel.open`) and on `pagehide`
  (`panel.close`); `panel.roll {req}` is answered `panel.here {req}`; the frame answers `frame.places {req, skin, places}` so rows get
  places. **A roll call only when `who` is typed** (and when the recorder starts): rows that did not answer become `lost`, unknown panels
  are added. The asker ends the roll call (`work.who` → 300 ms → `work.who.end`) — the recorder's window may be in the background, where
  browsers delay timers beyond a second
- **Lines** (`lib/skin/work-commands.js`): `work list` (the `work` panel, added or focused), `work watch` (`work_watch`: the same kind with
  `only: "running"`), `work cancel <n>`, `who` (numbered, with a list reference). The list (`lib/list/kinds/work.js`) asks `work.query` and
  reads again on `work.changed` and every `pollMs`; `Enter` goes to the firer, `Del` cancels. Tezcatl commands `skin.add {panel}`,
  `work.list` (with a fallback window), `work.cancel {n}`
- **Cancelling** sends the row's pair's `cancel` (`{type, payload}`) to the firer. Today only `lsp`: `lsp.cancel {req}` → `code_editor`'s
  `client.cancelRequest` sends `$/cancelRequest` and stops retrying. **The relay rewrites `$/cancelRequest`'s id** (`cancel_gid` in
  `lsp_server.exs`; before, the consumer's id went through, cancelling nothing, or another request with the same number); cancels of
  finished requests are dropped

**Alternatives**: each process naming `work.start` / `work.end`; only the frame keeping a roster.

**Why not**: saving and opening already flow as pairs on the bus — a declaration is enough. A frame-only roster misses panels in their own
windows.

**Not yet**: only LSP requests can be cancelled; `:w` typed inside `code_editor` has no start on the bus; skins other than the frame have no
recorder.

**Files**: `work.json`, `lib/core/work-log.js`, `lib/core/work-page.js`, `panels/invisible/work.html`, `lib/list/kinds/work.js`,
`list_kinds/work.json`, `list_kinds/work_watch.json`, `lib/skin/work-commands.js`, `lib/core/panel-frame.js`, `lib/skin/frame-page.js`,
`lib/skin/skin-ex.js`, `lib/code/code-editor/lsp-actions.js`, `panels/skins/xipe.html`, `lib/relay/lsp_server.exs`,
`command/command_map.json`, `test/work-log.test.js`, `test/work-commands.test.js`, `test/relay/lsp_cancel_test.exs`,
`test/e2e/work_list.mjs`.
