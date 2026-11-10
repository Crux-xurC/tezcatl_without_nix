# `lib/skin/tree-commands.js`

The tree skin's `tree ...` command line, read into {cmd, ...args} (pure).

**Decisions homed here**: [D-tree-skin](#d-tree-skin)

<a id="d-tree-skin"></a>

## D-tree-skin — the tree shows and selects; slots are edited by a list; commands are translated by the skin

**Decided**: a treemacs substitute assembled from parts (the skin `panels/skins/tree.html`).

| Part | Does | Does not |
|---|---|---|
| the slot list (`list.html?config=slots`, kind `slots`) | shows `tree.json` at the FS root (`{ "slots": [{ "order", "tag", "path" }] }`) in `order`, and **edits it** (`add`, `del`, `order`, `tag`, `update`; keys when alone). `Enter` → `tree.root` | — |
| the tree (`panels/resident/tree.html`) | shows the tree, keeps the selected path and posts `tree.selection`; `tree.root` changes the root, `tree.reload` reads again; `Enter` → `code.open` | writing (not even saving on others' behalf) |
| `code_editor` | edits and saves files (`D-files-in-elixir`); the slot file when you want to check or fix it by hand (`tree edit`) | — |
| the command line (`code_cmd_in`) + the skin | reads `tree …` (`lib/skin/tree-commands.js`) and **translates** it into operations on its slot list (`list.action`); `edit` opens in `code_editor` | — |

- A slot is a treemacs project: choosing it makes its path the tree's root, and only that one is in the tree (all slots are in the list)
- **Edit in the list; look closer in vi.** The list's edit is one path — read → change → sort by `order`, renumber from 1 → write — so
  the file is always tidy. `tree update` reads again, tidies (fixing order and numbers broken by hand) and reloads the tree
- **Translation on the skin**: the list has keys for use alone (`M-a`, `M-t`, `M-k`, `M-j`, `Del`), but a letter registered as a key
  cannot be typed in its filter; in the skin, arguments (path, number, tag) come with the command, so that never arises
- **An unreadable file is not written**: if it is not JSON or a slot cannot be read, the list and the skin's status say "could not read
  the list" and writing stops; fix it with `tree edit`, back with `tree update`
- The data's place follows the list rule: `dataFile` in `list_kinds/slots.json` (from the FS root, `tree.json`), not in git
- Windows inside the skin have per-instance suffixes; the skin answers only its own tree, list, `code_editor` and command line

**Commands**: `tree add [<path>]` (none: the directory selected in the tree; refused if not a directory) / `tree del <n>` /
`tree order <n> <m>` (swap) / `tree tag <n> [<text>]` / `tree update` / `tree edit [<path>]` (none: the slot file); the leading `tree`
may be left out. They are tezcatl commands too (`tree.add` … in `command_map.json`); the skin registers them and its own line invokes
the same names. From the palette or another window they reach every open tree skin, so **only the skin focused last runs them** (two
skins never write the same file twice); its own line's run with `{local: true}`. Bookmarks (tree's `m`) stay separate from slots.

**Alternatives**: commands that substitute text in the slot JSON open in `code_editor`; the tree owning slots (the old `tree.json` `roots`)
and their editing.

**Why not**: with one `code_editor`, substitution switches the display from the source being edited to the JSON at every slot change (and is
refused when unsaved); reordering and renumbering become a separate complex process. Editing in a list gathers writing in one place,
always tidy — both problems vanish. A list kind editing its own file is the same as dict and agenda. Given to the tree, the tree would
carry editing.

**Files**: `panels/skins/tree.html`, `panels/resident/tree.html`, `panels/resident/code_cmd_in.html`, `panels/tool/list.html`
(`list.action`), `lib/list/list-kinds.js` (`slots`), `lib/skin/tree-commands.js`, `list_kinds/slots.json`,
`list_kinds/panels_and_skins.json`, `command/command_map.json` (`tree.*`), `lib/code/code-editor.js` (saving).
