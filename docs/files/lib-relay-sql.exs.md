# `lib/relay/sql.exs`

A database as a backend: `Sql` logs a window in (two MyXQL connections to MariaDB) and runs a statement; `DbWindows` is the ledger of
numbered database windows; `SqlSocket` is `/sql`, the WebSocket of one window; `SqlWindowsHandler` is `GET /sql/windows`. The browser's
side is `lib/db/sql.js` (where the socket is, an answer made a matrix table); the server is `nix/db`.

**Decisions homed here**: [D-db-backend](#d-db-backend), [D-db-session](#d-db-session)

**State** (2026-10-22): [D-db-session](#d-db-session)'s relay side is built (step 1 of its order in issues.md): `/sql` per window, the
ledger, login and logout, cancel. The first stage's login at start, `POST /sql` and matrix's kind `sql` are gone (they were in
`15ce1c2`). The window is built too (step 3): the synthesis `database` ([D-synthesis](lib-skin-synthesis.js.md#d-synthesis)), and the
lines and the list (step 4): `database [id=1] [tab|window]`, `db login|exit|cancel [<n>]` from any window, `db_list` in the dock.
Intents on window 1 (step 6, 2026-10-22): an intent's `sql`, run by window 1 ("How an intent says it" below). Tezcatl's own tables in the
database (step 7, 2026-10-23): books made temporary tables of window 1 by an intent's `sql.load`, results back as tables and books
("Tezcatl's own tables into the database" below).

<a id="d-db-backend"></a>

## D-db-backend — a database is a third backend: MariaDB, reached by the relay over one kept connection

**Decided** (crux, 2026-10-21): what [the matrix with database operations](../issues.md#open-items)
asks for (select, filter, join, intermediate tables) is done by a real database server, beside Emacs and Xipe Totec. The relay reaches it;
Tezcatl never reads SQL.

- **MariaDB, Tezcatl's own server**: `nix/db` runs `mariadbd` as this user in the foreground on `127.0.0.1:3307` (its own data
  directory, `~/.local/state/tezcatl/mariadb`, `--no-defaults`), so Poca's box starts and stops it like the other backends (the row
  `mariadb`). `nix/db init` once makes the data directory, the account `TEZCATL_DB_USER` and the databases `tezcatl` and `tezcatl_e2e` —
  the account's grants are all it can touch. A system MariaDB (systemd, 3306) is not used: Poca cannot start or stop a root service
- **The relay connects with a driver** (MyXQL, built with Nix in `nix/relay-packages.nix` like cowboy) and keeps a session's
  connection: a temporary table made by one statement is there for the next. Who connects, and when, is
  [D-db-session](#d-db-session) (a person, per window); the first stage's one connection made at the relay's start is gone
- **A statement** (text, up to 1 MB) is sent as it is (`query_type: :text`). The answer is JSON: columns and rows (values as JSON
  carries them; decimals, dates and times as their usual text; bytes that are not UTF-8 as `0x…`; at most 5 000 rows, `truncated` said),
  or what a statement without columns changed (`num_rows`, `last_insert_id`), or the server's refusal as it is (`error`, `code` = its
  name such as `ER_NO_SUCH_TABLE`). `/sql` is Origin-strict like `/fs/write` (a statement may change data)
- **Several statements in one text**: nothing is split here. MyXQL always asks the server for multi-statements, and MyXQL 0.9.0 cannot
  carry their answers (`query` raises on a second result, and drops the connection; `query_many` fails on a refusal). So `query` is used,
  and a text with more than one statement is said to be one (`several_statements`) after the server ran it — the session ends with it
- **The browser**: an answer is made a table by `lib/db/sql.js` (a column's key is its position: `select a, a` is two columns; NULL
  is shown as `NULL`) — for the database window's `db_bar`. The first stage's matrix kind `sql` (`matrix get sql:…`) is gone
- The E2E's relay always uses the database `tezcatl_e2e` (`stack.sh` sets `TEZCATL_DB_NAME`), never `tezcatl`

**Alternatives**: SQLite — in Emacs (30.2 has it built in), the system's `sqlite3`, or compiled to WASM in the page; the relay running the
`mariadb` CLI for each statement (`--batch` / `--xml`); a system MariaDB on 3306; a subset of SQL interpreted by Tezcatl.

**Why not**: a CLI per statement keeps no session, so intermediate tables vanish between statements. A server started by systemd cannot be
started or stopped from Poca's box. Interpreting SQL in Tezcatl is the ad hoc interpreter [D-run-table](lib-task-run-table.js.md#d-run-table)
rules out. SQLite was withdrawn when crux chose a server with a kept connection as the engine.

**What it removed** (with D-db-session's relay, 2026-10-22): `POST /sql`, the relay's login at start, matrix's kind `sql` and
`test/e2e/sql_matrix.mjs`. Tezcatl's own tables (books) into the database and results back: [D-db-session](#d-db-session) (2026-10-23). Typing statements from the input line
(input_target `s`) was dropped for the database window ([D-db-session](#d-db-session)).

<a id="d-db-session"></a>

## D-db-session — a person logs in to a numbered database window; window 1 is the intents'

**Decided** (crux, 2026-10-21; the relay's side, the window, its lines and window 1's intents built 2026-10-22): the database is used through database windows, each logged in by a person, each with its own
session. Nothing logs in by itself. **A database window is a synthesis** (2026-10-22, [D-synthesis](lib-skin-synthesis.js.md#d-synthesis);
"As a synthesis" below): where the points below say "window", read one placed `database` synthesis.

- **The database window** (the synthesis `database`, after `matrix_set`'s shape): the table above, the command line (`code_cmd_in`, SQL
  highlighting with `@codemirror/lang-sql`'s MariaDB dialect) below; `Mod-Enter` sends what the command line holds as it is. Tezcatl
  never splits statements at `;` (that would be reading SQL); a text the server cannot take is its refusal. The window always shows
  `<account>@<host>:<port>/<database>` and its state: logged out, waiting, running
- **Numbered windows**: the relay numbers the database windows and keeps their ledger (number, account, database, state), as `w_list`
  does for the relay's windows. The number belongs to the window, not to a login: it stays across logging out and in again, and a
  reload takes the same number back. `database` opens a window with the smallest free number from 2; `database id=1` opens window 1; a
  second window 1 is refused
- **Opening** (2026-10-22, changed by the synthesis the same day): `database [id=1]` places the synthesis in this frame (`skin add
  database`); with `tab` or `window` it opens a new frame holding it alone (`frame.html?synthesis=database`) through
  [D-open-page](lib-core-open-page.js.md#d-open-page). The relay gives the number when `db_bar` connects to `/sql` (the smallest free
  from 2, or the one it asks for). A number in use is refused and the window says so
- **Window 1 is the intents'**: an intent that needs the database runs its statements on window 1's session — the relay runs them and
  shows window 1 which intent sent what and the answer. Window 1's command line takes only login, exit and cancel, never statements, so a
  person's typing and an intent's statements never mix, and an intent never takes over a window a person opened (2 and up). An intent
  run when window 1 is not open or not logged in stops with "This operation requires database window 1, logged in: `database id=1`";
  no window is opened for it
- **Logging in**: `db login <n> [<account>]` (from the input line or input_target; the account defaults to local.env's
  `TEZCATL_DB_USER`, its name only) carries the account, never a password. Window `<n>` asks for the password in a masked field of its
  own, so it never passes the input line, its records (`log start`), the dictionary or the kill ring. The relay uses it once to connect
  and keeps it nowhere — local.env has no password
- **Where the password is typed** (2026-10-22): a window just opened is in front (Poca shows a new tab or window), so it asks at once
  for the default account's password — the first login needs no going elsewhere. The window's own command line takes `db login`,
  `db exit` and `db cancel` for itself. `db login <n>` typed in another window's input line makes window `<n>` ask, marks its title
  (`● db <n>: password` — with the synthesis, the main's status on its band — until it is answered or given up) and says on the receiving side that window `<n>` is waiting for the password;
  the person goes there (`Ctrl+Tab` in Poca). A page cannot bring another tab forward: Poca's CEF passes no `window.focus()` on
  (checked 2026-10-22: no callback for a focus asked from the opener or from the page itself, with or without a key press), and a
  Poca-only signal for it was not made
- **A session lives with its window**: the window holds a WebSocket to the relay's `/sql`; logging in makes that window's connection.
  `db exit <n>` logs out (the window stays, "logged out"); closing or reloading the window, or the relay stopping, ends the session too.
  Two windows logged in as the same account are two sessions; nothing is shared
- **Cancelling**: `db cancel <n>` stops the statement window `<n>` is running. A connection running a statement takes nothing else, so
  logging in also makes a second connection kept for `KILL QUERY <id>` (no password is kept to make one later); the ledger shows it
- **The list**: `db_list`, a list panel like `w_list` (number, account, database, state; `Del` logs that window out), at the bottom of
  the dock, minimized; `db list open` shows it (the dock's rows change), `db list close` minimizes it

- **As a synthesis** (crux, 2026-10-22; built the same day): `syntheses/database.json` — `db_bar` (the main), `matrix_table`
  (kind `given`), `code_cmd_in`; `move` `table`, `line`, `bar`
  - **`db_bar`** (a new panel, one line under the band): `<account>@<host>:<port>/<database>`, the state, `db <n>`, and the masked
    password field (the account editable beside it; empty when local.env has no `TEZCATL_DB_USER`). It holds the `/sql` socket, takes
    its synthesis' `cmd.input`, and hands an answer to its matrix (`matrix.show`, a new bus message). `Enter` in the field logs in; a
    refusal is shown there and it asks again. `Esc` is not bound in it (the leave key stays as it is); giving up is `db exit`
  - **The command line**: a text that is exactly `db login [<account>]`, `db exit` or `db cancel` is a command; anything else is one
    statement, sent as it is. After a statement the text stays (it is edited and sent again); after a `db` command it is emptied.
    SQL highlighting with `@codemirror/lang-sql`'s MariaDB dialect — a grammar plugin, `languages/mariadb.js` (language `mariadb`;
    the vendored bundle is left as it is). `code_cmd_in` takes `?lang=`, `?keep=1`, `?clear=db`, `?hint=` for it
  - **The table**: read-only (an answer written into would not go back); sorting, filtering and CSV stay. Only the latest answer; the bar
    says the statement's head and the count or what changed
  - **The number** is the relay's (unique over every tab), not the synthesis' own name (unique in its skin). `db_bar` keeps it with
    `synthesis.keep {id}`: a reload asks for the same number; a saved skin read again (`skin read`, another window) asks for a new one,
    so one saved skin opened twice is never refused
  - **A session ends** also when the synthesis goes (`skin del`, a `skin read` that replaces it). When the relay is gone the window says
    so and logs in again only by `db login` (from `hello`, the same number); nothing reconnects by itself
  - **The password stays in its field**: never in the kill ring or the cursor aggregator (a test checks)
  - **Window 1**: it opens, logs in and refuses a statement typed in it; an intent's statement shows in its table under the intent's
    name and the statement's head, and its band says which intent ran
  - **How it is built**: `lib/db/db-bar-page.js` (page `panels/resident/db_bar.html`), `lib/db/sql.js` (`command`, `head`, `toGrid`),
    the table's kind `given` and `matrix.show` (`lib/xipe/matrix-page.js`). The title of the window is `● db <n>: password` while it
    asks. Checked by `test/e2e/db_window.mjs` (the logged-in part needs `TEZCATL_E2E_DB_PASSWORD`)
- **The lines** (built 2026-10-22, `lib/skin/db-commands.js`): `database [id=1] [tab|window]` places one in this frame (`id=1` given to
  its main as what it keeps), or opens `frame.html?synthesis=database[&keep.id=1]` in a tab or window (D-open-page); a second window 1
  is refused by the relay and says so. `db login [<n>] [<account>]`, `db exit [<n>]`, `db cancel [<n>]` from any window's input line
  reach window `<n>` over the bus wherever it is (`db.ask` / `db.exit` / `db.cancel` → `db.said`); no `<n>`: the database window
  focused in this frame; nobody answering: "no database window `<n>` is open". `db login <n>` makes it ask in its own field (its band:
  `● password`) and says so here; a logged-in window says "already logged in"
- **The list** (`db_list`, `lib/list/kinds/db_list.js`): the relay's ledger (number, account, database, state; window 1 marked
  "intents"), read again when a window says it changed (`db.changed`) and every 10 s; `Del` asks that window to log out (`db.exit`). It
  is a part of the standard dock (`dbls`, a row of its own at the bottom, one line high); `db list open` makes that row a third of the
  dock, `db list close` puts it back (the skin keeps it, as `dock rows`). Checked by `test/e2e/db_lines.mjs`

- **How an intent says it** (crux, 2026-10-22; built the same day): an `sql` in the intent's entry — `{"statement": "select table_name from
  information_schema.tables where … like ?", "args": ["like"]}`, in `command/intents/db.json` (dialect-free, beside `browser.json`). `args` names a param for each `?`; its value
  (typed as an Elisp param is: int, bool, enum checked; a missing optional one NULL — `lib/db/sql.js` `intentArgs`) goes to the
  server as a value of a prepared statement (`Sql.run` with arguments uses MyXQL's binary protocol; up to 100 scalars, `Sql.args`),
  never into the text. MariaDB takes no `?` in `SHOW` as a prepared statement (found 2026-10-23: `db.tables` was `show tables like ?`
  and failed with a syntax error), so an intent asks `information_schema` instead. The path: the input panel's resolver posts `db.run {req, intent, statement, args}` on the bus; window 1's
  `db_bar` (only window 1 answers) sends it on its own socket with `intent` (the relay takes a `run` on window 1 only with one) and
  says `db.took`; the answer comes back as `db.ran {req, ok, answer | error}` — the relay's answer as it is, so a `result.table` reads
  `rows` as arrays. No `db.took` within 1.5 s: "This operation requires database window 1, logged in: `database id=1`"; logged out
  or running, window 1 says so at once (a run the relay refuses comes back with its `req`). Nothing goes to Emacs; the uplink's
  state does not matter. No time limit once it runs (`db cancel 1`). The first intent: `db.tables` (`table db.tables like=…`).
  Checked by `test/sql.test.js`, `test/resolver.test.js`, `test/relay/sql_test.exs`, `test/e2e/db_intents.mjs`

- **Tezcatl's own tables into the database** (crux, 2026-10-23; built the same day): the flow is an intent's answer made a table
  (decode_emacs), that table a book, the book a temporary table on window 1 shaped by an intent's statement, and the answer a table
  again or the rows of a run_table (`result.table`, `result.book` — as they read any answer). Everything that goes in or comes out is a
  book; Tezcatl never reads the statements
  - **Window 1 only**: the intermediate tables are window 1's (an intent's), never a window a person opened (2 and up); there is no line
    for a person to load a book. They are temporary (`CREATE OR REPLACE TEMPORARY TABLE`): made again for each run, gone with the
    session — an intent's use needs nothing kept
  - **What goes in is a book**: `~work/books/<name>.json` (`{columns, rows: [[cell]]}`: a task_table's, a run_table's, the task list,
    one written by decode_emacs). decode_emacs' `b` writes the table shown to `~work/books/decode/<intent>.json` — the rows chosen with
    `v`, else every row shown, in the order shown; the cells as shown; written over each time ([D-decode-emacs](lib-vent-decode-table.js.md#d-decode-emacs))
  - **How an intent says it**: `sql.load` — `[{"book": "<param>", "as": "<table>"}]`, up to 8. The param's value names the book (a path
    under `~work/books` without `.json`; `~work/books/` and `.json` are taken off; `.`, `..` and other characters refused in the browser
    — `lib/db/sql.js` `intentLoads` — and in the relay — `Sql.loads`), so one shaping intent serves any book; `as` is letters, digits and
    `_`. `db.run` carries `load: [{book, as}]`, and window 1 sends it with the `run`; the relay takes it on window 1 only
  - **The table**: the book's columns as they are named (quoted, a backtick doubled — a name the server cannot take is its refusal), all
    `TEXT`, with `_n INT` (the row's place in the book, from 1) first, so the order can be kept (`order by _n`). A book with a column
    `_n`, a row longer than its columns, or not JSON is refused before anything runs; a short row gets NULLs. Cells go as values of
    prepared `INSERT`s (at most 1 000 rows or 60 000 values each), never into the text
  - **The relay reads the book** (`Sql.read_book`, under `FsHandler.work_root()`, up to 8 MB) in the run's task, before the
    statement: the rows never cross the bus. A failure stops the run and is the answer: `load <book> as <table>: <why>` (`no such
    book`, the server's refusal …)
  - **The example**: `db.magit-section` (`book` default `decode/magit.changed-files`, `section` default `unstaged`): `table
    magit.changed-files` → `b` → `table db.magit-section` or `run from db.magit-section` (the template `magit_stage`). Checked by
    `test/relay/sql_test.exs`, `test/sql.test.js`, `test/resolver.test.js`, `test/decode-table.test.js`, `test/e2e/db_books.mjs`
  - Alternatives: a person's line to load a book into any window (`db load <book> [as <t>] [<n>]`) and one to write the latest answer
    of a window to a book (`db book <name>`); the browser reading the book and putting its rows on the bus; `JSON_TABLE` over the book
    passed as one `?` value (each statement naming every column and its path); a permanent table in `tezcatl`; types guessed from the
    cells. Why not: window 1 is the intents' and an intermediate table is an intent's means, so a person's lines would only add a
    second way; the answer already becomes a book through `result.book`. Rows on the bus are a second copy of a file the relay can read.
    `JSON_TABLE` puts the book's shape into every statement. A permanent table needs cleaning up and outlives what used it. Guessing
    types is reading the data; a statement casts what it needs

**Alternatives**: the relay logging in at its start with local.env's password, one session shared by every page (what is built now);
statements sent from the input line or input_target `s`; the password typed in the input line; intents using any logged-in window; the
intent opening window 1 and asking for a login; a window closed by `db exit`; Poca bringing window `<n>` forward on `window.focus()` (CEF
does not pass it), or on a signal of Poca's own (a console message, say — Poca would know what it shows); `database.html` as a page of
its own after the matrix skin (it cannot be put in a frame with a dock); the number written in the page's URL (`history.replaceState`:
the frame makes panels again from what it keeps, not from their URLs); `Esc` giving up the password (it is half of the leave key). For
the intents: `{{name}}` put into the statement as an SQL literal quoted by the browser (as an Elisp form's); the page asking the relay
directly to run on window 1's session (a second way into a session besides its window's socket).

**Why not**: a login nobody did is opaque — who is connected, since when, and with whom the session is shared cannot be seen. The input
line sends one line and its lead key is `;`, SQL's terminator; it is also recorded. An intent using a window a person opened would run
in the middle of the person's statements and change their session. A window opened by itself is less clear than a message saying what
is needed. Closing panels is not a command today. Quoting values into SQL would make the browser hold the server's quoting rules —
a prepared statement's values need none.

- **Built in the relay** (2026-10-22): `/sql` — `hello` (the number: the smallest free from 2, or the one asked; a number in use is
  refused), `login` (the account and password checked once — the server's refusal as it is — then the session's two connections and
  its connection id), `run` (one at a time; never on window 1), `cancel` (`KILL QUERY` on the second connection), `exit`; states
  `logged out`, `waiting`, `running`. `GET /sql/windows` is the ledger (no password). A statement has no time limit (it can be cancelled)
- **A session is never made again quietly**: DBConnection makes a dropped or crashed connection again by itself, which would be a new
  session with its temporary tables gone. The window hears its connections (`connection_listeners`): a drop, or another process
  connecting for the same role, ends the session — the window says it is logged out, and why
- **The password never reaches a log**: it is used to connect and kept in no file; MyXQL's connections hold it in memory while they live
  (DBConnection keeps it as sensitive data and leaves it out of its reports). The login's check runs MyXQL's `connect` in a process of its
  own, which rescues everything and says only the kind of a failure — found 2026-10-22, when a missing option made `connect` raise and
  the crash report printed the options, the password among them, into the E2E stack's relay log (that log was removed)

**What it removed**: the relay's login at start, `POST /sql`, matrix's kind `sql`, and the password in local.env (crux, 2026-10-22; the
E2E takes it from `TEZCATL_E2E_DB_PASSWORD`, `nix/db init` from the command line).

**Waited for** opening a tab or a window from a command inside Poca — done 2026-10-22 ([D-open-page](lib-core-open-page.js.md#d-open-page)).
