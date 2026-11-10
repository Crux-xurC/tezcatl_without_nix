# `lib/xipe/matrix-grid.js`

The generic, backend-agnostic grid engine behind panels/resident/matrix.html (matrix.html section, design).

**Decisions homed here**: [D-matrix-shell](#d-matrix-shell)

**Takes part in**: [D-references](lib-skin-recv-refs.js.md#d-references)

<a id="d-matrix-shell"></a>

## D-matrix-shell — `matrix.html` is a generic grid that knows nothing of Xipe Totec; fetching and meaning go to adapters

**Decided**: the table `panels/resident/matrix.html` (its logic DOM-free in `lib/xipe/matrix-grid.js`) takes `{columns, rows}` and shows
them. How Xipe Totec's data is fetched and what it means are in an adapter per `kind` (as `list.html` and its kinds).

- **Inside the shell**: cursor moves (hjkl), visual selection of cells, row selection from the gutter of row numbers
  (`selection.scope: "row" | "cell"`), sorting, filtering (`/`; expressions read by a small parser, never evaluated as JS), colours (`c`
  then `b`/`r`/`y`, `w` clears), CSV, yank (`y` → `killring.add`)
- **What leaves the shell**: opening a place (`g d`), and the coordinate of the selection to `cursor` (`D-references`; the earlier
  `matrix.action {chord, selection}` was removed). What a key means is a translation layer's (`matrix_bindings.json`, empty for now)
- **Colours are kept by row id and column key** (`~work/store/matrix-colors.json`, `D-store` = `{rowId: {colKey: "b"|"r"|"y"}}`), never
  by position — sorting and filtering would move colours to other cells
- **Opened by the query only**: `matrix.html?kind=<adapter>&ref=<opaque reference>&root=<key of xipe.json>` (or
  `?path=<kind>:<ref>[@<root>]`); the shell does not read `ref`
- **Read only**: the table changes no data. Changing data is a command handed to the dialogue window
- **No automatic refresh**: a person fetches again. `matrix.html` keeps `{kind, ref, root}`, takes `matrix.reload` / `matrix.load` and
  posts `matrix.loaded {kind, ref, root, ok, message, rows}` each time. The `matrix` skin (table + command line) has three commands,
  `matrix update` / `matrix get <path>` / `matrix pwd` (`lib/xipe/matrix-commands.js`), also tezcatl commands
- **Rows as sentences** (`kind=xipe_rows`, `lib/xipe/xipe-rows.js`): `row/list` once, one row a sentence (`Calc.add/2 (1, 2) → 5`).
  The data is asked of Xipe Totec, not read from its `book.jsonl` (outside the FS root; folding an append-only log and converting
  formats would be done twice). Cells are one line with a width limit; the cursor's cell shows in full below (`cursorValue()`) — a
  display matter, the value is not read. A summary of shape ("list 4×4") can only be right inside a REPL, so it is Xipe Totec's
  (`summary`/`args_summary`, not provided yet); the shell shows it when present
- **From the table to the definition**: `row/list` and `card/list` give the definition's `path` (from the project root) and `line`;
  only these two fields are used. `code_editor` opens paths from the relay's FS root, so **the two roots are matched**
  (`lib/xipe/xipe-place.js`: the project root from `initialize`'s `project.root`, the FS root from `GET /fs`). A project outside the FS
  root has no path that opens — said so, never guessed. `g d` goes out through the page: `matrix-grid.js` hands the row to
  `opts.onOpen(row)`, `matrix-page.js` calls `code.open-at` (`lib/code/code-locate.js`). The list of functions is a list kind
  (`xipe_cards`: `card/list` once; `Enter` the table, `M-d` the definition)

**Alternatives**: a table panel only for Xipe Totec; editing cells in the table; colours by position; new event names
(`xipe:open-location` …).

**Why not**: a shell that knows Xipe Totec is changed for every new source. Editing in the table makes it keep Xipe Totec's discipline
("records in time order, only the rows named are evaluated"). Positions break on sorting. New names where the bus already has words
reinvent the wheel.

**What it removed**: branching of the shell per kind of table; a table and the server's record disagreeing.

**Files**: `panels/resident/matrix.html`, `lib/xipe/matrix-grid.js`, `lib/xipe/matrix-page.js`, `lib/xipe/xipe-rows.js`,
`lib/xipe/xipe-place.js`, `lib/xipe/xipe-client.js`, `lib/xipe/matrix-commands.js`, `lib/list/kinds/xipe_cards.js`,
`list_kinds/xipe_cards.json`, `matrix_bindings.json`.
