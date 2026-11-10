# Tezcatl without Nix

[tezcatl (Nix management: https://github.com/Crux-xurC/tezcatl)](https://github.com/Crux-xurC/tezcatl), made to run without Nix.

Tezcatl is a local, web-based development environment that uses Emacs as a backend instead of re-implementing it: the browser is the
window, and input goes to the backends (Emacs through emacs-vent, a terminal, the disk, language servers, Xipe Totec) uninterpreted.
What it is and how to use it: [README.tezcatl.md](README.tezcatl.md) (tezcatl's own README) and [docs/](docs/how-to-use.md).

This repository is generated from tezcatl (Nix management) by [`sync/sync.sh`](sync/README.md): the same pages and the same relay,
with the relay made a Mix project (`mix.exs`) and the Nix parts replaced. Changes are made in tezcatl (Nix management) and synced here;
the tezcatl commit this tree comes from is in [`sync/UPSTREAM`](sync/UPSTREAM).

| tezcatl (Nix management) | here |
|---|---|
| `nix develop`, then `t` | `bin/t` |
| `elixir main.exs`, BEAM packages from Nix | `mix run`, or a release (`bin/release`), packages from Hex (`mix.lock`) |
| the pages from `python3 -m http.server` | the pages from the relay's own VM ([`app/pages.ex`](app/pages.ex)) |
| `./test/run-relay.sh` | `bin/test` |
| `tezcatl-*-lsp` made by Nix | [`lsp/bin/`](lsp/README.md) |

Where tezcatl's documents say `nix develop`, `t` or `nix/…` (marked `<!-- env:nix -->`), read them with this table.

## Requirements

- Linux (x86_64; others untried)
- Elixir 1.18 or later with Erlang/OTP 27 or later (checked with Elixir 1.20.0 / OTP 29; the relay's tests also with 1.18.4 / OTP 27)
- gcc, g++, make and libcap, to build erlexec (the PTYs)
- ripgrep (`rg`) for `:grep`
- Optional: the language servers in `lsp.json` you want (see [lsp/README.md](lsp/README.md)) -- for JavaScript,
  `typescript-language-server` with TypeScript 5; MariaDB for the database windows
- The backends, started on their own: Emacs with [emacs-vent](https://github.com/Crux-xurC/emacs-vent) (`:4000`),
  [Xipe Totec](https://github.com/Crux-xurC/xipe_totec) (`:4200`)
- A Chromium-based browser, or [Poca](https://github.com/Crux-xurC/poca)

## Run it

```sh
mix deps.get           # once
bin/t --no-auth        # the pages (:4001) and the relay (:4100), in the foreground; Ctrl+C stops it
```

Then open `http://127.0.0.1:4001/main.html` and pick `frame`. Started from Poca's box, leave out `--no-auth`: Poca hands it a secret
and the relay serves only Poca's window.

`bin/t` runs `mix run` (the first start compiles). To run it without Elixir on `PATH` afterwards, build a release once with
`bin/release` (Erlang's runtime included, under `_build/prod/rel/`); `bin/t` runs that when it is there.

The ports: `TEZCATL_RELAY_PORT` (4100), `TEZCATL_PAGES_PORT` (4001, `off` for none), `TEZCATL_VENT_PORT` (emacs-vent, 4000). Settings of
your machine (e.g. `TEZCATL_FS_ROOT`, the root the files and terminals are opened under) can go in `local.env`, read by `bin/t`.

## Tests

```sh
bin/test                    # the relay's tests (mix test)
node --test test/*.test.js  # the browser side's
```

## Status

A development version, not checked as widely as tezcatl (Nix management). Checked without Nix (Elixir 1.20 / OTP 29): the relay's
tests, the browser side's, and 64 of the 70 end-to-end scenarios (`test/e2e/stack.sh up`, then `node test/e2e/<name>.mjs`; the
stack runs Xipe Totec from xipe_totec_without_nix beside this repository, or `XIPE_TOTEC_DIR`), with typescript-language-server and TypeScript 5. Not yet checked here: the scenarios
that need an Emacs with magit (`stack.sh emacs`: `magit_*`, `decode_emacs_magit`), a MariaDB login (`sql_socket`), or the OCaml /
Haskell / Nix / shell language servers (`lsp_langs`, and those parts of `code_outline` and `lsp_paths`).

## License

MIT, as tezcatl ([LICENSE](LICENSE)). emacs-vent (separate repository): GPL-3.0-or-later.
