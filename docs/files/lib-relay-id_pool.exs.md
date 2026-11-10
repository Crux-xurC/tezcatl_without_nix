# `lib/relay/id_pool.exs`

The id lists (D-id-pool): ids a note's `#eigenvalue` marks are replaced with (code_editor's `:Replace <mark> <list>`, `:w replace ...`).

**Decisions homed here**: [D-id-pool](#d-id-pool)

<a id="d-id-pool"></a>

## D-id-pool — marks in a text are replaced with ids from a list the relay keeps; an id is never given twice

**Decided**: rows of tables and tables themselves get a key (an id) without a person inventing one. One of the few operations where
Tezcatl rewrites a person's text, so: only when typed, only a set mark, and it says what it did.

- **`:Replace <mark> <list>`** (`code.replace`): every `<mark>` in the text becomes an id of the list `<list>`, as **one change** (one `u`
  undoes all); not saved. A mark is a string without blanks, replaced only **where no letter, digit or `_` follows**
  (`taskmatrix_#eigenvalue` is a mark, `#eigenvalues` is not). The mark's name is a person's choice
- **`:w replace <mark> <list>`**: `:Replace`, then the usual checked save. A failed replacement does not save; a save stopped by a
  conflict leaves the replaced text unsaved. Ids given out stay given out
- **The relay keeps the lists** (`lib/relay/id_pool.exs`, one GenServer — two `code_editor`s saving at once never take the same id), in
  `~/.local/state/tezcatl/ids/<list>.json` (`TEZCATL_IDS_DIR`): `available` (used from the top) and `issued` (ids given, when, to which
  file). `POST /ids/take?list=&n=&path=` takes n from the top into `issued` and refills `available` to 100 with ids in neither. A list is
  made on first use; names are `[a-z0-9_-]`; an unreadable list is not rewritten
- **An id is 8 lower-case letters and digits** (36⁸ ≈ 2.8 × 10¹²). What was given is not for people to read (only the relay touches it)
- **The pure part that reads tables** (`tables`, `findTable` in `lib/code/markdown.js`): each GFM table named by its pandoc caption
  (`Table: <name>`, blanks allowed), cells as markdown source (writing back keeps formatting), with the ranges of the table and its caption.
  Two tables of one name: no choice, a reason. A `Table:` line between two tables belongs to the first (as the panel draws it)

**Alternatives**: a round trip (names in the editor, ids on the disk, swapped on opening and saving); recycling used ids to the end
(`toend`); random ids each time with no list; replacing only in the bytes saved (the editor keeps marks); `code_editor` reading and writing the
list file itself.

**Why not**: a round trip is unreadable by other tools (editors, git, `:grep`), and the save check, the mirror, juncture and `code_diff` all
assume "the editor's text = the disk's" — each would need patching. Recycling brings an id back after one round: no longer a key. Random
ids checked against `issued` would also avoid duplicates, but "from the top" is easier to follow. Replacing only the saved bytes has the
round trip's problem. Two `code_editor`s writing the file themselves can take the same id.

**Files**: `lib/relay/id_pool.exs` (`IdPool`, `IdPoolHandler`), `lib/code/marks.js` (pure), `lib/code/code-editor/replace.js`, `main.exs`,
`lib/code/code-editor.js`, `lib/code/code-files.js`, `lib/skin/skin-ex.js` (`code.replace`), `lib/code/markdown.js`,
`command/command_map.json`, `test/e2e/stack.sh` (`TEZCATL_IDS_DIR`), `test/relay/id_pool_test.exs`, `test/marks.test.js`,
`test/markdown.test.js`, `test/e2e/replace.mjs`.
