# `nix/t`

Starts tezcatl itself (`t`): the pages (:4001) and the relay (:4100), in the foreground. It opens no browser and starts no backend;
emacs-vent and Xipe Totec are started on their own, each by its own entry in the outside tool (Poca's box).

**Decisions homed here**: [D-start-outside](#d-start-outside)

<a id="d-start-outside"></a>

## D-start-outside — starting, stopping and keeping things running is a GUI tool outside Tezcatl; Tezcatl only asks it

**Decided**: today one types `nix develop` and `t` in a terminal and works in the browser. Starting, stopping and keeping alive
(emacs-vent, Xipe Totec, the relay, the pages) is the business of **a GUI tool outside**, not of Tezcatl.

- The GUI tool need not be managed by Nix; its whole job is to **run, in an invisible terminal, what is typed today**
  <!-- env:nix -->(`nix develop <tezcatl> --command …` — the environment start-up needs is the dev shell's)<!-- /env:nix -->
- **What starts, and how, lives in the repository** (where `t` is); the GUI only calls it (two copies drift)
- **Stopping is Ctrl+C (or TERM) to that one process**, so starting and stopping are one thing. **`t` runs only in the foreground**
  (starts the pages and the relay, waits, Ctrl+C stops both); there is no background start, since the tool that started a thing must hold
  it to stop it (`t -d` removed 2026-10-19)
- **`t` starts tezcatl alone** (2026-10-19): the backends (emacs-vent, Xipe Totec) are separate entries of the outside tool, so each is
  started and stopped on its own, and `t` opens no browser — it only makes `http://127.0.0.1:4001/main.html` reachable; what opens it
  (Poca) is the outside tool's business
- **The GUI tool can also be driven from a terminal** (start, stop, status), so an xterm panel can ask it — asking to stop ends that
  panel too, with the relay, which is fine because the GUI does the stopping
- "Only who started a thing stops it": emacs-vent, Xipe Totec and the relay are started by the GUI, so stopped by it; what Tezcatl starts
  itself (language servers, PTYs) is stopped by Tezcatl's commands. Xipe Totec never stops Tezcatl's language servers
- Order does not matter: the relay retries Emacs every 2 s and Xipe Totec every 0.5 s (`vent_uplink.exs`, `xipe_conn.exs`)
- Terminals are not reconnected: if the relay falls, the panel's shell ends; restarting the relay and reloading the browser is the same as
  reconnecting

**Alternatives**: screens in Tezcatl to stop things and see their state (the relay becoming the processes' parent); the relay keeping
PTYs beyond a connection and returning to the same shell (session ids + resending output); existing tools (process-compose, overmind,
systemd user units) through Nix.

**Why not**: starting, stopping and keeping alive belong to a layer outside; thought of inside, it sinks into giving the relay state or
stopping one's own parent. A terminal is reconnected only when the relay is rebuilt, since browser and relay share the machine's
loopback. The GUI tool is not a choice of tool but "typing in an invisible terminal", so it need not be in Nix.

**What it removed**: most of terminal reconnection and of the means to stop. Left: something long run in a terminal panel (a build, a
dev server, a REPL) is lost when the relay is rebuilt — run it in tmux (`pty.shell` in `config.json`, or `?cmd=`; no code change).

**As implemented**: `nix/t` (a script; the dev shell's `t` calls it — under `nix develop --command` shell functions are not visible, so
outside tools call the script). It `exec`s the two, keeps their pids, sends TERM on INT, TERM or HUP and waits (KILL after 10 s); it
refuses to start anything when :4001 or :4100 is in use. Background children of a script ignore Ctrl+C (SIGINT), so `t` receives it — but
the relay's BEAM installs its own SIGINT handling and takes Ctrl+C directly; with stdin `/dev/null` it ends at once from BREAK (no
erlexec child is left; checked, nothing to do).

**The secret** (2026-10-19, [D-poca-secret](lib-relay-secret_gate.exs.md#d-poca-secret)): Poca's box starts `t` with
`POCA_SECRET`, which the relay inherits. Without one `t` starts nothing and says why; `t --no-auth` runs without authentication
(`TEZCATL_AUTH=off`), and `t` says which it is when it is up.

Until 2026-10-19 `t` also started emacs-vent and Xipe Totec, opened the system browser (`xdg-open`, `TEZCATL_BROWSER`) and had `t -d`
(start the free ports in the background and return). The backends were moved out so that Poca's box holds each one; the browser launch
went because Poca opens the page.

**Files**: `nix/t`, `flake.nix` (`t` calls `nix/t`), the outside GUI tool (not in this repository).
