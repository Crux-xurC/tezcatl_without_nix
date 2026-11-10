# `panels/resident/xterm.html`

The page of xterm (PTY terminal).

**Takes part in**: [D-pty-in-elixir](lib-relay-pty_socket.exs.md#d-pty-in-elixir), [D-session-service](panels-invisible-daemon.html.md#d-session-service)

## Notes from verification

**Spec** — the large comment at the top of the file is the design's source of truth (the file says so). It does not use `lib/core/ws.js` —
that is for the vent path only (JSON text frames, `?name=`, reconnects); the PTY is another protocol and path, so the page has its own
minimal WS code; it loads `config.js` for location resolution only. It answers `terminal.run {lines}` (addressed to it): each line written to
the PTY's stdin as `line + '\r'` — not through `insert` (`term.paste`), because bracketed paste makes several lines an edit of the line being
typed instead of commands run one by one. Output also goes out as `terminal.data {bytes}` (read by `xterm_cutoff`, `output_target`, the
run_table and the output_log). It takes `terminal.keys` from input_target (`lib/term/keys.js`).

**Does not** — anything of the vent protocol (emacs-vent takes no part); reconnecting (one connection = one PTY: a disconnect is the end).

**Pitfalls** — without `allowProposedApi: true`, loading `Unicode11Addon` throws, `boot()` fails and the screen stays at "starting…" (a bug
really hit); loading it is now in a `try/catch`, so the terminal starts anyway. `term.onData` structures **no** key — `enc.encode(d)` (UTF-8
bytes) goes as a binary frame (`D-pty-in-elixir`). `scheduleFit` / `doFit` debounce 120 ms and send `resize` only when `cols` / `rows`
changed. The shell is `['bash', '-l']` unless `pty.shell` in `config.json` is a valid array of strings.

*Verified 2026-09-06; `terminal.run` / `terminal.data` (2026-09-13) not re-verified.*

## Selection and revision notes

(Moved from the comments of `panels/resident/xterm.html`, 2026-09-10, with later notes.)

Record of the per-pane look:

- **`?font=` / `?size=` and `lib/core/fonts.css`**: override `ui.terminal.fontFamily` / `fontSize` for that pane only. `?font=` is an alias
  (`senobi`, `plemol` — through `@font-face` in `lib/core/fonts.css`, from `fonts/`) or a raw family string; `?size=` is px, clamped to
  8–32 (invalid values fall through to the config or default). After `document.fonts.ready` it refits once (xterm.js measures with the
  fallback at open). Plain `xterm` is unchanged
- **`claude` back to monospace**: `font=senobi` was dropped (`?cmd=claude&size=15`). Senobi Gothic is proportional (at 15 px: `W` 14.3 px,
  `i` 4.6 px, a blank 4.35 px, full width 15 px). xterm.js takes `W`'s width as one cell and widens every character to the cell with
  `letter-spacing`, so once Senobi loaded and cells were measured again (a resize changing columns or rows — `_afterResize` — or a change of
  `devicePixelRatio`), the cell jumped from 9.03 px (the fallback at open) to 14.3 px and every character spread apart (`i` +9.7 px, a
  full-width character +13.6 px, columns 98 → 61). "Refitting aligns the columns" held only before re-measuring. `?font=` and its aliases
  stay (a way to pass a monospace family)

Phase 8 — PTY + xterm.js (the design's source of truth: decisions, and what was still open)

  Relative paths: this file is under panels/; lib/ is at the repository root, so `../../lib/…`, never root-based (`/lib/…`). config.json
  is read through lib/core/config.js (`Tezcatl.config.load`), which resolves from its own `<script src>` (pages may move).

  Never:
  - call lib/core/ws.js' connectFromConfig (do not even load ws.js): it is the vent path's (JSON text frames, `?name=`, reconnects). The
    PTY is another protocol and path, so this page has its own minimal WS code. config.js (locating config.json) and panel-bus.js /
    panel-frame.js (the UI-local bus, not vent) may be loaded
  - put `?name=` on the PTY's WS URL (whether PTYs enter the relay's ledger is undecided — D below). The page's own `?name=` is only its
    panel-bus identity
  - reconnect: one connection = one PTY; a disconnect is the PTY's end (decision 2)

  Added like the input and output pages: panel-bus + panel-frame — the leave key (`ui.keys.leave`, a double Escape by default; a single
  Escape reaches the terminal) and the `insert` verb (→ `term.paste`: "this text into the terminal", used by the kill ring and LLM panes).
  Harmless alone. `?cmd=` (split at blanks) overrides the command: `?cmd=` > `config.json` `pty.shell` > `['bash','-l']`; the relay checks
  `cmd[0]` on PATH, so `?cmd=claude` runs the Claude Code CLI in its own PTY pane.

  Decisions (changing them moves things around):
  1. The PTY library is erlexec (`pty: true`): `open_port` gives no real PTY, so full-screen programs (nvim) do not run
  2. One connection = one PTY, ended by a disconnect. Work that needs persistence runs tmux inside the PTY
  3. The WS frame type says what a frame is: **binary** = the terminal's raw bytes, both ways, never decoded; **text** = control messages
     (JSON), parsed. PTY output may cut UTF-8, so it is always binary and goes to `term.write(Uint8Array)` as it is (xterm.js joins).
     Keys: xterm.js' `onData` already gives terminal bytes (Enter `"\r"`, C-c `"\x03"`, ↑ `"\x1b[A"`) — no `{key, modifiers}` structuring;
     `onData` is a string, so it is UTF-8-encoded (TextEncoder) and sent as a binary frame. `ws.binaryType = 'arraybuffer'`
  4. Four control messages (text frames, JSON): `start` (browser → relay: `cmd` — an array of strings, to avoid shell expansion — `cols`,
     `rows`, `cwd?`), `resize` (`cols` / `rows`, carried by ioctl, not bytes; sent first and on change only, debounced), `exit` (relay →
     browser: the code; shown, input stopped), `error` (`reason`: `start` received but no PTY — a missing command, exec failure, bad
     sizes; shown, input stopped, the socket closed right after, symmetric with `exit`)
  5. The path is `/pty` on the relay's cowboy (`main.exs`), port 4100 as vent; the URL is `pty.url` of `config.json`
  6. "Pass-through" differs: vent passes JSON unparsed; the PTY passes bytes uninterpreted and parses only control messages

  Settled:
  A. xterm.js is vendored: `lib/vendor/xterm/` with @xterm/xterm 6.0.0 + addon-fit 0.11.0 + addon-unicode11 0.9.0 (UMD, MIT); no npm, no
     bundler (origin, versions, how to update: its README). Globals `window.Terminal`, `FitAddon.FitAddon`, `Unicode11Addon.Unicode11Addon`
  B. `config.json` keys: `pty.url`, `pty.shell`, `ui.terminal.fontFamily` / `fontSize`; no theme (the default dark)
  C. Output back-pressure is the relay's (`D-pty-backpressure`); the browser passes through

  Still open:
  D. Whether the relay's ledger gets a kind (`?kind=vent` / `?kind=pty`) — when vent and PTY windows need telling apart in the list. Now
     this page gives neither `?name=` nor `?kind=`
  E. Fonts and ambiguous width: monospace is required, Japanese glyphs exactly twice the half width. The page loads addon-unicode11 and sets
     `term.unicode.activeVersion = '11'`; xterm.js 6.0 gates `term.unicode` as a proposed API (5.x had it on), so **`allowProposedApi: true`
     is required** — without it `loadAddon` throws "You must set the allowProposedApi option to true". Loading it is non-fatal: if it fails,
     the terminal stays usable (CJK / box-drawing widths may be slightly off). xterm.js treats East Asian Ambiguous characters (box drawing,
     some symbols) as half width, so nvim must match (`:set ambiwidth=single`)

  Resizing: erlexec takes `{winsz,{Rows,Cols}}` at start and `:exec.winsz/3` after (no limits); `resize` goes to the PTY by ioctl
  (TIOCSWINSZ).

Code notes: xterm.css styles the terminal; the page stays black behind it. No `convertEol` (the PTY already sends CRLF). A copy gesture in
the terminal feeds the kill ring (as code panes). The input is bracketed-paste aware → `onData` → the PTY. Resize fires in bursts:
debounced, and an unchanged size is not sent. `terminal.run`, `terminal.keys` and `terminal.data` came later (see the notes above).
