# `panels/resident/tree.html`

The page of tree (file tree).

**Takes part in**: [D-files-in-elixir](lib-relay-fs_handler.exs.md#d-files-in-elixir), [D-tree-skin](lib-skin-tree-commands.js.md#d-tree-skin)

## Notes from verification

**Note** — "multi-root with `tree.json` (`roots`)" in the older notes below was removed: the tree shows a tree and keeps the selected path;
its root is replaced with `tree.root {path, tag, tree}`. `tree.json` at the FS root holds the tree skin's slots (`{slots: [...]}`,
`list_kinds/slots.json`) — `D-tree-skin`.

## Selection and revision notes

(Moved from the comments of `panels/resident/tree.html` on 2026-09-10; multi-root and `tree.json` `roots` were removed later — the tree skin's
slots replaced them, `D-tree-skin`.)

tree.html -- the file tree. Reference implementation (hierarchical -- the one shape list.html can't be a config of). Reads endpoint ③
(GET /fs?path=) and lets you open a file into a code pane.

What it does NOT do: fetch file bodies to edit them, write anything, or hold a vent socket.

Open a file:
  Enter / →   -> post `code.open { path }` on the bus. A skin routes it to a code pane (the frame: the `code_editor` that has it, else the current
                 one, else one added)
  o           -> open the file in a NEW standalone code_editor window and feed it directly (works with no skin -- a reference-implementation
                 property)

The ③ base URL is derived from config.json connections[0].url (ws://host:port/ -> http://host:port).
Bookmarks (store: ~work/store/bookmarks.json, D-store; shared with list.html?config=bookmarks -- both keyed the same, `bookmark.changed` keeps them
in sync). No invisible aggregator: a bookmark is only ever made by `m` here, so this page persists it directly. A dir bookmark chosen in the
list expands the tree down to it and selects it (`bookmark.goto`, `revealPath`). Escape is the leave key (panel-frame.js, capture phase).

Record: `m` toggles a bookmark (★). dired's set of marks was decided to be the browser's (a panel keeping marked paths itself, as
bookmarks; batch operations iterating the set) — now done with run_table rows instead (`D-run-table`).
