# `lib/skin/thema.js`

What a thema shows: the one sentence and the colour of the band round its partner panel, from the block's settings and what the partner said on the bus.

**Decisions homed here**: [D-block](#d-block)

<a id="d-block"></a>

## D-block — a block treats two panels as one; the thema panel draws a band with one line of text and a colour

**Decided**: the unit between a skin and a panel, made for building an LCARS-like UI on the frame ("one display, one piece of
information", "long text goes in the frame's parts" — and "a block = a panel + its thema" matches).

- **A block is the frame's data and the frame draws it**: an item of the saved JSON is a panel or a block (the main panel A, its partner
  B, how B surrounds, thickness). Both iframes are direct children of the frame, positioned absolutely (code that assumes a panel's
  parent is the frame — `code-locate`'s `pageEnv`, `siblingRole`, the frame's `ours(meta)` — keeps working). To the user, one thing moved,
  closed and swapped by one place. **No nesting** (no block in a block). The focus is A's; B is never entered (two ordinary panels are
  arranged by the skin)
- **The thema panel** (`panels/extra/thema.html`): the band around the partner, with one line of text; parameters are colour, text,
  thickness and how it surrounds. Its iframe covers the block, and the main panel sits inside it, moved by the band's thickness (sizes
  with `calc`; an iframe does not stretch by position). The block's box has no border; the focus shows in the band's brightness. thema
  only listens to the bus — says nothing, takes no keys — and the frame gives its settings with `window.themaSet`
- **How each panel is dressed is `blocks/<panel>.json`** (`{panel, source, side, color, thickness, style, at}`, `blocks/README.md`),
  searched in what was kept (`block new`, `block place`; `~work/store/frame-blocks.json`, `D-store`) over `local/blocks/` then `blocks/` — the kept choices lie over the file's,
  never replace it whole. `skin add` places a block by default; `-bare` a plain panel. A skin keeps only what was changed there (the
  fifth field: `false` plain, `{side}`, minimised, thema overrides)
- **The text and colour come only from Tezcatl's own structured messages** (the panel's name, `code.opened`'s path, `code.dirty`, an LSP
  dropped, `file_changes` …), never from backends' text. Three sources to start: `name` (place and panel), `file` (the partner's
  `code.opened` / `code.here` / `code.dirty`; unsaved shows ● in the warning colour), `status` (the partner's
  `panel.status {text, level}`). `code.set` posts `code.opened` too. Bands on the right or left show no text (turning it is for whoever
  adds a block — the CSS of `thema.html` says how)
- **Commands**: `block arrange t|b|r|l|tl|tr|bl|br`, `block new <panel> <name|file|status> [side]` (kept in `~work/store`, the JSON on
  the receiving side — copy it into `blocks/` to ship; pages never write to the repository through the relay), `block place <panel>
  <line>` (`skin add <panel>`'s default place), `block min` (to the band, text visible) / `block min line` (a 4 px line) / `block unmin`
  (shrinking is along the sub axis; minimised blocks in px, the rest by ratio — `rects`' `subPx`, `fixedPx`; the main panel is hidden,
  not reloaded), `thema color|thickness|source|text|style|reset` (the focused block's band, kept in the skin; colours are a palette name
  or a CSS colour only)
- **The opening for LCARS** (studied from chriszacny/lcars — not forked: only CSS values and ideas are used): L-shaped sides
  `tl` `tr` `bl` `br` (the band and an arm down the edge; the main panel moves on two sides; corners are square in what ships); any colour
  name reads as `var(--th-<name>, <name>)`, so a style's colours work in `thema color`; **styles** (`thema style <name>`, a dressing's
  `"style"`): `local/thema/<name>.css` then `thema/<name>.css` (what a style may use is in `thema/README.md`; none ships yet); the L's
  inner corner cannot be drawn inside thema (the main panel covers it), so a style sets `--th-inner` and thema tells the frame
  (`postMessage`), which rounds the main panel's corner so `#corner` shows through; unfocused bands are dimmed by the page's brightness
  (`--th-dim`), not per element. An LCARS look of one's own lives in `local/thema/lcars.css` (not in git; no fonts brought in)

**Alternatives**: a block as a page holding the two (`block.html?a=…&b=…`).

**Why not**: the inner panels' parent would no longer be the frame, cutting the frame's wiring (`:LspDef` would open a new window).

**Not yet**: panels that post `panel.status`; dividers (striped bands).

**Files**: `lib/skin/frame-layout.js`, `lib/skin/frame-page.js`, `lib/skin/frame-render.js`, `panels/skins/frame.html`,
`lib/skin/thema.js`, `lib/skin/thema-page.js`, `panels/extra/thema.html`, `blocks/`, `thema/`, `lib/code/code-editor.js`
(`code.set` → `code.opened`), `test/frame-layout.test.js`, `test/thema.test.js`, `test/e2e/frame_block.mjs`, `test/e2e/frame_color.mjs`.
