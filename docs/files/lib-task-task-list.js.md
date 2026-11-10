# `lib/task/task-list.js`

The task list (D-task-list), the pure parts: the rows of a task_table cut into the one task list (~work/books/task_list.json), and what a row changed there does to the task_table's book.

**Decisions homed here**: [D-task-list](#d-task-list)

<a id="d-task-list"></a>

## D-task-list — the task list is one book cut from a task_table; the agenda shows it as rows and its changes go back to the table's book

**Decided**: the last layer of markdown → task_table → task list (editing as rows) — Emacs' org-agenda. It replaced the older agenda (the
list kind `task` and `todo.json`).

- **Cutting**: task_table's `L` (`task_table list`) = `w`, then **the rows shown** (filter and order — the order is the rank) written over a
  fixed `~work/books/task_list.json` ("save as" to a fixed place). Hidden rows are not in it (cutting would mean little otherwise)
- **The agenda** (`C-c a`, the panel `agenda` = `list.html?config=agenda`, list kind `task_list`) shows it in order: "state [#priority]
  title" with the number. Keys (`list_kinds/agenda.json`): `t` next state, `d` DONE, `x` CANCELLED, `M-n` a new task (the filter's text; an
  id is given, the number is the next top level), `Enter` opens the note at that id's line (`code.open-at`), `Del` only takes it off the
  list
- **Changes replace the row of the same id in the task_table's book** (the list's book too, each written against what was read). `d` and
  `x` set **every row under it in the book** (by number — rows not in the list too) to the same state (a closed parent closes its children,
  as org's tree). A new task is added to the book. **No row is deleted from the book** (that is task_table's job). After writing,
  `fs.changed`; an open task_table without edits of its own reads again
- **Back to the note is task_table's `W`** (one layer at a time); the agenda never touches notes
- `todo.json` is no longer used (the file stays as local data)

**Alternatives**: the task list in matrix's shell too; list changes going back to the note at once; leaving children not in the list
undone; keeping the old `task` kind beside it.

**Why not**: changing state row by row with keys is what a list is made for. Going to the note should pass task_table's check (has the
table changed since it was taken?) — one layer at a time also shows how far things went. Closing a parent closes its children — hidden or
not, a child is a child. Keeping both makes two places for tasks.

**Files**: `lib/task/task-list.js` (pure), `lib/list/kinds/task_list.js`, `lib/list/list-kinds.js` (`KINDS`), `list_kinds/agenda.json`,
`panels/tool/list.html` (loads `lib/task/*.js`), `lib/task/task-table-page.js` (`L`, reading again), `lib/skin/task-table-commands.js`
(`list`), `command/command_map.json` (`task_table.list`), `bus/messages.json`, `command/intents/browser.json`, `lib/vent/agenda-intent.js`,
`test/task-list.test.js`, `test/list-kinds.test.js`, `test/e2e/agenda.mjs`.
