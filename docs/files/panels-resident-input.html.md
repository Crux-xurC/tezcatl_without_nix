# `panels/resident/input.html` and `panels/resident/output.html`

The page of input.

**Takes part in**: [D-decode-emacs](lib-vent-decode-table.js.md#d-decode-emacs)

## Notes from verification

**Spec** — both pages are the smallest skeleton: one page = one socket — `mount` the panel module and connect it with
`ws.connectFromConfig`. The input page loads `resolver.js` and calls `Tezcatl.resolver.load()`; the output page loads no resolver —
resolving intents is about sending, not about showing what was received, and the script tags show that split. Both load `panel-bus.js` +
`panel-frame.js` and call `Tezcatl.panelFrame.init({role, name})` once, so inside a skin the leave key and the bus identity work; **alone
they are harmless** (no skin listens to `yield`), keeping them reference implementations that open alone (`D-skin-as-container`). `name` is
`?name=` or the role. In the frame these two are replaced by the dock (`D-unified-dock`); they stay for their own windows and prototype skins.

**Does not** — the parts themselves (`input-panel.js`, `output-panel.js`).

**Pitfalls** — both call `requestContext` on `open` (see `lib/vent/vent-init.js`), so the output page loads `text.js` too. Script order:
`config.js` → `panel-bus.js` → `panel-frame.js` → the panel module (`panel-frame.js` assumes `Tezcatl.bus`).

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `panels/resident/input.html`, 2026-09-10.)

Standalone input UI: one socket. Inbound context is still received (so the
middleware seam has currentContext), and shown as the current target.
Shared bootstrap: identify on the panel bus + arm the leave key
(config.json ui.keys.leave). Harmless when this page is opened
standalone (no skin listening for `yield`).
Load binding_map.json + dialects/<dialect>/intent_map.json. A miss in the
form falls through to raw send; a hit dispatches the intent. v0 ships no
candidate/palette panel, so type an intent id verbatim (e.g.
"magit.unstaged-files") in the Form field to run it -- every binding is
reachable this way whether or not it also declares `keys`.
A tab reaching emacs-vent through the relay may open after the
initial hello/context handshake (the relay does not replay it) --
ask Emacs to resend its current target on every (re)connect so this
tab is never stuck on "(no context yet)". Harmless no-op resend
otherwise (lib/vent/vent-init.js).



(Moved from the comments of `panels/resident/output.html`, 2026-09-10.)

Standalone receiver: one socket, output panel only.
Shared bootstrap: bus identity + leave key (harmless standalone).
See panels/resident/input.html: ask Emacs to resend its current target on
every (re)connect, since a tab reaching emacs-vent through the relay
may open after the initial hello/context handshake (not replayed).
