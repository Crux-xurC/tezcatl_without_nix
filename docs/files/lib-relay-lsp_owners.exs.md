# `lib/relay/lsp_owners.exs`

Who owns each open document of a shared language server (D-lsp-owner).

**Decisions homed here**: [D-lsp-owner](#d-lsp-owner)

<a id="d-lsp-owner"></a>

## D-lsp-owner — on a shared language server, each open document has one owner; only the owner's text reaches the server

**Decided**: the relay shares one language server among every consumer of a project (`code_editor`s, Xipe Totec's scanner). The server knows
the relay as one client and holds one text per URI. Before, a second `didOpen` was only counted and dropped while every consumer's
`didChange` was sent, so the same file in two `code_editor`s (a tree's `Enter` in another window) merged both people's edits into one text;
diagnostics and the edits of `:LspRename` / `:LspFormat` could land in the wrong places (reproduced in an E2E: the diagnostic of an error
typed in the second appeared in the first).

- **The first consumer to open is the owner**: only its `didOpen`, `didChange`, `didSave`, `didClose` reach the server, and that URI's
  diagnostics go to it only
- **An editor takes over from a scanner**: a consumer attached with `"client":"editor"` that opens a URI owned by another kind (a
  scanner) makes the relay send `didClose`, then the editor's `didOpen` — the server holds the text a person is editing (the scanner checks
  positions it read against the disk anyway)
- **Others only hold**: a second editor gets nothing, and the relay refuses its requests on that URI (-32803: its positions differ from the
  server's text). The relay says `{"kind":"held"}`; `code_editor` says "open in another code_editor"
- **When the owner closes, the next takes it**: `didClose` to the server, `{"kind":"released"}` to the first editor still holding it, which
  attaches again, opens with its own text and becomes the owner

**Alternatives**: (1) a server per consumer; (2) swapping the server's text to each consumer's at every request; (3) a different URI per
consumer.

**Why not**: (1) every consumer of a project uses the same version of the same server — no version differences allowed; memory and start-up
time too. (2) heavy; diagnostics swing between versions; cross-file analysis cannot know which version it sees. (3) the server would see the
same module twice (the reason clones get no language server).

**Files**: `lib/relay/lsp_owners.exs` (the decisions, pure), `lib/relay/lsp_server.exs` (carrying them out), `lib/relay/lsp_socket.exs`
(`client`, `held`, `released`), `lib/code/code-editor/lsp-attach.js`, `main.exs`, `test/relay/lsp_owners_test.exs`,
`test/e2e/lsp_owner.mjs`.
