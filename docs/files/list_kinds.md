# `list_kinds`

## Selection and revision notes

Each `list_kinds/<name>.json` declares one list of `panels/tool/list.html?config=<name>`; `kind` names the adapter
(`lib/list/kinds/<kind>.js`, registered through `lib/list/list-kinds.js`). (Moved from the files' comments on 2026-09-10, with later notes.)

- **`bookmarks.json`** — file-tree bookmarks (favourite paths). Store: `~work/store/bookmarks.json` (`D-store`), written by the tree's `m` key and this
  list's Del; both post `bookmark.changed`. onSelect posts `bookmark.goto {path}` for a dir (the tree, if open, expands there) or
  `code.open {path}` for a file. No invisible aggregator (a bookmark is made only by `m` — unlike the kill ring). Tests: route, order,
  onSelect, subscribe
- **`commands.json`** — the tezcatl-command palette. Source: `command_map.json` (via `lib/core/commands.js`). Action: `commands.invoke`,
  which broadcasts a `command` message the skin runs (checked end to end)
- **`killring.json`** — the kill-ring picker. Source: `panels/invisible/killring.html` (the aggregator, over the bus). `p` = yank into the
  origin surface and keep in the ring; `P` = yank and drop from the ring. Delivery branches on the origin pane's kind (code → vim `p`; xterm
  / other → the system clipboard). The skin opens this list on panel-frame's `killring` event, posts `killring.origin`, closes it on
  `killring.done`. Del removes an entry
- **`lsp.json`** — the running language servers: `title`, `kind: "lsp"`, `pollMs: 1500`, `labels.empty`, `hint`. Polls `GET /lsp/servers`
  (the URL is `api.windowsUrl` with `/windows` replaced); a row is `serverId  …/root` + `status · N pane · M doc · pid`; Del →
  `DELETE /lsp/servers/:key`. Servers start when an editor attaches; this list only watches and stops (its `hint` says so). Checked in a real
  browser (a `.js` file's squiggles, completion, hover; a row `consumers:1 / docs:1 / status:ready`)
- **`nav.json`** — the pane / window navigator. The skin builds the items (local panes ∪ other relay windows, de-duplicated) and posts them
  as `nav.list`; this list only draws and selects. Action: `nav.goto` (kind pane | window)
- **`panels_and_skins.json`** — the page catalogue for `main.html`. Static: items live right here (unlike nav / commands / w_list). Enter /
  click (onSelect) opens the page in `open.defaultMode`; M-t / M-w (onKey, via `cfg.keys`) force a tab / window. Opening runs inside
  list.html (keeping the user gesture) and posts `launcher.fill` so `main.html` mirrors the last id in its form WITHOUT stealing focus.
  `page` is repo-root-relative (may carry `?config=`); `name:true` means `?name=` is appended (a vent connection, shown in `GET /windows`).
  Keep in sync with the hard-coded map of `launcher.html`. Entries were added as panels came (`code_el_intent`, `intent-skin`, `bookmarks`,
  `daemon`, `claude` → `xterm.html?cmd=claude&size=15` (the per-pane `?size=`; the font is the usual monospace `ui.terminal.fontFamily`),
  `codex` (`?cmd=codex&size=15`; started if it is on the relay's PATH), and every panel since). `test/list-kinds.test.js` checks the pages
- **`w_list.json`** — the relay's connection ledger as a list. Source: `GET /windows` (polled). Action: `nav.goto` that window. Remove:
  `DELETE /windows/:id` (`D-ui-commands`, `D-loopback`). Moved from `relay-console/w_list.html`. A WebSocket push instead of polling is
  undecided
- Later lists (`agenda`, `code_editor`, `dict`, `locations`, `problems`, `slots`, `work`, `work_watch`, `xipe_cards`) are described in their
  decisions (`D-task-list`, `D-dictionary`, `D-tree-skin`, `D-work-list`, `D-matrix-shell`) and in [how-to-use.md](../how-to-use.md) §7
