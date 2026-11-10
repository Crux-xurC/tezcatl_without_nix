# sync

This repository is [tezcatl](https://github.com/Crux-xurC/tezcatl) made a Mix project, to run without Nix. Almost every file
comes from tezcatl through `sync/sync.sh` (see its header for what it changes); the files that came are listed in
`.upstream-files`, and the tezcatl commit in `sync/UPSTREAM`. Do not edit those here: change tezcatl and sync again.

This repository's own files:

| File | What |
|---|---|
| `mix.exs`, `mix.lock` | the Mix project (versions follow tezcatl's `nix/relay-packages.nix`) |
| `app/application.ex` | tezcatl's `main.exs` as an OTP application (kept in step by hand; the sync shows `main.exs`'s changes) |
| `test/relay/test_helper.exs`, `test/relay_isolated/test_helper.exs` | start ExUnit |
| `README.md` | the entrance (upstream's README is `README.tezcatl.md`) |
| `app/pages.ex` | the pages, served by the relay's VM (upstream uses python3's http.server) |
| `bin/t`, `bin/release` | starting tezcatl, building the release |
| `bin/test` | the relay's tests |
| `sync/` | this, the script, `gitignore.extra`, `UPSTREAM`, `main.exs.upstream` |

To update: `sync/sync.sh ~/path/to/tezcatl`, review `git diff`, `bin/test`, commit with the upstream commit in the message.
