# `lib/core/store.js`

What tezcatl keeps between sessions — the saved skins, the blocks, pane sizes, matrix colours, bookmarks, the kill ring — as one JSON
file per key under the work place, `~work/store/<name>.json`, read and written through the relay's `/fs/read` and `/fs/write`.

**Decisions homed here**: [D-store](#d-store)

<a id="d-store"></a>

## D-store — what is kept lives in files of the relay's work place, not in the browser

**Decided** (2026-10-19): everything that used to sit in `localStorage` is a file `~work/store/<name>.json`
(`~/.local/state/tezcatl/work/store/`). The key keeps its old name (`tezcatl:frame:skins` → `frame-skins.json`).

| Key | File | Written by |
|---|---|---|
| `tezcatl:frame:skins` | `frame-skins.json` | `skin save` (`lib/skin/frame-store.js`) |
| `tezcatl:frame:blocks` | `frame-blocks.json` | `block new`, `block place` |
| `tezcatl:panes:<id>` | `panes-<id>.json` | dragging a splitter (`lib/core/panes.js`, the prototype skins) |
| `tezcatl:matrix:colors` | `matrix-colors.json` | colouring a cell (`lib/xipe/matrix-page.js`) |
| `tezcatl:bookmarks` | `bookmarks.json` | the tree's `m`, the list kind `bookmarks` |
| `tezcatl:killring` | `killring.json` | `panels/invisible/killring.html` |

- **Reading**: `load(key)` reads the file now; `get(key)` is what was last read or set, for the places that must answer at once (a page
  waits for `ready(keys)` before it starts — the frame waits for the skins and blocks before it chooses `workspace_N` or opens `?skin=`)
- **Writing**: `update(key, fn)` reads, changes and writes against what it read (`x-tezcatl-base`), and makes the change again when another
  window wrote meanwhile — so two windows saving skins or toggling bookmarks do not lose each other's. `set(key, value)` is last-write-wins,
  for what one place owns (pane sizes, the kill ring). One window writes a key in order
- **Without the relay**: reads are `null`, writes say they failed; a file that cannot be read is not written over by `update`
- The window's own skin (`tezcatl:frame:work`) stays in `sessionStorage`: it is that window's only, for as long as it lives

**Why**: the browser that opens tezcatl (Poca) keeps nothing — memory-only profiles, no history — so `localStorage` was forgotten on every
close. Keeping it with the relay also makes it one place for every browser and window, and a file a person can read and copy.

**Alternatives**: keeping `localStorage` and having Poca persist it (against Poca's promise to keep nothing); a dedicated relay endpoint
for state (the `/fs` of the work place already reads, writes, checks the base and makes the directory); one file for every key (every
write would rewrite the others, and windows would collide more).

**What was not done**: moving what was in a browser's `localStorage` over automatically — copied by hand once (2026-10-19).

**Files**: `lib/core/store.js`, `test/store.test.js`; its users `lib/skin/frame-store.js`, `lib/skin/frame-lines.js`,
`lib/skin/frame-page.js`, `lib/core/panes.js`, `lib/xipe/matrix-page.js`, `lib/list/kinds/bookmarks.js`, `panels/resident/tree.html`,
`panels/invisible/killring.html`.
