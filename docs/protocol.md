# The vent protocol

What is sent, in what shape. This is the editor-neutral agreement; the inside of the Emacs side (emacs-vent) is documented in its own
repository. Only `flush` (§5) assumes the host has a command loop — that part is not editor-neutral. Why it has this shape: the decisions in
[structure.md](structure.md).

**Only this boundary is covered.** The PTY (②) and files (③) between Elixir and the browser are other protocols.

---

## 1. Transport

- One WebSocket, both ways
- The host is `127.0.0.1:4000`, **one client** (a second is closed at once)
- Through the relay, the relay holds that slot and browsers connect to the relay's port (4100 by default) ([D-single-client](files/lib-relay-vent_uplink.exs.md#d-single-client))
- One message = one text frame
- The top level is a JSON object, always with a string field `kind`

Serialisation is **JSON** for now. Principles 8 (transport apart from protocol) and 9 (JSON not an absolute premise) leave room to change it.

**Elisp's `nil` is ambiguous at the JSON border**: `json-serialize` turns a bare `nil` into `{}`, so where null is meant, `:null` is written
explicitly (an unresolved `source` …).

---

## 2. Host → outside (vent-out)

| kind | What |
|---|---|
| `hello` | the connection is up: `{"kind":"hello"}` |
| `context` | where input goes (§3) |
| `event` | something that happened in the host (§4) |
| `flush` | the command boundary of events (§5) |

On connecting: `hello`, then `context` (the initial target).

---

## 3. context

```json
{ "kind": "context", "buffer-name": "foo.el", "window": "win-3", "frame": "frame-1" }
```

| Field | What | Used for |
|---|---|---|
| `buffer-name` | the buffer's name | display; ` *Minibuf-N*` tells the minibuffer; `*Messages*` and the like tell "keys will be eaten as commands" (by a person looking) |
| `window` | `win-N` (a string id stable within the session) | display, following focus |
| `frame` | `frame-N` (likewise) | likewise |

- `window` / `frame` are stable ids through a weak hash: the same window keeps its id when its buffer changes
- **Sent only when a value changes** (compared with `equal` to the last one sent)
- **Outside the flush contract** (applied on arrival, not batched)

No more fields ([D-next-keystroke](files/lib-vent-output-panel.js.md#d-next-keystroke)). Emacs watches with `window-selection-change-functions`, `window-buffer-change-functions`,
`minibuffer-setup-hook`, and `post-command-hook` as a safety net (leaving the minibuffer with `C-g` is reported by none of the others); the
comparison with the last value sent keeps that from making context a per-command message.

Calling `emacs-vent-send-context` through `M-:` sends the current values unconditionally; a client that connects later fetches its initial
values this way ([D-stateless-relay](files/lib-relay-browser_socket.exs.md#d-stateless-relay)).

---

## 4. event

```json
{"kind":"event","source":…,"type":…,"content":…}
```

`source` is `:null` when it cannot be resolved.

| type | source | content | Notes |
|---|---|---|---|
| `message` | the caller, resolved | the formatted string (a reference envelope over the inline budget, §4.1) | `M-:`'s result comes back here |
| `compilation.started` | `"compilation"` | none | flushes itself |
| `compilation.output` | `"compilation"` | appended text (as above) | flushes itself |
| `compilation.finished` | `"compilation"` | the end message | flushes itself |
| `buffer.changed` | the caller, resolved | none | a notification only; not shown by receivers (boundaries are visible from flushes); which file changed is not told here |

There is no `eval.result` type for `M-:`; on a path where nothing catches it, the expression calls `message` itself ([D-single-input](files/lib-vent-protocol.js.md#d-single-input)).

### 4.1 Large content (not implemented)

When `content` is over the inline budget (a byte threshold), the text is not put on the wire but replaced by a **reference envelope**:

```json
{ "ref": "file", "path": "/…", "bytes": 123456, "preview": "the first few KB…" }
```

The receiver fetches the whole text through ③ (`GET /fs/read?path=`) into a viewer (`code.html`). How the referenced blob is made is the
host's business (emacs-vent would write a temporary file and send its path).

- The budget is each host's setting; on the browser's side `protocol.inlineMaxBytes` in `config.json`, tuned by the operator
- **Intent results (`tez:<corr>`) are not replaced**: the resolver reads `message`'s `content` inline with `/^tez:(\S+) (ok|err) (.*)$/`.
  Callers keep intent results within the budget; huge results need another mechanism (a temporary-file path, not implemented). If a host
  applies the budget, sender and receiver must agree on the envelope so the resolver can resolve it

---

## 5. flush

- The command boundary of events, sent at the end of the host's command loop
- Sources outside the command loop (process filters, timers) flush themselves
- Receivers collect events and commit them on `flush` (half states are never drawn)
- **context is not flushed**

Today a flush is sent even after commands with no events; an empty flush is a no-op for receivers (nothing to commit), so no harm. If the
wire's volume ever proves a problem, a dirty flag would suppress it.

**Hosts without a command loop**: sources outside the loop (process filters, timers, the dialogue bridge, compilation) already flush
themselves; a host without command boundaries uses only this self-flush (send events, then flush). Emacs is the only host so far.

---

## 6. Outside → host (vent-in): only `input`

```json
{"kind":"input","sequence":[{"key":"x","modifiers":["meta"]}]}
```

This is the only kind ([D-single-input](files/lib-vent-protocol.js.md#d-single-input)). Removed kinds: `clipboard` (merged into text sending), `eval` (`M-:` is enough).

### sequence

An array of InputEvents. No length limit is set (the cost of huge pastes is the general problem of large pastes).

- **One key at a time**: a sequence of length 1; a prefix (`C-x C-f`) goes as two messages, and whether the prefix completes is the host
  keymap's business
- **Together**: the built sequence in one message

### InputEvent

```
{ "key": <string>, "modifiers": [<modifier>] }
```

**`key`** is one of:

- one printable character (`"x"`, `" "`, `"あ"`, and a single code point outside the BMP such as `"😀"`)
- a special key name (below)

Other non-printable names are silently dropped by the sender.

**`modifiers`** is an array of `control` / `meta` / `shift` / `super`, in any order (Tezcatl writes control, meta, shift, super); may be
empty.

### Special key names (all of them)

```
return tab backspace delete escape
up down left right home end prior next
f1 f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12
```

`prior` / `next` are PageUp / PageDown. **There is no `space`**: it is sent as the one-character `" "`.

### Pitfalls in implementations

**Space**: on Emacs' side, a `key` of `" "` must become the `kbd` spelling `"SPC"` — `(kbd " ")` returns an empty sequence, so a bare `" "`
threw during injection and the whole message was lost. Fixed; before that, spaces could not be injected at all.

**Characters outside the BMP**: the sender iterates by code point, making one event. Emacs' `json-parse-string` gives a one-character Elisp
string and `(kbd "😀")` returns a single self-inserting character (checked with U+1F600). No drop needed.

---

## 7. Encoding text

The sender's job; vent-in knows nothing of these rules.

| Input | Output |
|---|---|
| `\r\n`, a lone `\r` | normalised to `\n` first |
| `\n` | `{"key":"return"}` |
| `\t` | `{"key":"tab"}` |
| other C0 controls, DEL (0x7f), lone surrogates | dropped (counted) |
| anything else (space and non-BMP included) | `{"key": the character, "modifiers": []}` |

- **Iterate by code point** (`Array.from`, `for..of`); `.split("")` breaks surrogate pairs
- **No prefix key, no final `RET`** (the caller's job)

### Encoding what is meant

| To | Send |
|---|---|
| paste | the text as InputEvents |
| evaluate an expression | `M-:` + its text + `RET` |
| run a command | `M-x` + its name + `RET` |
| open a file | `C-x C-f` + the path + `RET` |

### The shape of a query

No query layer on the host's side; this convention is enough.

```elisp
;; a query
(let ((print-length nil) (print-level nil)) EXPR)

;; a large result
(let ((print-length nil) (print-level nil))
  (with-temp-file "/tmp/tezcatl-q.el" (prin1 EXPR)) "/tmp/tezcatl-q.el")
```

---

## 8. Errors (on the receiving side)

Bad input never stops the host; the connection stays and it is logged.

| Situation | Behaviour |
|---|---|
| invalid JSON | dropped, logged once |
| `input` without `sequence`, or not an array | dropped, logged |
| an unknown modifier or key name, a failed conversion | **the whole message dropped** (never a partial injection), logged |
| an error while injecting or inside a filter | caught and dropped |
| an unknown `kind` | dropped, logged |

Text makes long sequences, so "one failure drops all" reaches far; remove the causes of failure in the encoding (§7) first.

---

## 9. Normalising keys (on the sending side)

Rules for making InputEvents from a real keyboard; receivers do none of this.

1. **Printable characters**: use `KeyboardEvent.key` as it is (browsers already return `"X"`, `"!"` with Shift)
2. **Folding Shift**: a printable character + Shift → fold into the character, no `shift`; a non-printable key + Shift → keep `shift`
   (`S-<f5>`). Because `(kbd "M-X")` ≠ `(kbd "M-S-x")`: `["meta","shift"]` on a printable character silently does nothing
3. **Modifiers**: `ctrlKey` → `control`, `altKey` → `meta`, `metaKey` → `super` (Super rarely arrives — window managers take it; no harm)
4. **Drop**: keydowns with `isComposing` (IME), a modifier alone, non-printable keys not in the table, a one-character C0 control
5. **`escape`** is not "cancel" in Emacs but **the Meta prefix**; quitting is `C-g`, sending ESC is `C-[`

### Not tidied

The special-key table is not split into "wire names (editor-neutral)" and "the mapping to Emacs' `kbd` spellings (Emacs-specific)"; it lives
in three places (vent-in, `keymap.js`, `kbd.js`). Candidates to add: `insert`, keypad keys (`kp-*`), `f13..f20`, `menu`, `print`, `pause`.
The lead-key notation (`lib/core/lead.js`) produces the same `{key, modifiers}` for every destination ([D-lead-key](files/lib-core-lead.js.md#d-lead-key)).
