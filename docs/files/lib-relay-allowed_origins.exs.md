# `lib/relay/allowed_origins.exs`

The relay's allow list of Origins, shared by every handler.

**Decisions homed here**: [D-loopback](#d-loopback)

<a id="d-loopback"></a>

## D-loopback — every port on 127.0.0.1; no authentication, only Origin and Host checked

> **Changed 2026-10-19** by [D-poca-secret](lib-relay-secret_gate.exs.md#d-poca-secret): the relay now serves only what Poca opened
> (its secret on HTTP, a ticket on a browser's WebSocket), and without a secret starts only when told to (`--no-auth`). What follows
> still holds under it, and alone when running with `--no-auth`.

**Decided**: `:4000` vent, `:4001` pages and `:4100` relay all bind `127.0.0.1`. No authentication, separation of privileges, roles or
audit. On top, the `Origin` header of WS handshakes and `GET /windows` is checked against an allow list: outside it, no upgrade (403),
and `/windows` gets no CORS headers. Default list `http://{127.0.0.1,localhost}:{4001,4100}`, replaced with `TEZCATL_ALLOWED_ORIGINS`.

**Alternatives**: token authentication, roles, a permission model (which page may ask for which command).

**Why not**: with loopback as the premise, "does this need authentication" disappears **structurally**. Being able to connect to
vent-in is nearly the same as doing anything in Emacs, so a half permission model means nothing.

**What it removed**: the whole design of authentication, permissions, roles and audit logs.

**But the adversary changes**: not "people on the same LAN" but "an unrelated tab open in the user's own browser". A WebSocket
handshake is outside the same-origin policy with no CORS preflight, so binding to loopback alone lets any page's JS connect to
`ws://127.0.0.1:4100/pty` and start a shell (or any elisp through `M-:` on `/`). Hence the `Origin` check. It is **not
authentication**: it asks nothing about who; it reads a value the browser sets and pages cannot forge.

- **A connection without `Origin` is allowed**: browsers always send it on a WS handshake, so none means a local non-browser program
  (a Node test client, `curl`) — which can talk to `127.0.0.1` directly anyway
- **`Host` is checked too**: the `Origin` check does not stop DNS rebinding (a page renaming itself to 127.0.0.1 becomes same-origin,
  and same-origin GETs carry no `Origin`: `GET /fs`, `/fs/read` — every file under `TEZCATL_FS_ROOT` — `/windows`, `/lsp/servers`
  would be readable). The browser then writes the attacker's name in `Host`, which pages cannot change. A cowboy middleware
  (`AllowedHosts`) before the router checks the host name of every request against `127.0.0.1`, `localhost`, `[::1]` and answers 403
  otherwise. Only the host name, never the port (moving the port or forwarding needs no setting); requests without `Host` pass
  (HTTP/1.0 local programs); `TEZCATL_ALLOWED_HOSTS` **adds** names (for `/etc/hosts` aliases). Not by IP (a rebound browser also
  comes from 127.0.0.1); not a secret token (that is authentication); not a required custom header (after rebinding, same-origin can
  set any header)
- **emacs-vent's `:4000` refuses browsers**: while the relay does not hold the one slot (Emacs up before the relay, a relay restart),
  a page's JS could take `ws://127.0.0.1:4000` and inject keys. emacs-vent's `on-open` closes a connection that has `Origin` (a
  browser) without giving it the slot; the relay (gun) and websocat send none
- **Left**: the page server `:4001` (`python3 -m http.server`) has no `Host` check; files not committed in the repository directory
  (`dict.json`, `local.env`, `Old/`) are readable the same way

**From afar**: SSH port forwarding to **the same port numbers** keeps the origin, so the default list passes.

**Files**: `lib/relay/allowed_origins.exs`, `lib/relay/allowed_hosts.exs`, `lib/relay/browser_socket.exs`,
`lib/relay/pty_socket.exs`, `lib/relay/windows_handler.exs`, `main.exs`, `emacs-vent-out.el` (`:4000`), `lib/core/ws.js`.

## Notes from verification

**Spec** — one allow list for every handler (lists per handler drift apart). `check/1` has three answers — `:undefined` (no header) → `:ok`,
in the list → `:ok`, otherwise `{:error, origin}` — so a caller writes the 403 and the log with one `case`.

**Does not** — decide who connects (not authentication: it reads a value the browser sets).

**Pitfalls** — `list/0` falls back to the default list when `TEZCATL_ALLOWED_ORIGINS` is unset, empty or only commas (`parse/1` gives
`[]`). `acao/1` requires `check(origin) == :ok` **and** a binary origin, so a connection without the header is allowed but gets no CORS
header — the intended asymmetry. The default list is `http://{127.0.0.1,localhost}:{4001,4100}`.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/relay/allowed_origins.exs`, 2026-09-10.)

Shared Origin allow-list for the relay's cowboy handlers -- BrowserSocket
  (`/`), PtySocket (`/pty`) and WindowsHandler (`GET /windows`). Resolved in
  one place so the three handlers cannot drift.

  ## Why this exists (overview.md §1)

  Every relay port binds to `127.0.0.1`, but a loopback bind does not keep out
  the user's own browser. A WebSocket handshake is exempt from the same-origin
  policy and triggers no CORS preflight, so any page open in that browser -- an
  unrelated tab on some random site -- can run
  `new WebSocket("ws://127.0.0.1:4100/pty")`. On `/pty` that spawns a shell; on
  `/` it can run arbitrary elisp via `M-:`. The `127.0.0.1` bind only stops
  other machines, not other tabs.

  This is **not** authentication -- overview.md §1's "no auth / no roles / no
  audit" decision stands. We look only at the `Origin` header the *browser
  itself* puts on the handshake (page JS cannot set or forge it) and drop the
  connection when it is not one of ours. We never ask *who* is connecting.

  ## No Origin header -> allowed

  `check/1` returns `:ok` when the client sent no `Origin` at all. A browser
  ALWAYS sends `Origin` on a WebSocket handshake, so "no Origin" means a
  non-browser local program: a Node/CLI WS client, `curl`, the test harness.
  Those are not the threat this guards against -- anyone who can start a local
  process can already talk to `127.0.0.1` directly and do anything this check
  would permit, so blocking them buys no safety and only breaks local tooling
  (`test/` connects a headerless Node WS client; rejecting it would break the
  existing checks).

  ## Default list / override

  Default: the loopback static-page origins on `:4001` (today's Python server)
  and `:4100` (if static files later move into `cowboy_static`), both
  `127.0.0.1` and `localhost` spellings. `TEZCATL_ALLOWED_ORIGINS`
  (comma-separated, exact `scheme://host:port`) replaces the default set when
  present and non-empty.

  ## SSH port-forwarding (overview.md §1)

  The documented way to use Tezcatl from another machine is
  `ssh -L 4001:127.0.0.1:4001 -L 4100:127.0.0.1:4100 ...` -- the *same* port
  numbers on both ends -- so the browser still sees `http://127.0.0.1:4001` and
  the default list covers it. Only a forward to a *different* local port needs
  `TEZCATL_ALLOWED_ORIGINS`. There is no auto-detection of the forwarded port.

  The active allow-list (list of `"scheme://host:port"` binaries).

  `TEZCATL_ALLOWED_ORIGINS` (comma-separated) replaces the default set when it
  is present and has at least one non-blank entry. Blank entries are trimmed
  and dropped.

  Decide a handshake from its `Origin` header value, as cowboy hands it over:
  a binary, or `:undefined` when the client sent none.

    * `:undefined`            -> `:ok`  (headerless non-browser client, see the
                                         moduledoc -- deliberately allowed)
    * a binary in `list/0`    -> `:ok`
    * any other binary        -> `{:error, origin}` -- caller logs it and rejects


  For the plain-HTTP handler (`GET /windows`): the value to echo back in
  `access-control-allow-origin`, or `nil` to omit the header entirely.

  Only a concrete, allow-listed browser Origin is echoed. A headerless request
  (`:undefined`) has nothing to echo and needs no CORS header; a disallowed
  Origin gets no header (the browser then blocks its own cross-origin read).
