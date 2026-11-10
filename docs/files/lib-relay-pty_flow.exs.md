# `lib/relay/pty_flow.exs`

Back-pressure for one PTY: buffers output and hands the socket one frame per request.

**Decisions homed here**: [D-pty-backpressure](#d-pty-backpressure)

<a id="d-pty-backpressure"></a>

## D-pty-backpressure — erlexec cannot be paused, so the output goes to another process

**Decided**: PTY output is not taken by `pty_socket.exs` directly but by one `PtyFlow` per connection (`lib/relay/pty_flow.exs`). It
buffers with a byte limit and hands the cowboy connection process one frame of at most `@chunk` (64 KiB) per `{:want}` (a demand
loop). Over `@cap` (1 MiB) the buffer is dropped whole, followed by `ESC c` (RIS, a terminal reset) and a marker with the bytes cut.
**The relay's memory is bounded whatever the input rate.**

**Alternatives**: (1) pass-through — one PTY read = one WS frame; (2) stop the child with SIGSTOP/SIGCONT (lossless flow control);
(3) close the socket of a slow client.

**Why not**: (1) with a slow client the connection process blocks in `Transport:send` while erlexec piles up `{:stdout, …}`
**without limit** (erlexec has no API to stop reading the PTY): `yes`, a huge `cat`, a verbose build make the relay run out of memory.
(2) is right and lossless but process groups are hard (stopping the shell of a pipeline inside `bash -l` leaves the leaves writing);
its skeleton is a comment at the end of `pty_flow.exs` — Phase 2, once Phase 1's cutting proves a nuisance. (3) `xterm.html` does not
reconnect (one connection = one PTY), so closing ends the session: only as a last safety valve.

**What it removed**: memory piling up in cowboy's send queue; the need to manage the buffer "while blocked" (impossible) — with a
demand loop the mailbox holds one frame.

**Trade-off (accepted)**: under sustained overload output is lost (with a marker) — spam scrollback, or a TUI 1 MiB behind that is
useless anyway. Cutting VT bytes midway breaks xterm.js' state, so it resets fully (RIS) instead of dropping parts.

**Files**: `lib/relay/pty_flow.exs`, `lib/relay/pty_socket.exs`, `main.exs`.

## Selection and revision notes

(Moved from the comments of `lib/relay/pty_flow.exs`, 2026-09-10.)

Per-connection backpressure buffer for the PTY path (`PtySocket`). One
  `PtyFlow` process sits between erlexec and the cowboy connection process.

  ## Why it exists (Phase 1 of the PTY backpressure work)

  erlexec has **no API to pause reading from the PTY** (the `xterm.html` comment): whatever the child writes, erlexec reads and forwards
  as `{:stdout, OsPid, Data}` messages. When the browser is slow, the cowboy
  connection process blocks in `Transport:send`; while blocked it processes no
  messages, so those `{:stdout, ...}` messages pile up in its mailbox without
  bound -> the relay OOMs. `yes`, `cat` of a huge file, a chatty build.

  `:exec.run/2` can send child output to *another* pid (`{:stdout, flow_pid}`).
  So `PtySocket` points it here, and this process:

    * drains its own mailbox immediately into a **byte-capped** accumulator
      (`@cap`), so its mailbox stays small;
    * hands the cowboy process **one already-batched, `@chunk`-capped frame at
      a time**, only when asked (`request/2` -> a `{:want, conn}` message).
      That demand loop keeps the cowboy mailbox to a single pending chunk no
      matter how fast the child writes;
    * when the accumulator would exceed `@cap` (the client is far behind, the
      buffered bytes are stale) it **discards everything pending**, counts the
      dropped bytes, and the next frame is prefixed with `ESC c` (RIS -- full
      terminal reset) + a visible marker. You cannot cut a VT byte stream
      mid-escape-sequence without desyncing xterm.js; RIS is the one safe
      resync. Lossy, but what is lost is spam scrollback or a TUI that is
      already 1 MiB behind and unusable.

  Result: relay memory is bounded no matter the input rate. The cost is that
  sustained overload loses output (with a marker). Phase 2 (SIGSTOP/SIGCONT to
  actually pause the child -- lossless) is scaffolded in comments at the end of
  this file; it is deliberately not wired.

  The accumulate / cap / chunk logic is pure (`new/1` `feed/2` `mark_want/1`
  `pull/1`) so `test/relay/pty_flow_test.exs` can exercise it without a
  process -- same split as `PtyValidate` / `PtySocket`.

  Not vent, not the relay's connection registry, no protocol knowledge -- just
  bytes and a demand signal (D-pty-in-elixir).
Largest amount of PTY output buffered here before we start shedding. Peak
is <= @cap (the size check happens before the append).
Largest single WS binary frame handed to the cowboy process.
--- API -----------------------------------------------------------------
Start a flow bound to `conn` (the cowboy connection pid). Linked.
Tell the flow the child's OS pid (Phase 2 signal target; stored now).

  Ask for the next frame. The flow replies to `conn` with one `{:pty_out,
  binary}` as soon as it has anything (or immediately if it already does).
  The cowboy process calls this once on start and once after each frame it
  sends -- a 1-deep demand pipeline.
Stop the flow (from PtySocket.terminate/3). No-op on nil.
--- pure core (tested directly) ---------------------------------------
Initial state for a flow bound to `conn`.
iolist -- O(1) append, flattened only on pull/1
byte_size of buf
bytes discarded since the last frame carried a marker
cowboy is waiting for a frame
Phase 2: stopped: false

  Append `bytes` to the accumulator, or -- if that would exceed `@cap` --
  discard everything pending and add `bytes`' length to `dropped` (the next
  `pull/1` prefixes a RIS + marker).
Record that the cowboy process is waiting for a frame.

  If the cowboy process is waiting and there is anything to send, build one
  frame: `RIS + marker` (only when bytes were dropped) followed by up to
  `@chunk` buffered bytes. Returns `{:frame, binary, state}` or `{:empty,
  state}` (nothing to send yet -- `want` stays set).
Largest buffered / per-frame byte counts (for tests).
ESC c = RIS (Reset to Initial State): xterm.js resyncs from a clean slate,
so it does not matter where in the VT stream we cut.
--- GenServer (thin shell over the pure core) ------------------------
=== Phase 2 (not implemented -- this is where it would go): lossless flow control by SIGSTOP/SIGCONT ===

Phase 1 (above) moves the receiving end into another process to keep cowboy's mailbox empty and cuts with a RIS reset at the buffer limit,
so the relay's memory is bounded whatever the input rate. What goes over is lost (spam scrollback, a TUI 1 MiB behind and useless anyway).

To be lossless, stop the child. erlexec cannot stop reading the PTY, but it can send SIGSTOP / SIGCONT to the child. With hysteresis on
bufsize:

    @high round(@cap * 0.9)
    @low  round(@cap * 0.25)

    defp maybe_signal(%{stopped: false, bufsize: n, ospid: pid} = st) when is_integer(pid) and n > @high do
      _ = :exec.kill(pid, :sigstop)   # 19: the child blocks in write(2) and stops once the PTY's kernel buffer (~64KB) is full
      %{st | stopped: true}
    end
    defp maybe_signal(%{stopped: true, bufsize: n, ospid: pid} = st) when is_integer(pid) and n < @low do
      _ = :exec.kill(pid, :sigcont)   # 18
      %{st | stopped: false}
    end
    defp maybe_signal(st), do: st

Wiring: `stopped: false` in new/1; pass the results of feed/2 and pull/1 through maybe_signal/1; ospid is already set by set_ospid/2
(Phase 1 calls it; it would only be used).

Unsolved: process groups. A pipeline inside `bash -l` (`find / | grep x`) keeps writing from its leaves when only the shell is stopped.
`{group, 0}` is set, so check by version whether :exec.kill can signal the group -- if not, take the pgid and fall back to
System.cmd("kill", ["-STOP", "-#{pgid}"]). TUIs (nvim …) catch SIGCONT and redraw fully: only a slight flicker.

Record: Phase 1 as above (one process per connection; `@cap` 1 MiB, `@chunk` 64 KiB; the pure parts `new` / `feed` / `mark_want` /
`pull`; `test/relay/pty_flow_test.exs`, 9 cases). Phase 2 is only a skeleton in comments, **started once Phase 1's cutting proves a nuisance
in practice** (`D-pty-backpressure`).
