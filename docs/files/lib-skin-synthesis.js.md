# `lib/skin/synthesis.js`

A synthesis' definition: read (`local/syntheses/<name>.json`, then `syntheses/<name>.json`), checked, and its panels laid out inside
the place the frame gives it. Pure but for the reading (`create`); the frame draws it.

**Decisions homed here**: [D-synthesis](#d-synthesis)

**Takes part in**: [D-frame](lib-skin-frame-layout.js.md#d-frame), [D-block](lib-skin-thema.js.md#d-block), [D-db-session](lib-relay-sql.exs.md#d-db-session)

<a id="d-synthesis"></a>

## D-synthesis — a synthesis is a panel written in JSON: its name, looked up, places several panels, one of them its main

**Decided** (crux, 2026-10-22; built the same day — the ground, and `matrix_set` as the first): a unit between a skin and a panel, less
fixed than the dock and wider than a block. It answers why the prototype skins (matrix, tree, xipe) cannot be used in a frame with a
dock: a skin page inside the frame's iframe would cut the frame's wiring and bring no dock.

- **A meta panel**: to the skin a synthesis is one panel; what it shows is decided by its name, the key to a registered definition —
  as a block's band shows a panel's name, the synthesis steps in at that name. There are several kinds (the database first; the
  prototype skins may follow)
- **Registered by name, written by hand**: `syntheses/<name>.json` (shipped), `local/syntheses/<name>.json` (yours, over it). No
  commands edit one. A name a panel or an alias has (`list_kinds/panels_and_skins.json`) is never a synthesis's — a test watches, so
  `skin add <name>` is never ambiguous
- **The definition**: `{name, axis, ratio, columns, main, move}` — `axis`, `ratio` and `columns` as `skin save` writes them (the frame's
  own layout lays out the inside); `main` one of its panels; `move` names → its panels, e.g. `{"table": "matrix", "line": "code_cmd_in"}`
- **To the skin, one panel**: `skin add <name>` puts it in one place; `skin del`, `switch`, `zoom`, `equal`, `focus` and the map
  (`panel_abstract`, one box) treat it as one panel — no `skin …` command changes. A block's band goes round the whole (its text the
  synthesis' own name, its status the main's `panel.status`); the panels inside are bare. No synthesis in a synthesis
- **Drawn by the frame**: the panels inside are iframes that are direct children of the frame's page, positioned absolutely, never moved
  in the DOM — for D-block's reason (code that takes the frame as a panel's parent keeps working)
- **Its own name is given when placed** (`<name>_<n>`, the smallest free in the skin) and kept by `skin save` with the definition's
  name: the item is `[<name>, position, ratio, active, {synthesis: "<own name>", keep: {…}}]` (with what the band changes). Read
  again (a reload, `skin read`), the panels inside are made again from the definition as it is then — never an empty box. `skin del`
  takes the definition's name or the own name
- **The main**: (1) the way in — `skin focus` on the synthesis, the map's `Enter` and a click on its band land on the main; (2) what
  speaks for it — the band's status is the main's; (3) where its behaviour lives — what the other panels put out goes to the main first.
  Every "a panel of the same skin" lookup (the skin port's `siblings`, the current `code_editor`, [D-command-target](lib-core-commands.js.md#d-command-target))
  looks inside the synthesis first, then in the skin; the skin port is the one place that knows it. The dock's input_target and
  output_target stay the skin's
- **Moving inside is one step more**: with the focus on the synthesis, `syn <move-name>` (the input line) enters that panel; `syn main`
  always exists. `skin focus` and the map never reach inside. No key is bound inside (keys inside panels are never taken)
- **What the main keeps**: the main posts `synthesis.keep {…}` and the frame keeps it in the item's `keep` (over a reload and in
  `skin save`; up to 16 plain values), given back to the main's page as its query when it is made again — with `kept=saved` beside it
  when read from a saved skin (`skin read`, `?skin=`), so the main can tell a reload from a copy
- **A frame opened for one synthesis**: `frame.html?synthesis=<name>` starts a frame holding it alone (`&keep.<key>=<value>`: what its
  main starts with — `database id=1 tab`). A page opened by `window.open`
  gets a copy of its opener's `sessionStorage` (the Web's rule, seen in the E2E), so the parameter wins over a copied skin; only a
  reload (the navigation's type) of a window that has a skin keeps it

**How it is built** (2026-10-22):

- **The definition** (`lib/skin/synthesis.js`): `check` refuses an unsound one and says why (a panel not in the launcher's list, `main`
  or a `move` naming a panel it does not hold, or holds twice, `move` taking the word `main` …); a panel's 5th item gives its page a
  `query` and a fixed length `px` (a one-line bar). Read once per name after the launcher's list, `local/syntheses/` first; `layout`
  places its panels with the frame's own `rects`
- **The frame**: a place's item has `syn` {own, keep, saved}; it is drawn as a block whose room holds the panels (`frame-render.js`;
  every iframe has the place's id, so a click inside focuses the place); a panel inside is named `<place id>.<k>` on the bus. The band
  says `<place> <own name> ── <the main's status>` (source `status` unless its dressing says otherwise; `lib/skin/thema.js`)
- **The skin port** (`lib/core/panel-frame.js`): `synthesis(w)` tells a panel its synthesis (own name, its place, which one is the
  main, the members with their bus names and ids); `siblings(w)` lists the synthesis' panels too, its own first
- **`syn [<word>]`** (`frame-lines.js`): alone it says the words; `syn main` and the definition's words enter that panel
- **The first one: `matrix_set`** (`syntheses/matrix_set.json`): `matrix_bar` (the main, `lib/xipe/matrix-bar-page.js`: what the
  matrix skin's page did — the line saying the table, `matrix update / get / pwd` and `radar` from its command line, the
  `matrix.*` tezcatl commands as a target of kind skin), `matrix_table` (`matrix.html`, the calc rows first), `code_cmd_in`. Two placed
  in one frame drive their own tables only. The prototype matrix skin (`panels/skins/matrix.html`) was removed for it (crux,
  2026-10-22); the launcher's `matrix-skin` (`open matrix`) opens `frame.html?synthesis=matrix_set`

**Left**: a `code_editor` inside a synthesis is not the frame's "current code_editor" (frame-code's wiring looks at the places only), and the
frame's roll call (`frame.places`, `work list`, `who`) names the main only; the same copied `sessionStorage` would hide `?skin=` in a
frame opened from a frame (`?skin=` is read only when the window has no skin).

**Files**: `lib/skin/synthesis.js`, `syntheses/` (`README.md`, `matrix_set.json`), `lib/skin/frame-layout.js` (the item),
`lib/skin/frame-render.js`, `lib/skin/frame-focus.js` (`enterInner`), `lib/skin/frame-lines.js` (`syn`, `skin add` reads a
definition first), `lib/skin/frame-page.js` (`?synthesis=`, `synthesis.keep`, the port), `lib/core/panel-frame.js` (the skin port),
`lib/skin/thema.js`, `lib/skin/thema-page.js`, `panels/skins/frame.html`, `panels/resident/matrix_bar.html`,
`lib/xipe/matrix-bar-page.js`, `list_kinds/panels_and_skins.json` (`matrix_table`, `code_cmd_in`, `matrix_bar`), `bus/messages.json`
(`synthesis.keep`), `test/synthesis.test.js`, `test/thema.test.js`, `test/e2e/frame_synthesis.mjs`.


**Alternatives**: the prototype skins put in the frame as they are (a skin page in an iframe); a page holding the synthesis' panels
(`synthesis.html`); commands to edit a synthesis (`synthesis add …`); reaching the panels inside with `skin focus` (`23.1`) or the map;
keys bound inside (`Tab`); a synthesis' name over a panel's; a synthesis in a synthesis.

**Why not**: a page in between cuts the wiring that takes the frame as a panel's parent (as D-block and D-dock found). Editing is rare;
JSON is enough. New places for `skin focus` change every skin's commands and the map. Keys inside panels collide with vim and lists
(D-frame). One name for two things makes `skin add` ambiguous. Nesting is the nested tree D-frame refused.

