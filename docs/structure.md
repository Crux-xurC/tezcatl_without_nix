# Structure

What Tezcatl is made of and why it has this shape — kept thin: the principles, who does what, and an index of the decisions. Each decision
is written in full in the record of its main file ([files/](files/index.md)); the "why" of anything is reached from there.

## 1. The twelve starting principles

Set in the first requirement document. Still alive, but abstract; actual choices are made by the decisions (§3).

1. Tezcatl does not replace Emacs
2. `emacs-vent` does not become a second UI of Emacs
3. `vent-out` sends semantic events
4. `vent-in` passes input through as it is (does not interpret it)
5. Events and context are separate
6. source / type / content are the basic unit of an event
7. Tezcatl aims to know the active context at all times
8. Transport and protocol are separate
9. JSON is not an absolute premise of the wire protocol
10. Tezcatl's core is not allowed to grow fat
11. Web pages can be units of extension
12. Existing Emacs / Vim / VS Code / Web / CLI assets are backends, not competitors

Principle 7 changed its meaning: first "always know Emacs' state", now only "know where the next keystroke goes" ([D-next-keystroke](files/lib-vent-output-panel.js.md#d-next-keystroke)).

## 2. Who does what

**When adding a file, check it against every boundary below: is this really this component's job?** (A receiving UI for testing vent-in was
once almost put inside the emacs-vent repository.)

| Layer | Does | Does not |
|---|---|---|
| **Browser (Tezcatl UI)** | UI; reading and normalising input; encoding text as InputEvents; the input middleware; mapping; text editing (CodeMirror + LSP); drawing terminals (xterm.js); completion and suggestions; decoration; laying out panels (skins); messages between panels (`BroadcastChannel`, not through the relay); UI-local commands; user customisation | Re-implementing Emacs' features; touching the disk or PTYs directly |
| **Elixir (the relay)** | The **paths** of state: relaying and multiplexing vent; starting and relaying PTYs; reading, writing and searching files; starting and multiplexing language servers; multiplexing Xipe Totec; the place for copies of edits; the connection ledger; the policy for accepting connections (`Origin`, `Host`) | Interpreting vent messages (pass-through); converting input; keeping or mirroring vent's state |
| **emacs-vent-in** | Receiving input from `127.0.0.1`; `in-filters`; normalised input → Emacs events (never splitting a modifier from its key); injecting into `unread-command-events` | Judging `M-x`'s meaning; reading command names; package-specific handling; Vim / Evil; completion; inserting text; UI; special cases for eval or the clipboard |
| **emacs-vent-out** | Emitting what happens inside Emacs as semantic events; telling where input goes (context); `out-filters`; resolving sources; keeping a single client | Delivering UI; handling input; sending buffer contents or display state |
| **Emacs** | Interpreting keymaps; running commands and packages; the "computation" of Magit, Org, dired … | Display |

### Where each capability lives

The table above read per capability. **Each capability has one home**; a capability with two (diagnostics from both LSP and Emacs) blurs
"which is the axis", so none is made.

| Capability | Home | Path |
|---|---|---|
| Build / run / test | the PTY (②) | run in an xterm; failures picked from `path:line:col` in the output |
| Syntax and semantic errors while editing, completion, hover, definition, references, rename, format | LSP | the relay starts and multiplexes a process per `(root, serverId)`; an editor holds one `/lsp` and uses `@codemirror/lsp-client`; diagnostics are CM6's lint facet |
| Text editing | CodeMirror (the browser) | the browser owns editing ([D-results-not-display](files/lib-vent-protocol.js.md#d-results-not-display)); saving through ③ |
| Reading, writing, searching files | ③ (Elixir) | `/fs`, `/fs/read`, `/fs/write` (checked against the opened version), `/fs/delete`, `/fs/rename`, `/fs/grep`, `/fs/stat`, `/fs/clone`; copies of edits through `/mirror` ([D-mirror](files/lib-relay-mirror.exs.md#d-mirror)) |
| git porcelain logic, org, Proof General | Emacs (an outside computer) | intents (correlated `M-:`), the dialogue bridge |
| UI-local operations (focus, open, close, layout) | `command_map.json` + `commands.js` | the panel bus |
| Tasks and the agenda | the browser (notes' tables, task_table, the task list) | org-mode's vocabulary only (TODO / DONE, `C-c a`); data and implementation are not compatible — nothing goes to Emacs |
| One command to build or run the current file | the browser (`compile-intent.js`) + the PTY | resolving the environment is left to the target xterm's shell |
| Calculation rows per function (evaluating, recording, referring) | Xipe Totec (a separate process) | the relay's `/xipe` ([D-xipe-relay](files/lib-relay-xipe_socket.exs.md#d-xipe-relay)); the table ([D-matrix-shell](files/lib-xipe-matrix-grid.js.md#d-matrix-shell)); the dialogue window ([D-xipe-dialogue](files/lib-xipe-xipe-session.js.md#d-xipe-dialogue)); Xipe Totec chooses the target project |
| Selecting, filtering and joining tables (intermediate tables) | MariaDB (a separate process, `nix/db`) | the relay's `/sql` ([D-db-backend](files/lib-relay-sql.exs.md#d-db-backend)); the answer is a matrix table |

**LSP is not packaged in its own flake like the Emacs flake.** A language server is practically a compiler's front end and needs the target
project's build environment (rust-analyzer runs `cargo check`, elixir-ls compiles the project); closed in its own closure it would drift from
the PTY's and the build's. Like the PTY, **the relay starts it as a stdio child**: `cwd` and the command come from the client, binaries are
resolved on PATH (the user brings them, as with nvim). **The PATH and the environment are the project's**: the relay asks the command
`project_env.json` declares for the project's marker (`nix print-dev-env`, `direnv export json`, …) once and starts the server with it —
no longer "the relay started from inside the project's dev shell", which Poca's box (tezcatl's own dev shell) could not keep
([D-project-env](files/lib-relay-project_env.exs.md#d-project-env)); a terminal gets it only when asked (`env xterm`). Start-up is heavy, so processes are kept per `(project root, language)` and shared across panes and reconnects (not the PTY's "one
connection = one process").

## 3. Decisions

Each decision has a name, not a number, so it can be recalled. Its record says what was decided, the alternatives, why not, what it
removed, and the files involved.

| Decision | In a sentence | Home |
|---|---|---|
| [D-results-not-display](files/lib-vent-protocol.js.md#d-results-not-display) | carry computed results, never what is displayed | `lib/vent/protocol.js` |
| [D-next-keystroke](files/lib-vent-output-panel.js.md#d-next-keystroke) | the context tells where the next key goes; it is not a state sync | `lib/vent/output-panel.js` |
| [D-single-input](files/lib-vent-protocol.js.md#d-single-input) | vent-in takes one kind only: `input` | `lib/vent/protocol.js` |
| [D-inject-as-is](files/lib-vent-protocol.js.md#d-inject-as-is) | append to `unread-command-events` | `lib/vent/protocol.js` |
| [D-single-client](files/lib-relay-vent_uplink.exs.md#d-single-client) | emacs-vent stays single-client; the relay multiplexes | `lib/relay/vent_uplink.exs` |
| [D-stateless-relay](files/lib-relay-browser_socket.exs.md#d-stateless-relay) | the relay keeps no state about the vent protocol | `lib/relay/browser_socket.exs` |
| [D-loopback](files/lib-relay-allowed_origins.exs.md#d-loopback) | every port on 127.0.0.1; no authentication, only Origin and Host checked | `lib/relay/allowed_origins.exs` |
| [D-pty-in-elixir](files/lib-relay-pty_socket.exs.md#d-pty-in-elixir) | terminals do not go through Emacs | `lib/relay/pty_socket.exs` |
| [D-pty-backpressure](files/lib-relay-pty_flow.exs.md#d-pty-backpressure) | erlexec cannot be paused, so the output goes to another process | `lib/relay/pty_flow.exs` |
| [D-files-in-elixir](files/lib-relay-fs_handler.exs.md#d-files-in-elixir) | file contents never ride the vent protocol | `lib/relay/fs_handler.exs` |
| [D-empty-middleware](files/lib-vent-middleware.js.md#d-empty-middleware) | one stage always on the path; empty for now | `lib/vent/middleware.js` |
| [D-intent-resolution](files/lib-vent-resolver.js.md#d-intent-resolution) | the mapping source is a JSON dictionary; the layer stands apart, before the middleware | `lib/vent/resolver.js` |
| [D-dialogue-bridge](files/lib-vent-dialogue-output-panel.js.md#d-dialogue-bridge) | an interactive co-process is split into driving and watching, on the existing kinds | `lib/vent/dialogue-output-panel.js` |
| [D-skin-as-container](files/lib-core-panes.js.md#d-skin-as-container) | the skin lays out; panel pages stay as they are, in iframes | `lib/core/panes.js` |
| [D-ui-commands](files/lib-core-commands.js.md#d-ui-commands) | browser-local operations are looked up by name; never mixed with intents | `lib/core/commands.js` |
| [D-session-service](files/panels-invisible-daemon.html.md#d-session-service) | windows arranged by the window manager; the invisible hosts in a daemon shipped with the launcher | `panels/invisible/daemon.html` |
| [D-xipe-relay](files/lib-relay-xipe_socket.exs.md#d-xipe-relay) | `/xipe` is a stateless broadcasting relay that can both start and connect | `lib/relay/xipe_socket.exs` |
| [D-matrix-shell](files/lib-xipe-matrix-grid.js.md#d-matrix-shell) | `matrix.html` is a generic grid that knows nothing of Xipe Totec; fetching and meaning go to adapters | `lib/xipe/matrix-grid.js` |
| [D-xipe-dialogue](files/lib-xipe-xipe-session.js.md#d-xipe-dialogue) | only `input` is sent; what a line means is Xipe Totec's | `lib/xipe/xipe-session.js` |
| [D-dictionary](files/lib-list-dict.js.md#d-dictionary) | storing, registering and using words are generic parts; a backend's text is never read | `lib/list/dict.js` |
| [D-tree-skin](files/lib-skin-tree-commands.js.md#d-tree-skin) | the tree shows and selects; slots are edited by a list; commands are translated by the skin | `lib/skin/tree-commands.js` |
| [D-language-plugins](files/lib-code-code-languages.js.md#d-language-plugins) | languages are a table the user owns; grammars are plugins that borrow the core's parts | `lib/code/code-languages.js` |
| [D-vim-via-input-line](files/lib-skin-skin-ex.js.md#d-vim-via-input-line) | code_editor works inside the text; Vim's command-line work goes through the skin's input line | `lib/skin/skin-ex.js` |
| [D-code-editor](files/panels-resident-code_editor.html.md#d-code-editor) | the file editor is a role (`code_editor`, one `isEditor`); its keymap is code.json's `editorKeymap` | `panels/resident/code_editor.html` |
| [D-start-outside](files/nix-t.md#d-start-outside) | starting, stopping and keeping things running is a GUI tool outside Tezcatl; Tezcatl only asks it | `nix/t` |
| [D-logbook](files/lib-code-file-changes.js.md#d-logbook) | changes on the disk are noticed by joining the bus's "I changed it" with the list of open code_editor, told by a panel living beside them | `lib/code/file-changes.js` |
| [D-mirror](files/lib-relay-mirror.exs.md#d-mirror) | copies of edits live in slots in the user's state directory; the original is reopened and the copy replayed | `lib/relay/mirror.exs` |
| [D-rename](files/lib-code-code-editor-lsp-actions.js.md#d-rename) | a rename across files opens each affected file in code_editor and applies it unsaved; all or nothing | `lib/code/code-editor/lsp-actions.js` |
| [D-command-target](files/lib-core-commands.js.md#d-command-target) | behaviour lives in tezcatl commands and keys only name them; the target is the nearest, inside the same skin | `lib/core/commands.js` |
| [D-frame](files/lib-skin-frame-layout.js.md#d-frame) | the base of skins is a frame: columns first, panels stacked in each; it starts empty and becomes a skin by a name | `lib/skin/frame-layout.js` |
| [D-block](files/lib-skin-thema.js.md#d-block) | a block treats two panels as one; the thema panel draws a band with one line of text and a colour | `lib/skin/thema.js` |
| [D-work-place](files/lib-relay-fs_validate.exs.md#d-work-place) | Tezcatl's own temporary files (clones, scratch) live in the user's state directory, a second root of `/fs` that looks like ordinary files | `lib/relay/fs_validate.exs` |
| [D-references](files/lib-skin-recv-refs.js.md#d-references) | lines on the receiving side can carry a reference to "where / which"; `go on` goes to the last one | `lib/skin/recv-refs.js` |
| [D-work-list](files/lib-core-work-log.js.md#d-work-list) | running work and open panels are shown from a record that matches bus messages by a table of start–end pairs | `lib/core/work-log.js` |
| [D-say-side-effects](files/lib-core-panel-frame.js.md#d-say-side-effects) | what happens along the way of a command is shown on the receiving side with a reference, without asking leave | `lib/core/panel-frame.js` |
| [D-composition](files/lib-core-commands.js.md#d-composition) | commands can be put in a row; values pass as references; no branches, loops or variables (planned) | `lib/core/commands.js` |
| [D-remote-window](files/lib-core-virtual-keyboard.js.md#d-remote-window) | xpra's screen gets the mouse only; the keyboard is a Tezcatl panel's, sent without interpretation (a plan) | `lib/core/virtual-keyboard.js` |
| [D-suggestions](files/lib-skin-suggest.js.md#d-suggestions) | the next word of the input line is chosen from a panel of candidates per source; one shell, sources as tables | `lib/skin/suggest.js` |
| [D-lead-key](files/lib-core-lead.js.md#d-lead-key) | keys pressed at the destination are written as a one-character prefix and one character; `;` by default | `lib/core/lead.js` |
| [D-unified-dock](files/lib-skin-frame-dock.js.md#d-unified-dock) | the dock's input line has a destination and the receiving side a source, each shown on one line; it takes in Emacs' input and output and the remote window's A, A' and B | `lib/skin/frame-dock.js` |
| [D-bridge](files/lib-target-frame.js.md#d-bridge) | another frame (another tab: Poca's split view) is a destination and a source of the dock (`f`): a line runs there, its lines come back; no dock of its own | `lib/target/frame.js` |
| [D-dock](files/lib-skin-dock-layout.js.md#d-dock) | the dock is a unit of a skin with a fixed set of parts; parts and layout are `docks/<name>.json`, changes on the spot go into the skin | `lib/skin/dock-layout.js` |
| [D-bus-ledger](files/lib-core-panel-bus.js.md#d-bus-ledger) | the bus's messages are written in one ledger, checked against the code by a test | `lib/core/panel-bus.js` |
| [D-lsp-owner](files/lib-relay-lsp_owners.exs.md#d-lsp-owner) | on a shared language server, each open document has one owner; only the owner's text reaches the server | `lib/relay/lsp_owners.exs` |
| [D-juncture](files/lib-code-juncture.js.md#d-juncture) | the state of a file a person checked is copied as a point, in a tree per file; applied as an unsaved edit | `lib/code/juncture.js` |
| [D-markdown](files/lib-code-markdown.js.md#d-markdown) | notes are drawn in a read-only panel; it follows only a code_editor of the same skin and path that a person tied with `follow` | `lib/code/markdown.js` |
| [D-id-pool](files/lib-relay-id_pool.exs.md#d-id-pool) | marks in a text are replaced with ids from a list the relay keeps; an id is never given twice | `lib/relay/id_pool.exs` |
| [D-task-table](files/lib-task-task-table.js.md#d-task-table) | a note's table is taken into a book, edited as a table and put back into the note; matrix's shell is borrowed, the panel and commands are its own | `lib/task/task-table.js` |
| [D-task-list](files/lib-task-task-list.js.md#d-task-list) | the task list is one book cut from a task_table; the agenda shows it as rows and its changes go back to the table's book | `lib/task/task-list.js` |
| [D-intent-later](files/lib-vent-resolver.js.md#d-intent-later) | an intent that takes long (fetch, pull, push) starts a process: `took` at once, answered when it ends; `post.commands` run tezcatl-commands after it (`check.update-all`) | `lib/vent/resolver.js` |
| [D-discard-confirm](files/lib-vent-decode-table.js.md#d-discard-confirm) | an intent that discards (`discards: true`) runs only on a table key's second press on the same row, or `intent!` written by a person | `lib/vent/decode-table.js` |
| [D-decode-emacs](files/lib-vent-decode-table.js.md#d-decode-emacs) | a panel that makes Emacs' answers a table; how to read them is written in the intent; Magit's meaning stays in Emacs | `lib/vent/decode-table.js` |
| [D-minimum](files/lib-code-minimum.js.md#d-minimum) | a small editor for one text; `:m <destination>` delivers it | `lib/code/minimum.js` |
| [D-run-table](files/lib-task-run-table.js.md#d-run-table) | a book of rows sent one by one to their input, the smallest id with an empty status first; "OK" is never defined | `lib/task/run-table.js` |
| [D-open-page](files/lib-core-open-page.js.md#d-open-page) | a tab or a window is the features given to `window.open` (Poca follows the Web's rule, and keeps the secret in both); the settings are config.json `launcher`; `open <page> [tab\|window]`, fallbacks' `mode` | `lib/core/open-page.js` |
| [D-store](files/lib-core-store.js.md#d-store) | what is kept (saved skins, blocks, bookmarks, the kill ring …) lives in `~work/store/` files, not in the browser | `lib/core/store.js` |
| [D-project-env](files/lib-relay-project_env.exs.md#d-project-env) | a project's environment (for its language servers, and for terminals asked with `env xterm`) comes from a command declared per marker in `project_env.json`, read as JSON (`env` or `nix`), asked once and kept till `env reload` | `lib/relay/project_env.exs` |
| [D-poca-secret](files/lib-relay-secret_gate.exs.md#d-poca-secret) | the relay serves only what Poca opened: HTTP needs Poca's header, a browser's WebSocket a one-shot ticket; without a secret it starts only when told to (`--no-auth`) | `lib/relay/secret_gate.exs` |
| [D-db-backend](files/lib-relay-sql.exs.md#d-db-backend) | a database is a third backend: Tezcatl's own MariaDB (`nix/db`, :3307), reached by the relay's `/sql` (a session per database window); SQL is never read by Tezcatl | `lib/relay/sql.exs` |
| [D-db-session](files/lib-relay-sql.exs.md#d-db-session) | a person logs in to a numbered database window (its own session, the password asked in the window); window 1 is the intents' (an intent's `sql`, its values to the `?`s; books made its temporary tables by `sql.load`), where no statement is typed (built) | `lib/relay/sql.exs` |
| [D-synthesis](files/lib-skin-synthesis.js.md#d-synthesis) | a synthesis is a panel written in JSON: its name, looked up, places several panels, one of them its main (the way in, what speaks for it, where its behaviour lives); to the skin one panel | `lib/skin/synthesis.js` |

## 4. Withdrawn proposals

Things nearly adopted, then taken back. **The same proposals come back in other shapes**, so they are kept with their reasons.

| Withdrawn | What happened | Why |
|---|---|---|
| Adding `major-mode`, evil state, `point` to the context | written in documents only, withdrawn | collides with [D-next-keystroke](files/lib-vent-output-panel.js.md#d-next-keystroke) and [D-results-not-display](files/lib-vent-protocol.js.md#d-results-not-display); keymaps are resolved in Emacs, so knowing the mode has no use |
| Watching Emacs' internal state with `post-command-hook` | same | same; `post-command-hook` went back to flushing, and to checking the context only as a safety net (sent only when it changed) |
| Fetching the context automatically by injecting `M-:` | implemented, then removed | it gives Emacs a state-following mechanism; it came back as a one-time fetch started by the browser ([D-stateless-relay](files/lib-relay-browser_socket.exs.md#d-stateless-relay)) |
| An `M-:` query layer as an Emacs package | considered, not done | a convention in the README is enough; a package would make emacs-vent less thin |
| A `clipboard` kind | implemented, then removed (not revived) | [D-single-input](files/lib-vent-protocol.js.md#d-single-input): merged into text sending; large pastes go as chunks of `input` |
| An `eval` kind | considered, rejected (again when the `M-:` channel was hard) | `M-:` is enough; reviving it would undo [D-single-input](files/lib-vent-protocol.js.md#d-single-input); seeing (`code_el_intent`) and stopping (`C-g`) instead ([D-intent-resolution](files/lib-vent-resolver.js.md#d-intent-resolution)) |
| Authentication in an "Elixir gateway" | planned, removed | [D-loopback](files/lib-relay-allowed_origins.exs.md#d-loopback): narrowing the premise made it unnecessary |
| The browser as a display mirror (Emacs owning the truth of editing) | the early policy, reversed | [D-results-not-display](files/lib-vent-protocol.js.md#d-results-not-display): Magit's value is git porcelain's logic, not its UI |
| vterm through emacs-vent | in the early diagrams, not adopted | [D-pty-in-elixir](files/lib-relay-pty_socket.exs.md#d-pty-in-elixir) |
| Making `main.html` a shell or renaming it `emacs.html` | held, then withdrawn | `main.html` is the real launcher (image, page list, form), neither Emacs-only nor one-off, so there was no reason |
| Carrying Proof General's processed end as one integer | assumed, then not taken | [D-dialogue-bridge](files/lib-vent-dialogue-output-panel.js.md#d-dialogue-bridge): its formatted text is carried as it is, so position units never arose (never implemented — a different path chosen while building) |
| Keeping `compile` in Emacs | documents only, withdrawn | build, run and test are the PTY's, diagnostics LSP's; through Emacs there would be two sources of diagnostics |

**A tendency**: most withdrawn things **grew on paper before being implemented** — proposals in documents do not run, are never checked,
and stay as if they were specifications. Things implemented (`clipboard`) were found unnecessary by use. So every decision here writes "the
alternatives" and "why not"; a decision whose reason cannot be written is not a decision yet.

## 5. Other editors

What ports best is the wire protocol and Tezcatl's `lib/` (only `kbd.js` is editor-specific). An adapter keeps three duties only: injecting
input, telling focus, catching messages. The lifeline on the host's side is **"keys can be injected by the same path as a person typing"**
(entering before keymaps are resolved).

- **Neovim** meets it; the reason to make it a vent would be "computation only Vim has" (`:g/…/normal`, ex, macros) — modal editing itself
  is no reason (the input middleware can do it on Tezcatl's side)
- **VS Code** cannot meet the injection condition
