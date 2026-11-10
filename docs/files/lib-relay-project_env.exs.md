# `lib/relay/project_env.exs`

The projects' environments: for a project root, the relay runs the command `project_env.json` declares for it once, keeps the answer
(and a failure) until `env reload`, and hands it to the language servers and to the terminals asked for with `env xterm`. Several
waiting for the same project share one run. The pure part — reading `project_env.json`, finding a project, reading the two output
formats, looking a command up on a given PATH — is `lib/relay/project_env_config.exs`; `GET /env` and `POST /env/reload` are
`lib/relay/env_handler.exs`.

**Decisions homed here**: [D-project-env](#d-project-env)

<a id="d-project-env"></a>

## D-project-env — a project's environment comes from a command a person declares

**Decided** (2026-10-19, crux and Claude): what the language servers and the terminals of a project run with is that project's
environment, got from a command written in `project_env.json`, not the environment the relay itself was started with.

```json
{ "timeoutMs": 120000,
  "entries": [
    { "marker": "flake.nix", "command": ["nix", "print-dev-env", "--json"], "format": "nix" },
    { "marker": ".envrc",    "command": ["direnv", "export", "json"],       "format": "env" },
    { "marker": "mise.toml", "command": ["mise", "env", "--json"],          "format": "env" } ] }
```

- **One way of writing for every tool**: an entry is a marker, a command and a format. Someone without Nix rewrites or adds lines; tezcatl
  knows no tool. Only two formats are read, both JSON: `env` (`{"NAME": "value" | null}`, null unsets — direnv, mise, a script of one's
  own; values as they are) and `nix` (`nix print-dev-env --json`: its exported variables as `nix develop` takes them — without `HOME`,
  `TMPDIR`, `TERM` and the rest it leaves out, `PATH` and `XDG_DATA_DIRS` put before the relay's own; the `shellHook` is not run). A
  new tool needs a line, or a script printing the `env` format
- **The project**: the nearest directory, from the file (a language server: from its root by `rootMarkers`) or the terminal's path up to
  the FS root, holding a marker; there the first entry in order whose marker is present. The command runs in that directory with the
  relay's own environment
- **Asked once, kept**: a project's command runs the first time something there needs it, and its answer is kept until `env reload`
  (all, or one project's) — the disk is not watched, as with `check update` ([D-logbook](lib-code-file-changes.js.md#d-logbook)). A
  failure (an exit code, no answer within `timeoutMs`, output that is not the format) is kept too: the command is slow, and it is said
- **Language servers: always.** The editor's head says "asking for the project environment" the first time, and a failure ("the
  relay's own is used"); the server's command is looked up on the project's PATH. A server already running keeps the environment it
  started with (`lsp restart` after `env reload`). Xipe Totec's scanner on `/lsp` is not told (it waits for `attached` alone); it only
  waits longer the first time
- **Terminals: only when a person asks.** `env xterm [<path>]` adds an xterm that starts in the project's root with its environment;
  the xterm says which in grey and in its head, or that there is no project / it failed and the relay's own is used. A plain xterm is
  as before. `compile.run` uses the shell of the xterm it sends to, so it follows that xterm
- **`env show [<path>]`** says which project, by which marker and command, and what the environment changes (the directories put before
  the relay's PATH, the variables set and unset); asked now if it was not kept

**Why**: structure.md §2 had "the relay is started from inside the project's dev shell" as the premise of LSP and the PTY. Since Poca's
box starts tezcatl in tezcatl's own dev shell, every project's language servers and builds were looked up on tezcatl's PATH plus
whatever the launcher had (the claude panel failed for want of `~/.local/bin`), and a version without Nix would have had nowhere to put
the language servers. A declared command keeps tezcatl ignorant of Nix — like [D-start-outside](nix-t.md#d-start-outside), the way a
project builds its environment stays in the project — and reading only structured output keeps to "tezcatl never parses human-readable
text". Terminals are left to the person: an existing shell, or a `nix develop` typed by hand, stays as it was.

**Alternatives**: putting `nix develop <root> --command` before each `lsp.json` command — seconds at every start, Nix only, and no help for
terminals; one dev shell holding every language server (the state before) — a project's own tools and versions are not used; applying
the environment to every xterm — it changes what a terminal is without being asked (crux: by hand, with a command to make it easy);
watching flakes and `.envrc` for changes — the disk is not polled anywhere else; running a shell to print `env` — the output is text, and
login shells add their own profile.

**Left for later**: the language servers in tezcatl's dev shell (`nix/dev-tools.nix`) stay as the relay's own for now — a project's PATH
comes first, so a project's own server wins; moving them into the projects' flakes is the next step, and a version without Nix needs no
change here. Telling Xipe Totec's scanner about the environment; an xterm of `env xterm` reloaded or restored from a saved skin starts as
a plain one (`envpath` is not kept with the skin).

**Files**: `lib/relay/project_env.exs`, `lib/relay/project_env_config.exs`, `lib/relay/env_handler.exs`, `project_env.json`,
`lib/relay/lsp_socket.exs` (the `env` frames, waiting before attaching), `lib/relay/lsp_config.exs` and `lib/relay/pty_validate.exs` (a
command on a given PATH), `lib/relay/lsp_registry.exs` and `lib/relay/lsp_server.exs` (the environment into the server),
`lib/relay/pty_socket.exs` (a start with `env: {path}`), `main.exs`, `lib/skin/env-commands.js` (the `env` lines),
`lib/skin/frame-code.js` and `lib/skin/frame-lines.js` (wiring), `panels/resident/xterm.html` (`?envpath=`),
`lib/code/code-editor/lsp-attach.js` (the editor's head); tests `test/relay/project_env_test.exs`, `test/env-commands.test.js`,
`test/e2e/project_env.mjs`.

## Selection and revision notes

- `ProjectEnv.request/4` answers at once when kept, else `:pending` and a message later — `LspSocket` and `PtySocket` send their
  "asking" frame and wait without blocking; `ProjectEnv.await/3` waits (the HTTP handler)
- The command runs under erlexec in its own process group, killed on timeout; its output is capped at 16 MB; the last line of its stderr
  goes into the failure
- erlexec's `{:env, ...}` adds to the relay's environment: a set variable is `{name, value}`, an unset one `{name, false}`; `TERM` is put
  last (the PTY's `xterm-256color`, the language server's `dumb`)
- OTP's `:json` decodes `null` as `:null` (not `nil`)
- A login shell (`bash -l`, the default of `pty.shell`) reads its profile after the environment is set: a variable the profile sets (on
  this machine `LANG`) comes back even when the project unsets it

*Not yet verified cold (written with the code, 2026-10-19).*
