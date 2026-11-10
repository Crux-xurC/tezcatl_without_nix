# `main.exs`

Starts the relay: loads its modules, supervisors and routes.

**Takes part in**: [D-files-in-elixir](lib-relay-fs_handler.exs.md#d-files-in-elixir), [D-id-pool](lib-relay-id_pool.exs.md#d-id-pool), [D-juncture](lib-code-juncture.js.md#d-juncture), [D-loopback](lib-relay-allowed_origins.exs.md#d-loopback), [D-lsp-owner](lib-relay-lsp_owners.exs.md#d-lsp-owner), [D-mirror](lib-relay-mirror.exs.md#d-mirror), [D-poca-secret](lib-relay-secret_gate.exs.md#d-poca-secret), [D-pty-backpressure](lib-relay-pty_flow.exs.md#d-pty-backpressure), [D-work-place](lib-relay-fs_validate.exs.md#d-work-place), [D-xipe-relay](lib-relay-xipe_socket.exs.md#d-xipe-relay)

## Notes from verification

**Spec** — no `mix`: `Code.require_file` loads the relay's `.exs` files in dependency order (the policy "a Nix monorepo needs no mix"; a
`mix.exs` version is planned). `VentUplink` and the other supervised children start **before** `cowboy.start_clear` — when the listener
opened first, a browser connecting right away hit `VentUplink.register` with `:noproc` (a past failure, recorded in the module doc). A taken
port (`{:error, :eaddrinuse}`) ends with a clear message and `System.halt(1)` (a hard match used to hide the cause behind a `MatchError`
pointing at `Code.require_file/2`).

**Does not** — decode vent frames; start erlexec (`ensure_all_started` covers `:gun` and `:cowboy` only): `pty_socket.exs`' `ensure_exec/0`
starts it lazily on the first `/pty` request ("a relay that only relays vent never spawns"), and `lsp_server.exs` starts it in `init/1`, so
a relay used without PTYs and LSP never starts erlexec.

**Pitfalls** — the routes and the order of requires grew with each endpoint (vent, PTY, windows, files, LSP, mirror, Xipe Totec, juncture,
ids …); `allowed_origins.exs` (and `allowed_hosts.exs`, a middleware before the router) must come before the handlers. `/windows` and
`/windows/:id` are one module (`WindowsHandler`), the `/fs*` routes one (`FsHandler`), `/lsp/servers[/:key]` one (`LspHandler`; `/lsp` itself
is the socket `LspSocket`).

Since 2026-10-19 (D-poca-secret) the middlewares are `AllowedHosts`, `SecretGate`, the router, the handlers; `Tickets` is a supervised
child; `/ticket` is a route; and the relay ends at once (`System.halt(1)`, with the reason) when it has neither `POCA_SECRET` nor
`TEZCATL_AUTH=off`. It says on start whether authentication is on.

*Verified 2026-09-08; routes added since only listed.*

## Selection and revision notes

(Moved from the comments of `main.exs`, 2026-09-10.)

main.exs -- Tezcatl vent relay boot.

No mix.exs: .exs files loaded with
Code.require_file/1 in dependency order, deps resolved by nix (ERL_LIBS
via the editor-style flake devShell). Boots:

VentUplink  -- one gun WebSocket client occupying emacs-vent's single
client slot (127.0.0.1:4000), with reconnect.
Tezcatl.LspSup + LspRegistry -- DynamicSupervisor for the per-{root,serverId}
language-server processes, and the registry that shares them (webLSP).
cowboy      -- WebSocket server for browser tabs on :4100
"/"                  -> BrowserSocket   (vent passthrough)
"/pty"               -> PtySocket       (Phase 8 PTY via erlexec)
"/windows"           -> WindowsHandler  (GET: connection registry, JSON)
"/windows/:id"       -> WindowsHandler  (DELETE: evict that connection)
"/fs"                -> FsHandler       (GET: directory listing -- endpoint ③)
"/fs/read"           -> FsHandler       (GET: file bytes)
"/fs/write"          -> FsHandler       (PUT/POST: write file -- Origin-gated)
"/lsp"               -> LspSocket       (WS: one browser consumer -- webLSP)
"/lsp/servers"       -> LspHandler      (GET: running language servers)
"/lsp/servers/:key"  -> LspHandler      (DELETE: stop one)

erlexec is NOT started here: PtySocket starts the :exec app (and its C port
program) lazily on the first /pty request, and LspServer.init does its own
ensure_all_started(:erlexec); a relay that only proxies vent traffic never
spawns it.

All handlers check the handshake `Origin` against AllowedOrigins
(lib/relay/allowed_origins.exs) before doing anything: every port is
127.0.0.1-bound, but that does not stop an unrelated tab in the user's
browser from opening ws://127.0.0.1:4100/pty. Not auth (overview.md §1) --
just the browser-set Origin header. TEZCATL_ALLOWED_ORIGINS overrides.

Boot order: the supervisor (VentUplink) starts BEFORE the listener opens,
so a browser that connects the instant the port is up finds VentUplink
already registered (previously cowboy came first and an early connect hit
VentUplink.register with :noproc).

The relay is stateless with respect to the vent protocol (overview.md
§2.1 / §2.2): frames are relayed byte-for-byte and never decoded. The
only state kept is the set of connected browser sockets plus the
{id, name} each announced on its WS upgrade URL -- never anything read
from a vent frame. GET /windows reports that registry so w_list.html can
list open windows; DELETE /windows/:id force-closes one of those sockets
(a 4000 "evicted" close). The PTY path (/pty) is separate: not vent, not
in that registry, not evictable here (overview.md §4.3, panels/resident/xterm.html).

Ports (all 127.0.0.1): emacs-vent 4000, static pages 4001, this relay 4100.
Overridable: TEZCATL_RELAY_PORT, TEZCATL_VENT_HOST, TEZCATL_VENT_PORT.
A relay already holds this port (e.g. `t` run twice, or a leftover from
a prior session). Without this clause the hard `{:ok, _} =` match raised
a MatchError whose stacktrace pointed at Code.require_file/2, hiding the
real cause. TEZCATL_RELAY_PORT overrides the port.
