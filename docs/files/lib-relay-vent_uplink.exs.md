# `lib/relay/vent_uplink.exs`

The one connection to emacs-vent and the ledger of browsers.

**Decisions homed here**: [D-single-client](#d-single-client)

**Takes part in**: [D-stateless-relay](lib-relay-browser_socket.exs.md#d-stateless-relay)

<a id="d-single-client"></a>

## D-single-client — emacs-vent stays single-client; the relay multiplexes

**Decided**: emacs-vent's WebSocket server keeps one client (a second is closed at once). The Elixir relay holds that one and takes
in any number of browser tabs and windows. emacs-vent is never exposed beyond `127.0.0.1`.

**Alternatives**: make emacs-vent multi-client.

**Why not**: multiplexing is the browser's concern, not Emacs'. The adapter stays thin; connection handling lives in one place in
Elixir, and Emacs Lisp never handles concurrent connections.

**What it removed**: connection handling, disconnect detection and per-client state in Emacs Lisp.

**Left open**: there is no id pairing an `M-:` request with its result. The old reason ("one client operated by a person: no harm")
was about emacs-vent's socket and **lapsed the moment the relay came in**. The resolver's `M-:` carries its own `tez:<corr>` id, so
for evals through the resolver it is solved; raw `M-:` (Form/Text mode, `vent-init.js`'s own) still has none.
Another consequence, accepted: **input from several tabs can form one key sequence in Emacs** (one tab's `C-x`, another's `C-f`).
With pure broadcast this is accepted — the relay choosing input would break `D-stateless-relay`. It shows only when a prefix is held
while another tab is used.

**Files**: `emacs-vent-out.el` (emacs-vent), `lib/relay/vent_uplink.exs`.

## Notes from verification

**Spec** — one `GenServer` holds both the single gun connection to emacs-vent and the ledger of browsers: fan-out (emacs-vent → every
browser) is one operation — read the ledger, hand out one frame from gun — and splitting them would need syncing the two. `evict/1`
(`DELETE /windows/:id`) finds the pid that gave `?id=` and sends `:evict`; it **never edits `clients`** (the socket's `terminate/3`
unregisters — one source for the ledger).

**Does not** — decode frames, read `kind`, keep a mirror of the context. `clients` holds `%{id, name, mon}` only; `evict/1` looks only at
the transport id.

**Pitfalls** — reconnecting is a fixed `@reconnect_ms = 2_000` (no back-off): a failing `gun.open` and a drop after connecting
(`gun_down`, close, `gun_error`, `{:DOWN, …}`) both end in the same `:reconnect` after 2 s. `to_emacs` without an uplink drops silently —
nothing is queued, a tab resends after reloading; **lost input is never retried**. `register` / `unregister` are casts, but registration
happens once at `websocket_init` and sends only after, so no harm. `alive?/0` returns `state.up` (true on `gun_upgrade`, false again on any
drop) — it follows the real state each time. `evict/1`'s guard (`is_binary(id) and id != ""`) returns `:not_found` without calling the
GenServer, so a connection that gave no `?id=` cannot be evicted by id. `handle_call({:evict, id}, …)` returns `{:ok, name}` right after
`send(pid, :evict)`; the close and the ledger update are asynchronous.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/relay/vent_uplink.exs`, 2026-09-10.)

One WebSocket client to emacs-vent (its single allowed client slot), plus
  the browser-connection registry used for fan-out and GET /windows.

  Pure passthrough (overview.md §2.1 / §2.2):

    * text frames from emacs-vent are sent verbatim to every registered
      browser pid -- no selection, no decoding;
    * text frames from browsers are written verbatim to emacs-vent in
      arrival order -- no aggregation, no decoding.

  Nothing is JSON-parsed. The registry holds only `%{id, name}` that each
  browser passed on its WS upgrade query string (`?id=&name=`), never
  anything derived from a vent frame. This is consistent with "each tab
  announces itself": the relay records what it was told, it does not mirror
  or derive emacs state.

  `GET /windows` reports that registry; `DELETE /windows/:id` (`evict/1`)
  asks the connection that announced `:id` to close. Both act on transport
  metadata only. A connection that never sent `?id=` is `nil` in the
  registry and is not addressable by `DELETE`.

  fan-out policy (plan): emacs-vent -> browser is an unfiltered broadcast;
  browser -> emacs-vent is arrival-order forwarding. No request/response id
  for `M-:` results -- every tab sees every result (accepted for now).
--- API ---
Register a browser socket. `id` / `name` come from its WS upgrade query.
Current browser connections as a list of `%{id: , name: }`.

  Evict the browser connection whose `?id=` was `id` (DELETE /windows/:id).

  Finds the socket pid that announced this `id` on its WS upgrade URL and
  sends it `:evict`; the socket closes itself (BrowserSocket replies with a
  4000 close) and its own `terminate/3` runs the `unregister` -- the registry
  stays single-sourced, this call never edits `clients` directly.

    * `{:ok, name}`  -- a match was found and told to close
    * `:not_found`   -- no live connection announced that id (also for an
                        `id` that is not a non-empty binary, so a connection
                        that never sent `?id=` -- `id` is `nil` in the
                        registry -- can never be evicted by id)

  Is the relay's single WebSocket connection to emacs-vent currently up
  (gun_upgrade completed, no gun_down/close/error since)? Reported by
  GET /windows so a browser (the Resolver) can fail fast instead of waiting
  out a timeout when emacs-vent is unreachable. This is the relay's own
  connection state, not a decoded vent frame -- reporting it does not
  violate the "never decode/hold vent state" passthrough principle (§9).
Forward one raw text frame from a browser to emacs-vent (dropped if no uplink).
--- GenServer ---
gun connection process died.
a registered browser socket died without a clean terminate/3.
No uplink yet: drop (nothing is queued; the tab retries after reload).
