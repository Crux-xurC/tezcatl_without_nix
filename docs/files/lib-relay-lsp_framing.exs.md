# `lib/relay/lsp_framing.exs`

The LSP base protocol framing: JSON-RPC bodies prefixed with Content-Length: <n>\r\n\r\n (an optional Content-Type header is tolerated and ignored).

## Selection and revision notes

(Moved from the comments of `lib/relay/lsp_framing.exs`, 2026-09-10.)

The LSP base protocol framing: JSON-RPC bodies prefixed with `Content-Length: <n>\r\n\r\n` (an optional Content-Type header is tolerated and
ignored). Pure -- the accumulator lives in `LspServer`'s state.

    new()               -> state
    feed(state, bytes)  -> {[body, ...], state}   bodies are raw JSON strings
    encode(body)        -> iodata ready for the server's stdin

- `feed/2` appends to the buffer and drains every complete message it can, returning them in order plus the carried-over state
- `content_length/1` is case-insensitive on the header name and rejects a non-`{n, ""}` value

Record:

- Made because the relay must parse the framing (fan-out, id remapping, per-document ownership need it); pure, so tested apart from the
  GenServer (`test/relay/lsp_framing_test.exs`) — the same split as `PtyValidate` / `LspConfig`. Covered: messages across feeds, several
  messages in one feed, Content-Type ignored
- **Bytes outside a frame are dropped up to the next `Content-Length:` and reading resumes**. Before, a header block without
  Content-Length was dropped whole with its separator; a language server (or its wrapper) printing an LF-terminated line to stdout put that
  line and the real header in one block, the real header vanished with it, the body stayed before the next header, and every later frame
  was unreadable (reproduced). Now only what precedes the block's last `Content-Length:` (case-insensitive, by byte position) is dropped; an
  unreadable one at the head (not a number) still drops the block. What was dropped is returned by `feed_report/2 -> {bodies, dropped,
  state}`, logged as a warning by `LspServer`; `feed/2` keeps its shape. 12 cases
