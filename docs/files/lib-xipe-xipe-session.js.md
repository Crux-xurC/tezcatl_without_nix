# `lib/xipe/xipe-session.js`

A persistent client for tezcatl's /xipe relay (lib/relay/xipe_socket.exs), for a skin that keeps one connection open while it lives (the Xipe dialogue window).

**Decisions homed here**: [D-xipe-dialogue](#d-xipe-dialogue)

**Takes part in**: [D-xipe-relay](lib-relay-xipe_socket.exs.md#d-xipe-relay)

<a id="d-xipe-dialogue"></a>

## D-xipe-dialogue — only `input` is sent; what a line means is Xipe Totec's

**Decided**: Xipe Totec's dialogue window (`panels/skins/xipe.html` + `code_xipe_in` + `code_xipe_out`) does not read the lines typed;
it sends them as one JSON-RPC method, `input` `{"text": "<line>"}` — as emacs-vent-in takes only `kind:"input"` and leaves meaning to
Emacs' keymaps. Whether a line answers a dialogue or is a command is Xipe Totec's call.

- The skin holds one `/xipe` connection (`lib/xipe/xipe-session.js`) and keeps receiving `notify/*`; it talks to its panels on the bus
- The record (`code_xipe_out`) shows an answer's `dialogue.text` as it is, else `result` / `error`; ids, `from` and the `dialogue`
  envelope are not shown. Tezcatl never reads `dialogue.text`
- Request ids carry a random tag per connection; other consumers' answers (errors included) are not picked up
- Panel names carry a suffix per skin, so two such skins never answer each other's panels

**Alternatives**: turn the CLI's notation into commands in the browser; make people type JSON-RPC; a dedicated method listing commands
(`command/list`) for completion.

**Why not**: converting in the browser keeps `xipe do`'s value rules in JS too (two places). Typing JSON-RPC is heavy. A listing method
widens Xipe Totec's mouth for completion's sake only — completion is the generic dictionary's (`D-dictionary`), and `input` is enough.

**What it removed**: Tezcatl needing to know "is a dialogue on"; the notation kept in two places.

**Files**: `panels/skins/xipe.html`, `panels/resident/code_xipe_in.html`, `panels/resident/code_xipe_out.html`,
`lib/xipe/xipe-session.js`, `lib/xipe/xipe-transcript.js`.
