# `flake.nix`

The development shell: Elixir / Erlang and the relay's BEAM dependencies, node, python3, the language servers and the terminal font from
nixpkgs; `t` and `relay`.

**Takes part in**: [D-poca-secret](lib-relay-secret_gate.exs.md#d-poca-secret), [D-start-outside](nix-t.md#d-start-outside)

## Notes from verification

**Spec** — the nixpkgs pin is shared with the sibling Emacs flake so the development setup shares one Nix closure. The dev shell's `t` calls
`nix/t` (`D-start-outside`): it runs the pages and the relay in the foreground and stops them with Ctrl+C, refusing if a port is taken
(checked by trying `/dev/tcp`). The backends are started on their own. `relay` (the relay alone) takes `--no-auth` when there is no
`POCA_SECRET` (D-poca-secret).

**Does not** — start Emacs or Xipe Totec (they are started on their own); install editors (nvim inside a PTY is the user's).

**Pitfalls** — Logs go to fixed paths `/tmp/tezcatl-*.log` (one instance at a
time). Why `ELIXIR_ERL_OPTIONS="+fnu"` is set is not stated in code (likely about non-ASCII file names; unknown).

*Verified 2026-09-08 against the old `t()`; to be re-verified against `nix/t`.*

## Selection and revision notes

(Moved from the comments of `flake.nix`, 2026-09-10; brought up to date 2026-11-10.)

- **An independent flake** with its own nixpkgs pin and `flake.lock`; `nixpkgs` is its only input.
- **Elixir / Erlang 27** (`beam.packages.erlang_27`). The relay is `.exs` loaded with `Code.require_file` — no mix — with its BEAM
  dependencies built by Nix (`nix/relay-packages.nix`) and put on `ERL_LIBS` by the BEAM builder's setup hooks. `erlexec` gives the relay
  real PTYs (shell, nvim, less, top).
- **Fonts**: `nix/fonts.nix` (guarded by `builtins.pathExists`) gives PlemolJP, the terminal's face, appended to `XDG_DATA_DIRS` for the
  native side (Emacs, a shell-launched browser). The pages load their faces (Senobi Gothic, heterodox_chess) by `@font-face` from the
  git-ignored `fonts/` through `lib/core/fonts.css`, not through this flake. heterodox_chess was a flake input until 2026-11-10; it left the
  flake for the publication, to be placed by hand like Senobi Gothic.
- **`python3`**: the static page server (`:4001`). **`nodejs`**: the unit tests and the E2E driver. **`ripgrep`**: `GET /fs/grep`.
- **The PTY box** runs whatever `nvim` and other tools the person has on `PATH`; Tezcatl ships no editor. The relay inherits this shell's
  `PATH` and the PTY's shell inherits it in turn.
- **`local.env`** (git-ignored) is sourced by the shellHook for this machine's settings, e.g. `TEZCATL_FS_ROOT`.
