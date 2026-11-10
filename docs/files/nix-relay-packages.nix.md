# `nix/relay-packages.nix`

The relay's BEAM dependencies built with Nix (cowboy, gun, erlexec …).

## Notes from verification

**Spec** — no Plug and no Jason (the comment says why): `/windows`' JSON is built by hand in `windows_handler.exs`, keeping anything
JSON-like away from the pass-through path — a design choice that shows in the dependency list.

**Does not** — application logic (only build dependencies).

**Pitfalls** — only `erlexec` has `nativeBuildInputs = [ pkgs.gnumake ]`: its `rebar.config` `pre_hooks` run `make -C c_src` to build the C++
`exec-port`; the C++ toolchain is stdenv's default (no compiler added). The comment says `cowlib` / `ranch` / `cowboy` point to the same hex
tarballs as another Nix file of the author's; the hashes themselves were not compared.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `nix/relay-packages.nix`, 2026-09-10.)

BEAM deps for the Tezcatl vent relay (main.exs + lib/relay/*.exs).
Self-contained on purpose: this file imports no other Nix file. cowboy (browser-facing WS
server + a plain GET /windows handler) and gun (WS client to emacs-vent)
are all the vent passthrough needs. No Plug, no Jason: the /windows JSON
is hand-built in windows_handler.exs so nothing JSON-shaped sits near the
passthrough path.
erlexec is for Phase 8 (PTY + xterm.js): the relay allocates a real PTY
for shell / nvim / less / top via :exec.run(..., [:pty]). open_port was
rejected -- it gives no controlling tty, so isatty() is false and full-
screen apps don't run (overview.md §12).
cowlib / ranch / cowboy are hex tarballs; gun 2.1.0 and erlexec 2.3.4
were prefetched with `nix store prefetch-file`.
erlexec ships a C++ helper (priv/<target>/exec-port) that rebar.config's
pre_hooks build with `make -C c_src`. Unlike the pure-Erlang deps above
it needs GNU make + a C++ toolchain at build time; the toolchain comes
from the default stdenv, make is added explicitly. No beamDeps.
