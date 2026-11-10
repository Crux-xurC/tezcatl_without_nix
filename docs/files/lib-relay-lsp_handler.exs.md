# `lib/relay/lsp_handler.exs`

`GET /lsp/servers` (the running language servers) and `DELETE /lsp/servers/:key` (stop one).

## Selection and revision notes

(Moved from the comments of `lib/relay/lsp_handler.exs`, 2026-09-10.)

    GET    /lsp/servers        -- list the running language servers (permissive CORS, like GET /windows)
    DELETE /lsp/servers/:key   -- stop one (Origin-gated, like DELETE /windows/:id)
    OPTIONS                    -- preflight (`GET, DELETE, OPTIONS`)

- `GET` returns `LspRegistry.list()` as `{"servers":[...]}`, permissive CORS through `acao/1`
- `DELETE` changes things, so it passes `AllowedOrigins.check` (403 otherwise); `LspRegistry.stop(key)` → `:ok` = 200 / `:not_found` = 404
- The same shape as `windows_handler.exs` (one module branching on method and the `:key` binding, taking both routes)

Record: the source of the `lsp` list panel (`list_kinds/lsp.json`, the `lsp` kind) and of `lsp list` / `lsp stop`. Servers start when an
editor attaches to `/lsp`; this handler only observes (`GET`) and stops (`DELETE`). Checked by a relay smoke run (`{"servers":[]}`, 404,
403, the preflight).
