# `panels/skins/intent.html`

The page of intent skin.

**Takes part in**: [D-intent-resolution](lib-vent-resolver.js.md#d-intent-resolution)

## Selection and revision notes

(Moved from the comments of `panels/skins/intent.html`, 2026-09-10.)

A minimal skin: the input panel and the transcript of extensions (`code_el_intent`) side by side — no LCARS, mechanism only
(D-skin-as-container). It takes `resolver.trace` (posted by lib/vent/resolver.js in the input pane) and only relays it to the transcript pane
with `code.set`; it never touches vent (D-stateless-relay). It learns the el-intent pane's bus id from `code.ready` and keeps the latest text
that came before ready. The leave key toggles between the two panes (no nav list panel).

Record: **skins are not composed of skins** — what is composed is the layout spec (data). Two skins sharing one flat `BroadcastChannel` fire
`yield` / `killring` / `command` twice and fight over the same kept key (`D-session-service`).
