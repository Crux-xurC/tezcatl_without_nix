# `nix/fonts.nix`

Native side only (Emacs, terminals): fonts from nixpkgs.

## Selection and revision notes

(Moved from the comments of `nix/fonts.nix`, 2026-09-10; see the record for what changed.)

Fonts for the Tezcatl dev shell. Split out from flake.nix; `flake.nix` guards `import ./nix/fonts.nix` with
builtins.pathExists, so it still evaluates when this file is absent, and config.json's "PlemolJP Console" then just falls back to monospace.
plemolJP -- the PTY terminal font (config.json ui.terminal.fontFamily = "PlemolJP Console"). IBM Plex Mono + IBM Plex Sans JP, half:full
width = 1:2, so nvim / shell / build output in the xterm.js grid stay column-aligned incl. Japanese. In nixpkgs (SIL OFL). Appended to
XDG_DATA_DIRS in the shellHook so the native side / a shell-launched browser can find fonts by family name. The browser panes load fonts by
@font-face url() off the :4001 static server -- fontconfig / XDG_DATA_DIRS is not on that path.

Record:

- **Font wiring**: `plemoljp` (and once the display face) bundled, exporting `xdgDataDirs`; `flake.nix` guards the import
- **The display face**: Okuda (poor at UI sizes, All Rights Reserved) was replaced by Senobi Gothic; a detour through Librestile was dropped
  (its only cut is Extended width: glyphs collided). When Tezcatl became its own repository, `fonts/` left git (not distributed); flakes see
  only tracked files, so the derivation building Senobi from `fonts/` was removed and this file bundles only nixpkgs' `plemoljp`. Senobi is
  read by the browser from `fonts/` through `lib/core/fonts.css` only (natively, each environment installs it)
- **Which pages name the bundled faces**: only the CM6 editor panes (`code*.html` through `code.json`) and the opt-in `claude` xterm pane;
  the chrome pages use `system-ui` / `monospace`. `XDG_DATA_DIRS` has almost no effect on the browser side
- **Chess pieces (`heterodox_chess`)**: fairy-chess pieces (13 pieces × 4 kinds, U+E900–U+E933), the ttf of
  [heterodox_chess_fonts](https://github.com/Crux-xurC/heterodox_chess_fonts). Until 2026-11-10 it was a flake input that this file
  packaged and the shellHook linked under `fonts/heterodox-chess/`; for the publication it left the flake and is handled like Senobi
  Gothic: the ttf placed by hand at `fonts/heterodox-chess/heterodox_chess.ttf` (git-ignored), read by the pages through
  `lib/core/fonts.css` (first in `--tz-ui-font`, only the pieces by `unicode-range`) and `code.json`'s `fontFamily`. Without the file only
  the pieces are not drawn. Terminals are not covered
- **No font file is in the repository** (`fonts/` is git-ignored). This file stays: it holds only nixpkgs' `plemoljp` (SIL OFL)
