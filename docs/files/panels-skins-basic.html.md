# `panels/skins/basic.html`

The page of basic skin.

**Takes part in**: [D-skin-as-container](lib-core-panes.js.md#d-skin-as-container), [D-ui-commands](lib-core-commands.js.md#d-ui-commands)

## Notes from verification

**Spec** — "a provisional container used every day" (a prototype now; `frame` is the skin to use). It puts the reference panels side by side
with `panes.js`, wires the fixed bus vocabulary and turns the leave key (`yield`) into a navigator of panes and windows. There is only
mechanism here (`D-skin-as-container`). It registers `nav.open`, `nav.goto`, `nav.next`, `nav.prev`, `nav.back`, `pane.close` and calls
`commands.listenBus()`; it holds one hidden `panels/invisible/cursor.html`. It answers `compile.cutoff.open` (reuse an `xterm_cutoff` pane
with `terminal.reconfigure`, else add one; `compile.cutoff.opened {reqId}`; the requester falls back to its own `window.open` after 200 ms)
and learns a new pane's bus id from its first `terminal.ready`.

**Does not** — panel contents; vent (each child iframe has its own); edit the ledger (`nav.goto kind:"window"` only focuses an existing
window with `window.open('', name)`).

**Pitfalls** — the nav list is **built by the skin** (`buildNavList`: local panes ∪ other windows from `GET /windows`, de-duplicated by
name); `list.html?config=nav` only draws what `nav.list` brings. `nav.open` adds the nav pane on the right and focuses it 60 ms later (the
iframe loading); `nav.goto` closes it after. Windows are polled every 2000 ms; `deriveWindowsUrl` turns `connections[0].url` (`ws://…`)
into `http://…/windows` — without one, "no relay url" and no polling.

*Verified 2026-09-06; `compile.cutoff.*` (2026-09-13) not re-verified.*

## Selection and revision notes

(Moved from the comments of `panels/skins/basic.html`, 2026-09-10.)

A neutral, theme-agnostic skin: it draws a plain frame and arranges the
     panel pages. The LCARS look is a separate skin (bring-your-own, like the
     fonts). Only tokens the pane host reads are set here.

---

panels/skins/basic.html -- the provisional daily-driver skin. It composes
the reference-implementation panel pages (panels/resident/input.html,
panels/resident/output.html) with lib/core/panes.js, wires the fixed bus vocabulary,
and turns the leave key into a pane / window navigator. No LCARS here --
mechanism only; the skin is the swappable part (docs/structure.md).
invisible cursor aggregator
--- layout ------------------------------------------------------------
pane ids, most-recent last
the transient nav list pane, when open
--- relay URLs (nav "other windows" half; ③ file reads) -------------
http://host:port  -- endpoint ③
--- nav list contents (skin builds it: local panes ∪ other windows) --
our own iframes
--- commands -------------------------------------------------------
--- kill ring --------------------------------------------------
panel-frame `killring` (default Esc-y) -> open the picker to the right,
remembering which pane (and its kind) we came from so the picker can
deliver back into it. `killring.done` closes it and refocuses.
--- file tree -> code pane (endpoint ③) -----------------------
tree.html posts `code.open {path}`. Ensure a code_editor (editor) pane exists,
then feed it: fetch /fs/read and code.set, addressed to that pane's bus
frame (learned from its code.ready). `o` in tree.html is the standalone
path. (code.html is the read-only viewer; editing uses code_editor.html.)
{ id } from a `code.ready` by a code pane
fed when a code.ready arrives
--- the leave key ------------------------------------------------
