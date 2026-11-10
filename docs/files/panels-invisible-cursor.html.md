# `panels/invisible/cursor.html`

The page of cursor (invisible).

**Takes part in**: [D-references](lib-skin-recv-refs.js.md#d-references), [D-skin-as-container](lib-core-panes.js.md#d-skin-as-container)

## Notes from verification

**Spec** — no look of its own (`?debug` dumps the state). It gathers three things into one `cursor.state` and posts it again: (1) the vent
`context` (where the next key goes — its own socket, as the output page); (2) the caret's cell / pixel / selection that editing panels
(CodeMirror, xterm.js) report with `reportCursor`; (3) `focus` / `focus.changed` from the skin, as a most-recent-first history (`nav.back`
returns to `state.previous`, the second from the end). It also keeps tables' coordinates and "the last reference" for `radar`
(`D-references`). **It never asks Emacs for `point`** — the context is not a position sync (`D-next-keystroke`); pixel-level information is
only what the browser's editors have.

**Does not** — ask Emacs for positions; draw cursors.

**Pitfalls** — it opens one `ws.js` socket for `context` (and calls `requestContext`), so it is a vent connection that is **not in the
ledger** (no `?name=`) — one per skin is assumed. The focus history drops only an id equal to the one before, so A→B→A leaves A twice.
`HISTORY_MAX` is 12.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `panels/invisible/cursor.html`, 2026-09-10.)

An invisible panel: it renders nothing by default. `?debug` shows a
     one-line dump of the state it is broadcasting.

---

cursor.html -- the cursor-info aggregator (docs/structure.md: the
"shared cursor part"). It has no visible UI. It collects:

  * the vent `context` (which target the next keystroke goes to) -- via
    its own relay socket, exactly like output.html;
  * `cursor` bus reports from editing panels (CodeMirror / xterm.js post
    their caret cell / pixel / selection);
  * the `focus` bus traffic the skin emits when it moves focus between
    panes -- turned into a small most-recent-last focus history, so
    "return to where I was" (nav.back) has an address.

and re-broadcasts one combined `cursor.state` whenever any of it changes,
plus on demand (`cursor.query`). It deliberately does NOT ask Emacs for
`point` -- Context is "the next keystroke's destination", not position
sync (docs/structure.md D-next-keystroke). Anything pixel-level here is
browser-owned (CodeMirror / xterm), never Emacs.
{ "buffer-name", window, frame }  (from vent context)
surface -> { cell, pixel, selection, at }
[{ id, role, name, at }]  most-recent last
focusHistory[len-2]  -- where nav.back goes
--- vent context (own socket) ---------------------------------------
--- caret reports from editing panels -----------------------------
--- focus history (from the skin's focus traffic) ----------------
`focus` messages are addressed to a specific pane; we observe them all
(bus.on, not onMine) to know the focus order.
de-dup consecutive
The skin can also announce a focus change explicitly (carrying the full
pane descriptor) -- richer than the addressed `focus` message.
--- answer explicit queries ------------------------------------
