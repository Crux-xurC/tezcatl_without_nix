# `lib/relay/xipe_socket.exs`

One WebSocket per browser consumer, stateless broadcast relay to a single shared XipeConn per {root_key, root}.

**Decisions homed here**: [D-xipe-relay](#d-xipe-relay)

<a id="d-xipe-relay"></a>

## D-xipe-relay — `/xipe` is a stateless broadcasting relay that can both start and connect

**Decided**: the path to Xipe Totec (a separate process keeping calculation rows) is the relay's `/xipe`. The relay holds one connection
to Xipe Totec's own WebSocket (JSON-RPC, localhost) and multiplexes the browser's consumers (`matrix.html`, the dialogue window).

- **Stateless**: no id rewriting, no pending map, no cached initialisation, no refcount (unlike `LspServer`). Frames up go to every
  consumer as they are; frames down are forwarded. Each consumer picks the answers to ids it chose (Xipe Totec's own rule: notifications
  reach every client, each chooses). Echoing one's own sends in the dialogue window is the browser's job, not the relay's
- **Start or connect**: each entry of `xipe.json` is `mode: "spawn"` (the relay starts `xipe start`, then connects) or
  `mode: "connect"` (to one already running). Connecting is `:gun` with reconnects, as `VentUplink`; starting is erlexec, as
  `LspServer`. One entry = one connection shared by all consumers (`XipeRegistry`)
- **By default, connect to one started elsewhere** (as emacs-vent): `t` starts Xipe Totec on :4200 in the background (passing `--lsp`
  and `--fs-root`) and `xipe.json`'s `"."` is `connect` — `spawn` stopped 45 s after the last window and paid start-up and a scan each
  time. `spawn` stays for the E2E (an isolated copy started by the relay)
- **Xipe Totec chooses the target project**: `xipe.json`'s key (default `"."`) names an entry, not a path. The relay passes only
  `--port`, its own `/lsp` URL (`--lsp`, so Xipe Totec's scans share Tezcatl's language servers) and the file root (`--fs-root`). The
  browser learns the target from the answer to `initialize`
- Origins are checked as on the other entries (`AllowedOrigins`)

**Alternatives**: a "clever" `LspServer`-like multiplexer (rewriting ids, owning the initialisation); the relay deciding the target path;
only start, or only connect.

**Why not**: Xipe Totec sends state changes to all clients as `notify/*`, so the relay has nothing to route. Deciding the target on
Tezcatl's side makes two decision points for "which project is shown" (Xipe Totec is also used alone). Being independent, it is
sometimes started by the relay and sometimes by the user first.

**What it removed**: id management in the relay; Tezcatl and Xipe Totec disagreeing on the target. **Re-initialising on reconnect**
came back with `connect` as default (a restarted Xipe Totec got an upstream that was never `initialize`d, so every line answered
`not_initialized`) and is solved statelessly: when the upstream reconnects (`XipeConn`'s `gun_upgrade`), the relay sends
`{"kind":"attached"}` again to the consumers connected before (`{:xipe_reattached, name}` → `XipeSocket`); each sends `initialize` again
(`lib/xipe/xipe-session.js`: sends wait for it, requests with no answer are dropped and the record shows `# reattached`). The relay
remembers who is connected, never what initialisation said. The one-shot `lib/xipe/xipe-client.js` restarts from `initialize` too.

**Files**: `lib/relay/xipe_config.exs`, `lib/relay/xipe_conn.exs`, `lib/relay/xipe_registry.exs`, `lib/relay/xipe_socket.exs`,
`xipe.json`, `main.exs`, `lib/xipe/xipe-client.js`, `lib/xipe/xipe-session.js`.
