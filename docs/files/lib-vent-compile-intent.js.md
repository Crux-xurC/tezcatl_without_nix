# `lib/vent/compile-intent.js`

The `compile` browser backend: runs the current file's compile command in the last xterm.

## Selection and revision notes

The equivalent of `M-x compile`; nothing is sent to Emacs — a local function called from `resolver.js`' `browser.backend` branch. The
flow:

1. Post `cursor.query`, wait for `cursor.state.focusHistory`, and find the bus ids of the latest `role:"code"` and `role:"xterm"` (no
   dependence on the skin: the same in any skin or a window of its own)
2. Send `code.get` to that code panel (`{to: codeId}`) and read `path` / `language` from the `code.text` answer
3. Look up `compile.json` by `language` — `{scope:"file"|"self"|"root", command:[argv], rootMarkers?}`
4. Only for `scope:"root"`, walk `/fs` upwards (`walkUp`) to decide where to `cd`; `"self"` is the file's own directory; `"file"` does not cd
5. `planLines(entry, prefix, ctx)` (pure) builds two lines, `cd <dir>` and the command (one line for `"file"`). argv becomes one shell line
   with POSIX single-quote quoting (`shQuote`) — joined from an array, not a string template, so no double quoting; only the `{{path}}`
   token is replaced by the absolute path before quoting
6. Send the `cd` line to that xterm with `terminal.run`
7. Post `compile.cutoff.open` (wait 200 ms for `compile.cutoff.opened`; otherwise open `xterm_cutoff.html` itself with `window.open`)
8. Wait for that `xterm_cutoff`'s `terminal.ready` (matching `req`), then send the command line with `terminal.run`

`intent.browser.prefix` (`compile.run-nix`'s `["nix","develop","--command"]` …) is prepended to argv before quoting — also an array join.

The pure parts (`_shQuote`, `_joinAbs`, `_dirnameRel`, `_resolveArgv`, `_planLines`) are tested by `test/compile-intent.test.js`; the
network and bus parts are not (DOM-driven, waiting for a real-browser E2E).

**Not verified**: the commands in `compile.json` were written by guess; only the languages tried in a session were actually run.
