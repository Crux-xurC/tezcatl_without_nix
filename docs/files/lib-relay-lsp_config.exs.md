# `lib/relay/lsp_config.exs`

Reads `lsp.json` into the relay's table of language servers; resolves commands and finds a project's root.

## Selection and revision notes

(Moved from the comments of `lib/relay/lsp_config.exs`, 2026-09-10.)

`lsp.json` (repo root) -> the relay's LSP server table. Pure except `resolve_command/1` (PATH lookup) and `find_root/3` (walks the real FS).

    { "autostart": bool,
      "servers": { "<languageId>": { "command": [str, ...], "rootMarkers": [str, ...], "initializationOptions": { ... } } } }

- The `languageId` keys equal the ids of `lib/code/code-languages.js` (the editor resolves a file name to the id and sends it with the
  `/lsp` attach). In the registry key `(root, serverId)`, `serverId` is the language key itself — one server per language
- `normalize/1` — an invalid top level is fatal (`{:error, reason}`); an invalid server entry is dropped with a warning in `:problems`.
  `command` must be a non-empty array of strings; `rootMarkers` defaults to `[".git"]`
- `server_for/2` — language id → the server's entry
- `resolve_command/1` — `command` resolved on PATH into a charlist argv for `:exec.run/2` (as `PtyValidate.validate_cmd/1`; missing →
  `{:error}`)
- `find_root/3` — the nearest ancestor directory of a file's absolute path that holds one of `markers`, up to `fs_root`; else `fs_root`.
  `abs_path` is assumed checked by `FsValidate`

Record: the reader of `lsp.json`, supporting one shared server per `(root, serverId)`; every attach passes `normalize` → `server_for` →
`resolve_command` → `find_root` (`lsp_socket.exs`). `initializationOptions` is kept as `init_options` and sent in `initialize` (per-server
settings such as tsserver's path). `test/relay/lsp_config_test.exs` (16 cases; `find_root` digs temporary directories).
