# `lib/relay/windows_handler.exs`

`GET /windows` (the ledger) and `DELETE /windows/:id` (evict a window).

**Takes part in**: [D-loopback](lib-relay-allowed_origins.exs.md#d-loopback)

## Notes from verification

**Spec** — JSON is built by hand because the relay has no JSON library (no Plug, no Jason in its dependencies): "not adding one" came first.
`/windows/:id` shares the module (`main.exs` routes both to `WindowsHandler`); `init/2` dispatches on `method` and the `:id` binding to
`handle/4` clauses, replying with `:cowboy_req.reply` directly like the other handlers (no cowboy REST behaviour). **GET and DELETE treat
Origin differently**:

| | GET (read) | DELETE (change) |
|---|---|---|
| allowed Origin | echoes `access-control-allow-origin` | passes |
| other Origin | no header (the browser stops the read itself); **not refused** | **403** (as the sockets) |
| no Origin (`curl`, tests) | passes | passes |
| preflight | — | `OPTIONS` → 204 + `access-control-allow-methods: GET, DELETE, OPTIONS` |

**Does not** — hold what is in the windows; edit the ledger (`DELETE` calls `VentUplink.evict/1`; the socket's `terminate/3` updates);
`/pty` connections (another protocol, outside the ledger, cannot be evicted).

**Pitfalls** — all JSON is string concatenation (`to_json/2`, `jstr/1`, escaping only `\` `"` `\n` `\r` `\t`); `id` and `name` come from the
browser itself (`ws.js`) so it is mostly harmless, but it is no general serialiser. `DELETE /windows` without `:id` is 404
`{"evicted":false}` and an unknown id 404 `{"evicted":false,"id":…}` — the bodies tell "not found" from "forgot the id". The last `handle/4`
clause answers 405 with `allow` for everything else. `cors/2` goes through `AllowedOrigins.acao/1`, so a header-less GET gets no CORS header.
Covered by `test/relay/windows_delete_test.exs` (pure parts in ExUnit, the HTTP side by E2E).

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/relay/windows_handler.exs`, 2026-09-10.)

The relay's own connection registry over HTTP. Two routes, one module
  (`main.exs`): `/windows` and `/windows/:id`.

  ## `GET /windows`

      {"uplink":true,"windows":[{"id":"c-1a2b...","name":"tezcatl-1"}, ...]}

  `uplink` is whether the relay's single WebSocket connection to emacs-vent
  is currently up (VentUplink.alive?/0); `windows` is the browser-connection
  registry (transport metadata). Neither is emacs state and neither is a
  decoded vent frame -- the JSON is hand-built so the relay pulls in no JSON
  library anywhere near the passthrough path.

  `uplink` exists so a caller (the Resolver) can fail
  fast when emacs-vent is unreachable instead of waiting out a timeout on
  every request -- reporting the relay's own connection state is not the
  same as decoding/holding vent protocol state (overview.md §9).

  Was a bare array before this field was added; `windows` is the old body.

  ## `DELETE /windows/:id`

      -> 200 {"evicted":true,"id":"c-1a2b...","name":"tezcatl-1"}
      -> 404 {"evicted":false,"id":"c-nope"}

  Asks the browser connection that announced `?id=<id>` on its WS upgrade
  URL to close (`VentUplink.evict/1` -> the socket replies with a 4000
  "evicted" close and its own `terminate/3` unregisters). Still transport
  metadata only -- the relay force-closes one of its own sockets, it does
  not touch emacs. A connection that never sent `?id=` is not addressable.
  (`panels/resident/xterm.html` is a separate protocol on `/pty`, not in this
  registry -- it is not evictable here.)

  ## CORS / Origin

  The pages are served from :4001 and this handler answers on :4100, so a
  browser request here is cross-origin.

    * `GET` is a read: the request's `Origin` is echoed in
      `access-control-allow-origin` only when it is on the relay allow-list
      (`AllowedOrigins`), otherwise no CORS header and the browser blocks
      its own read. It is never *rejected* -- a permissive read, as before.
    * `DELETE` mutates, so it is *gated*: a disallowed browser `Origin` gets
      a 403 (same stance as BrowserSocket / PtySocket). A headerless
      (non-browser: `curl`, tests) request is allowed -- anyone able to make
      a local request can already talk to `127.0.0.1` directly (see the
      `AllowedOrigins` moduledoc). `DELETE` is not a CORS-"simple" method,
      so a browser preflights with `OPTIONS`; that is answered here too.

  `vary: origin` keeps caches from serving one origin's answer to another.
  None of this is auth (overview.md §1).
GET /windows -- the registry snapshot. Permissive (read): CORS header
only for an allow-listed Origin, never a rejection.
OPTIONS preflight for DELETE /windows/:id from a browser.
DELETE /windows/:id -- gated (mutating). Bad browser Origin -> 403.
Echo an allow-listed browser Origin; omit the header otherwise (headerless
request, or a disallowed Origin the browser will block on its side).
