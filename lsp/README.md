# lsp

This repository's own. Upstream's `nix/dev-tools.nix` makes three commands that `lsp.json` names; these are the same, as shell
scripts. `bin/t` puts `lsp/bin` first on `PATH`, so the relay finds them.

| Command | Language | Needs on `PATH` |
|---|---|---|
| `tezcatl-elixir-lsp` | Elixir: `elixir-ls` where there is a `mix.exs`, else a syntax check only | `elixir-ls`, or `efm-langserver` and `elixir` |
| `tezcatl-haskell-lsp` | Haskell: `ghc -fno-code` on every save, its errors and warnings as diagnostics | `efm-langserver`, `ghc` |
| `tezcatl-shell-lsp` | shell: shellcheck | `efm-langserver`, `shellcheck` |

The other servers in `lsp.json` (`typescript-language-server`, `vscode-langservers-extracted`, `nil`, `ocamllsp` …) are found on
`PATH` as they are; install the ones for the languages you edit. Why each is set up this way: the comments in tezcatl's
`nix/dev-tools.nix`.
