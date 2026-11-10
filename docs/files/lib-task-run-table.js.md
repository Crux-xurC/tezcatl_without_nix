# `lib/task/run-table.js`

The run_table panel (D-run-table), the pure parts: a book of lines sent one by one, from the smallest id whose status is empty, each to its own input (a destination of input_target).

**Decisions homed here**: [D-run-table](#d-run-table)

<a id="d-run-table"></a>

## D-run-table — a book of rows sent one by one to their input, the smallest id with an empty status first; "OK" is never defined

**Decided**: instead of a person typing in the input line and sending through input_target (by hand: input → tezcatl → …), rows of a book
are sent in order (automatic: run_table → input_target → …). No new destination: each row names one of input_target's (`t` tezcatl, `e`
emacs-vent, `c` code_editor, `x` xterm, `x2` the second). A row is written as in the input line (lead-key notation); run_table never reads it.

**Stage 1 — the book and the runner**

- **Seven fixed columns, then variables**: `id` (order), `input` (a destination's letter; empty: the one chosen in input_target), `line`,
  `wait` (seconds), `auto` (`T` / `F`), `status`, `note`. `{column}` in `line` is that row's cell, put in as characters (`;` doubled —
  `lead.escape`, as a paste); `{…}` that is not a column name (`${HOME}`) stays
- **The rule**: take the row with an empty status and the smallest id. If its `auto` is `F` and a row of a smaller id failed (a key's
  status or `send-failed`), write `skip` and go on. Otherwise send it and write `sent`; once its status is filled, take the next —
  **whatever the status is, filled means next**. Done when no status is empty. A row left `sent` (stopped, window closed) is filled too and
  skipped; a person sends it again by emptying its status (`x`)
- **`run stop`** only writes `stop` in every empty status; with nothing empty the runner ends by itself; the row going ends with its wait
- **"OK" is never defined** (what comes back cannot be foreseen). Only facts are written: `sent`, `done` (the wait went by and no key
  matched — not "it worked"), `send-failed` (`lead.sent` refused, the line cannot be read, a missing variable), `skip`, `stop`, and **keys**
- **Keys are written beforehand by a person** (not interpreted, but the head of an error, an interruption, a timeout … noted beforehand):
  `tasks/run_keys.json` (everyone's defaults; now `err` ← `! `, the frame's errors) under the template's `keys` (`""` / `[]` removes).
  During the wait, a line of the row's destination that **begins with** a key's prefix makes that key's name the status and the line the
  note. Only heads of lines are compared (as `D-dictionary`: a generic mechanism a person chooses); the runner's own statuses cannot be keys
- **The output watched**: tezcatl's own lines (a new message `recv.out`, posted for every line the frame says) and an xterm's lines
  (`terminal.data` through `term-text.js`'s `take` / `rest`). Tezcatl answers before `lead.sent` returns, so watching starts just before
  sending and narrows by `lead.sent`'s `dest` and `key`. emacs-vent and code_editor are not watched (`done` after the wait)
- **Templates and temporary books**: a template `tasks/run/<name>.json` (columns, defaults, keys, rows; `blank` is the example) becomes a
  temporary book `~work/books/run/<name>.json` with `run new <template> [<name>]` (an existing book of that template is read; `run new!`
  makes it again). Only when wanted, `run save[!] <path>` writes it as a file — a saved book has a template's shape, so `run new <path>`
  reads it. Every change (statuses too) is written to the book at once
- **`lead.send` has `target`** (input_target sends to that row's letter, or refuses); `lead.sent` returns `dest` and `key`

**Stage 2 — `run insert-if <status> #<id>`**: written in a row's `line` and sent to tezcatl. When **the row above** (the largest id smaller
than the row's — copies added count too) **has** that status, a copy of row `#<id>` (status and note empty, other columns as they are) goes
just under it. The condition is a match only.

- **What is added**: only a copy of a row of the book, by id; no line written in place (the insert-if row itself is read as lead-key
  notation on its way to tezcatl, so a `;` inside would need doubling). A row to copy from is kept from being sent by filling its status
- **Ids**: one decimal down (`4` → `4.1`, `4.1` → `4.11`), below the next id so it lands just under (`4` with `4.1` present → `4.01`).
  Other rows' ids never change (the receiving side's `▶ run … #id` marks would no longer match)
- **Which run_table**: the frame asks every run_table of its skin (`run_table.ask`); only when exactly one answers that it is sending a row
  (to tezcatl, or still waiting for `lead.sent`) — `run_table.going` — does it pass `run_table.do {op:"insert-if"}`. None (typed by hand)
  or more than one: refused
- **That row's status**: the runner knows what it did, so it is `done` at once, the note "inserted #4.1 from #20 (#3 was done)" or "not
  inserted (#3 is err)". When it cannot (no `#99`), the frame says `! run insert-if ── …`, which the `err` key catches like any failed command
- In Lisp, `(when (equal above "done") (add-copy))`; an insert-if in a copied row chains them (rows making rows)

**Stage 3 — `run from <intent>`, `result.book`, `intent <id> …`**

- **The intent's `result.book`** (written in the intent's definition): `template`, `from` and `rows` (read as `result.table`; `bookRows` of
  `lib/vent/decode-table.js`), `put` (a variable column ← a key of the answer). Only JSON is read
  ([extending/intents.md](../extending/intents.md#resultbook))
- **Only fetched, never pushed**: `run from[!] <intent> [<name>] [<arg>=<value> …]` adds a run_table, which asks with `intent.run`;
  `intent.ran` carries the intent's `result.book`. An intent run elsewhere opens no book (no telling which window would take it). The book
  keeps `intent`; an existing book of that intent is read (`run from!` asks again). Only variable columns are filled; `line` and the rest
  come from the template's defaults
- **`intent <id> [<name>=<value> …]` calls an intent from a row**: Tezcatl's input line had no way to call an intent (only keys go to
  Emacs). A value runs to the next blank, or is a JSON string. The frame says the answer; a failure is a `! ` line (the `err` key)
- **Leaving rows out is `-`**: instead of dired's marks, fill the status of rows not wanted (`-` in the panel; `x` takes it back)
- **The first use**: `magit.changed-files`' `result.book` and the template `tasks/run/magit_stage.json` (several files staged, checked on a
  real Emacs)
- **Later**: `fill` (another intent writing columns of rows already there, matched by a column's value)

**Stage 4 — `output_log`, `log start|stop`, `run match`**

- **The record is a hidden panel `output_log`, started by a row of the book**: `log start[!] [<path>]` adds it to the frame (no path:
  `~work/logs/<date>_<time>.log`; `!` over a file there), `log stop` writes the last and removes it, `log` says whether one is writing. One
  per frame. The runner knows nothing of it — `log start` and `log stop` are rows like any other (the last row's wait gives late lines time
  to come). Typed by hand, it records work done without a run_table too
- **What it keeps**: the frame's lines (`recv.out`), the skin's xterms' lines, emacs-vent (its own connection: context and events), and what
  a run_table says of its rows (a new message `run.mark` — `send <input> <line>`, `sent <dest> <key>`, `not-sent <why>`, `status <status>
  <note>`)
- **As text a person reads**: one line each, `12:00:01.234 xterm:<panel> │ <line>` (`lib/recv/output-log.js`), readable in `code_editor` and
  read by the comparison too
- **Written whole** every 2 s (when changed) and at `log stop` — the relay has no append and is not changed. Over 5 MB it stops writing
  and says so
- **`run match <record> [<book>]`**: the `run_match` panel (matrix's grid). The record is cut by its `run` lines; for each row, **only the
  lines of that row's destination** are gathered and compared with the keys by their heads (`lib/task/run-match.js`). A row's part runs
  from its `send` **to the next row sent to the same destination** — a row to another destination in between does not cut it, so a line
  that came after the wait still counts as that row's. Where the first key found differs from the book's status, `≠` (`done` = no key). A
  row not in the record (the `log start` row itself) is said so, not `≠` (a row left `sent` is `≠`). The book is not changed — fix it in
  the run_table (`x`, `i`). `Enter` shows that part in full. (Cutting parts at "the next row of the same book" was changed while building:
  an E2E showed late lines were lost)

**The line drawn** (determination by crux, with the reason): rows are data, `{column}` is a quasi-quote, rows add rows (`insert-if`) — close
to Lisp. Tezcatl's side stops at "send in order, write statuses, insert `{column}`, match a status". Combinations of conditions, computed
values, branches and loops are not added: they are written in an Emacs intent (real Lisp) and come back as columns (stage 3). Adding them
would make Tezcatl an ad hoc interpreter of a language (Greenspun's tenth rule) and break "sent without being interpreted".

**Alternatives**: a one-column sequence in `list.html`; reading output text to decide OK or failure; the runner waiting for structured
answers (an intent's ok / err); stopping on a failure (`set -e`); the runner holding its own destinations; (stage 2) lines written in place
in insert-if, renumbering the ids under an added row, giving an ambiguous insert-if to the run_table started last; (stage 3) opening a book
whenever the intent runs (pushing), the copying rule in the template; (stage 4) an always-on recorder (a file per day), the runner writing
what it saw beside the book, an append mouth in the relay, the record as JSONL.

**Why not**: a list cannot hold per-row destinations, waits and results (matrix can hold the input too). Reading text breaks "never read
backends' text for people", and OK cannot be foreseen. Waiting for structured answers needs a meaning of "the end" per destination — rows
of `insert-if` reproduce it. Whether to stop is written per row with `auto` (a person guards it by how rows are written — that fits the
design). input_target already has the destinations. (2) Writing in place means doubling `;` and reads badly; renumbering changes finished
rows' ids too and breaks the match with the receiving side's marks; giving it to the wrong one silently gives a wrong result — refuse.
(3) Pushing cannot tell which window takes it; a rule in the template hides where an intent's answer goes and allows one rule per template.
(4) An always-on recorder needs retention and limits — started and stopped by rows, a record is one run's; the runner writing loses lines
after the wait; whole rewrites are enough for one run; people and the comparison can read the same text.

**Files**: `lib/task/run-table.js` (pure), `lib/task/run-table-page.js`, `panels/resident/run_table.html`, `lib/skin/run-table-commands.js`,
`lib/skin/intent-commands.js`, `lib/skin/log-commands.js`, `lib/recv/output-log.js` (pure), `lib/recv/output-log-page.js`,
`panels/invisible/output_log.html`, `lib/task/run-match.js` (pure), `lib/task/run-match-page.js`, `panels/resident/run_match.html`,
`tasks/run_keys.json`, `tasks/run/blank.json`, `tasks/run/magit_stage.json`, `lib/skin/input-target-page.js` (`target`, `dest`, `key`), `lib/skin/frame-page.js`
(`recv.out`), `lib/recv/term-text.js` (`take`, `rest`), `lib/vent/decode-table.js` (`checkBook`, `bookRows`), `lib/vent/resolver.js`
(checks `result.book`), `lib/vent/input-panel.js` (`intent.ran`'s `book`), `lib/skin/frame-code.js`, `lib/skin/frame-lines.js`,
`panels/skins/frame.html`, `command/command_map.json` (`run.start`, `run.stop`), `bus/messages.json` (`recv.out`, `run_table.do`,
`run_table.ask`, `run_table.going`, `run_table.inserted`, `run.mark`, `log.started`, `log.stop`, `log.stopped`, `lead.send`, `lead.sent`),
`list_kinds/panels_and_skins.json`, `suggestion/line.json`, `test/run-table.test.js`, `test/decode-table.test.js`, `test/e2e/run_table.mjs`.
