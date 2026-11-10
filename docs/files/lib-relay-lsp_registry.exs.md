# `lib/relay/lsp_registry.exs`

Keeps one LspServer per {root, serverId}.

## Selection and revision notes

(Moved from the comments of `lib/relay/lsp_registry.exs`, 2026-09-10.)

Keeps one `LspServer` per `{root, serverId}`. Serialises start-up so two near-simultaneous `/lsp` attaches for the same key share a server
(through `GenServer.call({:ensure, ...})`). Children run under the `DynamicSupervisor` named `Tezcatl.LspSup` (started by `main.exs`
alongside this process).

- `attach_or_start/3` — when the key is unknown or its pid is dead, `DynamicSupervisor.start_child` and `Process.monitor`; else the existing
  pid. `spec` = `%{argv, root, server_id, init_options}`
- `list/0` — each `LspServer.info/1` with a url-safe `key` (`Base.url_encode64(root <> "\n" <> serverId, padding: false)`); a failing
  `info/1` becomes `status: :unknown`
- `stop/1` — decode the key → `LspServer.stop` → off the ledger; `:not_found` is a 404
- `{:DOWN, ...}` — a dead server is cleaned off the ledger through its monitor

Record: the serialisation point that lets simultaneous attaches to one `(root, serverId)` share a server. `LspSup` (children
`restart: :temporary`) and `LspRegistry` start in `main.exs`' children beside `VentUplink`. `list/0`'s `key` is what `GET /lsp/servers` and
`DELETE /lsp/servers/:key` use. No dedicated unit test (the `encode_key` / `decode_key` round trip is a candidate).
