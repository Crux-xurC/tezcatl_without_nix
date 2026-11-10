# `lsp.json`

Language → the language server's command, root marks and options.

## Selection and revision notes

The language server table. Shape:

    { "autostart": bool,
      "servers": {
        "<langId>": {
          "command": [str, ...],              // required; argv, resolved on PATH
          "rootMarkers": [str, ...],          // default [".git"]
          "initializationOptions": { ... },   // optional; sent in initialize
          "editor": { "command": [...], ... } // optional; another server used for the editor only
        }
      } }

- `langId` is an id of `lib/code/code-languages.js` (what the editor resolved the file name to). In the registry key `(root, serverId)`,
  `serverId` is the language key — one server per language
- `lib/relay/lsp_socket.exs` reads it on every `/lsp` attach and runs `LspConfig.normalize`: broken entries are dropped (`:problems`), a
  broken top level is fatal

Record:

- A file apart from `config.json`: LSP belongs to the id space of `code-languages.js`, and operators swap server binaries per language
- `initializationOptions` for per-server settings (tsserver's path …)
- Not excluded from publishing (harmless, unlike fonts; users rewrite binary names for their environment)
- **Fifteen languages by default** for practical checks — `javascript`, `json`, `css`, `html`, `yaml`, `markdown`, `python` (pyright),
  `rust` (rust-analyzer), `shell`, `lua`, `sql`, `dockerfile`, `elixir` (elixir-ls), `nix` (nil), `ocaml` (ocamllsp). Binaries are the
  user's, on PATH: `normalize` does not look at PATH (`resolve_command` resolves on each attach — on the project's PATH first,
  [D-project-env](lib-relay-project_env.exs.md#d-project-env)), and a language not installed gives that editor alone `{kind:"error"}`
- **`editor`; shell and Elixir (for the editor) through efm**: `/lsp` has two users — the editor and Xipe Totec's scanner
  (`Scanner.Lsp.Elixir`, relying on elixir-ls' `documentSymbol` and `outgoingCalls`). elixir-ls returns no diagnostics without `mix.exs`,
  so only the editor uses `tezcatl-elixir-lsp` (elixir-ls with `mix.exs`, else efm with `Code.string_to_quoted`) — replacing the main one
  would leave the scanner reading no definitions and every card a tombstone (determination by crux: "the editor only"). The editor attaches
  with `"client":"editor"` and `LspConfig.server_for/3` picks `editor`; its id is `elixir:editor` (another process in the registry);
  `rootMarkers` default to the main entry's. `shell` became `tezcatl-shell-lsp` (efm + shellcheck; bash-language-server was not installed)
