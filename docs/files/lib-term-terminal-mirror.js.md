# `lib/term/terminal-mirror.js`

A receive-only xterm.js showing another terminal's output (with `path:line:col` links).

## Selection and revision notes

A receive-only xterm.js instance that, instead of opening another `/pty` from `panels/resident/xterm.html`, mirrors the output of an xterm
already running somewhere, over the bus. `term = new Terminal({ disableStdin: true, … })` takes no input.

`mount(container, opts)`: `opts.source` is whose output to show (the source xterm's bus id). It listens to `terminal.data` and drops
`meta.from.id !== sourceId`. "Only what came after it opened" holds with no marker or snapshot mechanism — the instance starts its own
subscription, so earlier broadcasts never reach it (BroadcastChannel's pub-sub timing, a property of `panel-bus.js`).

`setSource(id)` swaps the source (called by `panels/tool/xterm_cutoff.html` when reused through `terminal.reconfigure`); swapping does
`term.clear()`.

`term.registerLinkProvider` makes each line's `path:line:col` (`([^\s:()]+\.[A-Za-z0-9]+):(\d+)(?::(\d+))?`) clickable and calls
`opts.onLink(path, line, col)`. The plain text comes from xterm.js' `buffer.active.getLine(y).translateToString(true)`, ANSI already
interpreted (no ANSI parser of our own). This is the "custom link provider that finds `path:line:col` and opens the file" given as the reason
not to take `addon-web-links` (`lib/vendor/xterm/README.md`).

**Known simplification**: `onLink`'s target (`xterm_cutoff.html`) always sends `code.goto` to one fixed code panel — it does not check
whether the matched path is another file (a build error across several files may jump to the wrong place).
