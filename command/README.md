# command — every command of Tezcatl, and where to write a new one

What commands Tezcatl has and where each is written; which kind a new command should be and where to add it. This file holds the **whole
list** (name, syntax, a word, the file that has it); the details are in the files named and in [docs/how-to-use.md](../docs/how-to-use.md).
Nothing is copied here twice.

**Kept in step by tests**: `test/command-readme.test.js` checks that every command of `command_map.json`, every ex command of `code_editor`,
every input line of the skins and every intent id is listed here; `test/suggestion.test.js` checks the input lines against
`suggestion/line.json`. A command added without a line here fails the tests.

Lines typed in Xipe Totec's dialogue window (`help`, `show`, `eval` …) mean what Xipe Totec says they mean (`D-xipe-dialogue`), so they are
not listed here: type `help` there.

---

## 1. Telling the kinds apart

Where it is typed decides the mechanism and where it is written.

| Kind | Typed or pressed in | Mechanism | Defined in |
|---|---|---|---|
| **tezcatl command** | the palette (the `commands` list), other windows, keys, a skin's input line | `lib/core/commands.js`: called by name, run by the panel or skin that took it (`D-ui-commands`, `D-command-target`) | names and descriptions in `command/command_map.json`; implementations with `commands.register` in panels' and skins' page scripts |
| **`code_editor` ex command** | `:` inside a `code_editor`; lines starting with `:` in a skin's input line | vim's ex (`Vim.defineEx`); from the input line, bus `code.file` | `FILE_EX` / `OP_EX` of `lib/code/code-editor.js`; the input line's syntax in `OPS` of `lib/code/code-files.js` |
| **a skin's input line** | a skin's one-line input or command line | the skin reads and runs it; many are also tezcatl commands of the same name | parsing in pure files (`lib/skin/frame-layout.js`, `lib/skin/tree-commands.js`, `lib/xipe/matrix-commands.js`, `lib/skin/skin-ex.js`, `lib/skin/*-commands.js`), running in the skin's page |
| **editor key** | `code_editor` (vim's normal mode, or the keys of the keymap it has — `D-code-editor`) | a key only names a tezcatl command (`D-command-target`) | defaults per keymap in `DEFAULT_KEYS` of `lib/code/editor-keys.js`; the user's in `keys` of `code.json` (per keymap) |
| **intent** | the `input` panel (sending to Emacs), `code_el_intent`, the frame's `intent <id>`, decode_emacs keys, `run from` | `lib/vent/resolver.js`: run in Emacs (`emacs.*`, `magit.*`) or in the browser (`browser.backend`) | ids in `command/binding_map.json`; entries in `command/dialects/emacs/extensions/<extension>.json` (Emacs; index `intent_map.json`) and `command/intents/browser.json` (the browser) |

Keys that work only inside one panel (a list's `t` `n`, a table's vim-like moves …) are in that panel's page and in how-to-use; they are not
commands.

---

## 2. The lists

### 2.1 tezcatl commands (`command/command_map.json`)

| Command | Arguments | What it does | File (implementation) |
|---|---|---|---|
| `nav.open` | | open the navigator of panes and windows | `panels/skins/basic.html` |
| `nav.goto` | `kind` `id` `name` | focus a pane (local) or a window (through the relay) | `panels/skins/basic.html` |
| `nav.next` | | the next pane of this skin | `panels/skins/basic.html` |
| `nav.prev` | | the previous pane of this skin | `panels/skins/basic.html` |
| `nav.back` | | back to the pane focused before | `panels/skins/basic.html` |
| `pane.close` | | close the focused pane | `panels/skins/basic.html` |
| `killring.open` | | open the kill-ring picker (also `Esc` `y`) | `panels/skins/basic.html` |
| `tree.open` | | open a file-tree pane | `panels/skins/basic.html` |
| `tree.add` | `path` | tree skin: add a slot (none: the directory selected in the tree) | `panels/skins/tree.html` (syntax `lib/skin/tree-commands.js`) |
| `tree.del` | `n` | tree skin: remove a slot | same |
| `tree.order` | `a` `b` | tree skin: swap two slots | same |
| `tree.tag` | `n` `tag` | tree skin: tag a slot (none: remove the tag) | same |
| `tree.update` | | tree skin: read the slot file again, tidy it, reload the tree | same |
| `tree.edit` | `path` | tree skin: open that file in `code_editor` (none: the slot file) | same |
| `code.write` | `bang` | `code_editor`: save (`bang`: without checking the disk) = `:w` | `COMMANDS` of `lib/skin/skin-ex.js` → `lib/code/code-editor/file-ops.js` |
| `code.edit` | `path` `bang` | `code_editor`: open (new if missing; none: read again) = `:e` | same |
| `code.delete` | `bang` | `code_editor`: delete from the disk (the text stays) = `:Delete` | same |
| `code.rename` | `name` | `code_editor`: rename in the same directory = `:Rename` | same |
| `code.move` | `path` | `code_editor`: move = `:Move` | same |
| `code.to-input` | | `code_editor`: to the skin's input line = vim's `:#` (emacs' `M-x` names it) | `lib/code/code-editor.js` (`D-code-editor`) |
| `code.scratch` | | `code_editor`: write the text over the scratch file (`~work/scratch`); the open file does not change = `:Scratch` | same (`D-work-place`) |
| `code.replace` | `with` | `code_editor`: every `<mark>` in the text becomes an id of the relay's list `<list>` (never given twice); one change (`u` undoes); `with` is `"<mark> <list>"` = `:Replace` | `lib/skin/skin-ex.js` → `lib/code/code-editor/replace.js` (pure part `lib/code/marks.js`, relay `lib/relay/id_pool.exs`, `D-id-pool`) |
| `code.mirror` | | `code_editor`: write the copy now = `:Mirror` | `lib/skin/skin-ex.js` → `lib/code/code-editor/mirror.js` |
| `code.replay` | | `code_editor`: apply the copy to the text (one undo step) = `:Replay` | same |
| `code.reconnect` | | `code_editor`: copy → reopen (the LSP reconnects) → apply the copy = `:Reconnect` | same |
| `mirror.list` | | `file_changes`: read again the copies of `code_editor`s closed unsaved, into the list (`Enter` opens them for `:Replay`, `:w`; `d` `d` removes) | `lib/code/file-changes-page.js` (page `panels/resident/file_changes.html`; relay `POST /mirror/drop`, `GET /mirror/list`, `lib/relay/mirror.exs`) |
| `mirror.drop` | `path` | `file_changes`: remove that copy (only those closed unsaved; never one an open `code_editor` holds) | same |
| `code.lsp-definition` | | `code_editor`: to the definition (another file through `code.open-at`) = `:LspDef`, vim `gd` | `lib/skin/skin-ex.js` → `lib/code/code-editor/lsp-actions.js` |
| `code.lsp-references` | | `code_editor`: the list of references = `:LspRefs`, vim `gr` | same |
| `code.lsp-rename` | `name` | `code_editor`: rename (other files opened in `code_editor` and changed unsaved, `D-rename`) = `:LspRename` | same |
| `code.lsp-format` | | `code_editor`: format with the language server = `:LspFormat` | same |
| `code.lsp-hover` | | `code_editor`: the language server's description (in full in `lsp_log`), vim `K` | same |
| `code.diag-next` | | `code_editor`: the next diagnostic (wrapping), vim `]d` | `lib/skin/skin-ex.js` → `lib/code/code-editor/syntax-nav.js` |
| `code.diag-prev` | | `code_editor`: the previous diagnostic, vim `[d` | same |
| `code.def-next` | | `code_editor`: the next definition (the outline's unit), vim `]]` | same |
| `code.def-prev` | | `code_editor`: the previous definition, vim `[[` | same |
| `code.node-select` | | `code_editor`: select a syntax node; again widens to the parent | same |
| `code.node-parent` | | `code_editor`: to the start of the parent node | same |
| `code.node-next` | | `code_editor`: to the next sibling node | same |
| `code.node-prev` | | `code_editor`: to the previous sibling node | same |
| `code.list` | | the list of open `code_editor`s (`Enter` goes there) | `lib/code/code-locate.js` |
| `code.find` | `path` | which `code_editor` has that path open | `lib/code/code-locate.js` |
| `code.goto` | `line` `col` `path` | to that line of the `code_editor` focused last (with `path`: `code.open-at`) = the input line's `:12` | `lib/code/code-locate.js` |
| `code.open-at` | `path` `line` `col` | to the `code_editor` that has the file, else open it, at that line = `:find` | `lib/code/code-locate.js` |
| `skin.add` | `panel` | frame: add that panel (as the input line's `skin add <panel>` — its default area, else the focused one); run by the frame focused last | `lib/skin/frame-page.js` |
| `skin.read` | `name` | frame: read the skin kept under that name (as `skin read <name>`); the `skin_list` panel's `M-r`; run by the frame focused last | `lib/skin/frame-page.js` |
| `skin.focus` | `place` | frame: move the focus there (as `skin focus <place>`; `abs` is the map); what the lead key's `;:` names (`D-lead-key`); run by the frame focused last | `lib/skin/frame-page.js` |
| `dock.target` | | frame: to the dock's `input_target` (choose where the input line sends by a letter; choosing goes back to the input line); the lead key's `;i` (`D-unified-dock`) | `lib/skin/frame-page.js` |
| `dock.suggest` | | frame: to the dock's source of candidates (`@gsel`); `↑↓` cycles, a letter chooses and goes back, `Enter` goes to the candidates; the lead key's `;g` (`D-suggestions`) | `lib/skin/frame-dock.js` |
| `dock.recv` | | frame: to the dock's `output_target` (choose by a letter whose lines the receiving side shows; choosing goes back); while in the input line it follows the destination; the lead key's `;o` (`D-unified-dock`) | `lib/skin/frame-dock.js` |
| `work.list` | | the record of running and finished work as a list (a frame adds the `work` panel or goes to it; without a frame, a new window) = `work list` | `lib/skin/frame-page.js` (record `lib/core/work-page.js`, `work-log.js`, pairs `work.json`, list `lib/list/kinds/work.js`, `D-work-list`) |
| `work.cancel` | `n` | stop the row of that number (only if its pair has a cancel; sent to the firer) = `work cancel <n>` | same |
| `juncture.set` | | put the current `code_editor`'s file in juncture's index, its text as the root j0 = `juncture set` | `lib/skin/juncture-commands.js` → `lib/code/code-editor/juncture.js` (relay `lib/relay/juncture.exs`, `D-juncture`) |
| `juncture.point` | | make the current `code_editor`'s text a point (a child of the current one) = `juncture point` | same |
| `juncture.back` | | apply the current point's parent to the current `code_editor`, unsaved (the text first becomes a point) = `juncture back` | same |
| `juncture.forward` | | apply the child passed last, unsaved = `juncture forward` | same |
| `juncture.tree` | | the `juncture_tree` panel of the current `code_editor`'s file (`panels/resident/juncture_tree.html`): shown in the frame's if there is one, else added = `juncture tree` | same (panel `lib/code/juncture-tree-page.js`) |
| `markdown.open` | `path` | add a markdown panel drawing the note at `path` (the saved text; a new one each time) = `markdown <path>` | `lib/skin/markdown-commands.js` → `lib/skin/frame-code.js` (panel `lib/code/markdown-page.js`, `panels/resident/markdown.html`) |
| `markdown.follow` | | the current markdown panel follows a `code_editor` of the same skin with the same path (unsaved text, cursor) = `markdown follow` | same |
| `markdown.unfollow` | | the current markdown panel back to the saved text = `markdown unfollow` | same |
| `image.show` | `path` | the frame's image panel shows the picture at `path` (a file of the pages: `assets/…`), none there: one is added = `image <path>` | `lib/skin/image-commands.js` → `lib/skin/frame-code.js` (panel `lib/view/image-page.js`, `panels/extra/image.html`) |
| `task_table.save` | | save the current task_table to its book (the panel's `w`) = `task_table save` | `lib/skin/task-table-commands.js` → `lib/task/task-table-page.js` (`panels/resident/task_table.html`, `D-task-table`) |
| `task_table.put` | | save the current task_table and put it back into the note (`W`) = `task_table put` | same |
| `task_table.list` | | save it, and cut the rows shown (this filter, this order — the rank) into the task list (`~work/books/task_list.json`, the agenda) (`L`) = `task_table list` | same (list `lib/list/kinds/task_list.js`, `D-task-list`) |
| `run.start` | | the current run_table sends its rows, the smallest id with an empty status first (the panel's `R`) = `run start` | `lib/skin/run-table-commands.js` → `lib/task/run-table-page.js` (`panels/resident/run_table.html`, `D-run-table`) |
| `run.stop` | | the current run_table writes `stop` in every empty status (`S`) = `run stop` | same |
| `minimum.open` | | add a code_vi_minimum at the end of the frame's last line = `minimum [what it is for]` | `lib/skin/frame-code.js` (panel `lib/code/minimum-page.js`, `D-minimum`) |
| `check.update-all` | | frame: every `code_editor` of the frame compares what it opened with the disk = `check update all` (run by an intent's `post.commands` after `magit.checkout`, `magit.pull`: `D-intent-later`) | `lib/skin/check-commands.js` |
| `go.on` | | frame: to what the last line with a reference (`@…`) on the receiving side points at = `go on` | `lib/skin/frame-page.js` (references `lib/skin/recv-refs.js`) |
| `code.grep` | `pattern` `path` | search with ripgrep into a list (`Enter` opens) = `:grep` | `lib/code/code-locate.js` |
| `lsp.back` | | the same skin's `lsp_log`: back to where the last LSP jump came from, vim `Ctrl-o` | `lib/code/lsp-log-page.js` (page `panels/resident/lsp_log.html`, record `lib/code/lsp-log.js`) |
| `lsp.forward` | | the same skin's `lsp_log`: forward, vim `Ctrl-i` | same |
| `matrix.update` | | fetch the table again (a `matrix_set`'s table, else the last `matrix.html`) | `lib/xipe/matrix-bar-page.js`, `lib/xipe/matrix-page.js` (page `panels/resident/matrix.html`, syntax `lib/xipe/matrix-commands.js`, target `lib/xipe/matrix-target.js`) |
| `matrix.get` | `path` | fetch the table at that path (if none is open, a new `matrix.html` — `fallback`) | same |
| `matrix.pwd` | | show the table's path | same |
| `color.show` | `color` / `json` `name` | turn the colour panel into that colour (`json` is `{"name": "colour"}` from the FS root); if none is open, a new window | `panels/extra/color.html`, `lib/view/color-page.js` |

How to use them: [docs/how-to-use.md](../docs/how-to-use.md) §3 (the frame), §4 (`code_editor`), §9 (`matrix`).

### 2.2 `code_editor`'s ex commands

Typed inside a `code_editor`, or as a line starting with `:` in a skin's input line (to the current `code_editor`).

| Syntax | What it does | The same tezcatl command |
|---|---|---|
| `:w` / `:write` / `:w!` | save (`!`: without checking the disk). `:w replace <mark> <list>` runs `:Replace` first (no save if replacing fails) | `code.write` |
| `:e` / `:edit` / `:e!` `[path]` | open (new if missing); none: read again; `!` drops unsaved changes. A file another `code_editor` has open opens as a clone (`~work/clone/<path>`, `D-work-place`) | `code.edit` |
| `:Delete` / `:Delete!` | delete from the disk (the text stays) | `code.delete` |
| `:Rename name` | rename in the same directory | `code.rename` |
| `:Move path` | move | `code.move` |
| `:Scratch` | write the text over the scratch file (`~work/scratch`); the open file does not change (`:e ~work/scratch` opens it) | `code.scratch` |
| `:Replace <mark> <list>` | every `<mark>` in the text (where no letter, digit or `_` follows; e.g. `#eigenvalue`) becomes an id (8 lower-case letters and digits, never given twice) of the relay's list `<list>` (`~/.local/state/tezcatl/ids/<list>.json`; lower-case letters, digits, `-`, `_`; made on first use); one change (`u` undoes); not saved | `code.replace` |
| `:Mirror` | write the copy now | `code.mirror` |
| `:Replay` | apply the copy to the text | `code.replay` |
| `:Reconnect` | copy → reopen → apply the copy | `code.reconnect` |
| `:LspDef` | to the definition | `code.lsp-definition` |
| `:LspRefs` | the list of references | `code.lsp-references` |
| `:LspRename name` | rename | `code.lsp-rename` |
| `:LspFormat` | format | `code.lsp-format` |
| `:#` `[text]` | to the skin's input line (with the text); sending comes back; the character is `inputFormEx` in `code.json` | — |

Files: inside `code_editor`, `lib/code/code-editor.js` (`FILE_EX`, `OP_EX`, `fileEx`); reading the input line's lines, `lib/code/code-files.js`
(`OPS`, `parseEx`); wiring from the input line to `code_editor`, `lib/skin/skin-ex.js`.

### 2.3 Lines of a skin's input line

**The input line of skins with a `code_editor` (tree, frame)** (`lib/skin/skin-ex.js`)

| Syntax | What it does | The same tezcatl command |
|---|---|---|
| `:12` / `:12:5` | that line (and column) of the current `code_editor` | `code.goto` |
| `:find path[:line[:col]]` | the `code_editor` that has that file, else open it | `code.open-at` |
| `:grep pattern [path]` | ripgrep's list | `code.grep` |
| `:w` `:e` … | 2.2's ex commands to the current `code_editor` | 2.2 |

**The frame** (`panels/skins/frame.html`; parsing and handling in `lib/skin/frame-layout.js`, running in `run` of `lib/skin/frame-page.js`,
`D-frame`)

How `skin`, `dock`, `block` lines are written: **blanks separate the words; a comma only joins a list of numbers of no fixed length into
one word, with no blank in it** (`skin main 1,2,1`, `skin sub 3,1`, `dock rows 1,2`); **what has a fixed number of parts is that many
words** (a place `skin focus 2 3`, `skin del 2 3`, `skin add 2 3 tree`; the two to swap `skin switch ver 1 2`). Places are said the same
way (`tree at 2 1`, the map, `@2 1`).

| Syntax | What it does |
|---|---|
| `skin main 1,2,1` | ratios of the main axis' areas (1 to 26; for `axis h`, the columns' widths) |
| `skin sub 1,2,1 [area]` | ratios of the panels inside an area |
| `skin axis h` / `skin axis v` | the main axis (h: columns side by side, v: rows stacked; panels present are transposed) |
| `skin add line [position]` | add an area (ratio 1) |
| `skin del line [position]` | take an empty area away (the last when not given; one with panels, or the only one, stays) |
| `skin equal [-m \| -s]` | even (-m the areas, -s inside the focused area, none: both) |
| `skin zoom [-m \| -s] [n]` | make the focused part n times the largest other (10 by default); kept as ratios |
| `skin unzoom [-m \| -s]` | back to the ratios before zoom |
| `skin add <panel> [-bare]` | in the panel's default area (its dressing's `at`, `block place`), else the focused area, else the first |
| `block place <panel> <area>` | where `skin add <panel>` places it (kept in `~work/store`) |
| `skin add <synthesis>` | a name that is no panel's but a synthesis' (`syntheses/<name>.json`, `local/syntheses/`): its panels as one panel with its own name `<name>_<n>`, entered at its main; `skin del <name>` or `<name>_<n>` closes it whole (`D-synthesis`, `lib/skin/synthesis.js`) |
| `skin add database` | a database window (the synthesis `database`, `D-db-session`); its own command line takes the line below |
| `database [id=1] [tab\|window]` | a database window here, or a new frame holding one in a tab / window (`id=1`: window 1, the intents'; `lib/skin/db-commands.js`) |
| `db login [<n>] [<account>]` / `db exit [<n>]` / `db cancel [<n>]` | **in the input line**: database window `<n>` (wherever it is; none: the one focused here) asks for its password in its own field / logs out / stops its statement — over the bus (`db.ask`, `db.exit`, `db.cancel` → `db.said`) |
| `db list open` / `db list close` | the list of database windows (`db_list`, the dock's bottom row) made a third of the dock / back to its line |
| `db login [<account>]` / `db exit` / `db cancel` (no number) | **in a database window's command line**, the whole text exactly one of these: ask for the password again / log out / stop the running statement; any other text is one statement (`lib/db/sql.js` `command`, `lib/db/db-bar-page.js`) |
| `syn [<word>]` | inside the synthesis focused: alone, the words it has; `syn main` its main, the definition's `move` words its other panels (`lib/skin/frame-lines.js`) |
| `color <colour>` / `color <JSON> <name>` | to the colour panel (the tezcatl command `color.show`: the frame's, else an open one, else a new window) |
| `skin add <column> [position] <panel> [-bare]` | add a panel and focus it (a block with thema's band by default; `-bare` a plain panel) |
| `block arrange t\|b\|r\|l\|tl\|tr\|bl\|br` | the focused block's thema on top, bottom, right, left, or turned round a corner onto two sides (an L) |
| `block new <panel> <name\|file\|status> [t\|b\|r\|l]` | make that panel's block (kept in `~work/store`; to ship, `blocks/<panel>.json`) |
| `block min` / `block min line` | shrink the focused block along the sub axis to its band (text visible) / to a line; the panel is only hidden |
| `block unmin` | restore a shrunk block |
| `thema color <palette name\|colour>` | the band's colour on the spot (`base`, `info`, `warn`, `alert`, `calm`, or a CSS colour) |
| `thema thickness <px>` | the band's thickness on the spot (4–200) |
| `thema source <name\|file\|status>` | where the band's line comes from, on the spot |
| `thema text [text]` | a fixed line on the spot (none: remove it) |
| `thema style [name]` | the band's look on the spot (`thema/<name>.css`, `local/thema/` first; none: remove) |
| `thema reset` | remove thema's settings made on the spot (back to the dressing in `blocks/`; side and shrinking stay) |
| `dock side l\|b\|r` | the dock left, below, right (its parts are not reloaded, `D-dock`) |
| `dock size <length>` | the dock's thickness on the current side (`16em`, `240px`, `30%`; the height below, the width left and right) |
| `dock rows a,b,…` / `dock cols a,b,…` | ratios of rows / columns inside the dock on the current side (as many as the grid of `docks/<name>.json`) |
| `dock reset` | remove the dock's size and ratios set on the spot (back to `docks/`; the side stays) |
| `skin del <column> <position>` / `skin del <panel>` | close a panel |
| `skin switch ver a b [column]` / `skin switch hor a b` | swap inside a column / swap columns |
| `skin focus 2 3` / `skin focus x` `x -` `y` `y -` | focus by place (area, then position) or direction |
| `skin focus abs` (short: a line of `:` alone) | to the map at the bottom (`panels/extra/panel_abstract.html`); its `hjkl` and arrows are `skin focus x -`, `y`, `y -`, `x`; `Enter` enters the panel (keys in `lib/skin/panel-abstract-page.js`) |
| `radar` | the current selection of the panel with coordinates focused last (now: tables) as one line with a reference on the receiving side — the table's path, the row type, the column keys and the row ids (`@<id> <id>`), never values; a table of another window works too (coordinates are kept by the resident `cursor` panel; `lib/skin/radar.js`, `D-references`) |
| a lone `@` in a line | replaced by the receiving side's last reference before the line runs — a panel's place now (`21`), a place in a file `path:line`, a coordinate's row ids (separated by blanks); an `@` inside a word (`@attr`, `a@b`) stays; with no reference, the line is not run |
| `go on` | to what the last line with a reference on the receiving side points at; references show at the end of lines as `@2 1` (a panel), `@path:line` (a place in a file), `@<id>` (a `radar` coordinate); a panel is focused, a place is `code.open-at`, a coordinate goes to its panel; lines with references: `skin add`, the tree's `Enter`, `:find`, `code.open-at`'s answers (`D-references`, `lib/skin/recv-refs.js`) |
| `lsp list` | the running language servers, numbered, on the receiving side (`GET /lsp/servers`; parsing and handling `lib/skin/lsp-commands.js`, wiring `lib/skin/frame-code.js`) |
| `lsp stop <name or number>` | stop that language server (a number of the last `lsp list` — taken from the reference the line holds, never by reading the text; `DELETE /lsp/servers/:key`) |
| `lsp timeout <ms> [limit]` | how long this frame's `code_editor`s wait for answers, on the spot (`code.configure`; also for `code_editor`s added later; until the window closes — to keep it, `lsp.timeoutMs` in `code.json`) |
| `lsp restart` | stop the current `code_editor`'s language server and `:Reconnect` that `code_editor` (others `:Reconnect` each) |
| `env xterm [<path>]` | a new xterm (where `skin add xterm` puts it) started in the project around the path — none: the current `code_editor`'s file. The project is the nearest directory up to the FS root with a marker of `project_env.json`; the xterm's shell starts there with that project's environment (asked once, kept — `D-project-env`); no project or a failure: the relay's own, said in the terminal (`lib/skin/env-commands.js`, `lib/relay/project_env.exs`) |
| `env show [<path>]` | which project, by which marker and command, and what its environment changes (the directories put before the relay's PATH, the variables set and unset); asked now if it was not kept |
| `env reload [<path>]` | throw away what is kept of that path's project (none: of every one), so the next language server or `env xterm` asks again (after changing a flake …); running language servers keep theirs till `lsp restart` |
| `work list` | the record of running and finished work in a list panel (`work`; added, or gone to). The invisible `panels/invisible/work.html` keeps it by matching bus messages with the pair table (`work.json`: start and end types and the key). A row is: number, state (`running`, `slow`, `done`, `failed`, `expired` — no end within the pair's `expireMs`), what, who fired it, when, how long. `Enter` goes to the firer, `Del` stops it (`D-work-list`, `lib/skin/work-commands.js`) |
| `work watch` | only the rows of that record not finished (`work_watch`); over the pair's time they are `slow` |
| `work cancel <number>` | stop that row (today LSP requests — `$/cancelRequest`); rows that cannot be stopped, or are done, are said so |
| `who` | a roll call of open panels (dropping those whose closing was never announced), numbered on the receiving side; panels in the frame with their places |
| `diff -n A,B` | two saved files side by side in a new `code_diff` panel (`panels/resident/code_diff.html`), added in the current `code_editor`'s column; paths from the FS root (`~work/…` is the work place), `./` `../` from the current `code_editor`'s file (`lib/code/code-diff.js`, `D-work-place`) |
| `diff -f A,B` | the same two to the focused `code_diff` (else the first of this frame) |
| `:Diff` | the current `code_editor`'s text against the file on the disk — `:Scratch` then `diff -n ~work/scratch,<the file>` (unsaved text goes through the scratch file) |
| `check update [all]` | the current `code_editor` (`all`: every one of this frame) compares the version it opened with the disk (`GET /fs/stat`); on a difference it posts `file.changed` (`file_changes` reads again or tells) and says one line each on the receiving side (with a reference to the `code_editor`); never polled — only when typed (`lib/skin/check-commands.js`, `D-logbook`) |
| `minimum [what it is for]` | add code_vi_minimum (a small vim editor with no file) at the end of the frame's last line. Deliver what was written with `:m`: `:m input` (into the input line), `:m xterm` (pasted into the xterm focused last; not run), `:m code_editor <file>` (at the end of that file's `code_editor`, unsaved), `:m` (back to the panel that asked; else the kill ring). `:q` throws it away; a panel asks with `minimum.ask` (`lib/code/minimum.js`) |
| `task_table take[!] <path> <name>` / `task_table save` / `task_table put[!]` / `task_table list` | a task_table panel editing a note's table (captioned `Table: <name>`; the name may contain blanks) as a table. `take` adds it in the current `code_editor`'s column — reading the table's book (`~work/books/<name>.json`) if there is one, else taking it (`take!` takes it again over the book). Tables without the required columns (`tasks/task_table.json`: `id`, `state`, `task`, `inner_id`) are refused. Inside: matrix's keys (hjkl, `v`, sorting by a heading, `/`, `c`, `y`) and `i` / `Enter` (edit a cell; ids set are refused), `o` / `O` (a sibling / child row, numbered), `d` `d`, `J` / `K` (refused while sorted), `w` (to the book: every row, in the order shown; rows whose id is empty or the mark get ids), `W` (`w`, then into the note; refused if the note's table changed since taken — `put!` overrides; a `code_editor` with the note gets it unsaved, else the file), `L` (`w`, then the rows shown, in order, cut into the task list — the agenda — writing over the fixed `~work/books/task_list.json`). `save`, `put`, `list` go to the focused task_table (else the frame's first); `t` in a markdown panel takes one too (`lib/task/task-table.js`, `lib/skin/task-table-commands.js`) |
| `run new[!] <template> [<name>]` / `run from[!] <intent> [<name>] [<arg>=<value> …]` / `run start` / `run stop` / `run save[!] <path>` / `run insert-if <status> #<id>` / `run match <record> [<book>]` | a run_table panel sending rows one by one to their input (`D-run-table`). `new` makes a temporary book (`~work/books/run/<name>.json`; the template's name if none) from a template (`tasks/run/<template>.json`, or the path of a book saved with `run save`) and adds it to the frame — an existing book of that template is read, `new!` makes it again. Columns: `id`, `input` (an input_target letter: `t`, `e`, `c`, `x`, `x2`), `line` (lead-key notation as in the input line; variables from the eighth column inserted as `{column}` — a `;` in a value becomes `;;`), `wait` (seconds; empty: the default of `tasks/run_keys.json`), `auto` (`F`: `skip` when a smaller id failed), `status`, `note`. `start` sends the smallest id with an empty status, marks it `sent`, and during the wait compares the heads of its destination's output lines (tezcatl: the frame's receiving side; xterm: the terminal's lines) with the keys (`tasks/run_keys.json` under the template's `keys`): a match is that key, none is `done`; not sent is `send-failed`; once filled, the next row. `stop` writes `stop` in every empty status. Inside: matrix's keys and `R`, `S`, `i`, `Enter`, `o`, `x` (empty the status to send again), `-` (leave a row out: status `-`), `d` `d`. `save` writes the book to a file (`save!` over one). `insert-if` is written in a row's `line` and sent to tezcatl: when the row above (the largest smaller id) has `<status>`, a copy of row `#<id>` (status and note empty) goes just under it (ids one decimal down: `4` → `4.1`, `4.1` → `4.11`; another decimal when there is no room); that row is `done` at once (its note says what it did); taken by the one run_table of this skin sending a row, refused (a `! ` line) for none or two. `from` makes a book from an intent's answer by its `result.book` (the template, and which key of the answer goes to which variable column — [docs/extending/intents.md](../docs/extending/intents.md)); an existing book of that intent is read, `from!` asks again. `match` adds a run_match panel setting an output_log's record (a file written by `log start`) beside the book row by row (each row's destination's lines, from that row to the next row sent to the same destination, compared by their heads with the keys; `≠` where the book's status differs; `Enter` shows the part in full, `r` reads again; the book is found from the record when omitted) (`lib/task/run-table.js`, `lib/skin/run-table-commands.js`) |
| `intent <id> [<name>=<value> …]` | ask the input panel (the one place that runs intents) to run an intent and say its answer on the receiving side (`intent ── <id> ok <answer>`; a failure `! intent ── …`; no answer in 6 s `! … no answer`); a value runs to the next blank, or is a JSON string (`path="a b.js"`); for calling intents from run_table rows (`D-run-table`, `lib/skin/intent-commands.js`) |
| `table <intent> [<name>=<value> …]` | the intent's answer (its `result.table`) in a decode_emacs of its own: the one the frame added for that intent is asked again, else one is added (`?intent=&args=`, it asks on opening); a decode_emacs key of the kind `table` does the same (`table.open`; `D-decode-emacs`, `lib/skin/intent-commands.js`) |
| `log start[!] [<path>]` / `log stop` / `log` | start a record of the output (the invisible panel output_log), write the last and stop, or say whether one is writing. It keeps the frame's receiving side, the skin's xterms' lines, emacs-vent and what run_table says of its rows (`run` lines), one line each as text (`12:00:01.234 xterm:<panel> │ <line>`). No path: `~work/logs/<date>_<time>.log`; `!` over a file there. Written whole every 2 s, stopping at 5 MB; one per frame. Written as run_table rows, it records just the run (`D-run-table`, `lib/skin/log-commands.js`) |
| `image <path>` | the image panel of the frame (the focused one, else the first) shows a picture of the pages (`assets/…`; the relay's `/fs/read` takes text only, so not a file of the FS root yet); none: one is added in the focused area. A panel opened with no path shows `assets/tezcatlipoca.png` (`lib/view/image.js`, `lib/skin/image-commands.js`) |
| `markdown <path>` / `markdown follow` / `markdown unfollow` | a markdown panel drawing a note read-only (`@lezer/markdown` + GFM, `lib/vendor/codemirror/markdown.bundle.js`). `<path>` adds it in the current `code_editor`'s column (the saved text, read again on save notices). `follow` makes the focused (else the frame's first) markdown panel follow a `code_editor` of the same skin with the same path — drawing its unsaved text and marking the block with its cursor; it lets go when that `code_editor` opens another file or closes. Inside: `j`, `k`, `Enter` (to the block's line), `f` (toggle follow), `r`. Raw HTML stays text; images are not loaded — the path is said (`lib/code/markdown.js`, `lib/skin/markdown-commands.js`) |
| `juncture set\|point\|back\|forward\|tree [path]` | a tree per file of points a person checked (`D-juncture`). `set` puts the file in the index with its text as the root j0; `point` makes the text a child of the current point (`set` first if needed); `back` / `forward` apply the parent / the child passed last to `code_editor`, unsaved (`u` undoes, `:w` saves; a text differing from the current point first becomes a point). `tree` is the `juncture_tree` panel (the frame's if any, else added in the current `code_editor`'s column; `j` `k` choose, `Enter` applies the point unsaved, `d` compares with the disk in `code_diff`, `o` opens the point, `r` reads again; it reads again when points change). No path: the current `code_editor`; with one, the `code_editor` that has it (added if none). Pushing out (`juncture.files` 10 files, `juncture.slots` 20 points per file in `code.json`) is said on the receiving side (`lib/code/juncture.js`, `lib/skin/juncture-commands.js`, `lib/code/code-editor/juncture.js`, relay `lib/relay/juncture.exs`) |
| `open <page> [tab\|window]` | a page of the launcher (an id or alias of `list_kinds/panels_and_skins.json`, panels and skins) in a new tab or a new window, from this frame's window; none: `launcher.open-mode` of `config.json`. In Poca the tab or window keeps the secret, so the relay answers it; a refused pop-up is said (`lib/core/open-page.js`, `D-open-page`) |
| `skin name <name>` | name it |
| `skin save [name]` | save (the JSON on the receiving side) |
| `skin read <name>` | open a saved one (the `skin_list` panel lists them) |

**The tree skin** (`panels/skins/tree.html`, syntax `lib/skin/tree-commands.js`; the leading `tree` may be left out): `tree add [path]`,
`tree del n`, `tree order n m`, `tree tag n [text]`, `tree update`, `tree edit [path]` — the same as 2.1's `tree.*`.

**The command line of `matrix_set`** (a synthesis — `syntheses/matrix_set.json`, run by `lib/xipe/matrix-bar-page.js`; it replaced the matrix skin; syntax `lib/xipe/matrix-commands.js`; the leading `matrix` may be left out): `matrix update`,
`matrix get <path>`, `matrix pwd` — the same as 2.1's `matrix.*`. Also `radar` (this table's selection becomes "the last reference"; the band
shows `radar ── <table path>  <type>  [<columns>]  @<id>` — `lib/skin/radar.js`).

**The dialogue window** (`panels/skins/xipe.html`): lines go to Xipe Totec as they are, except that a lone `@` is replaced, before sending,
by the last reference (a `radar` typed in any window; `radar` → `eval @`). An `@` inside a word stays; without a reference the line is not
sent, and that is said.

### 2.4 editor keys (`code_editor`, per keymap)

The keymap is `editorKeymap` in `code.json` (`D-code-editor`). vim's keys work in normal mode; emacs' as Emacs writes them.

| Command | vim | emacs |
|---|---|---|
| `code.lsp-definition` | `gd` | `M-.` |
| `code.lsp-references` | `gr` | `M-?` |
| `code.lsp-hover` | `K` | `C-h .` |
| `code.diag-next` / `code.diag-prev` | `]d` / `[d` | `M-g n` / `M-g p` |
| `code.def-next` / `code.def-prev` | `]]` / `[[` | `C-M-e` / `C-M-a` |
| `lsp.back` / `lsp.forward` | `Ctrl-o` / `Ctrl-i` | `M-,` / `C-M-,` |
| `code.to-input` | (`:#`) | `M-x` |

Defaults in `DEFAULT_KEYS` of `lib/code/editor-keys.js`. `keys` in `code.json` lies over them per keymap
(`{"vim": {…}, "emacs": {…}}`; `""` removes one; the older flat form is vim's). Keys of a keymap other than vim are written as Emacs
writes them (`C-` `M-` `S-` `s-`, a space between strokes) or as CodeMirror does (`Ctrl-Alt-e`).

### 2.5 intents

The ids in `command/binding_map.json` are the intents the `input` panel (and `intent <id>`) can call.

| id | Runs in | What it does | File |
|---|---|---|---|
| `magit.changed-files` | Emacs | untracked, unstaged and staged files as a decode_emacs table (`s` stage, `u` unstage, `d` against HEAD, `C` commit — the message from a code_vi_minimum, `H` the file's hunks; `result.table`, `D-decode-emacs`); `run from` it makes a run_table of `magit_stage` (`result.book`) | `command/dialects/emacs/extensions/magit.json` |
| `magit.unstaged-files` | Emacs | files not staged | `command/dialects/emacs/extensions/magit.json` |
| `magit.staged-files` | Emacs | staged files | same |
| `magit.stage-file` | Emacs | stage a file | same |
| `magit.unstage-file` | Emacs | unstage a file | same |
| `magit.commit` | Emacs | commit (no editing buffer) | same |
| `magit.file-at-head` | Emacs | the text of a file as it is in HEAD (what decode_emacs' `d` compares in `code_diff`) | same |
| `magit.log` | Emacs | the last commits as a decode_emacs table (`count` default 50, `rev` default HEAD; `f` the commit's files) | same |
| `magit.commit-files` | Emacs | the files a commit changed as a table (`d` the file at the parent against the file at the commit) | same |
| `magit.file-at-rev` | Emacs | the text of a file at a revision (`rev` empty: the index) | same |
| `magit.hunks` | Emacs | the hunks of the unstaged and staged changes as a table (`s` stage, `u` unstage one, `Enter` the file at it, `d` against its base) | same |
| `magit.stage-hunk` | Emacs | stage one hunk (the diff made again in Emacs, its @@ line checked) | same |
| `magit.unstage-hunk` | Emacs | unstage one hunk | same |
| `magit.branches` | Emacs | the local branches as a table (`*` the current one, upstream, ahead / behind as of the last fetch; `Enter` / `o` check out, `n` a new branch from the row's, `f` fetch, `F` pull, `P` push the row's branch) | same |
| `magit.checkout` | Emacs | check a branch out (git decides about uncommitted changes); then `check.update-all` | same |
| `magit.branch-create` | Emacs | make a branch (`from`: empty is HEAD) and check it out; then `check.update-all` | same |
| `magit.fetch` | Emacs | fetch (`remote`: empty is git's default) — a later intent (`D-intent-later`) | same |
| `magit.pull` | Emacs | pull into the current branch, `--ff-only` — later; then `check.update-all` | same |
| `magit.push` | Emacs | push a branch (empty: the current one) to its upstream only; `set-upstream=<remote>` makes one; no force — later | same |
| `magit.stashes` | Emacs | the stashes as a table, newest first (`z` stash the changes, the message from a code_vi_minimum; `p` pop the row's, `a` apply it) | same |
| `magit.stash-push` | Emacs | stash the index and the working tree (Magit's `magit-stash-save`; `untracked=true` untracked files too; `message`); then `check.update-all` | same |
| `magit.stash-pop` | Emacs | pop a stash (`stash@{n}`); git's words when it refuses (the stash kept); then `check.update-all` | same |
| `magit.stash-apply` | Emacs | apply a stash, keeping it; then `check.update-all` | same |
| `magit.discard-file` | Emacs | discards (`D-discard-confirm`: `X` twice, or `intent!`): an unstaged change (back to the index) or an untracked file (to the trash); a staged row refused; then `check.update-all` | same |
| `magit.discard-hunk` | Emacs | discards: one unstaged hunk out of the working tree (its @@ line checked); then `check.update-all` | same |
| `magit.restore-file` | Emacs | discards: the file in the index and the working tree as at `rev` (default HEAD; `R` in a commit's files); then `check.update-all` | same |
| `magit.stash-drop` | Emacs | discards: drop a stash (`X` in the stashes) | same |
| `emacs.save-buffer` | Emacs | save the buffer (an example of keys) | `command/dialects/emacs/extensions/emacs.json` |
| `emacs.hooks-status` | Emacs | how many hooks are registered | same |
| `emacs.vent-context-state` | Emacs | the state of vent's context | same |
| `emacs.insert-text` | Emacs | insert the selection into Emacs | same |
| `compile.run` | the browser | build the compile command from the last `code_*`'s language and send it to the last `xterm` | `command/intents/browser.json`, `lib/vent/compile-intent.js` (`compile.json`) |
| `compile.run-nix` | the browser | `compile.run` with `nix develop --command` | same |
| `agenda.open` | the browser | open the agenda (the task list) (`C-c a`) | `command/intents/browser.json`, `lib/vent/agenda-intent.js` |
| `db.tables` | database window 1 | the tables of its database as a decode_emacs table (`like` default `%`); stops when window 1 is not open or not logged in | `command/intents/db.json` (`sql`) |
| `db.magit-section` | database window 1 | a book (`book`, default `decode/magit.changed-files`: `b` in that decode_emacs) made the temporary table `t_in`, its files of one `section` (default `unstaged`) in the book's order — a decode_emacs table, and a run_table's rows (`run from db.magit-section`, the template `magit_stage`); an example of `sql.load` | `command/intents/db.json` (`sql`) |

How to add one: [docs/extending/intents.md](../docs/extending/intents.md).

---

## 3. Adding one

The table of what to write and where, for every kind, is [docs/extending.md](../docs/extending.md). In short:

| To add | Write | Also update |
|---|---|---|
| an operation callable from the palette or another window | a **tezcatl command**: `command/command_map.json` with `name`, `desc` (`args`; a `fallback` if needed; `line` (`"skin add {panel}"`, one-word arguments) when one line of the frame's input does it — then no implementation is written, `lib/skin/frame-lines.js`; `quiet` to not echo `> line`); the implementation in the page script that takes it (`lib/<role>/<name>-page.js`, never in HTML) with `Tezcatl.commands.register(name, fn)` (return `false` when not yours) | §2.1 here; who runs it: `D-command-target` |
| an operation on `code_editor`'s current file or text | a **`code.*` tezcatl command**: `COMMANDS` of `lib/skin/skin-ex.js` (name → `op`), `OP_EX` (`op` → `fileEx`) and `fileEx` of `lib/code/code-editor.js`, the work in `lib/code/code-editor/`; as an ex command too: `FILE_EX` and `OPS` of `lib/code/code-files.js` | §2.1, §2.2; `D-vim-via-input-line` (buffers, windows, search come as input-line commands) |
| a line only for a skin's input line | parsing in a pure file (`lib/skin/*-commands.js`, `lib/skin/frame-layout.js`), running in the skin's page; test the parsing | §2.3 and a row in `suggestion/line.json` (`test/suggestion.test.js` watches — `D-suggestions`); also a tezcatl command if other windows should call it |
| a key | make it a tezcatl command first, then `DEFAULT_KEYS` of `lib/code/editor-keys.js` (a default) or `keys` in `code.json` (per keymap) | §2.4 |
| work shown by `work list` | one pair in `work.json` (start type, end type, the key that matches them, `cancel` if it can be stopped, `expireMs` for pairs whose end may never come); both must flow on the bus — if not, add the two messages (`D-work-list`) | `test/work-log.test.js` reads `work.json` |
| telling a person what happened along the way | post `recv.say {text, cls?, ref?}` from the panel (another panel as a reference: `{kind: "bus", id, name}`); the frame shows it (`D-say-side-effects`) | — |
| something Emacs runs | an intent: one entry in `command/dialects/emacs/extensions/<extension>.json` (a new file is named in `extensions` of `intent_map.json`) and `{ "id" }` in `command/binding_map.json`; embedding values and wrapping are common (`lib/vent/elisp.js`) — no JS per extension | §2.5; [docs/extending/intents.md](../docs/extending/intents.md) |

Whatever the kind: the tests (`node --test test/*.test.js`, `test/e2e/` if needed) and the use in [docs/how-to-use.md](../docs/how-to-use.md).
A decision with a reason goes into the record of its main file ([docs/files/](../docs/files/index.md)).

---

## 4. The files here

| File | Contents | Read by |
|---|---|---|
| `command_map.json` | tezcatl commands: name, description, arguments, `fallback`, `line`, `quiet` | `lib/core/commands.js` |
| `binding_map.json` | the intent ids (and keys) the `input` panel can call | `lib/vent/resolver.js` |
| `dialects/emacs/intent_map.json` | the index of Emacs extensions (names in `extensions`) | `lib/vent/resolver.js` |
| `dialects/emacs/extensions/<extension>.json` | that extension's intents (Elisp form templates, `emacs.form`); ids `<extension>.<name>`; now `magit` and `emacs` (Emacs itself and emacs-vent) | `lib/vent/resolver.js` (forms built by `lib/vent/elisp.js`) |
| `intents/browser.json` | intents run in the browser | `lib/vent/resolver.js` |
| (at the root) `work.json` | the pair table of the work list (start type, `where`, end types, `fail`, key, text, `slowMs`, `expireMs`, `cancel`); one entry per kind of work | `lib/core/work-page.js` (`lib/core/work-log.js`) |
| (at the root) `suggestion/line.json` | the table of input lines (the candidates' source `line`: `line`, `desc`, `in`); add a row for every new line | `lib/suggest/line.js` (`D-suggestions`) |
| `matrix_bindings.json` | where table keys would become input-line templates (empty; for when it is wanted — `D-references`) | nobody yet |
