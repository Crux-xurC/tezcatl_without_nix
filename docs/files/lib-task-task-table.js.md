# `lib/task/task-table.js`

The task_table panel (D-task-table), the pure parts: a note's table (lib/code/markdown.js tables) taken into a book, edited as a table, and put back into the note as markdown.

**Decisions homed here**: [D-task-table](#d-task-table)

<a id="d-task-table"></a>

## D-task-table — a note's table is taken into a book, edited as a table and put back into the note; matrix's shell is borrowed, the panel and commands are its own

**Decided**: the middle layer of markdown → table → task list (editing as a table). `matrix.html` stays Xipe Totec's table shell; as list
kinds derive from `list.html`, a separate panel `task_table` borrows only the drawing parts (`lib/xipe/matrix-grid.js`, `matrix-data.js`,
`matrix-render.js`). Its column rules and commands are its own (in matrix they would bind matrix's freedom).

- **Taking**: `task_table take <path> <name>` (the name may have blanks — the rest of the line) or `t` in a markdown panel. The note's
  table is found by its pandoc caption (`tables`, `findTable` of `lib/code/markdown.js`) and becomes a **book** (`~work/books/<name>.json`
  — in the work place, so `/fs`'s checked reads and writes work as they are). An existing book is read; `take!` takes it again over it.
  The note is read from the `code_editor` that has it (its text now), else from the disk
- **Column rules** are `tasks/task_table.json`: four required columns (`id` — the place, `t-02-01`; `state`; `task`; `inner_id` — the
  row's id), the mark, the id list, the number prefix, the order of states. A table without them is refused with a reason; other columns
  are carried as they are
- **Editing**: `i` / `Enter` a cell (a typed `|` is escaped, newlines become blanks); **an id once set is never edited**. `o` a sibling
  (the next number of the same level), `O` a child (numbered too), after the row's descendants. `d` `d` deletes, `J` / `K` move (not while
  sorted)
- **`w` to the book**: every row in the order shown (sorted: in that order, compared as the grid compares) — a filter hides none (dropping
  hidden rows is the task list's rule; here it would delete rows from the note). Rows whose `inner_id` is empty or the mark get ids
  (`D-id-pool`)
- **`W` to the note**: after `w`, the note's table of the same name is replaced whole with its caption (`toMarkdown`, aligned to display
  width). If the note's table changed since it was taken (a different hash of its range), refused — `task_table put!` puts it anyway,
  `take!` takes again. A `code_editor` that has the note gets it **as an unsaved edit** through `code.edits` (refused if it has unsaved edits);
  otherwise the file is written with the check and `fs.changed` posted
- **Target**: `task_table save` / `put[!]` / `list` go to the focused task_table (else the frame's first) as `task_table.do`

**Alternatives**: editing and keys added to `matrix.html`; the book in a new mouth of the relay (a state directory); `w` writing only the
rows a filter shows; replacing only the changed part of the note's table.

**Why not**: in matrix, Xipe Totec's tables would carry column rules and keys. In the work place, `/fs`'s checked writes suffice — no
change to the relay. Writing only shown rows deletes rows from the note. Replacing part of a table needs knowing which rows are the same,
which rows without ids cannot tell — the whole table is sure.

**Files**: `lib/task/task-table.js` (pure), `lib/task/task-table-page.js`, `panels/resident/task_table.html`, `tasks/task_table.json`,
`lib/skin/task-table-commands.js`, `lib/code/markdown.js` (`tables`' `align`; empty cells used to shift columns), `lib/code/markdown-page.js`
(`t`), `lib/skin/frame-code.js`, `lib/skin/frame-lines.js`, `panels/skins/frame.html`, `command/command_map.json`, `bus/messages.json`
(`task_table.do`, `task_table.open`), `test/task-table.test.js`, `test/task-table-commands.test.js`, `test/e2e/task_table.mjs`.
