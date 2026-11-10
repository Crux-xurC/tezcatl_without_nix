# `panels/tool/xterm_cutoff.html`

The page of xterm_cutoff (compile output mirror).

## Selection and revision notes

A thin host page for `lib/term/terminal-mirror.js`. Alone it does nothing (no `?source=`, nothing drawn).

On start it reads `source` (the target xterm's bus id) from `?source=`, calls `terminalMirror.mount()` and posts `terminal.ready {req}` (`req`
is the correlation id the opener passed in `?req=`) — the signal `compile-intent.js` waits for, so the mirror is surely subscribed before the
command is sent.

`terminal.reconfigure` (`onMine`) takes reuse: when `panels/skins/basic.html` points an existing `xterm_cutoff` pane at a new compile run, it
updates `{source, code, req}`, calls `mirror.setSource()` again and fires `terminal.ready` again (the same "wait for req" works for reuse and
creation alike). `onLink` (a click on `path:line:col`) only posts `code.goto` to `codeId` (`?code=` / `terminal.reconfigure`'s `code`).
