# Issues

What is being considered or worked on next. What is promised and what happens outside is [scope.md](scope.md); why things are as they are
is in the file records ([files/](files/index.md)).

## Next by the author

**The goal now (crux, 2026-10-23): Tezcatl's first completion** — the intents brought to a set level, then the whole of Tezcatl tested,
then the development release (publishing, below). The author's other work goes on in sessions of its own and is not in this list.

### 1. The intents

Where they are: Magit with decode_emacs and run_table works on a real Emacs (`test/e2e/decode_emacs_magit.mjs`, `stack.sh emacs`) —
`magit.changed-files` with `s`, `u`, `d`, `C` (the message from a code_vi_minimum), staging several files from a run_table
(`result.book`, `magit_stage`), one hunk (`magit.hunks`), the log and a commit's files (`table magit.log` → `f` → `d`), branches, fetch, pull and push (`table magit.branches`, `test/e2e/magit_branch.mjs`); intents on
database window 1 (`sql`, `sql.load`; `db.tables`, `db.magit-section`). How to add one: [extending/intents.md](extending/intents.md).

**The set level for the release (crux, 2026-10-23): Magit's everyday use.** Done when these work on a real Emacs, each with an E2E check:

1. branch (switch, create), fetch, pull, push — **done** 2026-10-23 (`magit.branches` and the rest, later intents:
   [D-intent-later](files/lib-vent-resolver.js.md#d-intent-later), `test/e2e/magit_branch.mjs`); stash (push, pop, apply, list) —
   **done** 2026-10-23 (`magit.stashes`, `test/e2e/magit_stash.mjs`). Dropping a stash waits for the confirmation of 2
2. discarding changes (discard a file's or a hunk's change, restore a file, drop a stash) behind a confirmation — **done** 2026-10-23
   (a second press, `intent!`: [D-discard-confirm](files/lib-vent-decode-table.js.md#d-discard-confirm), `test/e2e/magit_discard.mjs`).
   Large answers through a file: **not needed** — measured 2026-10-23, `via:"message"` carries 40 MB in 2 s; what stops an answer is
   Emacs computing for more than 3 s. If a query ever needs that, `later` can be widened to queries (a process' output made a value)

Dired (operations on a chosen set of files) and Org (agenda items, capture, schedule) are for the release after: what a row is and how a
row is the same one after a refresh are not decided ([extending/intents.md](extending/intents.md#planned-features-a-provisional-mapping)).
Staging single lines and the rest below are not needed for the release.

Open:

- **Staging single lines** (examined 2026-10-21 in a batch Emacs with the real Magit; not built): Emacs can give a file's diff as rows
  (hunk, number in the hunk, `+` / `-` / context, old and new line numbers, text) by reading git's unified diff, and can stage or unstage
  a chosen set of those numbers by Magit's own rule for a region (`magit-diff-hunk-region-patch`: chosen lines kept, unchosen `-` made
  context when staging — `+` when unstaging —, the others dropped, `diff-fixup-modifs` for the @@ counts, `git apply --cached`); a choice
  with no changed line is refused. Tezcatl only carries the numbers. Two ways to run it:
  - several lines at once from a range chosen with `v` in decode_emacs (one call; the numbers shift after each application, so the
    lines of one call must be applied together)
  - one row a line through a run_table (below) — possible only if a line is named on the side that does not move: the working tree's
    line numbers when staging (the index moves), HEAD's when unstaging. Not yet tried
- **Chosen rows of a table into a run_table** (proposed 2026-10-21; possible since 2026-10-23 through the database: `v` and `b` in
  decode_emacs, then `run from` an intent whose `sql.load` takes that book — `db.magit-section`): what is not there is the shorter
  way first proposed — `v` then a key putting the chosen rows into the book of the intent's `result.book` (made from the answer's
  items, not the cells shown), appended to that intent's book so that choices accumulate before `run start`. Fits operations whose rows keep their meaning while
  others run (files by path); hunks and lines need a naming that does not move (above)
- **Joining tables across panels** (a memo, crux, 2026-10-21): seeing Magit's tables (changed files, log, a commit's files, hunks) joined
  in one — a join added to matrix, or rows joined by a key like the agenda's `inner_id` into a new table whose changes go back to the
  tables they came from
- The log's `count` is a param `default` in the intent (50); a person changes it there or per call — whether a setting in `config.json`
  should override intents' defaults
- Carrying large answers through a file; a double press to confirm discarding (discard is not in yet); a saved skin keeping which intent
  each decode_emacs shows — [D-decode-emacs](files/lib-vent-decode-table.js.md#d-decode-emacs), [D-run-table](files/lib-task-run-table.js.md#d-run-table)

### 2. The whole tested

- The unit tests (`node --test test/*.test.js`) and the relay's (`./test/run-relay.sh`)
- Every E2E scenario of [test/e2e/README.md](../test/e2e/README.md), each on a fresh stack (scenarios run one after another can
  disturb each other: pages left open answer `intent.run`); those with a password through a test account (`E2E_DB_USER`,
  `TEZCATL_E2E_DB_PASSWORD`); `decode_emacs_magit.mjs` and `magit_*.mjs` with `stack.sh emacs`
- **Run 2026-10-25 at d57158d, all passed** (before taking up the walk-through again): unit 616, relay 232, every E2E scenario and
  `xipe_skin.mjs .` (the database ones logged in with a test account, `secret_gate` with `E2E_SECRET`), and `poca_gate.mjs` on a display
  of its own (`Xvfb :99` + `openbox`; Poca's `build/` and `build-dev/`). Found and fixed in the run: `suggestion_list.mjs` picked `main`
  by its place, which `skin del line` (d57158d) moved; `poca_gate.mjs` (and Poca's `e2e_auth` / `e2e_window`) lacked `--no-first-run`.
  Beside it: Xipe Totec's 568 and its live tests (iex, OCaml, GHCi with cabal and stack), embody by its ReadMe's examples, Poca's
  `e2e_auth`, `e2e_window`, `e2e_split` (`build/` is the binary of 2026-10-22, without the split: `build-dev/` passes). The run before:
  2026-10-23 at c6eee77, unit 609, relay 232, E2E 66 scenarios
- Known and open: in `test/e2e/db_intents.mjs`, after a decode_emacs is added, keys typed through CDP into a database window's command
  line are sometimes not taken (found 2026-10-23; whether Tezcatl's focus or the driver's is not known; the scenario posts `cmd.input`
  as `Mod-Enter` does)
- crux's checks in the real Poca: tabs and windows ([D-open-page](files/lib-core-open-page.js.md#d-open-page): Poca's new windows
  keep the secret, `open <page> [tab|window]`), the database window and its intents
  ([D-db-session](files/lib-relay-sql.exs.md#d-db-session))
- What a check finds outside [scope.md](scope.md) is not a defect; what is inside goes to its record or to this list

### 3. Publishing

**Publishing in two layers** (the direction, decided 2026-10-20):
- *Development releases*: Tezcatl, Xipe Totec and embody, each from its own repository with its own flake, each checked on its own with
  Nix. For engineers who use the Nix package manager on an ordinary Linux distribution, as the author does; NixOS is not assumed, and
  packaging everything as Nix (modules, services) is left to NixOS users. Poca is published as it is and installed on its own; without
  it, `t --no-auth` and a Chromium browser ([scope.md](scope.md#starting-and-running))
- *tezcatlipoca* (Tezcatl in Poca): the stable bundle for a wider audience, without Nix — a fixed combination of the development
  releases (a lock of their commits) that passed the E2E and Xipe Totec's tests together, with Poca. It holds what is outside Tezcatl
  ([D-start-outside](files/nix-t.md#d-start-outside)), and a thin repository: the lock, the commands and the packaging; no code of its
  own:
  - `tezcatlipoca setup` writes the rows of Poca's `box.json` that depend on the person: Emacs (where it is and how it starts differ
    per person — `command -v emacs` offered and changeable to any command; `--fg-daemon` added, since a box row stays in the
    foreground; `ports` matching emacs-vent's own address, which emacs-vent sets; or no Emacs row, for a daemon already run elsewhere),
    tezcatl and Xipe Totec (their places, `PATH`, one FS root for `TEZCATL_FS_ROOT` and `--fs-root`). It replaces only its own rows by
    name and leaves the person's others; run again to change. It can check that the Emacs starts and the port opens, not that
    emacs-vent loads (that is the person's init). Not in Poca (Poca knows nothing about what it shows) and not in Tezcatl
  - A command copying embody into a project (carrying embody's version, so a stale copy can be told)
  - tezcatlipoca's own commands (embody's …) in a file Tezcatl reads through one entrance — a further file named in `config.json` or an
    environment variable, read by a mechanism that already reads files (intents, run templates), not a seventh place to register
    commands. Tezcatl only sends their line to a terminal (as `:m xterm`); what runs is tezcatlipoca's script
  - The first one narrowed: Linux x86_64 only; Poca as `build/Release` with a list of the system libraries CEF needs; language servers,
    OCaml and GHC from the person's own environment. Numbered 0.x until combinations have been checked over time
- Order: the intents (1. above) brought to a set level and the whole tested (2.) → the development releases, one by one → time to learn, and the version
  without Nix → one trial of the whole → tezcatlipoca. "Within days" of the development releases is an effort target, not a promise:
  the development releases draw no one until they are announced, so there is room to learn. In parallel with the rest of this list
  (which hardly touches how the relay starts): a version without Nix (the relay, today `elixir main.exs` with cowboy from Nix through `ERL_LIBS`, made a mix project for `mix release`
  with ERTS; the static pages served by the relay's cowboy instead of `python3 http.server`, deciding the page server `:4001` of the
  Poca's secret row with it) for Tezcatl, then Xipe Totec; then tezcatlipoca's lock and commands. Poca's packaging starts from sorting out CEF's dependencies (tried
  once and left for now). Places that assume Nix are marked `<!-- env:nix -->` in the documents,
  to be revised for tezcatlipoca — `grep -rn "env:" docs README.md`
- Before the development releases: the Publishing row below. The relay's own connections to `:4000` / `:4200` were re-examined
  (crux, 2026-11-09) and moved to after the release: browsers are already refused at all three ports (emacs-vent refuses any `Origin`,
  Xipe Totec allows only listed ones, the relay asks for Poca's secret), and programs of the same user are outside by D-poca-secret. What
  is left is other users of a shared machine, and a secret on `:4000` / `:4200` alone would not close it while the relay passes a
  WebSocket without `Origin`. The development release assumes a machine one person logs in to ([scope.md](scope.md#starting-and-running))
- **Not published: the cell tables** (crux, 2026-10-26; **done** 2026-10-31). The cell tables and their views are the author's own and
  not for public use: they are kept out of the repository (`.gitignore`), their rows are out of `list_kinds/panels_and_skins.json`,
  `bus/messages.json` and `docs/files/index.md`, and the relay's route for them was deleted. `test/bus-ledger.test.js` reads only the
  pages git does not ignore, so a person's own pages beside the published ones are not held to the ledger. `skinPort.block` (a panel
  reading its block) is general and stays

## Open items

| Area | Issue | State |
|---|---|---|
| Input and dock | Held modifiers for the lead key (capitals; xpra's Ctrl+click); the default set of shortcuts; Home / End / PageUp / PageDown; whether a click on the virtual keyboard puts its notation into the input line. More suggestion sources (files the tree shows, language-server symbols, Xipe Totec's cards) and saving a table a person took. Where the receiving side's one line breaks; how the input panel's intent resolution, Text mode and `C-g` button are handled in the dock; a command to make things small; a notation to send one line to tezcatl without switching | Partly done — [D-lead-key](files/lib-core-lead.js.md#d-lead-key), [D-suggestions](files/lib-skin-suggest.js.md#d-suggestions), [D-unified-dock](files/lib-skin-frame-dock.js.md#d-unified-dock), [D-dock](files/lib-skin-dock-layout.js.md#d-dock) |
| Database and intermediate tables | The engine and its use are decided and built ([D-db-backend](files/lib-relay-sql.exs.md#d-db-backend), [D-db-session](files/lib-relay-sql.exs.md#d-db-session): numbered database windows, window 1 for intents, books into its temporary tables). Open: Xipe Totec's rows (matrix) as books; a result written back to the book it came from (a task_table's, by `inner_id`, then `W` to the note); joining tables across panels (a statement over two loads, up to 8 — not yet tried on Magit's tables); matrix itself stays read-only and writes only Tezcatl's own tables | Built to step 7 (2026-10-23) |
| run_table | `result.book`'s `fill` (another intent filling columns of rows already there); the runner watching emacs-vent's output (today only in a record and `run match`). Conditions and computation stay out (Emacs intents) | Decided; stages 1–4 done — [D-run-table](files/lib-task-run-table.js.md#d-run-table) |
| Frame and blocks | More panels posting `panel.status` (matrix_bar does); dividers in styles; how far the prototype skins move onto the frame (as syntheses: matrix → `matrix_set` done, the matrix skin's page removed; tree, xipe, intent); a `code_editor` inside a synthesis as the frame's current one, and the roll call naming a synthesis' panels; growing the frame into an LCARS-like UI (an LCARS look is not shipped; keep it in `local/`); whether a saved skin keeps the files that were open | Partly undecided — [D-block](files/lib-skin-thema.js.md#d-block), [D-frame](files/lib-skin-frame-layout.js.md#d-frame), [D-synthesis](files/lib-skin-synthesis.js.md#d-synthesis) |
| Notes and tasks (the rest) | Short names (`task_table`, `juncture` …); keeping colours in books; several task lists; the agenda's display (by date or tag, org's column view) | The main part is done — [D-markdown](files/lib-code-markdown.js.md#d-markdown), [D-id-pool](files/lib-relay-id_pool.exs.md#d-id-pool), [D-task-table](files/lib-task-task-table.js.md#d-task-table), [D-task-list](files/lib-task-task-list.js.md#d-task-list) |
| juncture | Short forms (`jt` …; one table of abbreviations for input lines?); making points automatically (before `:w`, `:Replay`, `:e!`, a rename, `:LspFormat` …); passing a path to `juncture.*` from the palette; vim keys | The main part is done — [D-juncture](files/lib-code-juncture.js.md#d-juncture) |
| Seeing work | Stopping more than LSP requests (Xipe Totec's `eval/cancel` through `work.json`); `:w` typed in `code_editor` has no start on the bus; skins other than the frame have no recorder | [D-work-list](files/lib-core-work-log.js.md#d-work-list) |
| Xipe Totec | `matrix <operation> [coordinate]` (the vocabulary of operations); coordinates of a `code_editor`'s position and a list's selected row for `radar`; showing `summary` / `args_summary` (waits for Xipe Totec); one skin with the dialogue window, the table and the list, or Xipe's windows in the frame; saying "the disk's version is evaluated" when a `code_editor` has unsaved edits | Follows Xipe Totec — [D-references](files/lib-skin-recv-refs.js.md#d-references), [D-matrix-shell](files/lib-xipe-matrix-grid.js.md#d-matrix-shell), [D-xipe-dialogue](files/lib-xipe-xipe-session.js.md#d-xipe-dialogue) |
| Changes outside Tezcatl | A patch decoding git in a terminal or saves in Emacs into `file.changed`; showing the difference on a conflict | With publishing — [D-logbook](files/lib-code-file-changes.js.md#d-logbook), [D-mirror](files/lib-relay-mirror.exs.md#d-mirror) |
| Terminals and remote windows | PTY back-pressure Phase 2 (SIGSTOP/SIGCONT, lossless); xpra with a virtual keyboard (how keys go in, raw `Esc` to a remote vim, what the destination line can show) | Later, when needed — [D-pty-backpressure](files/lib-relay-pty_flow.exs.md#d-pty-backpressure), [D-remote-window](files/lib-core-virtual-keyboard.js.md#d-remote-window) |
| Commands and lists | Composing commands (`A -- B`, `@`, names) and `matrix value`; where list panels live (alone, all skins, always); the agenda's drill-down; serialization; a kind in the connection ledger (`?kind=`) | When a real need appears — [D-composition](files/lib-core-commands.js.md#d-composition) |
| Showing and verifying | Panels for PDF / LaTeX; an E2E of the dialogue bridge with a real Coq through the relay (the one E2E not done); Magit / dired / org views | Later — [D-dialogue-bridge](files/lib-vent-dialogue-output-panel.js.md#d-dialogue-bridge) |
| Poca's secret | What a page says when it was opened outside Poca (today every request is refused, silently; crux has a plan; the refusals carry CORS for allowed origins so a page can tell); other users of a shared machine (after the development release; examined 2026-11-09): a secret on every connection without `Origin` —
the relay's `:4100` (Xipe Totec's `/lsp` then sending one), and the relay's own connections to emacs-vent `:4000` and Xipe Totec `:4200`
(changes in both published libraries); the page server `:4001` (static files of the repository are readable from any browser — `local.env`, `dict.json`; judged a small risk); the input panel's "connected" means the relay, not Emacs — show Emacs' own state apart (`GET /windows` has `alive`) | Stage 1 done — [D-poca-secret](files/lib-relay-secret_gate.exs.md#d-poca-secret) |
| Project environments | Moving the language servers of `nix/dev-tools.nix` into the projects' flakes (today they stay as the relay's own, after a project's PATH); keeping `env xterm`'s project with a saved skin and over a reload; telling Xipe Totec's scanner about the environment | Stage 1 done — [D-project-env](files/lib-relay-project_env.exs.md#d-project-env) |
| Publishing | emacs-vent's unibyte strings; carrying large output; splitting the table of special keys; sending large input step by step; the daemon electing again; a WebSocket push for `w_list`; showing a real LCARS-like setup | Choose when publishing |
| Editor keymaps | After [D-code-editor](files/panels-resident-code_editor.html.md#d-code-editor) (keys per keymap, `code.to-input`, `inputLineEx`: done 2026-11-08): the kill-ring bridge for emacs (`@replit/codemirror-emacs` keeps its ring inside — a fork, or a bundle exporting it); codemirror-emacs' own keys (`C-e`, `C-f` …) do not answer CDP's synthetic keys in the E2E (before the change too) — to be tried with a real keyboard; a Kakoune-like keymap (`kak`) | Partly done |
| Maintainability | Splitting the large files left (`lib/vent/input-panel.js` …); one place to register input-line commands (today six places — [extending.md](extending.md)); a shared relay client for pages (`relay()` is copied in several page scripts); E2E scenarios closing the pages they open | As needed |

Poca (the browser that opens Tezcatl) is a separate project and not in this list; packaging it is part of tezcatlipoca ("Publishing in two
layers" above).

## Estimates waiting for confirmation

Not reproduced; not bugs until they are. They are listed in [scope.md](scope.md#estimates-not-verified-report-them-as-bugs-if-they-hold).

## Closing an issue

When something is done and checked, take it off this list (and update [scope.md](scope.md)). A decision made with a reason goes into the
file record of its main file, with a `D-…` name, and into the index of [structure.md](structure.md).
