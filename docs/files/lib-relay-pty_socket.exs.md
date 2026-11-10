# `lib/relay/pty_socket.exs`

The `/pty` WebSocket: starts a shell in a PTY and passes bytes.

**Decisions homed here**: [D-pty-in-elixir](#d-pty-in-elixir)

**Takes part in**: [D-loopback](lib-relay-allowed_origins.exs.md#d-loopback), [D-pty-backpressure](lib-relay-pty_flow.exs.md#d-pty-backpressure)

<a id="d-pty-in-elixir"></a>

## D-pty-in-elixir — terminals do not go through Emacs

**Decided**: xterm.js draws in the browser; the Elixir relay opens the PTY on the server. **emacs-vent takes no part** (no change to
the vent protocol).

**Alternatives**: vterm through emacs-vent (the first design drew vterm as a part on Emacs' side).

**Why not**: a round trip through Emacs per key doubles the latency; vterm's C module writes the buffer directly, so
`after-change-functions` cannot be relied on; vterm's display depends on overlays — carrying it breaks `D-results-not-display`; and the
ownership line stays clean (Elixir owns processes).

**Nothing runs in Emacs**: "keep `compile` in Emacs for its error regexps and `next-error`" was **withdrawn**. Build, run and test go
in the PTY; jumping on a failure picks `path:line:col` (specified text — the "may be parsed" layer) with xterm.js' link detection and
moves the editor (`code.mark`, `code.goto`), not through Emacs. Errors while editing are LSP's (one source of truth). Running `compile`
through Emacs would make two sources of diagnostics.

**What it removed**: how to carry vterm's display state.

**Decided with it**: the PTY library is **erlexec** (`open_port` gives no real PTY: full-screen programs such as nvim do not work);
**one connection = one PTY**, closed on disconnect — persistence is tmux inside the PTY, the relay keeps no sessions; **keys are not
structured** (xterm.js' `onData` gives terminal bytes, passed as they are; `{key, modifiers}` is the vent path's notion); output
back-pressure is a separate process (`D-pty-backpressure`).

**A clash of words**: "pass-through" means two things — for vent "the JSON is not parsed", for the PTY "the bytes are not interpreted
(only control messages are parsed)". Say which.

**Files**: `lib/relay/pty_socket.exs`, `panels/resident/xterm.html`, `config.json`.

## Notes from verification

**Spec** — branching on binary vs text frames follows from one constraint: PTY output may cut UTF-8 in the middle, so it cannot ride text
frames. OTP 27's own `:json` (no Jason) parses control messages, so values from the browser go through **a real parser and explicit
validation** (`PtyValidate`), not hand extraction. Output goes through a linked `PtyFlow` (`D-pty-backpressure`): `:exec.run` gets
`{:stdout, flow}` / `{:stderr, flow}`, then `PtyFlow.set_ospid/2` and the first `request`; `{:pty_out, chunk}` becomes a binary frame and
the next `request` (a one-deep pipeline); both `terminate/3` clauses stop the flow.

**Does not** — validate `cmd` / `rows` / `cols` / `cwd` itself (`PtyValidate`); register in `VentUplink` (PTYs are not in the connection
ledger, not in `GET /windows`).

**Pitfalls** — `sig_to_int/1` carries the fix of a bug where `:exec.signal/1` (number → atom) and `:exec.signal_to_int/1` (atom → number)
were swapped (the comment keeps the story). `exit_code(:normal)` is 0; `{:exit_status, status}` splits through `:exec.status/1` into
`{:status, code}` or `{:signal, sig, _core}`; anything else (`:noproc` too) is -1. `handle_start/2`'s `with` runs `ensure_exec()` before
validating the command, so a failing erlexec never shows as a command error. `:env` adds only `{~c"TERM", ~c"xterm-256color"}`; erlexec
inherits the parent environment unless told `clear`. `terminate/3` sends `:exec.kill(ospid, 9)` before `:exec.stop(ospid)` (interactive
shells ignore SIGTERM). Separating vent and PTY connections by `?kind=` is not implemented.

*Verified 2026-09-06; the PtyFlow wiring (2026-09-09) not re-verified.*

## Selection and revision notes

(Moved from the comments of `lib/relay/pty_socket.exs`, 2026-09-10.)

cowboy_websocket handler for the PTY path (`/pty`). Phase 8.

  One WS connection == one PTY (overview.md §4.3, panels/resident/xterm.html). erlexec
  allocates a real pseudo-terminal (`pty`); `open_port` was rejected because
  it gives no controlling tty. This handler is NOT registered with
  `VentUplink` -- that registry is for vent connections and backs
  `GET /windows`. A `?kind=` split is open item ④ and not done here.

  Frame types (panels/resident/xterm.html decision 3):

    * binary frame  -- raw terminal bytes, both directions, never decoded.
      browser -> here: written straight to the PTY stdin.
      PTY -> browser : erlexec sends child output to a per-connection `PtyFlow`
                       process (lib/relay/pty_flow.exs), which byte-caps a
                       buffer and hands this handler one `@chunk`-capped frame
                       per `{:want}` -- a demand loop that bounds our mailbox
                       no matter how fast the child writes (PTY backpressure,
                       item ③). Overload past the cap sheds with a RIS reset.
    * text frame    -- a JSON control message, parsed. Four kinds:
        start  (browser -> relay)  cmd (array of strings) / cols / rows / cwd?
        resize (browser -> relay)  cols / rows
        exit   (relay -> browser)  code    -- child exited; sent just before close
        error  (relay -> browser)  reason  -- start was received but no PTY could
                                              be spawned (bad cmd, exec failure,
                                              bad cols/rows); sent just before close

  JSON is parsed with OTP 27's stdlib `:json` (not Jason -- no new dep). The
  control messages carry untrusted, browser-supplied values, so they get a
  real parser plus explicit validation rather than hand extraction.

  `cmd` runs as argv with no shell (erlexec list form), so there is no shell
  expansion; `cmd[0]` is resolved against the relay's PATH. Arbitrary command
  execution is intended (overview.md §1) but malformed input must never crash
  the relay: every bad control message is logged and dropped, the connection
  stays up.

  Environment: the PTY inherits the relay's environment (erlexec's `:env`
  extends rather than replaces -- see `handle_start/2`). The relay overrides
  only `TERM` (its peer is the browser's xterm.js, not the starting terminal).
  Inheriting PATH unchanged is what lets the box run the user's own `nvim` and
  tools -- Tezcatl ships no editor and wires none (overview.md §4.3 / §10).

  The handshake's `Origin` header is checked in `init/2` (see `AllowedOrigins`)
  -- a disallowed browser Origin gets a 403 and no upgrade. This is not auth;
  it stops an unrelated tab in the user's browser from scripting
  `new WebSocket(".../pty")` to spawn a shell. A headerless (non-browser)
  client is allowed.
Origin gate first (AllowedOrigins). A browser always sends `Origin` on a
WS handshake and cannot forge it; a disallowed value never upgrades.
Just upgrade. The PTY is not started here: its size is unknown until
the first `start` message arrives.
One PtyFlow per connection, linked. It receives the child's output
(erlexec {:stdout, flow, ...}) and feeds us one capped chunk per demand.
--- control messages (text frames) ---
--- raw terminal bytes (binary frames) -> PTY stdin, never inspected ---
binary before `start`: nothing to write to yet. Drop, not an error.
--- PTY output -> browser (via PtyFlow's demand loop) ---
PtyFlow hands us one already-batched, size-capped chunk per {:want}. Ask
for the next before replying (a 1-deep pipeline: at most one chunk waits
in our mailbox while we send this one). See lib/relay/pty_flow.exs.
--- PTY exit: tell the browser the code, then close ---
The socket is gone, so the shell goes too (1 connection = 1 PTY). Kill
the whole process group -- SIGKILL the leader now (an interactive shell
ignores SIGTERM), then `exec.stop/1` lets erlexec's `kill_group` sweep
any remaining group members (SIGTERM then SIGKILL after `kill_timeout`).

Guarded: during a full relay shutdown the :exec server may already be
gone, and a call into it would exit/timeout here. On such an exit the OS
reaps everything anyway (erlexec's port SIGKILLs its children on exit).
=== start ===
child output goes to the per-connection PtyFlow, not straight to
this process -- that is the whole backpressure mechanism.
`:env` here EXTENDS the inherited environment (erlexec only drops
inheritance if the list contains the `clear` atom -- it does not).
So the shell keeps the relay's PATH etc.; with a login shell
(config.json pty.shell = ["bash", "-l"]) that resolves the user's
own nvim and tools the same way a normal terminal would -- Tezcatl
wires no editor (overview.md §10). We override only TERM: the PTY's
peer is not the terminal that started the relay but the browser's
xterm.js, so the terminal's identity is declared by the relay, not
inherited. LINES / COLUMNS are deliberately NOT set -- the terminal
size is owned by `:winsz` above and the `resize` control message; a
second copy in the environment would only drift.
erlexec (the :exec app and its C port program) is started on the first PTY
request, not at relay boot -- the vent passthrough never needs it, so a
relay that only ever proxies vent traffic does not spawn the port.
ensure_all_started/1 is idempotent, so every start after the first is a
cheap no-op check.
`start` was received but no PTY exists -- validation rejected it, erlexec
would not start, or `:exec.run` failed. Tell the browser why and close, the
same way a real child exit sends `exit` + close. Without this the browser
stays on "connected" with a dead terminal and every keystroke silently
dropped (binary frames have nowhere to go while `ospid` is nil).
`terminate/3` sees `ospid: nil` and does nothing.
=== resize ===
A winsz failure here is almost always a lost race with child exit
(the child died between the guard match above and this call); the
`{:DOWN, ...}` message is already queued and will send the `exit`
frame. Nothing actionable to report to the browser -- log and move
on. A rejected size (bad rows/cols from a buggy client) is likewise
dropped: the PTY keeps its current, valid size.
=== validation ===

The `start` / `resize` field checks (cmd / rows / cols / cwd) live in
`PtyValidate` (lib/relay/pty_validate.exs) -- pure functions, split out so
they can be unit-tested without starting erlexec or a PTY. This module
keeps every erlexec call and the socket lifecycle.
=== PTY backpressure (item ③) ===

Moved out of this module into `PtyFlow` (lib/relay/pty_flow.exs): erlexec
sends child output there (the `{:stdout, state.flow}` option in
handle_start/2), it byte-caps a buffer and hands us one `@chunk`-capped
frame per `{:want}` (websocket_info({:pty_out, _})). That demand loop keeps
this process's mailbox to a single pending chunk regardless of the child's
write rate -- previously a slow client blocked us in `Transport:send` while
erlexec kept queuing `{:stdout, ...}` unboundedly. Overload past the cap
sheds with a RIS reset + a visible marker (lossy; Phase 2 = SIGSTOP the
child, scaffolded in comments in pty_flow.exs).
=== helpers ===
Anything else -- `:noproc` (erlexec lost the child before it could report a
real status), or an unrecognised reason. Not a clean exit: report "unknown"
rather than pretend it was 0.
`:exec.status/1` reports a signal death as `{:signal, Signal, Core}` where
Signal is an atom (`:sigint`, `:sigsegv`, ...) for every signal erlexec
knows -- only one outside its table comes through as the raw integer.
`:exec.signal_to_int/1` is erlexec's atom -> number converter. (Its
inverse, `:exec.signal/1`, is number -> atom and raises
FunctionClauseError on an atom -- passing that one an atom here made every
signal death fall through to the `rescue` and report 15 regardless of the
actual signal.) Guard it so an unknown signal name still yields a code
(128 + N, the shell convention) instead of raising in the {:DOWN, ...}
handler and dropping the socket before the `exit` frame is sent.
