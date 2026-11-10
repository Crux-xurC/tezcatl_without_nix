# `lib/relay/lsp_server.exs`

One GenServer per {root, serverId}.

**Takes part in**: [D-lsp-owner](lib-relay-lsp_owners.exs.md#d-lsp-owner), [D-work-list](lib-core-work-log.js.md#d-work-list)

## Selection and revision notes

(Moved from the comments of `lib/relay/lsp_server.exs`, 2026-09-10, with later changes.)

One GenServer per `{root, serverId}`. Owns the OS process (a `--stdio` language server, **no PTY**), the LSP base-protocol framing, and the
`initialize`/`shutdown` lifecycle. Many browser consumers attach; the server sees one client (this relay).

Multiplexing:

- **initialize**: the relay sends its own once (fixed `@client_caps`), caches the result; a consumer's `initialize` request is answered
  locally from that cache, never forwarded. `shutdown`/`exit` from a consumer just detaches it.
- **requests consumer -> server**: the `id` is rewritten to a relay-global int (`next_gid`) and mapped back (`pending`) when the response
  returns. `$/cancelRequest`'s id is rewritten too (`cancel_gid`; `D-work-list`).
- **notifications server -> consumers**: broadcast to every attached consumer (the CM6 client filters diagnostics by uri); a document's
  diagnostics go to its owner.
- **server -> client requests** (`workspace/configuration` / `client/registerCapability` / `workspace/workspaceFolders` / progress) are
  answered by the relay with safe defaults; anything else gets `-32601`.
- **didOpen/didClose** — each open document has one owner (`LspOwners`, `D-lsp-owner`): only the owner's `didOpen`, `didChange`,
  `didSave`, `didClose` reach the server, and its diagnostics go to the owner. An editor takes over from a scanner (the relay's `didClose`,
  then the editor's `didOpen`); other editors only hold (`held`; their requests get -32803). When the owner closes or goes, `didClose` and
  `released` to the next editor. (The earlier refcount — dropping a second `didOpen` while sending everyone's `didChange` — merged two texts
  into one.)

Lifecycle: when the last consumer detaches a `@grace_ms` (45 s) timer starts; if it fires with no consumer, `do_shutdown` (`exit`
notification + `:exec.stop`). The child is `restart: :temporary`.

Pitfalls (from the code comments):

- `:json.encode(nil)` writes the string `"nil"` — use `:null` for JSON null (`processId`, the `shutdown` answer, answers to the server).
  `:json.decode` already gives `:null` for `null`, so decoded messages round-trip
- an `initialize` that answers an error → `init_state: :failed`, the error to every queued consumer's `initialize`, `{:lsp_exit, -1}` to all
  consumers (before, `msg["result"] || %{}` turned it into an empty success and `:ready`)
- framing is only in `LspFraming` (`send_to_server` encodes, `handle_info({:stdout,…})` feeds)

Record:

- The relay owning `initialize` / `shutdown` for a shared server. `--stdio` servers start through erlexec (`{:cd, root}`, `TERM=dumb`, no
  PTY — stdout is JSON-RPC, stderr goes to `Logger.debug`)
- Two `nil`-to-JSON bugs fixed (found in a real E2E): `"nil"` above, and the error `initialize` taken as success
- `initializationOptions` from `lsp.json` sent in `initialize`
- Real E2E with `typescript-language-server` 6 and `typescript` 5.7.3: attach → root found → spawn → the relay's `initialize` (capabilities
  cached) → a consumer's `initialize` answered from the cache → `didOpen` with a syntax error → `publishDiagnostics` fanned out → `hover`
  through the id remap → two consumers sharing one pid → detaching → a failed init giving `status:"failed"` with the error. Later the
  browser side (`@codemirror/lsp-client`) in a real browser
- **URIs are encoded**: `file_uri/1` (`%XX` for everything but letters, digits and `-._~/`, as vscode-uri) builds `rootUri`,
  `workspaceFolders` and the `workspace/workspaceFolders` answer. `"file://" <> root` was invalid with blanks or Japanese, and `#` / `%` made
  another path, so diagnostics from servers that answer with encoded URIs were dropped by the editor. Xipe Totec's `Scanner.Lsp.file_uri/1`
  uses the same rule (a document's owner is decided by the URI string)
