# `panels/resident/dialogue-input.html` and `panels/resident/dialogue-output.html`

The page of dialogue input.

**Takes part in**: [D-decode-emacs](lib-vent-decode-table.js.md#d-decode-emacs), [D-dialogue-bridge](lib-vent-dialogue-output-panel.js.md#d-dialogue-bridge)

## Notes from verification

**Spec** — `dialogue-input.html` is, as its own comment says, "functionally the same as `input.html`": the same script tags and inline JS
(the resolver included). Driving a dialogue tool (Proof General's `C-c C-n` …) needs no new wire mechanism (`D-dialogue-bridge`), and that
shows here — a new page whose contents are a copy of the input page. `dialogue-output.html` differs from `output.html` only by using
`dialogue-output-panel.js`.

**Does not** — a driving UI specific to Proof General (no `pg.next` button; no such intent).

**Pitfalls** — the input page is **duplicated in code** (not shared), so changing how `input-panel.js` is called means changing both — a
deliberate copy (said in the comment).

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `panels/resident/dialogue-input.html`, 2026-09-10.)

Driving a dialogue tool (e.g. Proof General's `C-c C-n') needs no new wire
  mechanism: it is the same `kind:"input"' path panels/resident/input.html already
  uses, landing in whichever window is selected (emacs-vent-in.el,
  unaltered; see emacs-vent-in-dialogue.el for why). This page is therefore
  functionally input.html under a name that pairs with dialogue-output.html.
  A dedicated dialect's intent_map.json (e.g. `pg.next' -> `C-c C-n') can be
  added later without touching this page or its scripts.

---

Standalone input UI: one socket. Inbound context is still received (so the
middleware seam has currentContext), and shown as the current target.
Shared bootstrap: identify on the panel bus + arm the leave key
(config.json ui.keys.leave). Harmless when this page is opened
standalone (no skin listening for `yield`). role `dl-input` (dl =
DiaLogue) so w_list / nav can tell it apart from a plain input pane.



(Moved from the comments of `panels/resident/dialogue-output.html`, 2026-09-10.)

Standalone receiver, same shape as panels/resident/output.html: one socket, this
panel only.
Shared bootstrap: bus identity + leave key (harmless standalone). role
`dl-output` (dl = DiaLogue) to pair with dialogue-input.html's `dl-input`.
See panels/resident/input.html: ask Emacs to resend its current target on
every (re)connect, since a tab reaching emacs-vent through the relay
may open after the initial hello/context handshake (not replayed).
