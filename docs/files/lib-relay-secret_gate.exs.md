# `lib/relay/secret_gate.exs`

Poca's secret, checked for every route of the relay: a cowboy middleware after `AllowedHosts` and before the router. HTTP needs the header
`X-Poca-Secret`; a browser's WebSocket needs a one-shot ticket from `GET /ticket`.

**Decisions homed here**: [D-poca-secret](#d-poca-secret)

<a id="d-poca-secret"></a>

## D-poca-secret — the relay serves only what Poca opened; WebSockets by ticket

**Decided** (2026-10-19): Poca makes a secret each time it starts and starts tezcatl's row of its box (`"auth": true`) with it in
`POCA_SECRET`. On the pages' HTTP requests to the relay (the same row: `:4001` and `:4100`) Poca adds the header `X-Poca-Secret`; it
adds it to nothing else (another port's page, another row, a redirect out of the row). The relay then decides each request:

| Request | Without the header / ticket | |
|---|---|---|
| `OPTIONS` (a CORS preflight) | answered by the gate | Poca adds the header **before** Chromium's CORS check, so every fetch from `:4001` to `:4100` is preflighted for `X-Poca-Secret`; the handlers' own `OPTIONS` allowed `content-type` only. An allowed `Origin` gets the method and headers it asks for (cached 10 min); any other, none |
| a WebSocket **without `Origin`** | through | not a browser — Xipe Totec on `/lsp`. A browser always sends `Origin` on a WebSocket and a page cannot drop it |
| a WebSocket **with `Origin`** | 403 | a ticket (`?ticket=`) or the header; a ticket is good for one handshake within 10 s |
| any other HTTP | 401 | whatever the `Origin`: a same-origin `GET` or a navigation has none |

- **Tickets**: a browser's WebSocket cannot carry the header (Poca's request handler never sees WebSockets), so the page first fetches
  `GET /ticket` — a plain HTTP request, which gets the header — and opens with the ticket in its URL. One handshake, 10 seconds, in memory
  (`Tickets`, an ETS table); the secret itself never goes into a URL. Every (re)connect takes a new one (`lib/core/ticket.js`, used by
  the four sockets: `lib/core/ws.js`, `panels/resident/xterm.html`, `lib/xipe/xipe-client.js`, `lib/code/code-editor/lsp-attach.js`)
- **Without a secret the relay does not start**, unless `TEZCATL_AUTH=off` says to run without authentication (`t --no-auth`,
  `relay --no-auth`, the E2E stack). Then everything goes through, as under [D-loopback](lib-relay-allowed_origins.exs.md#d-loopback)
  alone, and the relay says so when it starts. A secret wins over `off`
- **Refusals** are plain text (401 / 403 / no secret); an allowed origin gets `Access-Control-Allow-Origin` on them, so a page can tell
  "not opened from Poca" from "the relay is down". The log names the path and status, never the query (no ticket in the log)
- Comparing uses `:crypto.hash_equals` (no timing); a relay without a secret answers `/ticket` with `{"ticket": null}` and the pages open
  as before
- The handlers are unchanged; `Origin` (`AllowedOrigins`) and `Host` (`AllowedHosts`) are still checked as before

**Why**: under D-loopback alone, any page in any browser on the machine — another localhost app, a tab in Brave — could use the relay:
read and write every file under `TEZCATL_FS_ROOT` with `/fs`, start a shell on `/pty`, send keys to Emacs. `Origin` refuses unrelated
tabs only as far as the browser reports itself honestly about whose page it is; the secret makes "opened from Poca" the condition.
Refusing to start without one keeps the hole from coming back silently: running without it is a choice a person types.

**What is not guarded against**: programs of the same user. They read the person's files directly and can read the relay's environment
(`/proc/<pid>/environ`), so a WebSocket without `Origin` passes (it is how Xipe Totec reaches `/lsp`, needing no change in Xipe Totec).

**Alternatives**: a gate on the pages only (`:4001` refusing direct opening) — not a guard, since the relay can be reached directly; a
cookie — cookies ignore the port, so it would reach every localhost app; the secret in the WebSocket URL — it would sit in logs and
history; letting a relay without a secret run open by default — the same hole, unseen; Xipe Totec sending the secret on `/lsp` — not
needed once WebSockets without `Origin` pass.

**Found in Poca** (2026-10-19): the first run in Poca failed — every fetch stopped at its preflight, so nothing reached the relay
(Emacs "disconnected"; nothing in the log). The E2E with CDP's Fetch had not seen it: Fetch adds the header after the CORS check.
Hence the gate answers preflights, and `test/e2e/poca_gate.mjs` drives tezcatl in a test Poca itself.

**Left for later**: what a page shows when it was opened outside Poca (everything answers 401 / 403 today; crux has a plan); the relay's
own connections to emacs-vent (`:4000`) and Xipe Totec (`:4200`), which check nothing yet; the page server `:4001` (static files, no
check). Re-examined 2026-11-09: browsers are refused at all three ports already, so what these leave open is other users of a shared
machine — and that needs the relay's WebSocket without `Origin` closed too, not only `:4000` / `:4200`. Outside the development release
(it assumes a machine one person logs in to — [scope.md](../scope.md#starting-and-running)); after it.

**Files**: `lib/relay/secret_gate.exs`, `lib/relay/tickets.exs`, `lib/relay/ticket_handler.exs`, `main.exs` (the middleware, `/ticket`,
the refusal to start), `lib/core/ticket.js` and its four users, `input_target/emacs-vent.json` and `output_target/emacs-vent.json`
(load `ticket.js` before `ws.js`), `nix/t` (`--no-auth`), `flake.nix` (`relay --no-auth`), `test/e2e/stack.sh` (`TEZCATL_AUTH=off`,
`E2E_SECRET`); tests `test/relay/secret_gate_test.exs`, `test/ticket.test.js`, `test/e2e/secret_gate.mjs`, `test/e2e/poca_gate.mjs` (with
`test/e2e/poca_tezcatl.sh`). Poca's side:
[Poca](https://github.com/Crux-xurC/poca) (README "Authentication").
