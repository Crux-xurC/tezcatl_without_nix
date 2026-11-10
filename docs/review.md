# Review

How to review Tezcatl or verify it against its documents — with an AI or alone. Two kinds of work: **reviewing** (finding bugs against
[scope.md](scope.md)) and **verifying** a file (reading its code cold and writing what it really does into its record in
[files/](files/index.md)).

## Reviewing

Read [scope.md](scope.md) first. What happens outside the scope exactly as written there is not a bug; its "How to read it" says when it may
still be reported. Tests to run:

```
node --test test/*.test.js     # browser-side unit tests; starts nothing
./test/run-relay.sh            # the relay's ExUnit tests
```

End-to-end checks in a real headless browser, isolated from the real ports, are in [test/e2e/README.md](../test/e2e/README.md).

## Verifying a file

The goal is to find where the documents and the code disagree. **When they do, trust the code and fix the document**, keeping the
disagreement in the record's notes (git records the fix itself).

### What a record's verification notes say

- **Spec** — not *what* it does but *why it has this shape* (what it does is the one line in the index)
- **Does not** — what it could do here but does not: a record of the boundary
- **Pitfalls** — the non-obvious things only reading the code reveals; what others ask first
- **Difference from the design** — where the documents and the code disagree; "none" if none
- the date and commit of the verification (what changed is git's)

### Order of what to hand over (one session = one to three files; no conversation carried over)

| # | Hand over | Notes |
|---|---|---|
| 1 | [README.md](../README.md) | once, at the start of a session |
| 2 | [structure.md](structure.md) §2 (who does what) | every time |
| 3 | **only the decisions concerned** | the record's "Decisions homed here" / "Takes part in" names them |
| 4 | [protocol.md](protocol.md) | **only for files touching the protocol**: `protocol.js`, `text.js`, `kbd.js`, `keymap.js`, `vent-init.js`, `input-panel.js` |
| 5 | the file's one line from the index | its notes stay hidden |
| 6 | the code and its tests | the tests read better as a spec than the code alone (`text.js` + `test/text.test.js`) |
| 7 | → ask for the notes | |
| 8 | **only now show the record's earlier notes** | ask for the differences |
| 9 | add the commit and write the notes back into the record | |

### Why the notes come last

Earlier notes are what someone expected or wrote while building. Shown first, an AI goes looking for those items and says "it matches"; what
is not written is never found. If `vent_uplink.exs` actually peeked at `kind`, a note saying "it does not decode" shown first would be read
as true. **What a cold reading does not bring up is either missing from the code or missing from its comments — both worth recording.** For
the same reason, notes written by whoever built the file are provisional until a cold reading confirms them.

### Suggested reading order

- **The relay**, along its start-up: `main.exs` → `allowed_origins.exs` → `vent_uplink.exs` → `browser_socket.exs` → `pty_socket.exs` →
  `windows_handler.exs` …
- **The browser**: `config.js` and `ws.js` **first** (everything goes through them), then `protocol.js` → `keymap.js` → `kbd.js` →
  `text.js` → `middleware.js` → `vent-init.js` → `input-panel.js` → `output-panel.js`
- **Pages and settings** last; `xterm.html` after the PTY files

### A preface to give an AI (copy it)

```
I am reading and understanding the code of a project called Tezcatl.
This session is for reading only. No code is changed.

I will hand over, in order:
1. the project's overview
2. who does what among its components
3. the design decisions concerning this file
4. where the file sits (its one line only)
5. the code

Please:
- read the code and write notes in this form:
  - Spec — not what it does but why it has this shape
  - Does not — what it could do here but does not
  - Pitfalls — non-obvious points you only see by reading
  - Difference from the design — where the documents I gave disagree with the code; "none" if none
- write "unknown" where you do not know; do not fill gaps by guessing
- if you notice bugs or improvements, do not propose fixes; state them as facts under Pitfalls
```

**Saying "reading only" matters**: understanding and changing are not mixed — a fix proposed while reading tends to be adopted unchecked and
taken back later ([structure.md](structure.md) §4).

### What a person prepares

What an AI cannot fill: the commit (`git rev-parse --short HEAD`), the date, and the test files.

### What this repository alone cannot decide

emacs-vent is another repository, so checks across both sides lack code: how `text.js` spells `\t` / `\n`, which `<name>`s `kbd.js` accepts,
whether `protocol.js`' output is accepted — each needs the special-key part of `emacs-vent-in.el`. For those files only, hand over just that
part from emacs-vent's side.

### Cautions while verifying

- **Do not send commands that can raise errors to a headless daemon.** `C-M-x` to a daemon without a frame runs `eval-defun` in `*scratch*`,
  `(read)` on an empty buffer hits `end-of-file`, the frameless daemon enters the debugger's recursive edit and the process dies — the same
  when pushed directly, not through vent-in, so **it is not vent-in's bug**. It does not happen with a live Emacs that has a frame; to keep
  checking headless, connect a real client first (`emacsclient -t` / `-c`)
- **emacs-vent-out's change hooks do not fire by themselves headless**: `--fg-daemon` without a frame does not redisplay; checking that they
  fire needs a real frame
- **Do not open the input and output pages directly against the same emacs-vent at once** (one client; the second is cut). Through the relay
  this limit goes away — the reason the relay exists ([D-single-client](files/lib-relay-vent_uplink.exs.md#d-single-client))
