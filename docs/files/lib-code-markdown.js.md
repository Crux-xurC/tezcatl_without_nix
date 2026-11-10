# `lib/code/markdown.js`

The markdown panel, the pure parts: the `markdown ...` lines of a skin's input form, and a note's parse tree (@lezer/markdown + GFM, lib/vendor/codemirror/markdown.bundle.js) turned into plain blocks the page draws with DOM calls -- never as HTML: raw HTML in a note is kept as text (the panel is on the pages' origin, …

**Decisions homed here**: [D-markdown](#d-markdown)

**Takes part in**: [D-id-pool](lib-relay-id_pool.exs.md#d-id-pool), [D-task-table](lib-task-task-table.js.md#d-task-table)

<a id="d-markdown"></a>

## D-markdown — notes are drawn in a read-only panel; it follows only a code_editor of the same skin and path that a person tied with `follow`

**Decided**: the first step of moving the agenda into markdown (notes and tasks together; markdown → table → task list): a panel that
shows a note.

- **`markdown <path>` opens one** (a new panel each time; alone, `markdown.html?path=`). By default it draws **the saved text** and reads
  again when `code.saved`, `fs.changed` or `file.changed` touch the path (the same test as `code_diff`); the heading shows `disk · saved at`
- **`markdown follow`** (`f` in the panel) follows a `code_editor` of **the same skin** (`skinPort`) with **the same path**: it takes the
  unsaved text by `code.get` (300 ms after a `cursor` message) and marks the block with the cursor. When that `code_editor` opens another file
  or closes, it lets go (said on the receiving side) and returns to the disk's version. `markdown unfollow` returns. It never ties itself
  (what is being looked at is a person's choice)
- **Drawing only builds DOM**; the text is never inserted as HTML — raw HTML stays text (the panel lives in an origin that touches the
  bus). A link to a path → `code.open-at`, `http(s)` → a new window (`noopener`), anything else stays text. Images are not loaded: "this
  panel cannot show an image ── its file is <path>"
- **Parsing is `@lezer/markdown` + GFM** (tables, strike-through, check boxes) in a separate bundle `lib/vendor/codemirror/markdown.bundle.js`:
  `cm.bundle.js`' CommonMark has no GFM tables and rebuilding it would move pinned versions, so it is separate like `merge.bundle.js`
  (`@lezer/common` and `highlight` from `languageKit`); 1.7.2, not 1.8.0 (out only ten days then)
- **A table's caption is pandoc's** — a `Table: <name>` line just before or after the table; the next steps read it as a table's name
- **Every block keeps its source line range**. The panel's `Enter` goes to the block's line in the followed `code_editor` (`code.goto`), else
  `code.open-at path:line`

**Alternatives**: following a `code_editor` of the same skin and path automatically; HTML through `marked` or similar, then sanitised;
rebuilding `cm.bundle.js` with GFM; loading images through the relay's `/fs/read`.

**Why not**: automatic following changes whether the shown text is saved or not regardless of what the person does. Sanitising HTML runs a
leak as a script of the same origin — building DOM has no way to leak. Rebuilding `cm.bundle.js` moves other languages' versions.
`/fs/read` handles UTF-8 text only (`D-files-in-elixir`).

**Files**: `lib/code/markdown.js` (pure), `lib/code/markdown-page.js`, `panels/resident/markdown.html`, `lib/skin/markdown-commands.js`,
`lib/vendor/codemirror/markdown-entry.js`, `lib/vendor/codemirror/markdown.bundle.js`, `lib/skin/frame-code.js`, `lib/skin/frame-lines.js`,
`panels/skins/frame.html`, `command/command_map.json`, `bus/messages.json` (`markdown.follow`), `test/markdown.test.js` (with the real
parser), `test/markdown-commands.test.js`, `test/e2e/markdown.mjs`.
