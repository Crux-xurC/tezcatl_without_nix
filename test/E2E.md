# Tezcatl manual E2E

Two parts: **Phase 6** (input panel, below) and **Phase 8** (PTY terminal, at
the end of this file).

Automated coverage: `node --test test/*.test.js` (keymap / kbd / middleware /
protocol / pipeline) plus a wire-level check that `protocol.js`'s exact output
drives `find-file` through a live `emacs-vent-in` daemon.

## Phase 6 manual E2E

Automated coverage above. What still needs a
human and a real browser: the form field + parse preview, the `keydown` capture
layer, `preventDefault`, and the `emacs-vent-out` change-hooks actually firing
on redisplay.

## Setup

Terminal 1 — Emacs with a real frame (the change-hooks need redisplay, so a
frameless `--daemon` is not enough):

```
cd ~/dev/emacs-vent
nix develop
e            # emacs -Q + emacs-vent loaded + emacs-vent-mode on
```

Terminal 2 — serve Tezcatl:

```
cd /path/to/tezcatl
nix develop
t            # pages :4001 + relay :4100 (emacs-vent on :4000 is started on its own)
```

With the relay in front, multiple panel windows share the one emacs-vent slot.
`main.html` itself opens no socket — it just spawns `panels/*.html` windows.
Open them from `main.html` (`new input` / `new output` / `xterm`), or open the
`panels/*.html` pages directly.

## Input panel: three modes

- **Form** (default) — compose a `kbd`-notation description, review the parsed
  preview, then **S-Enter** / **Send** transmits it as ONE `{"kind":"input"}`
  message. **Plain Enter** appends a ` RET ` token. ArrowUp/Down recall sent
  lines.
  - **Form capture**: the field auto-captures keys while focused (green border +
    `⌨ capturing` hint). A real chord (`C-f`, `M-x`), a function key, or
    Home/End/PageUp/PageDown is intercepted — `preventDefault`, so Ctrl+F etc.
    never trigger the browser — and appended as notation. Bare typing still goes
    in as text (so `/tmp/x`, `M-x` names, `M-:` expressions type normally).
    **Esc** = capture OFF + leave the field. **Tab** = toggle capture, stay in
    the field. **Tab from outside** the field = focus it. All keyboard, no mouse.
- **Live** — click the mode button; then every keystroke is captured and sent
  immediately. Escape toggles capture (this machine's Fn+CapsLock emits Escape);
  `C-[` is how ESC / Meta-prefix reaches Emacs.
- **Text** — click the mode button; paste or type a raw block into the textarea.
  The preview shows `N chars → M events` (plus `(K dropped)` for control chars).
  **S-Enter** / **Send** transmits it as ONE `{"kind":"input"}` message, one
  event per character (`\n`→`<return>`, `\t`→`<tab>`, other C0 dropped). **Plain
  Enter is a newline.** No prefix and no trailing `RET` are added — type the
  `M-x` / `M-:` / `RET` yourself, or (later) let the middleware add them.

## Acceptance scenario (Form mode)

Expected: `C-x C-f` → `find-file` → minibuffer → context shows the minibuffer →
type a name → `RET` → context returns to the new buffer.

1. `main.html` output panel shows `hello` then a `context` line; the target
   block shows the buffer in Emacs's selected window (`*scratch*` or similar),
   plus `win-N` / `frame-N`.
2. In the input field, **press `Ctrl+X` then `Ctrl+F`** (real keys — the field
   is capturing). Field becomes `C-x C-f `, preview shows `C-x C-f   (2 events)`,
   and the browser does NOT open its own find bar. Press **S-Enter** (or Send).
   - Input panel logs `→ C-x C-f   {"kind":"input","sequence":[…]}`.
   - Emacs opens the `Find file:` minibuffer.
   - (Typing the literal notation `C-x C-f` still works too — bare characters
     pass straight through.)
3. Output panel: a new `context` line; target block now shows
   `buffer-name:  *Minibuf-1*` (window/frame may change too).
4. Type `/tmp/x` in the field, then press **Enter** → field becomes
   `/tmp/x RET `. Preview shows `/ t m p / x <return>   (7 events)`. Press
   **S-Enter**.
   - Input panel logs the 7-event message.
   - Emacs opens the file; output panel shows a `context` line with the new
     buffer as the target.
   - (Or do it in one go: `C-x C-f /tmp/x RET` then S-Enter.)

## Also check

- **Parse errors**: type `<f13>` or `C-foo` → preview turns red
  (`parse error: …`), S-Enter logs `(not sent: …)`, nothing goes to Emacs.
- **Not connected**: stop Emacs, Send with capture/form → input panel logs
  `✗ not connected`; status shows `disconnected`; on restart it reconnects and
  a fresh `context` arrives.
- **`C-[`** (Form: press `Ctrl+[`, or type `C-[`, then Send) →
  `{"key":"[","modifiers":["control"]}` — this is how to get ESC / Meta-prefix
  into Emacs.
- **Form capture browser-shortcut suppression**: with the field focused, press
  `Ctrl+F`, `Ctrl+P`, `Ctrl+S`, `Ctrl+G` → each appends a token (`C-f` `C-p`
  `C-s` `C-g`), none triggers the browser. (`Ctrl+W` / `Ctrl+T` / `Ctrl+N` can
  NOT be suppressed by any web page — known, overview.md §7.3.)
- **Form capture exits**: press `Esc` → border goes grey, `capture OFF` in the
  log, focus leaves the field; now `Ctrl+F` opens the browser find bar. Press
  `Tab` → focus returns, border green again. Press `Tab` while focused → toggles
  capture without moving focus.
- **Form bare typing under capture**: with capture ON, type `/tmp/x` → the field
  shows `/tmp/x` (characters, not spaced tokens); preview `/ t m p / x
  (6 events)`.
- **Live mode**: switch to Live, capture ON, press `C-x` `C-f` — same result,
  one message per keystroke. Lone `Shift` / `Insert` → `(dropped: …)`,
  `*emacs-vent-log*` stays clean.
- **Text mode**: switch to Text. In Emacs `C-x C-f` a scratch path first (so the
  minibuffer is the target). Type `M-x` notation is NOT used here — instead:
  - paste `insert-char` into the textarea, press **S-Enter** → the minibuffer
    fills with `insert-char` (one self-insert per char); Emacs does not run it
    until you send a `RET` (Form mode, or another Text send of just a newline).
  - a block with a real space, e.g. `(message "a b")`, round-trips — the space
    is `{"key":" "}` and Emacs inserts it (regression guard for the
    `emacs-vent-in` `SPC` fix).
  - a line with a leading tab and a trailing newline → `<tab>` then `<return>`
    events; control bytes like `^L` are silently dropped (preview shows
    `(1 dropped)`), `*emacs-vent-log*` stays clean.
- **Standalone `input.html`**: Text mode works there too (it loads `text.js`).
- **Live shift folding**: `S-a` → `{"key":"A","modifiers":[]}`; `S-<F5>` →
  `{"key":"f5","modifiers":["shift"]}` (Form mode passes `S-a` through as
  `{"key":"a","modifiers":["shift"]}` — deliberate, notation is literal).
- **Standalone pages**: `panels/resident/output.html` alone still shows context + event
  log; `panels/resident/input.html` alone still sends and shows the current target
  one-liner.

> NOTE: the Phase 6 steps above still say "main.html output panel". Since the
> launcher refactor that means **the `panels/resident/output.html` window** you opened
> from `main.html` (`new output`). A full rewrite of this section is pending.

---

## Phase 8 manual E2E — PTY terminal (`panels/resident/xterm.html`)

Design and decisions are canonical in the head comment of `panels/resident/xterm.html`.
emacs-vent is **not** needed for the PTY path (it is a separate protocol on
`/pty`), though Poca's box usually starts it too.

Setup: `cd /path/to/tezcatl && nix develop`, then `t --no-auth`. Open the terminal
window from `main.html` with **`xterm window`** (or `xterm` for a tab), or open
`http://127.0.0.1:4001/panels/resident/xterm.html` directly.

Check:

1. A shell prompt appears; the status bar shows
   `connected — bash -l  (COLS×ROWS)`.
2. `ls --color=auto` shows colour; `tput colors` → `256` (isatty is true).
3. `sleep 100`, then `Ctrl-C` interrupts it (xterm sends `\x03` → PTY ISIG →
   SIGINT; `pty_echo` keeps ISIG on).
4. Type Japanese text — columns do not drift (`addon-unicode11` active). If
   box-drawing drifts, that is the nvim-side `ambiwidth` gap (xterm.html
   comment E), not a bug here.
5. Resize the window → `tput cols` / `tput lines` follow (debounced `resize`).
6. `nvim` starts and full-screen redraw is intact; `:q` returns to the shell.
   This is the user's own `nvim` (whatever is on PATH) — Tezcatl ships no
   editor and wires none (overview.md §10).
7. `exit 3` → status shows `shell exited (code 3)`, input is disabled
   ("Reload for a new one").
8. Close the window → no orphaned `bash` / child processes (`ps` /
   `pgrep -af bash`).
9. **Start-failure surface** (1-C fix): set `pty.shell` in `config.json` to
   `["/no/such/bin"]`, reload → status shows
   `could not start the shell: cmd not found on PATH: "/no/such/bin". Fix
   config.json and reload.` (the `error` control message), input disabled.
   Restore `config.json` afterwards.
10. **Signal-exit code** (1-A fix): run `kill -KILL $$` inside the shell (an
    interactive bash ignores SIGTERM, so use SIGKILL) → status shows
    `shell exited (code 137)` (128 + SIGKILL), not a silently dropped socket.
    This exercises `sig_to_int/1` on an atom signal name (`:sigkill`).
11. **Environment** (overview.md §4.3). In the PTY:
    - `echo $TERM` → `xterm-256color` (declared by the relay via erlexec `:env`,
      not inherited from the terminal that ran `relay`).
    - `type -a nvim` → resolves to the user's normal `nvim`. The PTY runs a
      login shell (`bash -l`) and inherits the relay's PATH, so what you get is
      the same `nvim` a normal login terminal would (Tezcatl adds nothing).
    - `nvim` shows syntax colour (256-colour terminal + a real tty).
    - `echo "$-"` contains `i` and the environment looks like a login shell
      (`/etc/profile` + `~/.bash_profile` applied).

---

## Relay Origin gate (manual) — `lib/relay/allowed_origins.exs`

The relay checks the handshake `Origin` on all three routes (`/`, `/pty`,
`GET /windows`). Not auth (overview.md §1): it stops an unrelated browser tab
from scripting `new WebSocket("ws://127.0.0.1:4100/pty")`. A client that sends
no `Origin` (non-browser) is allowed on purpose.

Setup: `cd /path/to/tezcatl && nix develop`, then `t --no-auth` (or `relay --no-auth`).

(a) **Normal browser use still works.** Open `panels/resident/xterm.html` and
    `panels/resident/input.html` from `main.html` (served on `:4001`). Both connect —
    xterm shows a prompt, input panel shows `connected`. The page Origin is
    `http://127.0.0.1:4001`, which is on the default allow-list.

(b) **A foreign Origin is refused with 403 on both WS routes.** With the relay
    up:

    ```
    for path in / /pty; do
      curl -s -o /dev/null -w "$path -> %{http_code}\n" --max-time 3 \
        -H "Connection: Upgrade" -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Version: 13" \
        -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
        -H "Origin: http://evil.example" "http://127.0.0.1:4100$path"
    done
    ```

    Both print `403`. The relay log shows
    `pty: rejecting handshake, disallowed Origin "http://evil.example"` and the
    `browser:` equivalent. Repeat with `-H "Origin: http://127.0.0.1:4001"` →
    both print `101`. `GET /windows` with `-H "Origin: http://evil.example"`
    sends **no** `access-control-allow-origin`; with an allow-listed Origin it
    echoes that exact value plus `vary: origin`.

(c) **A client with no `Origin` header still connects.** Drop the `-H
    "Origin: ..."` line from the command above → both routes print `101`. This
    is the `test/` Node WS client / `run.sh` wire-level path: it must keep
    working (rationale in the `AllowedOrigins` moduledoc).

(d) **Override.** Restart the relay with
    `TEZCATL_ALLOWED_ORIGINS="http://127.0.0.1:5000" relay` → an `Origin` of
    `http://127.0.0.1:5000` now gets `101`, and the former default
    `http://127.0.0.1:4001` now gets `403` (the env var *replaces* the default
    list, it does not add to it). Needed only when SSH-forwarding to a
    different local port than the origin server's (overview.md §1).

---

## `DELETE /windows/:id` (manual) — `lib/relay/windows_handler.exs`

Evicts the browser vent connection that announced `?id=<id>` on its WS
upgrade URL (`GET /windows` lists the ids). ExUnit covers `VentUplink.evict/1`
and the 4000-close reply (`test/relay/windows_delete_test.exs`); this checks
the HTTP surface and the browser-visible effect.

Setup: `t --no-auth` (or `relay --no-auth`), then open one or two `panels/resident/input.html` /
`panels/resident/output.html` windows from `main.html` so the registry is non-empty.

(a) **Evict a real connection.**

    ```
    curl -s http://127.0.0.1:4100/windows            # copy an id from "windows"
    curl -s -X DELETE -H "Origin: http://127.0.0.1:4001" \
      -w "\n[%{http_code}]\n" http://127.0.0.1:4100/windows/<that-id>
    ```

    Prints `{"evicted":true,"id":"<id>","name":"<name>"}` and `[200]`. The
    relay log shows `vent uplink: evict "<name>" ... -- asked to close` then
    `-browser "<name>"`. In the browser, that page's socket closes with code
    `4000`; `GET /windows` no longer lists the id. (A page acting on the 4000
    code — self-close instead of reconnect — is `panel-frame.js`'s job, added
    with the skin work; a plain `panels/*.html` today just reconnects.)

(b) **Unknown id → 404, nothing disturbed.**
    `curl -s -X DELETE -H "Origin: http://127.0.0.1:4001" -w "\n[%{http_code}]\n" http://127.0.0.1:4100/windows/c-nope`
    → `{"evicted":false,"id":"c-nope"}` and `[404]`. Other windows stay up.

(c) **A connection with no `?id=` is not addressable.** `panels/resident/xterm.html`
    and any `panels/*.html` opened without `?name=` connect unlabelled
    (`id` is `null` in `GET /windows`). There is no id to `DELETE` — such a
    connection can only be closed by closing its window.

(d) **Origin gate (mutating route, unlike GET).**
    `curl -s -X DELETE -H "Origin: http://evil.example" -w "\n[%{http_code}]\n" http://127.0.0.1:4100/windows/x`
    → `forbidden origin` and `[403]`; relay logs
    `windows: rejecting DELETE, disallowed Origin "http://evil.example"`.
    Drop the `-H "Origin: ..."` (headerless, non-browser) → the request is
    allowed and answers `404` for a missing id. A browser preflight
    `curl -s -D - -X OPTIONS -H "Origin: http://127.0.0.1:4001" http://127.0.0.1:4100/windows/x`
    → `204` with `access-control-allow-methods: GET, DELETE, OPTIONS` and the
    echoed `access-control-allow-origin`.

(e) **Wrong method.** `curl -s -X POST -w "\n[%{http_code}]\n" http://127.0.0.1:4100/windows/x`
    → `{"error":"method not allowed"}` and `[405]` with `allow: GET, DELETE, OPTIONS`.

---

## `GET /fs` + `/fs/read` — endpoint ③ (read-only) — `lib/relay/fs_handler.exs`

Path-escape validation is ExUnit (`test/relay/fs_validate_test.exs`); this
checks the cowboy-req surface. Relay up (`t` or `relay`); the root is
`TEZCATL_FS_ROOT` or the relay's cwd (the repo root under `t`).

(a) **Directory listing.**
    `curl -s http://127.0.0.1:4100/fs | python3 -m json.tool`
    `curl -s "http://127.0.0.1:4100/fs?path=lib/relay" | python3 -m json.tool`
    → `{"path":"lib/relay","entries":[{"name":...,"dir":bool,"size":int}, ...]}`,
    dirs first then by name. No `path` = the root (`"path":""`).

(b) **File bytes.**
    `curl -s "http://127.0.0.1:4100/fs/read?path=config.json"` → the raw file,
    `content-type: text/plain; charset=utf-8`. A directory → `[400]`
    `{"error":"not a directory"}`... `not a regular file`; missing → `[404]`;
    over 5 MiB → `[413]`.

(c) **Escape / bad path → 400 (not 404).**
    `curl -s -w " [%{http_code}]\n" "http://127.0.0.1:4100/fs?path=../etc" -o /dev/null` → `[400]`
    `curl -s -w " [%{http_code}]\n" "http://127.0.0.1:4100/fs?path=/etc/passwd" -o /dev/null` → `[400]`
    (`{"error":"path escapes the root"}` / `"path must be relative to the root"`).

(d) **CORS (read = permissive, like `GET /windows`).**
    `curl -s -D - -o /dev/null http://127.0.0.1:4100/fs -H "Origin: http://127.0.0.1:4001"`
    → `access-control-allow-origin: http://127.0.0.1:4001`. With
    `-H "Origin: http://evil.example"` → still `200`, no ACAO header (the
    browser blocks its own read). Preflight
    `curl -s -D - -X OPTIONS -H "Origin: http://127.0.0.1:4001" http://127.0.0.1:4100/fs`
    → `204` + `access-control-allow-methods: GET, PUT, POST, DELETE, OPTIONS`.

(e) **Wrong method.**
    `curl -s -X DELETE -w "\n[%{http_code}]\n" http://127.0.0.1:4100/fs` → `[405]`
    `{"error":"method not allowed"}`, `allow: GET, PUT, POST, DELETE, OPTIONS`.

---

## `PUT /fs/write` — endpoint ③ (write) — `lib/relay/fs_handler.exs`

Mutating, so **Origin-gated like `DELETE /windows`** (not permissive like the
reads). No new pure logic (`FsValidate.resolve` is shared with the reads and
covered by `test/relay/fs_validate_test.exs`); this is the cowboy surface plus
the browser save round-trip. Relay up; `TEZCATL_FS_ROOT` or cwd is the root.
**Point it at a scratch dir** (`TEZCATL_FS_ROOT=/tmp/x relay`) so the tests do
not scribble on the repo.

(a) **Write a file.**
    `curl -s -X PUT -H "Origin: http://127.0.0.1:4001" -H "content-type: text/plain" --data-binary $'hello\nline2\n' -w "\n[%{http_code}]\n" "http://127.0.0.1:4100/fs/write?path=wtest.txt"`
    → `{"ok":true,"path":"wtest.txt","bytes":12}` and `[200]`. `POST` works the
    same. `curl -s "…/fs/read?path=wtest.txt"` reads it back verbatim
    (in-place truncate + write — existing content is replaced, not appended).

(b) **Escape / bad path → 400 (not 404), nothing written.**
    `curl -s -X PUT -H "Origin: http://127.0.0.1:4001" --data-binary x -o /dev/null -w "[%{http_code}]\n" "http://127.0.0.1:4100/fs/write?path=../escape.txt"` → `[400]`
    (`{"error":"path escapes the root"}`), and no `escape.txt` outside the root.

(c) **Directory target → 400.**
    `curl -s -X PUT -H "Origin: http://127.0.0.1:4001" --data-binary x -w "\n[%{http_code}]\n" "http://127.0.0.1:4100/fs/write?path=."`
    → `[400]` `{"error":"path is a directory"}`.

(d) **Over 5 MiB → 413.**
    `head -c 6000000 /dev/zero | curl -s -X PUT -H "Origin: http://127.0.0.1:4001" --data-binary @- -o /dev/null -w "[%{http_code}]\n" "http://127.0.0.1:4100/fs/write?path=big.bin"`
    → `[413]` `{"error":"body too large"}`, nothing written.

(e) **Origin gate (mutating route).**
    `curl -s -X PUT -H "Origin: http://evil.example" --data-binary x -o /dev/null -w "[%{http_code}]\n" "http://127.0.0.1:4100/fs/write?path=wtest.txt"`
    → `[403]` `forbidden origin`; relay logs
    `fs: rejecting write, disallowed Origin "http://evil.example"`. Drop the
    `-H "Origin: …"` (headerless, non-browser) → the write is **allowed** (a
    local process can already write the file directly — same rationale as the
    other routes). Preflight
    `curl -s -D - -X OPTIONS -H "Origin: http://127.0.0.1:4001" http://127.0.0.1:4100/fs/write`
    → `204` + `access-control-allow-methods: GET, PUT, POST, DELETE, OPTIONS`.

(f) **Browser save (`code_editor` writes itself → ③ → `code.saved`).** (Changed
    2026-10-06: the editor does the `PUT /fs/write`; `code.save-request` and the
    "only the feeder writes" ledger are gone.) Open a file in `code_editor` (tree
    `Enter`/`o`, `:e <path>`, or `code_editor.html?path=<path>`). Edit; the `●`
    dirty dot appears. Type **`:w`** (there is no save key since 2026-10-25): the head flashes `saving…`
    then `saved <path>`, and the `●` **clears**. The file on disk now holds the
    new text, and an Emacs with `global-auto-revert-mode` picks it up. Type more
    *before* the save confirms → those edits stay dirty. Closing the window that
    opened the file does not matter.

(g) **A file changed on disk is not overwritten.** With the file open and
    clean, change it behind the editor's back (`echo x >> <file>`), edit, then
    `:w` → the head says the disk version changed since it was opened and
    nothing is written (the relay answered 409 `changed` to the
    `x-tezcatl-base` hash). `:w!` writes anyway, `:e!` reads the disk again.
    Automated: `test/e2e/code_files.mjs`.

---

## `/lsp` — language-server multiplexer — `lib/relay/lsp_*.exs`

The relay runs one language server per `(projectRoot, serverId)` and fans it
out to every browser consumer (`lsp.json` maps a `code-languages.js` id to a
`--stdio` server command). Pure parts are ExUnit
(`test/relay/lsp_framing_test.exs`, `lsp_config_test.exs`); this is the socket
surface + a real server.

`GET /lsp/servers` is permissive CORS (like `GET /windows`);
`DELETE /lsp/servers/:key` is Origin-gated (like `DELETE /windows/:id`).

### Error paths (no server binary needed) — verified

Relay up (`t` or `relay`), `TEZCATL_FS_ROOT` = repo root. A tiny WS client
(`node` has a built-in `WebSocket`):

```
node --input-type=module -e '
const ws = new WebSocket("ws://127.0.0.1:4100/lsp");
ws.onopen = () => ws.send(JSON.stringify({kind:"attach", path:"lib/core/kbd.js", lang:"python"}));
ws.onmessage = e => { console.log(String(e.data)); ws.close(); };'
```

- `lang:"python"` (no `lsp.json` entry) → `{"kind":"error","reason":"no LSP server configured for language \"python\" (lsp.json)"}`, socket closes.
- `path:"../etc/passwd"` → `{"kind":"error","reason":"path escapes the root"}`.
- `lang:"javascript"` with no `typescript-language-server` on PATH →
  `{"kind":"error","reason":"LSP command not found on PATH: ..."}`.
- a first frame that is not an attach → `{"kind":"error","reason":"send an attach message first"}`.

### Happy path — verified against `typescript-language-server` 6 + `typescript` 5

Setup: `typescript-language-server` on PATH, and the **project** needs a
usable `typescript` (a `node_modules/typescript` with `lib/tsserver.js` —
`typescript@5.x`, *not* the `7.x` native-port preview, which has no
`tsserver.js` and makes `initialize` fail). A JS/TS project normally has it as
a devDep; otherwise put `"initializationOptions": {"tsserver": {"path": "…/typescript/lib"}}`
in that server's `lsp.json` entry.

Over `/lsp` (a `node` script with the built-in `WebSocket`; relay
`TEZCATL_FS_ROOT` = the project):

1. `{"kind":"attach","path":"main.js","lang":"javascript"}` →
   `{"kind":"attached","rootUri":"file://<root>","serverId":"javascript","uri":"file://<root>/main.js"}`.
   Root = nearest ancestor with `tsconfig.json`/`jsconfig.json`/`package.json`/`.git`.
2. Send an LSP `initialize` request → a **result with `capabilities`** comes
   back, and the relay did **not** forward it (it answers from its own cached
   one). Send `initialized`, then `textDocument/didOpen` for the file with a
   syntax error (`let q = ;`) → a `textDocument/publishDiagnostics` arrives:
   `["Expression expected.", "Cannot find name '…'."]`.
3. `textDocument/hover` (id `"hov"`) → the reply comes back with the **same
   id** (`"hov"`) and markdown `contents` — the relay remapped the id out to a
   global int for the server and back.
4. `GET /lsp/servers` → one row
   `{"key":"<b64url>","root":"…","serverId":"javascript","status":"ready","consumers":1,"docs":1,"pid":<n>}`.
5. Open a **second** `/lsp` connection, attach the same file → `GET /lsp/servers`
   shows `"consumers":2` with the **same `pid`** (shared). Close the first →
   `"consumers":1`, `"docs":0` (its `didOpen` was refcounted; the relay sent
   `didClose` to the server). Close the last → after ~45 s the server shuts
   down and drops from the list.
6. **Init failure surfaces.** With a broken `typescript` (or none), `initialize`
   returns an **error** to the consumer (not an empty success), `GET
   /lsp/servers` shows `"status":"failed"`, and the relay logs
   `lsp[…]: server rejected initialize: …`.
7. `DELETE /lsp/servers/<key>` (Origin `http://127.0.0.1:4001`) →
   `{"stopped":true,…}` and the server stops now; a bad key → `[404]`; a
   disallowed Origin → `[403]`.

### The `lsp` manager panel

Open `panels/tool/list.html?config=lsp` (`lsp` in the `main.html` / `launcher.html`
form). It polls `GET /lsp/servers` every 1.5 s. With a `code_editor` pane editing a
`.js` file elsewhere, a row appears:
`javascript  …/scratchpad/jsproj   ready · 1 pane · 1 doc · pid <n>`.
`Del` on the row → `DELETE /lsp/servers/<key>`, the row goes `stopped …` in the
foot and drops on the next poll; the editor re-attaches (and restarts it) on
its next edit. `Enter` just prints the row's root/status/key to the foot.
Unit-tested: `test/list-kinds.test.js` (`lsp.fill` row mapping, `lsp.remove`
DELETE).

### Browser side — the editor's own `/lsp` consumer — verified

`code-editor.js` opens the `/lsp` socket, wraps it as an `LSPClient` transport
and lets `@codemirror/lsp-client` drive it. Verified 2026-09-11 against a real
`typescript-language-server` 6 + `typescript` 5.9, driving headless Chromium
over CDP (`TEZCATL_FS_ROOT` = a scratch `jsproj/` whose `main.js` has
`let q = ;`):

- a skin/tree posting `code.set { text, filename }` addressed to the editor
  frame → `attachLsp` opens `ws://<relay>/lsp`, sends `{kind:"attach"}`, gets
  `{kind:"attached"}`;
- `@codemirror/lsp-client` then does `initialize` (answered from the relay's
  cache, id remapped) → `initialized` → `textDocument/didOpen`;
- `textDocument/publishDiagnostics` ("Expression expected.") lands as a
  `.cm-lint-marker` (gutter + inline) and the head shows `lsp javascript`;
- `GET /lsp/servers` shows `consumers:1 / docs:1 / status:ready`; closing the
  pane drops it (`no consumers, shutting down`).

**Needs `serverDiagnostics()`** in `new LSPClient({ extensions: [...] })` —
`languageServerSupport()` alone gives completion / hover / signature help but
not diagnostics (see `lib/vendor/codemirror/README.md`).

**Still by hand**: hover tooltip and server completion in a real browser
(the wire capabilities are there; only the render was not scripted here).

## `code.html` (viewer) + `code_editor.html` (editor) — `lib/code/code-editor.js`

CodeMirror is only exercised here (the unit tests are pure — `node --test`
covers `lib/code/code-languages.js`, not the editor). Pages up (`t`, or
`python3 -m http.server 4001`). Both pages share `lib/code/code-editor.js`
(`createCodeEditor`); `code.html` calls it `editable:false`, `code_editor.html`
adds `vim()` + the kill-ring bridge (saving is `:w`).

(a) **Viewer is read-only.**
    Open `http://127.0.0.1:4001/panels/resident/code.html?lang=python`. The head shows
    `code · python · view`. Type — nothing is inserted, no cursor caret in the
    doc. In devtools console:
    `Tezcatl.bus.post('code.set', { text: 'def f():\n    pass\n', filename: 'a.py' })`
    → text appears, Python highlighting, still not editable. A
    `code.set { text, readOnly:false }` is **ignored** — still read-only.

(b) **Editor edits, tracks dirty, resets on `code.set`.**
    Open `http://127.0.0.1:4001/panels/resident/code_editor.html?lang=javascript`. Vim
    status bar at the bottom; starts in normal mode. `i`, type, `Esc` — edits
    land. The `●` dirty dot appears on first change. Console:
    `Tezcatl.bus.post('code.set', { text: 'const x = 1\n', filename: 'b.js' })`
    → doc replaced, dirty dot clears, and `u` (undo) cannot walk back past the
    load (history was dropped).

(c) **Save with no path.**
    In a bare `code_editor.html` (no `?path=`, nothing set with a filename), edit,
    then `:w`. The
    head says there is nowhere to save (`nowhere to save (a text with no path)`). With a path, see
    the `PUT /fs/write` section (f) above.

(d) **`code.get` round-trips.**
    With a listener `Tezcatl.bus.on('code.text', console.log)`, send
    `Tezcatl.bus.post('code.get', {}, { to: '<frame-id>' })` (or from another
    panel) → reply `{ name, text, dirty, language }`.

(e) **Single vs double Escape.**
    In `code_editor.html` insert mode: one `Esc` → vim normal (stays in the
    panel). Two quick `Esc` → panel-frame posts `yield` (a skin would open the
    navigator). `code.html` has no vim: one `Esc` does nothing, double `Esc`
    still yields.

(f) **Kill ring (editor only).**
    In `code_editor.html` with the invisible `killring.html` mounted by a skin
    (or open `panels/invisible/killring.html` in another tab on the same
    origin): `yy` → a `killring.add` fires (watch
    `Tezcatl.bus.on('killring.add', console.log)`). `Esc y` opens the picker
    in a skin; choosing an entry posts `killring.yank` back and it lands via a
    real vim `p`.

(g) **Tree / skin wiring still points at the editor.**
    In `panels/skins/basic.html`, `Esc Esc` → navigator → open `tree`. Enter
    on a file → a `code_editor` pane appears on the right with the file loaded
    (not `code.html`). `o` in the tree opens a standalone `code_editor.html`
    window fed the same way.

(h) **`code.json` knobs.** `code-editor.js` fetches `code.json` (repo root) on
    start and live-reconfigures. Edit `code.json` `"tabSize": 8` and reload
    `code_editor.html?lang=go` (or set a doc with real tabs via `code.set`) → tabs
    render 8 wide. `"lineWrapping": true` → long lines wrap. `"fontSize": 18`
    → bigger text. `"fontFamily": "monospace"` is the default (no visible
    change from before this landed). `"keymap": "default"` → `code_editor.html`
    **still gets vim** (the page pins `keymap:"vim"`); a hypothetical editor
    page that does not pin picks up the config value. `?keymap=default` on
    `code_editor.html`'s URL overrides the pin. From devtools:
    `Tezcatl.bus.post('code.configure', { tabSize: 4, lineWrapping: true }, { to: '<frame-id>' })`
    applies without a reload.

(i) **`autosave`.** `code.json` `"autosave": 800` → in a `code_editor` pane that
    was fed a file (so it has a path), the editor saves itself 800 ms after
    you stop typing (watch the relay log for `PUT /fs/write`); the `●` dot
    clears when the write succeeds. A scratch editor (no path) never
    autosaves. `"autosave": false` (default) → `:w` only.

## `ui.startup.windows` — open a set of windows on launch — `main.html`

`config.json` `ui.startup.windows` is `[{ id, mode?: "tab"|"window", name? }]`
where `id` resolves via `list_kinds/panels_and_skins.json`. `main.html` opens
them **once per tab lifetime** (a `sessionStorage` guard), with a stable window
name per entry. Pages up (`t`, or `python3 -m http.server 4001`).

(a) **Empty default → nothing opens.** Fresh `config.json` ships
    `"windows": []`. Load `main.html` → only the launcher, no extra windows.

(b) **A configured set opens on first load.** Set
    `"windows": [{ "id": "tree" }, { "id": "code_editor", "name": "work" }, { "id": "xterm", "mode": "window" }]`
    and load `main.html` in a fresh tab → three windows/tabs open (`xterm` as a
    `width=1200,height=800` popup, the others per `launcher.open-mode`). If the
    browser blocks the popups, the launcher error line shows
    `N startup window(s) were blocked -- allow pop-ups for this origin.`.

(c) **Reload does not duplicate.** With those three open, reload `main.html`
    (same tab) → nothing new opens (`sessionStorage` guard). Close one of the
    three, then open `main.html` in a **new** tab → the set opens again, and
    the two still-open windows are refocused (stable names) rather than
    duplicated; only the closed one respawns.

(d) **Unknown id is skipped.** Add `{ "id": "nope" }` to the list → the other
    entries still open, no error thrown.

## `main.html` launcher — the embedded page list

The `panels_and_skins` adapter's URL/mode building is unit-tested
(`test/list-kinds.test.js` `_pagePlan` / `onSelect` / `onKey`); this is the
browser side — the user gesture and cross-frame `launcher.fill`. Pages up
(`t`, or `python3 -m http.server 4001`); nothing else need run.

(a) **A second selection still works (the focus-steal regression).**
    Open `http://127.0.0.1:4001/main.html`. In the embedded list, arrow to an
    item and press `Enter` → it opens in a new tab, and the left-hand form
    shows that id. Switch back to `main.html`, and **without clicking the
    list**, arrow to another item and press `Enter` → it also opens. Before
    the fix, focus jumped to the form on the first selection, so the second
    arrow/Enter went to the form and nothing opened.

(b) **Click opens too; the form is not focus-stolen.**
    Click a list row → opens in a tab, form mirrors the id, and the caret does
    **not** jump into the form (you can keep arrowing the list).

(c) **`M-t` / `M-w` force tab / window.**
    `M-t` on a row → new tab. `M-w` → a `width=1200,height=800` popup window
    (from `open.windowFeatures`). Both also mirror the id into the form.

(d) **Popup blocked → retry from the form.**
    If the browser blocks the popup, the list foot shows `popup blocked: …`
    and the form still holds the id; pressing the form's **open** button
    (a real gesture) opens it.

(e) **Form still takes free-form input.**
    Type `output window` / an alias (`term`, `llm`, `codevi`) / `killring` in
    the form and `Enter` → resolves via the manifest and opens.
