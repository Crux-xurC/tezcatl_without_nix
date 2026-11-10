# `lib/relay/lsp_socket.exs`

One WebSocket per browser consumer (the code editor holds it; purpose panels proxy through the editor over panel-bus).

**Takes part in**: [D-lsp-owner](lib-relay-lsp_owners.exs.md#d-lsp-owner), [D-references](lib-skin-recv-refs.js.md#d-references)

## Selection and revision notes

(Moved from the comments of `lib/relay/lsp_socket.exs`, 2026-09-10, with later changes.)

`/lsp` -- one WebSocket per browser consumer (the code editor holds it; panels with other purposes go through the editor on the bus).

- The handshake passes `AllowedOrigins.check` (as `pty_socket`); otherwise 403
- The first frame from the client: `{"kind":"attach","path":"<repo-relative>","lang":"<id>","client":"editor"|…}`. From
  `TEZCATL_FS_ROOT` (or the cwd) the relay goes `read_lsp_json` → `LspConfig.normalize` → `server_for` → `FsValidate.resolve` (escapes
  refused) → `LspConfig.resolve_command` → `LspConfig.find_root` → `LspRegistry.attach_or_start` → `LspServer.attach` (`attach_server/3`:
  if the server it got stopped before the attach — its grace ran out, `DELETE /lsp/servers`, an exit — it drops the monitor and asks the
  registry again; stopped both times → `{"kind":"error"}`. Before, a failed `{:ok, meta} =` match crashed this process and the browser got
  nothing — `test/relay/lsp_socket_test.exs`), and answers `{"kind":"attached","rootUri":…,"serverId":…,"uri":…,"key":…}` (`uri` so the
  editor never builds `file://` itself, encoded with `LspServer.file_uri`; `key` for `lsp restart`)
- After that, text frames are raw JSON-RPC passed to `LspServer.from_consumer`. `{:lsp_out, text}` → the consumer; `{:lsp_exit, code}` →
  `{"kind":"exit","code":n}` and a 1000 close; the server pid's `{:DOWN}` likewise; `held` / `released` from the owner rules
- `terminate/3` calls `LspServer.detach`
- Every failure is `{"kind":"error","reason":...}` and a close

Record: one consumer = one WS. Checked: four error paths (an unconfigured language, a path escape, a missing binary, a first frame that is
not attach) with Node's built-in WebSocket; the happy path is in the server's real E2E. The editor matches diagnostics whose URIs a server
wrote another way by decoding them (`sameFileUri` of `lib/code/code-files.js`).
