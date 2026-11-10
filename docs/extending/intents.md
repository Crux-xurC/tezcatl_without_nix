# Adding an intent

An **intent** is a named operation run in a backend — an Emacs form, a key sequence, or a function in the browser — declared in JSON. One
entry in `command/binding_map.json` and in `command/dialects/<dialect>/extensions/<extension>.json` (or `command/intents/browser.json`, or `command/intents/db.json` for a statement on database window 1) makes
an Emacs extension callable from Tezcatl. `lib/vent/resolver.js` implements it ([D-intent-resolution](../files/lib-vent-resolver.js.md#d-intent-resolution)). **The relay and emacs-vent are not
changed**; Elixir is not touched. The `eval` path needs one Elisp form; the `keys` path none.

This page is a preparation list, also for asking an AI to help: hand it §3 (the contract), §6 (the preface) and the information on the
package.

## Planned features: a provisional mapping

An intent is a **recipe for reproducing an Emacs command in Tezcatl**. The aim is not to make the browser UI imitate every Emacs screen;
it is to combine Emacs-side queries and actions with Tezcatl's tables, panels and commands so the common workflows feel coherent. For Org,
that means matching useful commands and workflow vocabulary where practical; it does not mean reading or writing Org files. Tezcatl's
existing task workflow uses Markdown tables and has no Org syntax compatibility.

The existing pieces can be composed more widely than a list of standalone intents suggests. A query intent can declare both
`result.table` and `result.book`: `decode_emacs` presents the result for review, while `run from <intent>` uses `result.book` to build a
`run_table` from the same answer. The user can inspect or adjust that book, then run it row by row. `run_table` can also call an intent
from each row. This provides a plausible path for bulk operations without sending a large command or an opaque batch into Emacs. It is a
design route to verify while adding the intents, not a claim that the workflows below already exist.

| Emacs workflow | Existing Tezcatl pieces | Provisional composition / gap |
|---|---|---|
| **Magit: review changed files, stage or unstage a file, compare it with HEAD, commit** | `magit.changed-files` → `decode_emacs`; row keys call `magit.stage-file`, `magit.unstage-file`, or show `magit.file-at-head` in `code_diff`; `C` asks a code_vi_minimum and runs `magit.commit` | Works at file granularity on a real Emacs: the table and its keys `s`, `u`, `d`, and `C` (the commit message from a code_vi_minimum, an `ask` key) in `magit.json`, checked by `test/e2e/decode_emacs_magit.mjs`. Editing a commit message in a Magit buffer remains separate work. |
| **Magit: stage or unstage one hunk** | `magit.hunks` (`table magit.hunks [path=…]`, or `H` on a changed file) → `decode_emacs`; `s` / `u` call `magit.stage-hunk` / `magit.unstage-hunk` with the hunk's number and @@ line; `Enter` opens the file at it; `d` the file against its base | Works on a real Emacs (`test/e2e/decode_emacs_magit.mjs`). Emacs makes the diff again, checks the @@ line and applies that hunk (`git apply --cached`); Tezcatl carries only which hunk. Only the @@ lines are listed (not the hunks' text). Staging single lines is not possible yet ([issues.md](../issues.md#1-the-intents)). |
| **Magit: log, a commit's files, a file at the parent against the commit** | `magit.log` (`count`, default 50; `rev`) → `f` → `magit.commit-files` → `d` (`magit.file-at-rev` twice) | Works on a real Emacs (`test/e2e/decode_emacs_magit.mjs`). The log is cut by `count` so that it fits the message channel. |
| **Magit: stage or unstage several reviewed files** | `magit.unstaged-files` / `magit.staged-files`; `decode_emacs`; `result.book`; `run from`; `run_table`; `intent` command | Have an Emacs query return file records, expose them as a `decode_emacs` table and as `result.book` rows, then create a run table whose row line calls the single-file stage/unstage intent. Review the generated rows and run them. This avoids needing an array-valued intent parameter. Works on a real Emacs: `magit.changed-files`' `result.book` and `tasks/run/magit_stage.json` — `run from magit.changed-files`, `-` on the rows not wanted, `run start` (`test/e2e/decode_emacs_magit.mjs`). |
| **Magit: discard changes, restore a file, drop a stash** | `X` in `magit.changed-files` (`magit.discard-file`), in `magit.hunks` (`magit.discard-hunk`), in `magit.stashes` (`magit.stash-drop`); `R` in `magit.commit-files` (`magit.restore-file`) | Works on a real Emacs (`test/e2e/magit_discard.mjs`). Intents with `"discards": true` run only on the key's second press on the same row within 3 s, or `intent! <id>` ([D-discard-confirm](../files/lib-vent-decode-table.js.md#d-discard-confirm)). An unstaged change goes back to the index, an untracked file to the trash, a staged row is refused (unstage first). |
| **Magit: branches, checkout, a new branch, fetch, pull, push** | `magit.branches` → `decode_emacs` (`Enter` / `o` `magit.checkout`, `n` asks the name → `magit.branch-create`, `f` `magit.fetch`, `F` `magit.pull`, `P` `magit.push`); `intent magit.push set-upstream=<remote>` | Works on a real Emacs with a bare remote (`test/e2e/magit_branch.mjs`). fetch, pull and push are later intents ([D-intent-later](../files/lib-vent-resolver.js.md#d-intent-later)): `magit-start-git`, answered when git ends, no time limit. Push goes to the upstream only (none: refused, `set-upstream=` makes one), no force; pull is `--ff-only` (gone apart: git refuses); a checkout leaves uncommitted changes to git. After a checkout, a new branch or a pull, `check.update-all` runs in the frame used last (`post.commands`). Passphrases are asked in Emacs' minibuffer: answer by typing to Emacs. Remote branches are not listed. |
| **Magit: stash** | `magit.stashes` → `decode_emacs` (`z` asks the message → `magit.stash-push`, `p` `magit.stash-pop`, `a` `magit.stash-apply`); `intent magit.stash-push untracked=true` | Works on a real Emacs (`test/e2e/magit_stash.mjs`). The stash is made by Magit's `magit-stash-save`, not `git stash push`: under Magit's `--literal-pathspecs` git leaves untracked files in the working tree. Pop and apply are git's, its words when it refuses (the stash kept). Drop is not offered (a confirmation first). Then `check.update-all`. |
| **Magit: cherry-pick, rebase** | The intent resolver can call noninteractive Emacs forms; tables and run tables can display and sequence returned values | Likely expressible as query/action recipes. Prefer one small, inspectable operation per intent; interactive Transient workflows should not be assumed callable as ordinary functions. |
| **Dired: browse directories and open files** | `tree`, `tree.edit`, `code.open-at`, `code.find` | Already approximated by Tezcatl's own file tree and editor. This is intentionally a different UI from a Dired buffer. |
| **Dired: create, rename, move, delete one file; search files** | `code.edit`, `code.rename`, `code.move`, `code.delete`, `code.grep` | Existing Tezcatl commands cover common single-file operations. Intent recipes can be added where Emacs-specific context or behavior is useful. |
| **Dired: operate on a marked or queried set of files** | Emacs query intent → `decode_emacs` review table and `result.book` → `run from` → `run_table` | A strong candidate for composition: make one row per file and execute copy, move or delete one row at a time. Add a review/confirmation boundary for destructive operations, define collision behavior, and test paths with spaces and files outside the relay FS root. A `"` cannot be carried in an `intent` value or a row's `{column}` ([scope.md](../scope.md#files)), so a path containing one needs another route. Tezcatl's current file commands do not provide this Dired-style bulk workflow. |
| **Org: open agenda and change TODO state** | `agenda.open`; Tezcatl Agenda keys; Markdown `task_table` and `task_table list` | The task workflow already borrows the familiar TODO/Agenda pattern, but it operates on Tezcatl's Markdown-backed tasks. The command vocabulary can be aligned without claiming Org file compatibility. |
| **Org: review agenda items and change selected states in bulk** | An Emacs query could return Org task records; `decode_emacs` and `result.book` can expose/reify rows; `run_table` can call per-item actions | Plausible as a recipe workflow. Decide which Org fields are needed, how an item is identified across refreshes, and how edits interact with Org buffers before implementing. Validate APIs against a real Org setup. |
| **Org: capture, schedule, set deadlines, archive** | Intents can call Emacs functions; `run_table` can sequence one action per row | Potentially feasible, but these operations have more buffer/file semantics and are not covered by Tezcatl's Markdown task table. Scope each command and its confirmation/result behavior before treating it as a common supported workflow. |

For list-driven workflows, the intent can return stable row data once and describe two views over it: `result.table` for browsing and
`result.book` for building a run table. `decode_emacs` itself does not currently export a selected subset of displayed rows into a run table;
the `run from` path builds its book from the intent's answer. If selecting only some rows is required, make that selection in the generated
run table (or add an explicit selection/transfer feature later), rather than assuming the table panel already provides it.

Treat the mappings above as candidates, not promises. Check that the Emacs package exposes a suitable noninteractive function, that the
query result is small enough for the current message channel, and that every action has useful refresh and failure behavior. For larger
results, the documented temp-file / exec-stdout transport is not implemented yet.

## 1. How it goes round

```
an intent id typed in the input panel's Form (or `intent <id> name=value` in the frame, or a decode_emacs key, or `run from`)
  → resolver.lookup(binding_map)          … the id, or kbd notation matching `keys`
  → resolver.dispatch(the intent's entry)
       kind:"eval" → M-: (the wrapper form) RET as one message, with a correlation id
       kind:"keys" → the default key sequence as it is, no correlation
       browser.backend → a function registered in the page; nothing goes to Emacs
  → emacs-vent → Emacs evaluates
  → for kind:"eval", the result comes back as a message "tez:<corr> ok|err <payload>"
  → resolver.onInbound matches it by regex → settle → log / post.refresh / intent.result / intent.ran
```

**Dispatch is sequential by practice, not enforced**: `pending` is keyed by corr, so several evals can be in flight; `post.refresh` is the
only re-entry started by the system. Run one, look at the result, then send the next.

**Seeing and stopping**: the skin `panels/skins/intent.html` (alias `intent`) is the input panel beside `code_el_intent` (the transcript of
extensions). Each send posts the whole of `renderTrace()` on `resolver.trace`; each entry is the unsent Elisp (the extension's form as it is)
with `[status]` — `sending` → `waiting` → `ok` / `err` / `timeout` / `aborted` (keys: `sent`). On unexpected behaviour, "unstick Emacs
(C-g)" in the input panel calls `resolver.abort()`: a `C-g`, the latest pending eval `aborted`. `C-g` is global — it unsticks Emacs; it does
not cancel "this" command.

## 2. What to hand over (to an AI, or keep at hand)

| # | What | From | Required |
|---|---|---|---|
| 1 | the contract (§3) | this page, copied as it is | yes |
| 2 | the preface (§6) | this page, copied | yes |
| 3 | one or two close existing entries | `command/dialects/emacs/extensions/*.json` (table below) | yes |
| 4 | the package's **functions callable non-interactively** | the source, `C-h f`, real signatures — not how-to pages | yes |
| 5 | the dialect | `config.json` `connections[0].dialect` (default `emacs`) | if not the default |
| 6 | what the result is for | the log only / a `list-item` source / a table (`result.table`) / run_table rows (`result.book`) | yes |
| 7 | [protocol.md](../protocol.md) | when going down to the wire | optional |

Close existing entries:

| To make | Look at |
|---|---|
| a pure query (returns a value) | `magit.unstaged-files` (`vconcat` makes it an array) |
| a parameter picked from a list, refreshing a list afterwards | `magit.stage-file` (`params` + `from:list-item` + `post.refresh`) |
| a free-text parameter | `magit.commit` (`from:user-input`, several lines) |
| using the browser's selected text | `emacs.insert-text` (`from:selection`, an `idempotent:false` example) |
| sending keys only (no Elisp) | `emacs.save-buffer` (`kind:"keys"`) |
| checking that a long form gets through | `emacs.hooks-status` (an eval of ~200 characters) |
| an answer drawn as a table | `magit.changed-files` (`result.table`) |
| independent of Emacs (done in the browser) | `compile.run` (`command/intents/browser.json`, `browser.backend`) |
| a statement on the database (window 1) | `db.tables` (`command/intents/db.json`, `sql`) |
| a book shaped on the database, then a table and a run_table's rows | `db.magit-section` (`sql.load`, `result.table`, `result.book`) |

## 3. The contract of an intent entry (copy it as it is)

```
## The contract of an intent entry (Tezcatl / resolver.js)

### Where
- one entry in intents[] of command/dialects/<dialect>/extensions/<extension>.json (id: <extension>.<name>). For a new extension, make
  the file and add its name to `extensions` in command/dialects/<dialect>/intent_map.json
- { "id": "<the same id>" } in command/binding_map.json (optionally "keys": "<kbd notation>")

### emacs.kind: "eval" — evaluate one Elisp form and get its result
- "emacs": { "kind": "eval", "form": "<an Elisp expression, as a string>", "expect": "value" } is required
- {{name}} in form is replaced:
    - a params[].name → an Elisp literal of its type
        string / path → "..." escaped (\\ " and control characters: \t \r \n \f \v, others three-digit octal)
        int           → checked as an integer, as it is
        bool          → t / :false
        enum          → checked against values[], bare
    - a locals[name] → only $context.buffer-name / $context.window / $context.frame
    - any other {{...}} is an error, and nothing is sent
- What is really sent is a fixed wrapper:
    (let ((message-log-max nil))
      (condition-case e
          (let ((v <form>))
            (message "tez:%s ok %s" "<corr>"
                     (decode-coding-string (json-serialize (if (null v) :null v)) 'utf-8)))
        (quit  (message "tez:%s err %s" "<corr>" ... "interrupted" ...))
        (error (message "tez:%s err %s" "<corr>" ... (error-message-string e) ...)))
      nil)
  → the form's value v is the payload; nil becomes :null (never write :null in the form)
  → a signal goes down the err path (nothing crashes)
- The value must pass json-serialize: vectors, not lists (wrap with (vconcat ...)); strings, numbers, t, :false, nested vectors and plists
  are fine
- via:"message": the result goes to every tab in one WS frame; the resolver waits 3 s for Emacs to make it. Size is no limit (measured
  2026-10-23 on the E2E stack: 40 MB in 2 s, magit.log count=3000 — 420 KB — in 0.3 s); time is: a form that computes for longer is a
  timeout (keep it to a file or a hunk), and something that runs long is a later intent (below)

### emacs.later: true — the form starts a process; answered when it ends ([D-intent-later](../files/lib-vent-resolver.js.md#d-intent-later))
- "emacs": { "kind": "eval", "later": true, "form": "<starts a process and returns it>" } — for what takes longer than 3 s (the network)
- the wrapper answers tez:<corr> took <pid> at once (no time limit from then: the input panel posts intent.took to the asker), then, when
  the process has ended, ok {"exit": 0, "output": "<text>"} or err "exited <n>: <text>". The process' sentinel (Magit's) still runs first
- the text: the form may put a function of the process on it, (process-put p 'tez-output (lambda (proc) ...)) — Magit's intents give the
  process' section of the magit-process buffer; the last 2000 characters, shown only
- no closures in the form (M-: may evaluate with dynamic binding): a lambda reads only its arguments and the process' properties
- magit.fetch: (let* ((default-directory top) (p (magit-start-git nil "fetch" ...))) (process-put p 'tez-output ...) p)

### emacs.kind: "keys" — send a default key sequence (no Elisp)
- "emacs": { "kind": "keys", "sequence": "<kbd notation>" } is required
- no correlation, fire and forget, no completion signal
- only sequences meaningful globally, independent of the current buffer (Tezcatl never opens display buffers)

### browser.backend — nothing goes to Emacs; a locally registered function is called
- "browser": { "backend": "<name>" } ("emacs" omitted, or { "kind": "none" })
- dispatch() looks at this **before** "emacs" — it runs even when emacs-vent's uplink is down (it has nothing to do with Emacs)
- the function is what the page registered once at start with `Tezcatl.resolver.registerLocal("<name>", fn)` (`fn(args, ctx, intent)`); the
  JSON only names it, the work is in your own `lib/*.js`
- **use it when** the feature works without Emacs (building a compile command from compile.json and sending it to a PTY — compile.run;
  only opening a panel — agenda.open). When information or state only Emacs has is needed, use emacs.kind:"eval" (the test: §4)
- dialect-free, so it goes in command/intents/browser.json (the resolver reads and merges both)
- examples: compile.run (lib/vent/compile-intent.js), agenda.open (lib/vent/agenda-intent.js)
- browser.post.refresh means the same as for Emacs, but re-running after a backend is not wired yet

### sql — a statement run on database window 1 (D-db-session)
- "sql": { "statement": "<one statement, with ? for values>", "args": ["<param name>", ...] } ("emacs": { "kind": "none" })
- dispatch() looks at this before "emacs" too. The statement goes over the bus (db.run) to database window 1, which runs it on its own
  session and shows which intent sent what and the answer; nothing goes to Emacs
- args names a param for each ?, in order; the param's value (typed as in params[] below: int a number, bool true/false, a missing
  optional one NULL) goes to the server as a value of a prepared statement — never put into the text, so no quoting is written or needed
- window 1 not open (no db.took within 1.5 s) or not logged in: the intent fails with
  "This operation requires database window 1, logged in: `database id=1`"; no window is opened for it. One statement at a time
  (window 1 running another refuses); no time limit once it runs (`db cancel 1` stops it)
- the payload is the relay's answer as it is: {columns, rows, num_rows, truncated} (rows are arrays: a result.table reads it with
  "from": "rows", "rows": "arrays" and a column's "from" its index), or {num_rows, last_insert_id} for a statement without columns;
  the server's refusal is the error
- "load": [{ "book": "<param name>", "as": "<table>" }, ...] (optional, up to 8): before the statement, each book
  (~work/books/<value of the param>.json — a path under ~work/books without .json; outside it the intent fails with why) is made the
  temporary table <as> of window 1's session, made again each run: the book's columns as TEXT columns of the same names, and _n
  (its place in the book, from 1) first — `order by _n` keeps the book's order. The relay reads the book; a book that is not there,
  not a book, or refused by the server fails the intent with "load <book> as <table>: …". A book comes from decode_emacs' `b`
  (~work/books/decode/<intent>.json), a task_table, a run_table …
- goes in command/intents/db.json (dialect-free; the resolver reads it beside browser.json). Examples: db.tables, db.magit-section
  (a book shaped, then result.table and result.book on its answer)

### params[]
- { "name", "type": string|path|int|bool|enum, "required": bool, "default": <value>,
    "from": { "kind": "user-input" | "selection" | "list-item", "of": "<another intent id>" },
    "doc": "...", "values": [...] (for enum) }
- `default`: what an empty or missing value becomes (`magit.log`'s `count` 50) — change it here; a call can still give its own
  (`table magit.log count=200`)
- `from` is resolved by the input panel; the resolver sees only the collected { name: value }. Calling the resolver from another panel,
  prepare selection / list-item yourself, or use user-input only

### browser.post.refresh
- "browser": { "post": { "refresh": [ { "id": "<another intent id>" } ] } }
- after this intent settles ok, the named intents run once again automatically (one level only, no params, 250 ms debounce)

### browser.post.commands
- "browser": { "post": { "commands": [ { "name": "<tezcatl command>", "args": {...} } ] } }
- after this intent settles ok (not on err), the commands are posted on the bus (`command`): the frame used last takes one with a `line`.
  magit.checkout, magit.branch-create and magit.pull: [{ "name": "check.update-all" }] — every code_editor of the frame compares its file
  with the disk (a frame without one says "nothing to compare")

### result
- "result": { "via": "message" | "none", "shape": "json" | "none" [, "table": {...}] [, "book": {...}] }
- the keys path is via:"none"

### result.table and result.book — see the sections below

### discards: true — it discards what cannot be had back ([D-discard-confirm](../files/lib-vent-decode-table.js.md#d-discard-confirm))
- the resolver runs it only when confirmed: a table key with "confirm" pressed twice on the same row, or `intent! <id> …` in the frame;
  `intent <id>`, the input panel's Form and a run_table row without `!` are refused with the way to do it
- a table key calling such an intent must have "confirm" (else the intents load with a problem said)

### Other fields
- "idempotent": bool — whether re-running this form itself is safe (it may be resent after a mistaken timeout); inserting and appending
  are false
- "title" / "desc" / "notes" — for people; write in notes why this function was chosen
```

<a id="resulttable"></a>

### `result.table` — the answer as a table in decode_emacs ([D-decode-emacs](../files/lib-vent-decode-table.js.md#d-decode-emacs))

Declaring which part of the answer (the `json-serialize`d value) becomes which shape of table makes the answer appear as a table in the
decode_emacs panel (the input panel's resolver posts it as `intent.result`). Intents without it keep their answers in the input panel's log.
Tezcatl reads only the answer's JSON, never a message's text meant for people.

```
"table": {
  "from":    "" | "<key>" | "<index>" | "a.b"   — where in the answer the rows are ("" for the whole)
  "rows":    "objects" | "arrays" | "values"
             objects: a row is a plist (columns by key) — recommended
             arrays:  a row is a vector (columns by index)
             values:  a row is one value (a string …; one column)
  "columns": [{ "key": "<column>", "from": "<plist key | vector index>", "label": "<heading>" }]   (from defaults to key, label to key)
  "link":    "<column>"   — the column Enter opens as a file (absolute is fine; nothing outside the FS root opens)
  "line":    "<column>"   — the line Enter opens it at (beside a link; magit.hunks' `line`)
  "enter":   "<key>"      — instead of a link: Enter does what that key of `keys` does (magit.branches: "o", the checkout)
  "keys":    { "<one character>": { "intent": "<id>", "params": { "<param>": "<column>" } }
                                | { "command": "<tezcatl command>", "args": { "<arg>": "<column>" } }
                                | { "table": "<id>", "params": { "<param>": "<column>" } }
                                | { "diff": { "intent": "<id>", "params": {...}, "against": "<column>" } }
                                | { "diff": { "intent": "<id>", "params": {...}, "path": "<column>",
                                              "against": { "intent": "<id>", "params": {...}, "path": "<column>" } } }
                                | { "ask": "<purpose>", "intent": "<id>", "param": "<param>", "params": {...} } }
             intent: called with the row's values, then refresh. With "confirm": "<what is discarded>" (an intent that discards):
                     the first press says it and the row's values, the second on the same row within 3 s runs it
             ask:    a code_vi_minimum headed <purpose> is added to the frame (minimum.ask, D-minimum); what `:m` sends becomes the
                     intent's <param> (with `params` from the row, if any), then refresh. `:q` drops it. No row is needed without
                     `params`; only in a frame. magit.changed-files' `C`: { "ask": "commit message", "intent": "magit.commit", "param": "message" }
             table:  the intent's answer in a decode_emacs of its own (in a frame: as `table <id> …` — the frame's panel for that intent
                     asked again, else one added). magit.log's `f`: { "table": "magit.commit-files", "params": { "rev": "rev" } }
             diff:   the intent's answer (a string: another version of that file) is written to ~work/emacs/<id>/<path> and compared with
                     the file of the `against` column in code_diff. With `against` an intent, both answers are written and compared (old
                     = against); `path` names each one's file column, and the values of the other params become directories:
                     ~work/emacs/<id>/<value>/<path> (magit.commit-files' `d`: the file at the parent against the file at the commit)
             not allowed: h j k l v y c g / (the table's own keys), r (fetch again), b (into a book); Enter is the link's, else the `enter` key's
  "refresh": "<intent id>"   — what is fetched again after a key (default: this intent with the same arguments)
}
```

On the Elisp side, a vector of plists is easiest:

```elisp
(vconcat (mapcar (lambda (f) (list :path (expand-file-name f) :section "unstaged"))
                 (magit-unstaged-files)))
;; table: { "rows": "objects", "columns": [{"key":"section"},{"key":"path"}], "link": "path" }
```

A declaration that cannot make a table (no `rows`, no columns, `link` not a column, a key not allowed) is logged in the input panel when the
intents load, and that intent's `table` is dropped (the intent still works). `via:"message"`'s 3 s still holds (the size does not matter).

<a id="resultbook"></a>

### `result.book` — the answer as run_table rows ([D-run-table](../files/lib-task-run-table.js.md#d-run-table))

A book with one row per item of the answer's list, made from a run_table template. Used by the frame's `run from <this intent> [<name>]
[<arg>=<value> …]` (the run_table asks the input panel with `intent.run`; `intent.ran` carries this declaration). An intent run elsewhere
opens no book.

```
"book": {
  "template": "<template>"  — a name of tasks/run/<template>.json, or a path from the FS root (a book saved with run save)
  "from":     as table's ("" for the whole)
  "rows":     as table's (objects, arrays, values)
  "put":      { "<variable column of the template>": "<plist key | vector index>" }   — one column for rows "values" (the value itself)
}
```

- Only the template's **variable columns** (from the eighth) are filled; `line`, `input`, `wait`, `auto` come from its `defaults`. Rows the
  template has stay first; the answer's rows follow with the next ids
- To call an intent from a row, make its `line` the tezcatl line `intent <id> <param>=<value> …` (destination `t`). A value that may have
  blanks is written as a JSON string, `path="{path}"` (a value with `"` cannot be written). The frame says `intent ── <id> ok …` or
  `! intent ── …`
- Example: `magit.changed-files` has
  `"book": { "template": "magit_stage", "rows": "objects", "put": { "section": "section", "path": "path" } }` with the template
  `tasks/run/magit_stage.json`, whose columns end with `section`, `path` and whose default `line` is `intent magit.stage-file path="{path}"`
- A declaration that cannot be used (no template, no rows, no put) is logged when loading and dropped (the intent still works; `run from`
  refuses with "has no result.book")

## 4. What a person decides

Not to be left to an AI; without these, plausible forms that do not work come back.

- **Pick position-independent functions.** A package's how-to teaches interactive commands (Magit's `s` = `magit-stage`); what is needed is
  a function callable non-interactively. The `notes` of existing entries record real cases — "`magit-stage-file` (singular) does not exist;
  `magit-stage-files` (plural) takes a list", "`magit-commit` needs with-editor, which is not wired, so call `magit-run-git` directly". Read
  the source or try it in a real Emacs
- **Check it does not depend on `(point)`, the current buffer or a transient prefix.** Such functions silently do nothing or error from an
  `M-:` in a scratch buffer. Try it in a real Emacs
- **Scope the amount of work**: per file, per hunk; what Emacs computes must end within 3 s (a whole working tree's diff may not)
- **Decide `idempotent`**: would a mistaken timeout followed by a resend run it twice?
- **Is a round trip to Emacs needed?** If only raw git text is wanted, a PTY can get it. Intents pay off for what only Emacs can give: Org,
  Magit's computed state, Proof General

## 5. After adding it

1. Open an input panel (alone or in a skin). On loading, `resolver: N intents, M bindings … problems: …` is logged — **check your id is not
   in the problems line**
2. Type the intent id in Form and send (or `intent <id> name=value` in the frame's input line)
3. Results:
   - `✓ <id> [corr] ok <payload>` — success
   - `✗ <id> [corr] err: <reason>` — the form signalled; read the reason and fix it
   - `✗ <id> … (no tez: line within 3s)` — sent, but nothing back in 3 s: too heavy (scope it), or `M-:` landed in the minibuffer (check
     Emacs)
   - `✗ <id> emacs-vent uplink is down` — the relay and emacs-vent are disconnected
4. `command/binding_map.json` is additive: an entry never breaks other bindings (unknown intents, colliding keys, broken rows are logged as
   problems and skipped)
5. In the `intent` skin, each send adds to the transcript "the unsent Elisp (your form with the parameters in) + `[status]`" — how `{{path}}`
   was filled and how `elispLit` escaped. It is a parsed display, not the wire (what is sent is the wrapped keystrokes). Select the
   expression and paste it into a real Emacs' `M-:` to run §4's checks
6. If stuck (`M-:` swallowed by the minibuffer …), "unstick Emacs (C-g)": the latest pending eval becomes `aborted` without waiting for the
   timeout

## 6. A preface to give an AI (copy it)

```
I want to add one intent to a project called Tezcatl.

An intent: one entry in command/binding_map.json and command/dialects/<dialect>/extensions/<extension>.json makes an Emacs extension
callable from Tezcatl's input line. The relay's and emacs-vent's code are not changed. Only JSON.

I will hand over:
1. the contract of an intent entry (the fields, the substitution rules, the wrapper)
2. one or two close existing entries
3. what I want, and the package's functions that can be called non-interactively

Please:
- write an entry for the extension file and one for command/binding_map.json, following the contract
- write the form's Elisp so that it does not depend on the buffer position, a transient prefix or keymap lookups (say so if it must)
- check that the value passes json-serialize (wrap a list with vconcat)
- point out if making the result may take Emacs more than 3 s (the size is no limit; long work is a later intent)
- write "check in a real Emacs" where you are not sure; do not fill gaps by guessing

I have little experience with Elisp and Elixir; avoid jargon or explain it where you use it.
```

## 7. Not there yet

- **`keys` shortcuts**: `keys` in `command_map.json` / `binding_map.json` are mostly empty (intents are found by id, the candidates and
  `intent <id>`)
- **temp-file / exec-stdout paths**: how large results would travel; not started

## 8. A provisional shape when adding many

These are the only things formulated so far; the rest (how far to factor common values, more `result.shape`s, a lint pass for the
extension files) is decided while writing — abstracting first, one does not know what to factor.

**Naming**: `<package>.<noun>` (a pure query; plural for a list) / `<package>.<verb>-<noun>` (an action): `magit.staged-files` (query),
`magit.stage-file` (action).

**A pure query** (returns a value):

```
"params": [], "locals": {},
"emacs":  { "kind": "eval", "form": "(vconcat (<pkg>-<...>))", "expect": "value" },
"browser": { "backend": null, "post": { "refresh": [] } },
"result": { "via": "message", "shape": "json" },
"idempotent": true
```

**An action** (with side effects):

```
"params": [ { "name": "...", "from": { "kind": "list-item", "of": "<the query intent>" } } ],
"emacs":  { "kind": "eval", "form": "(progn (<pkg>-<...> {{...}}) nil)", "expect": "value" },
"browser": { "post": { "refresh": [ the query intents it invalidates ] } },
"result": { "via": "message", "shape": "none" },
"idempotent": <depends on the form; appending and inserting are false>
```

**The refresh graph**: an action lists in `post.refresh` the queries it invalidates (Magit: stage / unstage / discard / commit →
`magit.unstaged-files`, `magit.staged-files`); when they multiply, keep them in one table.

**Not decided on purpose**: `result.shape` stays `json` / `none` (tables are `shape: "json"` with `result.table`); streams and type schemas
when an intent needs them. Some things need no intent — a plain `M-:` may do; if it fits one form naturally, an intent; when unsure, try it
in a real Emacs (§4). How much actions will use common `locals` (`$context.*`) is unknown; for now the browser passes parameters.

---

**Temporary planning note — discard this section after the planned intents and workflows have been completed and reviewed.** The mapping
at the beginning of this page is a working list for Magit, Dired and Org-inspired commands. Replace it with a concise account of what was
actually implemented, and remove provisional items that were not selected.
