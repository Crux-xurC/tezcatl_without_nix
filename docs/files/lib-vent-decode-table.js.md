# `lib/vent/decode-table.js`

What an intent's answer becomes in the decode_emacs panel (D-decode-emacs), the pure parts.

**Decisions homed here**: [D-decode-emacs](#d-decode-emacs), [D-discard-confirm](#d-discard-confirm)

**Takes part in**: [D-run-table](lib-task-run-table.js.md#d-run-table)

<a id="d-decode-emacs"></a>

## D-decode-emacs — a panel that makes Emacs' answers a table; how to read them is written in the intent; Magit's meaning stays in Emacs

**Decided** (Magit's intents are added by checking them on the real Emacs): reproducing Magit as a panel where Tezcatl runs git itself was
dropped. If Tezcatl does itself everything it can, emacs-vent and intents become unnecessary and it is back to "rebuilding Emacs'
extensions one by one". git's meaning is Emacs' (Magit's), and Tezcatl is the window that shows answers — `D-results-not-display`.

- **The `decode_emacs` panel** makes an intent's answer (JSON from `json-serialize`) a table in the form the intent declared
  (`result.table`, [extending/intents.md](../extending/intents.md#resulttable)). A generic window knowing neither Magit nor git — more
  Emacs extensions mean more intent definitions, not more panel code. The table borrows matrix's grid (as `D-task-table`)
- **How to read is in the intent's definition** (send to emacs-vent → which part of the answer → which shape of table): `from` (where),
  `rows` (`objects` — plists, `arrays`, `values`), `columns`, `link` (the column `Enter` opens as a file; absolute paths become paths from
  the FS root), `keys` (call an intent or a tezcatl command with the row's values, a diff, or an ask — a code_vi_minimum for a sentence, `minimum.ask`, whose `:m` runs the intent with it: Magit's commit message), `refresh`. Only JSON is read — never the
  human text of a message (`D-dictionary`'s line). A declaration that cannot make a table is logged on loading and dropped (the intent
  still works)
- **Differences are Tezcatl's**: Emacs returns materials, not the difference — a list of changed files as the table, and a `diff` key
  calling an intent that returns another version of that file (HEAD …), written to `~work/emacs/<intent>/<path>` and compared in `code_diff`
- **Flow**: the input panel's resolver posts the answer of an intent with `table` as `intent.result`; the panel's keys and `r` ask the input
  panel (the one place that runs intents) with `intent.run {req, id, args}`, answered `intent.ran {req, ok, payload}` (after Emacs answered,
  for an eval). Without an input panel open: "no answer"
- push and pull happen in an xterm (where asking for credentials works reliably)
- **One table, one panel** (2026-10-21, crux): `table <intent> [<name>=<value> …]` in the frame adds a decode_emacs of that intent's own
  (`?intent=<id>&args=<JSON>`: it asks once on opening; the answer comes as every answer, `intent.result`), or asks the one the frame
  already has again. A key of the kind `table` does the same from a row (`table.open` to the frame) — the log's `f` puts the commit's
  files beside the log. Tables stand side by side; nothing is switched inside one panel. A saved skin does not keep which intent a panel
  shows (as it does not keep code_editor's files — a Frame issue)
- **The table into a book** (2026-10-23, [D-db-session](lib-relay-sql.exs.md#d-db-session)): `b` writes the table shown to
  `~work/books/decode/<intent>.json` (`bookOf`: the rows chosen with `v`, else every row shown, in the order shown; the column keys;
  the cells as shown, not the answer's items — what a person saw is what goes on), written over each time, so a database intent's
  `sql.load` can make it a table. `b` joins the panel's reserved keys. The second key of the grid's chords (`c b`, `c r`) is the
  grid's, not the panel's
- **Two versions** (`diff` with `against` an intent): both answers are written to the work place and compared; the values of the
  params other than the file become directories (`~work/emacs/magit.file-at-rev/<rev>/<path>`), so the two sides never overwrite each
  other. `magit.file-at-rev` takes `rev` empty as the index (git's `:path`); the parent of a root commit is the empty tree
- **A hunk is named, Emacs cuts it** (2026-10-21, crux): `magit.hunks` returns each hunk's number in its file and its @@ line, not its
  text; `magit.stage-hunk` / `magit.unstage-hunk` make git's diff of that file again in Emacs, check that hunk's @@ line against the
  one given, cut the file's header and that hunk, and `git apply --cached` (`--reverse` to unstage) through `magit-run-git-with-input`.
  A file changed since is refused (ask again). Tezcatl never builds a patch or reads the diff
- **The log is cut** by `count` (a param `default` of 50, `params[].default` in the intent; a call gives its own) so that it fits the
  message channel; a path for large answers stays open (issues)

**Alternatives**: a `git` panel where the relay runs git (reproducing Magit's status screen); a panel only for Magit; Magit returning the
difference itself; the reading rules in a settings file on the panel's side; (2026-10-21) one decode_emacs whose table is switched by the
last answer; Tezcatl writing the new index text of a file (from the hunks a person chose) to `~work` for Emacs to `hash-object` +
`update-index`; returning the hunks' text in the table.

**Why not**: (2026-10-21) a switched table cannot show the log and a commit's files at once; writing the index text makes Tezcatl
compose file contents from a diff — logic that is git's — and is kept for staging single lines, if Emacs can give the diff as rows
(issues); the hunks' text does not fit the message channel, and the file against its base (`d`) shows it. git in the relay reinvents the wheel and heads back to rebuilding Emacs' extensions. A dedicated panel multiplies per
extension. A difference as text makes Tezcatl read it, with no links to files — a list plus versions' texts reuse `code_diff` and
`code.open-at` as they are. Reading rules apart from the intent make two places to write.

**Files**: `lib/vent/decode-table.js` (pure), `lib/vent/decode-emacs-page.js`, `panels/resident/decode_emacs.html`, `lib/vent/resolver.js`
(checks `result.table`, posts `intent.result`), `lib/vent/input-panel.js` (`intent.run`), `panels/resident/input.html`,
`panels/resident/dialogue-input.html`, [extending/intents.md](../extending/intents.md), `bus/messages.json`, `test/decode-table.test.js`,
`test/resolver.test.js`, `lib/skin/intent-commands.js` (`table`), `lib/skin/frame-code.js` (`addTable`, `table.open`),
`command/dialects/emacs/extensions/magit.json`, `test/run-table.test.js` (the `table` line), `test/e2e/decode_emacs.mjs` (answers on the bus instead of Emacs), `test/e2e/decode_emacs_magit.mjs` (a real Emacs:
`stack.sh emacs`).

<a id="d-discard-confirm"></a>

## D-discard-confirm — what discards runs on a second press, or on a `!` a person wrote

**Decided** (crux, 2026-10-23): an intent that discards what cannot be had back has `"discards": true` (`magit.discard-file`,
`magit.discard-hunk`, `magit.restore-file`, `magit.stash-drop`). The resolver runs one only when its caller says it was confirmed
(`ctx.confirmed === true`), else answers why (nothing reaches Emacs). Two ways to confirm:

- a table key with `"confirm": "<what is discarded>"`: the first press says that and the row's values (`X again to do it (it cannot be
  undone)`); the second press of the same key on the same row within 3 s runs it (`intent.run` with `confirmed: true`). Another key — the
  cursor moving — or a longer wait forgets the first press. The resolver refuses to load a table key calling a discarding intent without
  `confirm`
- `intent! <id> …` in the frame (a person wrote the `!`, as `:w!`); `intent <id>` is refused with the way to do it. A run_table row runs
  one only if its line says `intent!`. The input panel's Form never confirms

What discarding means is kept narrow: an unstaged change goes back to the index (`git restore --worktree`), an untracked file goes to
the trash (`magit-delete-by-moving-to-trash`, Magit's default), a staged row is refused (unstage first: the staged and the unstaged
changes of one file are never lost together), a hunk is taken out of the working tree after its @@ line is checked; `R` in a commit's
files makes the file in the index and the working tree what it is at that commit.

**Alternatives**: a sentence typed in a code_vi_minimum ("yes"); a dialog; Magit's own `magit-discard-files`.

**Why not**: typing a word is slower than the danger needs and is soon typed without reading; a dialog is a page of its own in an
origin that touches the bus; `magit-discard-files` asks y/n in Emacs' minibuffer, which Tezcatl does not show.

**Pitfalls**: `delete-file`'s TRASH moves to the trash only while `delete-by-moving-to-trash` is non-nil — it is bound to
`magit-delete-by-moving-to-trash` (found in a batch Emacs, 2026-10-23: without it the file was deleted). The E2E Emacs has its own trash
(`XDG_DATA_HOME` under `$E2E_DIR`). Comparing "the same row" is by its cells: a refreshed table with the same row still matches.

**Verified**: `test/e2e/magit_discard.mjs`, `test/resolver.test.js`, `test/decode-table.test.js`.

**Files**: `lib/vent/decode-table.js`, `lib/vent/decode-emacs-page.js`, `lib/vent/resolver.js`, `lib/vent/input-panel.js`,
`lib/skin/intent-commands.js`, `command/dialects/emacs/extensions/magit.json`.
