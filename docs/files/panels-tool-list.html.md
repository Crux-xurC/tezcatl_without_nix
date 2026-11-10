# `panels/tool/list.html`

The page of list.

**Takes part in**: [D-dictionary](lib-list-dict.js.md#d-dictionary), [D-task-list](lib-task-task-list.js.md#d-task-list), [D-tree-skin](lib-skin-tree-commands.js.md#d-tree-skin), [D-ui-commands](lib-core-commands.js.md#d-ui-commands)

## Notes from verification

**Spec** — a permanent reference implementation next to the input and output pages. The page knows nothing of any kind: it has the filter,
`↑↓` selection, `Enter` (`onSelect`), `Del` (`remove`), `Home` / `End`. `?config=` fetches `list_kinds/<name>.json` and finds the kind
`cfg.kind` among `Tezcatl.listKinds`. It does not handle `Escape` (the leave key belongs to `panel-frame.js`). `api` has `windowsUrl` and
`fsBase` (for kinds that read and write real files through `/fs`); `onKey` gets the filter's text as a fifth argument.

**Does not** — where data comes from or what deleting does (the kinds); per-kind looks.

**Pitfalls** — the default config is `commands` (no `?config=` nor `?kind=`); only `commands` waits for `Tezcatl.commands.load()` before
`start()`. A kind with `subscribe` refreshes itself, so `removeSel` does not delete locally; a `fill`-only kind drops the item at once for
a quick response. `unsub()` runs on `pagehide`, which some browsers do not fire for windows of their own (a polling kind may keep running).

*Verified 2026-09-06; `fsBase` / `filterText` (2026-09-13) not re-verified.*

## Selection and revision notes

(Moved from the comments of `panels/tool/list.html`, 2026-09-10.)

generic list primitive: a filter box + a keyboard-navigable list. The
     third permanent reference implementation, next to input.html /
     output.html. w_list / nav / commands are configs of it.

---

panels/tool/list.html?config=<name> -- loads list_kinds/<name>.json (declarative)
+ the matching adapter from lib/list/list-kinds.js (mechanism), then renders a
filterable, keyboard-driven list. Selection / removal go through the
adapter; the panel itself knows nothing kind-specific.
full item set from the adapter
after filter
windowsUrl for the w_list kind.
cfg.keys: { "<chord>": <anything> } -- keys this config claims. list.html
routes them to kind.onKey instead of letting them type into the filter.
Chord grammar: optional "C-" / "M-" prefixes then a KeyboardEvent.key
("M-t", "p", "P"). Returns the matched chord string, or null.
a subscribe-driven kind refreshes itself; for a fill-only kind,
drop it locally so the UI responds.
Escape is the leave key -- panel-frame.js handles it (capture phase).
