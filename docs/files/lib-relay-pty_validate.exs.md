# `lib/relay/pty_validate.exs`

Pure checks of a PTY's command, size and directory.

## Notes from verification

**Spec** — the pure functions taken out of `pty_socket.exs`, so they run in ExUnit (`test/relay/pty_validate_test.exs`) without starting
erlexec or a PTY; real PTYs belong to live E2E. That line is the reason for the file split.

**Does not** — call erlexec or handle a socket's life (`PtySocket`).

**Pitfalls** — `validate_cmd/1` resolves `cmd[0]` on PATH with `System.find_executable/1` and errors if absent — the consequence of taking
argv as an array to avoid shell expansion (`D-pty-in-elixir`): it does once what the shell's `$PATH` search would. `validate_size/2`'s
`@max_dim = 65_535` comes from the kernel's winsize fields being unsigned short. `validate_cwd(nil)` is `{:ok, []}` (no `:cd`, erlexec's
default — usually where the relay started), while `""` fails (`File.dir?("") == false`): `nil` and `""` differ.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/relay/pty_validate.exs`, 2026-09-10.)

Pure validation of the browser-supplied fields on `PtySocket`'s `start` and
  `resize` control messages: `cmd` / `rows` / `cols` / `cwd`.

  Split out of `pty_socket.exs` so it can be unit-tested on its own -- without
  starting erlexec's port program or a real PTY, which is live-integration E2E
  territory (progress.md §5.B), not ExUnit.

  Same component as `PtySocket`: the relay's PTY path (overview.md §2 item ②,
  §4.3). It holds no state, knows nothing of the vent wire protocol, and never
  interprets a vent frame -- it only turns three untrusted values into either
  an option fragment for `:exec.run/2` / `:exec.winsz/3` or an `{:error,
  reason}` string the caller logs and drops. `PtySocket` keeps the socket
  lifecycle and every erlexec call.

  The control messages carry untrusted, browser-supplied values, so a bad one
  must never crash the relay: each check returns `{:error, reason}` rather than
  raising, and the caller drops the message with the connection left up.
winsize fields are unsigned short in the kernel.
Largest accepted terminal dimension (a kernel winsize field is u16).

  Validate a `start` message's `cmd`.

  `cmd` must be a non-empty list of strings. It runs as argv with no shell
  (erlexec list form -- no expansion); `cmd[0]` is resolved against the
  relay's PATH and a miss is an error. On success the result is the charlist
  argv `:exec.run/2` wants, with `cmd[0]` replaced by its resolved path.

      iex> match?({:ok, [_ | []]}, PtyValidate.validate_cmd(["sh"]))
      true
      iex> PtyValidate.validate_cmd([])
      {:error, "cmd must be a non-empty array of strings"}

  Validate `rows` / `cols` from a `start` or `resize` message. Both must be
  integers in `1..#{@max_dim}`. On success returns `{:ok, rows, cols}` so the
  caller can pattern-match the pair straight into `{:winsz, {rows, cols}}` /
  `:exec.winsz/3`.

  Validate a `start` message's optional `cwd`.

    * missing (`nil`)            -> `{:ok, []}`      (no `:cd` option)
    * a string naming a real dir -> `{:ok, [{:cd, charlist}]}`
    * a string that is not a dir -> `{:error, reason}`
    * anything else              -> `{:error, reason}`

  The `{:ok, opt}` shape is meant to be `++`-ed onto the erlexec option list.
