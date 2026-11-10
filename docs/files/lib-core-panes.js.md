# `lib/core/panes.js`

Splitters and pane hosts that prototype skins lay panels out with.

**Decisions homed here**: [D-skin-as-container](#d-skin-as-container)

<a id="d-skin-as-container"></a>

## D-skin-as-container — the skin lays out; panel pages stay as they are, in iframes

**Decided**: the container that arranges panels is the **skin** (`panels/skins/*.html`). A skin builds a tree of splits with
`lib/core/panes.js` (splitters and pane hosts) and puts each `panels/…html` **unchanged** in an `<iframe src=…?name=>` at each leaf.
"One implementation, many instances": every skin uses the same `panes.js`. (The frame — `D-frame` — later laid out columns itself; the
principle stays.)

Panels talk to each other and to the skin through `lib/core/panel-bus.js` (one `BroadcastChannel`, same origin), **never through the
relay**. It carries UI-local intentions only (`yield`, `focus`, `insert`, `result`, `cursor`, `command`, `nav.list` …).

Only the leave key (`ui.keys.leave` in `config.json`, default `["Escape","Escape"]`) is **reserved in every frame**:
`lib/core/panel-frame.js` registers one capture-phase `keydown` in each panel, sees it before the panel's own handlers and posts
`yield`. Other keys between panels are read by the skin after the yield.

**Alternatives**: layout inside each panel, or panels rewritten for skins; panel messages through the relay (a new WS kind); each
panel reserving its own leave key.

**Why not**: the input and output panels are permanent reference implementations and must open alone; changing them for a skin breaks
that. With an iframe and `?name=`, the relay sees the same connection as before (listed in `GET /windows`, can be evicted). UI messages
through the relay break `D-stateless-relay` (UI-local matters — which pane is focused — would enter the relay). `BroadcastChannel` is
the one same-origin transport that crosses both `<iframe>` and `window.open` without a server. Leave keys left to panels make them
fight over Escape (one to pass to Emacs, one to go back to the skin); one capture-phase owner is the only reservation, and as a double
`Escape Escape` a single Escape still reaches Emacs.

**What it removed**: maintaining panels twice (with and without a skin), the ownership of Escape, a path for UI state into the relay.

**Files**: `lib/core/panes.js`, `lib/core/panel-bus.js`, `lib/core/panel-frame.js`, `panels/skins/basic.html`,
`panels/invisible/cursor.html`, the input, output and list panels, `config.json` (`ui.keys`).

## Notes from verification

**Spec** — `spec` is a tree of nodes `{dir:"row"|"col", children:[…]}` and leaves `{panel, src, size?, name?}`. A leaf becomes
`<iframe src=…>`; `src` is resolved from the repository root with `Tezcatl.config.sibling` (so `panels/skins/basic.html` can write
`"panels/resident/input.html"`). `?name=` is added so the vent connection the iframe opens shows in `GET /windows` and can be evicted. Split
weights are kept in `~work/store/panes-<id>.json` (by `opts.id`, [D-store](lib-core-store.js.md#d-store)) after dragging. Used by the prototype skins; the frame lays out columns itself (`D-frame`).

**Does not** — panel contents (unchanged iframes); vent; messaging between panels (`panel-bus.js`); a skin's look (it reads `--tzp-*` CSS
variables; the skin defines colours).

**Pitfalls** — focus is tracked indirectly: `window` `blur` → `setTimeout(0)` → is `document.activeElement` an `<iframe>` (events inside an
iframe do not reach the parent, so a click moving focus is caught only this way). `addPane` only wraps the root in a new node and adds a
cell; insertion at any position (`at.after`, in the module doc) is not implemented — only `at.side` (`"right"` by default) works.
`closePane` lifts a lone remaining child one level. `panes()` returns leaves in insertion order (`Object.keys(leaves)`), not visual order.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/core/panes.js`, 2026-09-10.)

Panes -- the splitter / pane host a Tezcatl skin uses to arrange panel
pages (browser only). "Implementation one, instances many": every skin
(panels/skins/*.html) builds its layout with this; the panel pages
themselves are unchanged, loaded into <iframe>s.

  Tezcatl.panes.mount(containerEl, spec, opts) -> handle

spec is a tree:
  node  = { dir: "row" | "col", size?, children: [spec, ...] }
  leaf  = { panel, src, size?, name?, params? }   // panel = a role label

`dir:"row"` splits left/right, `dir:"col"` splits top/bottom. `size` is a
flex-grow weight (default 1). Leaves become an <iframe src=...>; `src` is
resolved relative to the repo root (Tezcatl.config.sibling) so
"panels/resident/input.html" works from panels/skins/basic.html. `?name=` is added
so the vent connection shows in GET /windows and is evictable.

handle:
  focus(id)              -- iframe.contentWindow.focus() + emit "focus"
  panes()               -- [{ id, role, name, src }]  (leaf order)
  has(id) / get(id)
  closePane(id)          -- remove a leaf (+ its now-lone-child collapse)
  addPane(leaf, at)      -- at = { side: "right"|"left"|"top"|"bottom" }
                            or { after: <id> }; default: append to root
  focusedId()
  on(evt, cb)            -- "focus" (id) | "close" (id) | "layout" ()

Splitter drags persist flex weights to ~work/store (lib/core/store.js) keyed by opts.id.
id -> { id, role, name, src, cellEl, iframeEl, node }
Click into an iframe -> document.activeElement becomes that <iframe>.
(Events inside the iframe do not cross into the parent, so this blur
hook is how a mouse click on panel content updates the focused pane.)
leaf
a .tzp-cell
a .tzp-cell
--- sizes persistence -----------------------------------------
--- focus ---------------------------------------------------
--- add / remove -----------------------------------------
.tzp-cell OR container (root leaf)
drop this cell and one adjacent splitter
if only one cell remains, hoist its content up a level
last pane in the skin
Simple v0: wrap the current root in a fresh node of the needed
direction and drop the new cell before/after it.
--- events ----------------------------------------------
