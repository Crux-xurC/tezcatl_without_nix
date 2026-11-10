# `lib/core/ws.js`

The vent WebSocket: connecting from `config.json`, reconnecting, sending.

**Takes part in**: [D-loopback](lib-relay-allowed_origins.exs.md#d-loopback)

## Notes from verification

**Spec** — two failures are told apart (the reason is in the code): when `config.json` was read but has no `connections[0].url`,
`firstConnectionUrl` gives `null`, `connectFromConfig` reports `'no-config'` and **does not even reconnect** (configured not to connect — an
operator's mistake is not hidden); when `config.json` cannot be fetched or parsed, it falls back to `DEFAULT_URL` and tries (a config that
could not be read is no reason to stop).

**Does not** — validate frames (`protocol.parseMessage`); tune back-off (a fixed 2 s).

**Pitfalls** — `clientId` is `crypto.randomUUID()`, else `Date.now().toString(36) + …`, made **once per page** (reconnects reuse it;
`withName` runs at every `open()` but `clientId` is a constant from module load). `send()` while disconnected **does not queue**: it returns
`false`, so input sent between `onclose` and the `open()` 2 s later is lost (callers only show it). `sock.onerror` just calls
`sock.close()`; retrying is only in `onclose`.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/core/ws.js`, 2026-09-10.)

Single WebSocket connection for a panel page (browser only).

Each panel page (panels/resident/input.html, panels/resident/output.html) opens exactly one
socket. With the relay in front, many such sockets can coexist; the relay
occupies emacs-vent's single-client slot on their behalf.

The connection target is never hardcoded: it comes from config.json's
connections[] array -- connections[0].url is the vent-protocol peer this
panel talks to (the array is future room for more peers / key-record
dialects; one entry is today's setup). If config.json can't be fetched at
all, DEFAULT_URL is the last-resort fallback. If it IS fetched but has no
usable connections[0].url, that's operator misconfiguration: the panel
reports "no-config" and does not connect (see connectFromConfig).
config.json is located and fetched by lib/core/config.js (loaded before this
script). Keeping the resolution in one place means a page moving to a
deeper directory does not silently break.
This tab's stable id for the session, sent to the relay on the WS
upgrade URL (never in a frame). The relay lists it in GET /windows.
If the page URL carries ?name=..., pass it (and this tab's id) through
on the WS upgrade URL so the relay can label the connection for
w_list.html. Pages opened directly (panels/resident/input.html, panels/resident/output.html
with no ?name=) connect unlabelled and are unaffected.
config.json's connections[] holds the vent-protocol peers. Today there
is one; connections[0].url is what a panel connects to. Returns the url
string, or null when connections is missing / not an array / empty / the
first entry has no non-empty string url (operator misconfiguration --
the caller surfaces it and stops, rather than silently using a default).
Resolves to a url string to connect to, or null to mean "config was
readable but has no connection defined -- do not connect". A fetch/parse
failure is different (no config at all): that falls back to DEFAULT_URL.
config.json had no connections[0].url: surface it and stop. No
socket, no reconnect loop -- the operator has to fix config.json.
Returns true if the frame was handed to an open socket, false otherwise
(not connected -- the caller surfaces this; nothing is queued).
