# `lib/relay/browser_socket.exs`

The vent WebSocket of a browser: passes frames between it and emacs-vent unread.

**Decisions homed here**: [D-stateless-relay](#d-stateless-relay)

**Takes part in**: [D-loopback](lib-relay-allowed_origins.exs.md#d-loopback)

<a id="d-stateless-relay"></a>

## D-stateless-relay — the relay keeps no state about the vent protocol

**Decided**: Elixir does not decode vent frames, does not look at `kind`, does not keep or mirror the context: a pass-through. The
only state it may keep is the set of connection pids and the `{id, name}` each connection gave in the WS upgrade's query
(`?name=&id=`).

**Alternatives**: the relay keeps the latest context and hands it to tabs that connect later.

**Why not**: **the context's owner is Emacs.** A copy in the relay goes stale on every disconnect, reconnect and Emacs restart; what
must be avoided is *shared mutable state*. Instead a tab that connects later **fetches it itself**: it sends
`emacs-vent-send-context` as an `M-:`. A one-way initialisation with the existing kinds (`input` / `context`), nothing new.

**What it removed**: cache invalidation, consistency on reconnect, "which is right when the relay's value and Emacs' differ".

**As it stands**: emacs-vent → browsers: broadcast to every tab, unfiltered; browsers → emacs-vent: forwarded in arrival order, not
merged. Input from several tabs may interleave into one key sequence (see `D-single-client`); avoided by not typing in several tabs
at once.

**"Wasn't automatic `M-:` removed?"**: what was removed was Emacs following its own state automatically (always, `major-mode`, evil
state). What remains is a client fetching its initial value once per connection — no new kind, no new state.

| | removed | present |
|---|---|---|
| started by | Emacs itself | the browser connecting |
| how often | always | once per connection |
| for | following Emacs' state | initialising a late tab |
| fetches | `major-mode`, evil state … | the existing `context` |

**Files**: `lib/relay/vent_uplink.exs`, `lib/relay/browser_socket.exs`, `lib/vent/vent-init.js`.

## Notes from verification

**Spec** — five functions are the whole handler — `init/2` (the Origin check, the query), `websocket_init/1` (register),
`websocket_handle/2` (pass on), `websocket_info/2` (forward), `terminate/3` (unregister) — `D-stateless-relay` itself: no judgement here.
`websocket_info(:evict, state)` (from `VentUplink.evict/1`) answers `{:close, 4000, "evicted"}`; code **4000** lets the page tell a
deliberate eviction from a relay restart or a network drop and close itself instead of reconnecting. After the close cowboy runs
`terminate/3`, so `unregister` stays the one path for the ledger.

**Does not** — read frames: `websocket_handle({:text, frame}, state)` passes `frame` to `VentUplink.to_emacs(frame)` unread.

**Pitfalls** — `idle_timeout: :infinity` (the reason is in the code): an output tab sends nothing towards the relay, and cowboy's default 60 s
idle cut (which counts only client → server traffic) closed it every minute, making a loop of reconnects and context requests. `qval/2`
treats `""` as `nil`, so an empty `?name=` is the same as none.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/relay/browser_socket.exs`, 2026-09-10.)

cowboy_websocket handler: one browser tab <-> the relay.

  Passthrough only. The tab's `{id, name}` is read from the WS upgrade
  query string (`?id=&name=`) in `init/2`, never from a frame. Text frames
  from the tab go straight to `VentUplink.to_emacs/1` undecoded; frames
  from emacs-vent arrive as `{:vent, frame}` and are pushed to the tab
  as-is.

  The handshake's `Origin` header is checked in `init/2` (see `AllowedOrigins`)
  -- a disallowed browser Origin gets a 403 and no upgrade. This is not auth
  (overview.md §1 keeps "no auth"); it stops an unrelated tab in the user's
  browser from scripting `new WebSocket(".../")` and running elisp via `M-:`.
  A headerless (non-browser) client is allowed.
Origin gate first (AllowedOrigins). A browser always sends `Origin` on a
WS handshake and cannot forge it; a disallowed value never upgrades.
idle_timeout: :infinity -- a vent tab can sit silent for long stretches
(output.html never sends anything at all) while emacs-vent stays
connected. cowboy's default 60s idle timeout counts only client->server
traffic, so without this it would close such a tab every 60s and drive a
reconnect + context-refetch loop. PtySocket sets the same.
DELETE /windows/:id -> VentUplink.evict/1 -> this. Close with a 4000
("evicted") code so the page can tell a deliberate eviction from a relay
restart / network drop and act on it (self-close) rather than reconnect.
cowboy then runs terminate/3, which unregisters -- the registry stays
single-sourced.
