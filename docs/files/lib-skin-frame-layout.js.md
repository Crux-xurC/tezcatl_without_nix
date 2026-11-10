# `lib/skin/frame-layout.js`

What the frame skin holds, and its `skin ...` commands .

**Decisions homed here**: [D-frame](#d-frame)

**Takes part in**: [D-synthesis](lib-skin-synthesis.js.md#d-synthesis), [D-block](lib-skin-thema.js.md#d-block), [D-dock](lib-skin-dock-layout.js.md#d-dock), [D-references](lib-skin-recv-refs.js.md#d-references), [D-db-session](lib-relay-sql.exs.md#d-db-session)

<a id="d-frame"></a>

## D-frame — the base of skins is a frame: columns first, panels stacked in each; it starts empty and becomes a skin by a name

**Decided**: the base of new skins (the earlier ones — basic, tree, xipe, matrix, intent — stay as prototypes).

- **Two axes**: a skin has `axis` `h` (default: lines side by side as columns, filled top to bottom) or `v` (lines stacked as rows,
  filled left to right). The main axis' areas are **lines** (not "bars": that clashes with LCARS' bands). A place is "line → position"
  in either axis, written as two words (`2 3`: the third of the second; kept in a saved skin's `focus` as `"23"`, `"1,10"` past the 9th). The data (`columns`, `col`, `row`) does not change with the axis; `v` only transposes
  where things are drawn (`rects`) and the direction of moves. `skin axis` works with panels present; places stay, iframes are not
  reloaded. Splitting needs one axis first or it breaks, so the main axis comes first
- **Ratios are integers** whose sum is the denominator (`1,2,1` → ¼ ½ ¼; fractions are awkward in practice)
- **What a skin keeps** (`skin save` as JSON): `{name, type, axis, ratio, focus, columns: [[ [panel, position, ratio, active, block] … ]
  …], dock, zoom}`; unnamed ones are `workspace_1`, `workspace_2` …
- **One way of writing a line** (2026-11-09): blanks separate the words; a comma only joins a list of numbers of no fixed length into
  one word, with no blank in it (`main 1,2,1`, `sub 3,1`, `dock rows 1,2`); what has a fixed number of parts is that many words (a place
  `focus 2 3`, `del 2 3`, `add 2 3 tree`; the pair `switch ver 1 2`). Before, the rule had grown by feel: `switch ver` took `1,2` or
  `1 2`, `focus` took `23` / `2,3` / `2.3` while `del` and `add` took `2 3` (and `add 23` meant line 23), and `1, 2` was read as `1,2`;
  those forms and the old names `horizon` / `vertical` are gone. Full-width commas and digits are not read. `thema color` takes the rest
  of the line as a CSS colour (blanks dropped: `rgb(10, 20, 30)`)
- **Commands are `skin …`**: `main` (columns), `sub [line]` (inside a line),
  `add <line> [<position>] <panel>` / `add <panel>` / `add line [position]`, `del`, `switch ver a b [line]` / `switch hor a b`,
  `focus <line> <position>` / `focus x|x -|y|y -` / `focus abs`, `equal [-m|-s]`, `zoom [-m|-s] [n]` / `unzoom` (the focused part becomes n times
  the largest other, 10 by default: **it rewrites ratios** — the point is to spare computing ratios; the ratios before are kept as `zoom`
  and `unzoom` returns to them; commands that change ratios or order forget them), `name`, `save [<name>]`, `read <name>`
- **Moving the focus is outside panels**: the leave key (`Esc` twice) goes to the input line; the **map** (`panel_abstract`, the boxes
  of areas and panels, the focused one filled) is where `hjkl` and the arrows move (`skin focus abs`, or `:` alone), and `Enter` enters.
  An empty input line's `Enter` / `Escape` enters the focused panel. Keys inside panels (vim's `J` `K`, a list's arrows) are never taken.
  The map does not `panelFrame.init` (it is not "the panel focused last") and is not in the launcher
- **`skin add` and `skin focus` enter the panel**
- **Starts empty; panels are added while working**. The skin being worked on is per window (`sessionStorage`); saved ones open from any
  window (`~work/store/frame-skins.json` — `D-store`, `skin read`, `frame.html?skin=`), then `local/skins/<name>.json` (yours, not in git), then
  `skins/<name>.json` (shipped)
- **Panels never move in the DOM**: moving an iframe reloads it (a `code_editor`'s edits would be lost); they are positioned absolutely, only
  place and size change. Swapping never reloads
- Panel names are the launcher's (`class:"panel"` in `list_kinds/panels_and_skins.json`, invisible ones excluded)
- **Wiring as in the tree skin**: the tree's `Enter` opens in the frame's `code_editor` — the one that has the file, else "the current"
  (focused, else used last, else the first). **Never into a `code_editor` with unsaved edits**: then a `code_editor` is added (below the current
  one, else in the focused line). The same when `:find`, a grep list or `:LspDef` goes somewhere not open (the frame replaces `openNew`;
  list windows outside the frame look at the frame that opened them each time, and open a new window if it is gone). **A buffer = one
  `code_editor` panel = one file**; switching is `skin focus`. `:` lines of the input line go to the current `code_editor`, `:#` comes to the input
  line. `code.*` tezcatl commands are run by the frame focused last
- **The window's name is the skin's name** (`workspace_N`, or what `skin name` / `save` / `read` gave): the bus identity and the title
  follow it; the launcher's id (`frame-skin`, alias `frame`) stays

**Alternatives**: building on `lib/core/panes.js` (a nested tree of splits); writing skins back to JSON files at the FS root; moving
the focus with keys inside panels, or a prefix (`Esc` → `h`); fractional ratios; keeping move keys on the input line; zoom as a view
only, neither changing ratios nor saved.

**Why not**: nested trees mix axes and break easily, and `panes.js` rebuilds panels in the DOM (a swap reloads). Saving in the window's
browser is enough. Keys inside panels collide with vim and lists. Moves belong to the map; the input line is for typing lines. Zoom's
purpose is to spare computing ratios, and `unzoom` covers temporary use.

**Left**: whether a saved skin keeps the files that were open.

**Files**: `lib/skin/frame-layout.js` (pure), `lib/skin/frame-page.js` and its parts (`frame-render.js`, `frame-focus.js`,
`frame-lines.js`, `frame-code.js`, `frame-store.js`), `panels/skins/frame.html`, `panels/extra/panel_abstract.html`,
`lib/skin/panel-abstract-page.js`, `lib/skin/skin-ex.js`, `list_kinds/panels_and_skins.json`, `test/frame-layout.test.js`,
`test/e2e/frame_skin.mjs`, `test/e2e/frame_axis.mjs`.
