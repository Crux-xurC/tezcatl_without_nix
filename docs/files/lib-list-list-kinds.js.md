# `lib/list/list-kinds.js`

The list kinds of panels/tool/list.html: the whole.

**Takes part in**: [D-dictionary](lib-list-dict.js.md#d-dictionary), [D-session-service](panels-invisible-daemon.html.md#d-session-service), [D-task-list](lib-task-task-list.js.md#d-task-list), [D-tree-skin](lib-skin-tree-commands.js.md#d-tree-skin), [D-ui-commands](lib-core-commands.js.md#d-ui-commands)

## Notes from verification

**Spec** — the same split as `resolver.js`: `list_kinds/<name>.json` declares, the kinds are the mechanism (`fill`, `subscribe?`, `order?`,
`remove?`, `onSelect`, `onKey`); the kinds now live in `lib/list/kinds/<name>.js`. Kinds include `w_list` (polls `GET /windows`; `remove` is
`DELETE /windows/:id`; `onSelect` posts `nav.goto kind:"window"`), `nav` (what the skin posts as `nav.list`; `fill` asks `nav.list.query` and
waits 500 ms), `commands` (`commands.list()`, `onSelect` = `commands.invoke`), `panels_and_skins` (the launcher's catalogue; opens pages),
`killring`, `bookmarks` (tree's marks in `~work/store/bookmarks.json`, a dir → `bookmark.goto`, a file → `code.open`), `lsp`
(`GET /lsp/servers`, `remove` = `DELETE /lsp/servers/:key`), `dict`, `slots`, `problems`, `locations`, `work`, `xipe_cards`, `task_list`. A
kind without `remove` is a list nothing can be deleted from. `deliver()` sends `killring.yank` to code and `insert` to others, and writes the
clipboard each time.

**Does not** — draw, filter or handle keys (`panels/tool/list.html`); hold a vent socket.

**Pitfalls** — `w_list.subscribe` loops on `setTimeout(cfg.pollMs)` (1500 ms) and keeps going on fetch failures until `pagehide`
unsubscribes. `w_list.remove` of a connection that never gave `?id=` logs "not evictable". `nav.fill` resolves an empty array after 500 ms
without a skin. Pages in `panels_and_skins.json` are repository-root paths and are made `/`-absolute before `window.open` (from inside
`panels/tool/list.html` a relative path doubled to `/panels/panels/…` and 404ed); `main.html` and `launcher.html` follow the same rule. The
`onKey` signature has a fifth argument `filterText` (used by kinds that create from the filter's text).

*Verified 2026-09-08; kinds added later not re-verified.*

## Selection and revision notes

(Moved from the comments of `lib/list/list-kinds.js`, 2026-09-10.)

List kinds -- the (source, action) adapters panels/tool/list.html plugs in
(browser global + CommonJS module). Same split as resolver.js: the JSON
(list_kinds/<name>.json) is declarative params, this file is the
mechanism. A kind supplies:

  fill(cfg, api)                  -> items[] | Promise<items[]>   (initial)
  subscribe(cfg, api, onChange)   -> unsubscribe fn              (optional)
  order(items, cfg)              -> items[]                      (optional)
  remove(item, cfg, api)         -> Promise | void              (optional;
                                       absent => the list is not removable)
  onSelect(item, cfg, api)       -> void
  onKey(chord, item, cfg, api)   -> void                        (optional;
                                       called for keys named in cfg.keys,
                                       e.g. "M-t" / "p" -- list.html claims
                                       them instead of typing into filter)

item = { id, label, sub?, kind?, name?, raw? }
api  = { bus, windowsUrl, log }

v0 kinds: w_list (relay connection registry, GET/DELETE /windows), nav
(skin-provided pane+window navigator), commands (the tezcatl-command
palette). None hold a vent socket -- a future "kill-ring" kind that
queries Emacs would go through resolver.js, not a raw WS.
--- w_list -----------------------------------------------------------
--- nav (skin-provided: local panes ∪ other windows) --------------
--- commands (the tezcatl-command palette) -----------------------
No local impl in list.html -> commands.invoke broadcasts a `command`
message the skin picks up (commands.listenBus).
--- panels_and_skins (static page catalogue, for main.html) -------
Items are declared inline in list_kinds/panels_and_skins.json. BOTH
onSelect (Enter / click, mode = cfg.open.defaultMode, default "tab") and
onKey (cfg.keys "M-t" / "M-w", mode explicit) open the page with
window.open right HERE, inside the keydown / click handler, so the call
keeps the user gesture. Earlier onSelect round-tripped `launcher.fill` to
main.html and let its form do the open; that open then ran off-gesture
(popup-blocked) and the fill stole focus out of this list, so keyboard
navigation silently went to main.html's form -- "a second selection does
nothing". Now the open is local and `launcher.fill` is only a mirror:
main.html shows the last-opened id in its form WITHOUT taking focus.
This kind holds no socket and never touches the relay.
pure: manifest entry + mode + cfg.open -> { url, name, features, mode }.
Exposed as _pagePlan for tests (no window.open, no bus).
it.page is repo-root-relative (list_kinds/panels_and_skins.json header).
openPage runs INSIDE panels/tool/list.html -- moved there in Phase 9 to keep
the user gesture -- whose document base is .../panels/, so a bare
"panels/x.html" would resolve to .../panels/panels/x.html (404). Force
it root-absolute; callers at repo root (main.html form) are unaffected.
impure: run a plan (window.open, if available) + mirror to main.html's
form via `launcher.fill` (always -- so a blocked popup can be retried
from the form, which has its own gesture).
--- killring (kill-ring picker; source: panels/invisible/killring.html) --
Enter / `p` = yank the entry into the origin surface and keep it in the
ring; `P` = yank and drop it. Delivery branches on the origin pane kind:
code -> post `killring.yank` to that frame (code.html runs a real vim `p`,
linewise-aware); every other surface -> the fixed `insert` verb
(panel-frame onInsert). Either way the entry is also mirrored to the
system clipboard so a plain paste works too. The skin posts
`killring.origin` (which pane we came from) and handles `killring.done`
(refocus + close).
{ id, kind } -- last killring.origin seen
Registered by both fill and subscribe; two idempotent listeners is
harmless, and each call binds to the caller's bus (matters for tests).
always mirror to the system clipboard (a plain paste then works too)
Enter == `p` (yank & keep)
"keep" | "pop"
--- bookmarks (file-tree favourites; store: ~work/store/bookmarks.json) --
Written by panels/resident/tree.html (`m` key) and by this kind's remove(); both
post `bookmark.changed` so the other side re-reads. No invisible
aggregator -- the kept file persists regardless of what is open, and a
bookmark is only ever created by a deliberate `m` in the tree (unlike the
kill ring, which is fed continuously in the background and needs a live
listener). onSelect routes: a dir -> `bookmark.goto {path}` (the tree, if
open, expands there); a file -> `code.open {path}` (the existing path).
pure: which bus message a selected bookmark sends. Exposed for tests.
--- lsp (running language servers; GET/DELETE /lsp/servers) ---------
Derived from the same relay URL as w_list (api.windowsUrl, /windows ->
/lsp/servers). A server is started by an editor attaching over /lsp; this
panel only observes and stops. fill/subscribe poll GET /lsp/servers on
cfg.pollMs; remove() -> DELETE /lsp/servers/:key. shortRoot() abbreviates
a deep root to "…/last/three/segments".
--- shared -----------------------------------------------------
