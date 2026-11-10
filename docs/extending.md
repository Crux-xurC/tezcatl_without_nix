# Extending Tezcatl

What to write to add something, where, and which test tells you when you forgot a place.
Most additions are data (JSON) and need no code; the rest have a fixed set of places.
Each row ends with the detailed recipe when there is one.

The rules that hold for every row:

- Behaviour goes in `lib/<role>/<name>.js` (pure, unit-tested) and `lib/<role>/<name>-page.js`
  (the page's script); an HTML page only loads scripts. Roles: `core` `vent` `code` `skin` `list`
  `task` `recv` `target` `suggest` `term` `xipe` `view`.
- Run `node --test test/*.test.js` after any change. The ledger tests below fail when a list was
  not told about the new thing — that is their job.
- Say how to use it in [how-to-use.md](how-to-use.md); if you decided something with a reason,
  write it in the file record of the main file ([files/](files/index.md)).
- Things only for you (a personal skin, a look) go under `local/` (not in git), searched before
  the shipped ones.

## Commands and keys

| To add | Write | Also update | Guarded by |
|---|---|---|---|
| an operation callable from the palette, another window or a key (a **tezcatl command**) | `command/command_map.json`: `name`, `desc`, `args`; if the frame's input line can do it, `line` (`"skin add {panel}"`) and no code is needed; else `Tezcatl.commands.register(name, fn)` in the page script that owns it (return `false` when not yours) | `command/README.md` §2.1 | `test/command-readme.test.js` |
| an operation on the current file of a `code_editor` | a `code.*` tezcatl command: `lib/skin/skin-ex.js` `COMMANDS` (name → op), `lib/code/code-editor.js` `OP_EX` and `fileEx`, the work in `lib/code/code-editor/`; as an ex command too: `FILE_EX` and `lib/code/code-files.js` `OPS` | `command/README.md` §2.1–2.2 | `test/command-readme.test.js`, `test/skin-ex.test.js` |
| a line of the frame's input form (`run …`, `log …`) | the parsing in a pure `lib/skin/<name>-commands.js` (`parse`, `wire`); one entry in `LINES` of `lib/skin/frame-lines.js`; its wiring in `lib/skin/frame-code.js` (and its name in the object it returns); its `<script>` in `panels/skins/frame.html` (before anything that uses it); a stub in `test/frame-lines.test.js` | `command/README.md` §2.3, `suggestion/line.json` (one row per form) | `test/suggestion.test.js`, `test/frame-lines.test.js` |
| a key in `code_editor` (per keymap) | make it a tezcatl command first, then `DEFAULT_KEYS` in `lib/code/editor-keys.js` (a default) or `keys` in `code.json` (yours, per keymap) | `command/README.md` §2.4 | `test/command-readme.test.js` |
| a lead-key shortcut (`;:`, `;i` …) | `ui.keys.leadBindings` in `config.json` (`";x": "<command> <args>"`, `""` takes one out); the fixed letters cannot be bound | — | `test/lead.test.js`, `test/how-to-use.test.js` |
| a process shown by `work list` | one pair in `work.json` (the start type, the end type, the key that matches them, `cancel`, `expireMs`); both must be bus messages | — | `test/work-log.test.js` |
| a bus message | its entry in `bus/messages.json` (who posts, who takes, payload, how takers narrow it) | — | `test/bus-ledger.test.js` (both ways) |
| a line telling the person what happened beside what was asked | post `recv.say {text, cls?, ref?}` from the panel; the frame shows it | — | — |

## Backends

| To add | Write | Also update | Guarded by |
|---|---|---|---|
| something Emacs runs (an **intent**) | one entry in `command/dialects/emacs/extensions/<extension>.json` (a new file is named in `intent_map.json`), and `{ "id" }` in `command/binding_map.json` — [extending/intents.md](extending/intents.md) | `command/README.md` §2.5 | `test/command-readme.test.js` (the ids of `binding_map.json`) |
| an intent run in the browser | `command/intents/browser.json` with `browser.backend` | same | `test/command-readme.test.js` |
| an intent run on the database (window 1) | `command/intents/db.json` with `sql` — [extending/intents.md](extending/intents.md#sql--a-statement-run-on-database-window-1-d-db-session) | same | `test/command-readme.test.js`, `test/sql.test.js` |
| an intent's answer shown as a table | `result.table` in the intent — [extending/intents.md](extending/intents.md#resulttable) | — | `test/decode-table.test.js` |
| an intent's answer turned into run_table rows | `result.book` in the intent, and the template it names — [extending/intents.md](extending/intents.md#resultbook) | — | `test/decode-table.test.js` |
| a way to get a project's environment (a tool other than Nix, direnv, mise) | one entry in `project_env.json`: `marker` (a file in the project's root), `command` (run there, printing JSON), `format` — `env` (`{"NAME": "value" \| null}`) or `nix` (`nix print-dev-env --json`); a script printing `env` for anything else | — | `test/relay/project_env_test.exs` (the formats) |
| a language (LSP, highlighting) | `languages` in `code.json` and the server in `lsp.json`; a grammar if you want colours — [extending/languages.md](extending/languages.md) | — | `test/code-languages.test.js` |
| a compile command for a language (`compile.run`) | `compile.json` | — | `test/compile-intent.test.js` |
| a place the input line sends to | `input_target/<id>.json` (label, scripts) and its row in `input_target/index.json` (order, letter); the way in `lib/target/<id>.js` (`candidates`, `start`, `send` — the shape is in `lib/target/emacs-vent.js`) | — | `test/input-target-dir.test.js` |
| a source the receiving side shows | `output_target/<id>.json` and `output_target/index.json`; the way in `lib/recv/<id>.js` (`candidates`, `start`, `lines` — the shape is in `lib/recv/xterm.js`) | — | `test/output-target-dir.test.js` |

## Panels and looks

| To add | Write | Also update | Guarded by |
|---|---|---|---|
| a **panel** | `panels/extra/<name>.html` (only loads scripts) and `lib/<role>/<name>-page.js`; its row in `list_kinds/panels_and_skins.json` (the launcher and `skin add` find it there) — [panels/extra/README.md](../panels/extra/README.md) | — | `test/list-kinds.test.js` |
| a **list** (a filtered list with keys, in `panels/tool/list.html`) | `list_kinds/<name>.json` (title, labels, keys) and `lib/list/kinds/<name>.js` (fill and the actions) | — | `test/list-kinds.test.js` |
| a source of **suggestions** (the words offered after the input line) | `suggestion/index.json` and `lib/suggest/<id>.js` | — | `test/suggestion.test.js` |
| a saved **skin** shipped with Tezcatl | `skins/<name>.json` (what `skin save` prints) — [skins/README.md](../skins/README.md) | — | — |
| how a panel is dressed in the frame (its band) | `blocks/<panel>.json` — [blocks/README.md](../blocks/README.md) | — | `test/thema.test.js` |
| a look for the bands (rounded corners …) | `thema/<name>.css` — [thema/README.md](../thema/README.md) | — | — |
| a layout of the dock | `docks/<name>.json` — [docks/README.md](../docks/README.md) | — | `test/dock-layout.test.js` |

## Tables and runs

| To add | Write | Also update | Guarded by |
|---|---|---|---|
| a run_table **template** (lines sent one by one) | `tasks/run/<name>.json`: the seven columns (`id input line wait auto status note`), then variables; `defaults`; `keys` — see run_table in [how-to-use.md](how-to-use.md#send-rows-one-by-one-run_table) | — | `test/run-table.test.js` (the shape) |
| a **key** every run_table knows (a failure's first words) | `tasks/run_keys.json` (`"<status>": ["<prefix>", …]`) | — | — |
| the columns a task_table needs | `tasks/task_table.json` | — | `test/task-table.test.js` |

## Where the details are

- every command, with the file that has it: [command/README.md](../command/README.md)
- end-to-end checks in a real browser: [test/e2e/README.md](../test/e2e/README.md)
- why a file is as it is: its record in [files/](files/index.md)
