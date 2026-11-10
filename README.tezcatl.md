# Tezcatl

A local, web-based development environment that uses Emacs as a **backend** instead of
re-implementing it. Tezcatl (Nahuatl for "mirror") is the window: it decides how things are
operated and shown in the browser, and sends input to the backends **without interpreting it**.
The backends — Emacs through emacs-vent (a separate repository), a terminal, the disk, language servers,
Xipe Totec (a separate project) — compute.

```
Browser (Tezcatl: CodeMirror / xterm.js)
        │ WebSocket
 ───────┼──────────────────────── the same host
 Elixir relay   ① vent  ② PTY  ③ files  ④ LSP  ⑤ Xipe Totec
        │
 emacs-vent (in / out)  →  Emacs (Magit / Org / dired …)
```

The browser never talks to Emacs, a PTY, the disk or a language server directly; one Elixir
relay owns each connection and multiplexes the windows.

## What it is not

- not a re-implementation of Emacs, an IDE, Git, LSP, an LLM or vterm
- not a mirror of Emacs' buffers (it carries computed results, not what Emacs displays)
- not a competitor of VS Code, not a plugin marketplace
- not for the network: everything listens on `127.0.0.1` only, and started from Poca the relay serves only Poca's window (see
  [docs/scope.md](docs/scope.md))

## Run it

Start it from Poca's box (the `tezcatl` row with `"auth": true`): Poca hands it a secret and the relay serves only Poca's window.

<!-- env:nix -->
```
nix develop
t --no-auth   # by hand, without Poca: page server + relay without authentication (Ctrl+C stops both); opens no browser
```

The backends are started on their own: your Emacs with [emacs-vent](https://github.com/Crux-xurC/emacs-vent) loaded and `emacs-vent-mode` on (for example
`emacs --fg-daemon`, :4000) and [Xipe Totec](https://github.com/Crux-xurC/xipe_totec)
(`xipe start --port 4200 --lsp ws://127.0.0.1:4100/lsp --fs-root <root>`, :4200).

Then open `http://127.0.0.1:4001/main.html` (the launcher) and pick `frame`.
A version without Nix (`mix.exs`) is planned; until then the steps above assume the dev shell.
<!-- /env:nix -->

## Which document to read

| You want to | Read |
|---|---|
| use it day to day | [docs/how-to-use.md](docs/how-to-use.md) |
| add a command, an intent, a panel, a language … | [docs/extending.md](docs/extending.md) — a table: what to write, where, which test guards it |
| know what is promised to work, and what happens outside | [docs/scope.md](docs/scope.md) — each promise with a one-line why and the file records that hold the details |
| change or analyse the core | [docs/scope.md](docs/scope.md), then [docs/files/](docs/files/index.md) (one record per file: what it does, why, the decisions it is home to) |
| see the overall shape | [docs/structure.md](docs/structure.md) (principles, who does what, the decision index) |
| know the wire format | [docs/protocol.md](docs/protocol.md) |
| review or verify it | [docs/review.md](docs/review.md) |
| see what is left to do | [docs/issues.md](docs/issues.md) |

## Glossary

| Term | In a word |
|---|---|
| **vent protocol** | the editor-neutral agreement between Tezcatl and an editor |
| **emacs-vent** | its Emacs implementation (vent-out: Emacs → outside, vent-in: outside → Emacs) |
| **relay** | the Elixir process that owns emacs-vent's single client slot, the PTYs, the files, the language servers |
| **panel** | one page (an editor, a terminal, a list …), alone in a window or inside a skin |
| **skin** | a page that holds panels; **frame** is the one to use (columns of panels and a dock) |
| **dock** | the part of the frame outside the columns: the map, the input line, the receiving side, … |
| **lead key** | `;` and one character: how the input line writes keys a browser would take (`;cx` is `C-x`) |
| **intent** | a named operation run in a backend (an Emacs form, a browser action), declared in JSON |
| **book** | a table kept in the work place (`~work/books/`): task_table and run_table edit books |
| **work place** | `~work/…` — Tezcatl's own files, outside the project (`~/.local/state/tezcatl/work/`) |

## License

- Tezcatl (this repository): MIT ([LICENSE](LICENSE))
- emacs-vent (separate repository): GPL-3.0-or-later
