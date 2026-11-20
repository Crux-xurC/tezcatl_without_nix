# `lib/xipe/xipe-classes.js`

Matrix.html's kind="xipe_classes" adapter logic (pure): Xipe Totec's card/list result -> the generic grid's {columns, rows}, the
functions whose class waits for a person's approval.

**Decisions homed here**: [D-xipe-approval](#d-xipe-approval)

**Takes part in**: [D-matrix-shell](lib-xipe-matrix-grid.js.md#d-matrix-shell)

<a id="d-xipe-approval"></a>

## D-xipe-approval — the classes waiting for a person are a table, and `matrix approve` approves the rows selected

**Decided** (2026-11-21): Xipe Totec evaluates a function only when a person classified it. An AI agent (over `xipe mcp`) can only
propose a class with a reason (`effect/propose`), and a rescan takes back a person's class when the function's body changed since
(xipe_totec's D-effect-approval). Both wait for `effect/approve`. Tezcatl shows them and lets a person approve them:

- **The table**: `matrix.html?kind=xipe_classes&ref=all` (`matrix get xipe_classes:all`; `ref` may be `source=agent` or
  `source=changed`). `card/list` once; the cards whose `effect_source` is `agent` or `changed`, each a row: the function, the class,
  why it waits ("proposed", "body changed"), the agent's reason, its calc rows. Only card/list's own fields are used. The reason is the
  agent's text: shown as it is, never acted on
- **The source beside it**: `g d` on a row opens the function in a `code_editor` at its line (`card/list`'s `path` and `line`, matched
  to the FS root by `lib/xipe/xipe-place.js`, as `xipe_rows`). The class, the reason and the source are read together before approving
- **Approving**: `matrix approve` (a tezcatl command `matrix.approve`; matrix_bar's command line sends `matrix.approve` to its table)
  sends `effect/approve {ids}` with the ids of the rows selected (the grid's coordinate: the cursor's row, or a visual selection). Xipe
  Totec approves all of them or none and says why; the table is then fetched again and says how many were approved. On another kind
  of table, or with nothing selected, it is refused and said
- **The one write from the table**: [D-matrix-shell](lib-xipe-matrix-grid.js.md#d-matrix-shell) keeps the table read only, changes
  going to the dialogue window. Approving is the exception, and the only one: approving is what this table is for, the ids are the
  rows the person selected in it, and what is written (the class as it stands) is what the table shows. Nothing else is written from
  a table

**Alternatives**: approving in the dialogue window (`radar` on the table, then a line with `@` — Xipe Totec's `input` would need an
`approve <ids>` form, and the person goes between two windows for one act); approving every row shown at once; showing the source in
the table.

**Why not**: two windows for one act, read in one place, makes the approval easier to skip than to read; approving everything shown
approves rows not looked at; a function's source in a one-line cell cannot be read, and `code_editor` already shows it with the
language's highlighting.

**Files**: `lib/xipe/xipe-classes.js`, `lib/xipe/matrix-page.js`, `lib/xipe/matrix-commands.js`, `lib/xipe/matrix-bar-page.js`,
`panels/resident/matrix.html`, `command/command_map.json`, `bus/messages.json` (`matrix.approve`), `suggestion/line.json`,
`test/xipe-classes.test.js`, `test/e2e/xipe_approve.mjs`.
