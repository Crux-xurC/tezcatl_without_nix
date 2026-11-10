# `lib/skin/dock-layout.js`

The frame's dock as data (D-dock): what a dock is made of and how its parts are laid out, and the `dock …` commands.

**Decisions homed here**: [D-dock](#d-dock)

**Takes part in**: [D-suggestions](lib-skin-suggest.js.md#d-suggestions)

<a id="d-dock"></a>

## D-dock — the dock is a unit of a skin with a fixed set of parts; parts and layout are `docks/<name>.json`, changes on the spot go into the skin

**Decided**: the dock is a unit thought like a block (`D-block` is "a panel + its thema"; the dock is "the input line, the receiving
side, the destination, the map, the virtual keyboard … — a fixed set of parts"). Part iframes are direct children of the frame's page;
there is no container page (for the reason `D-block` refused one: the wiring that assumes the frame is a panel's parent must not be cut).

- **Its dressing is `docks/<name>.json`**: `parts` (a part's name → a panel's name, `"@form"`, `"@recv"`, `"@gsel"`, `"@sugg"`, or
  `null` for a part not made yet) and a CSS grid per side — below (`b`), left (`l`), right (`r`): `areas`, `rows`, `cols` (`"r": "l"`:
  the same) — thickness and the first side. Searched as blocks are (`local/docks/` → `docks/` → built in; the built-in one equals
  `docks/standard.json`, watched by a test). How to write one: `docks/README.md`
- **The input line and the receiving side stay the frame page's own** (`@form`, `@recv`), placed in one area of the grid; not iframes —
  the frame's own behaviours (where the leave key returns, empty-line Enter/Esc, `:#` …) are tied to the frame's DOM (and 25 E2E scenarios
  look at those ids)
- **Changing it on the spot is by commands**: `dock side l|b|r` (parts never move in the DOM, so nothing reloads), `dock size <length>`,
  `dock rows a,b,…`, `dock cols a,b,…`, `dock reset` (thickness and ratios; the side stays). Thickness and ratios are kept per side (a
  ratio for below does not fit the left). What changed goes into the frame's state `dock` and into `skin save`'s JSON (changes only)
- **One page for the variants**: `frame.html?dock=l|b|r` sets only the first side of a skin that has none; the launcher lists `frame-bd`,
  `frame-ld`, `frame-rd`. Saved skins without `dock` read as `standard`, below
- **A part not made yet is an empty box** with its name dimmed; making it is changing `null` to the panel's name in `parts`
- **`How_to_use`** draws the input line's use from the lead-key table (`lib/core/lead.js` with `config.json`'s `ui.keys` over it) and
  `command_map.json` (what shortcuts do, commands with a `line`) — rebinding or adding commands never makes it wrong
  (`lib/skin/how-to-use.js`). **`clock`** shows the time (instead of a logo). Both only show: no keys, no bus messages, never "the panel
  focused last" (like the map and the virtual keyboard)

**Alternatives**: a container page `dock.html`; a page per side (`frame-ld.html` …); making the input line and the receiving side panels.

**Why not**: the container page cuts the wiring (as in `D-block`); pages per side keep three copies of the same thing; the input and the
receiving side carry the frame's own behaviours (the lone `input_leadkey` panel remains).

**Files**: `lib/skin/dock-layout.js`, `docks/standard.json`, `docks/README.md`, `lib/skin/frame-dock.js`, `lib/skin/frame-lines.js`
(`dock …`), `lib/skin/frame-layout.js` (carries `dock`), `lib/skin/frame-focus.js`, `lib/skin/frame-page.js`, `lib/skin/how-to-use.js`,
`lib/skin/how-to-use-page.js`, `panels/extra/How_to_use.html`, `panels/extra/clock.html`, `panels/skins/frame.html`,
`list_kinds/panels_and_skins.json`, `test/dock-layout.test.js`, `test/how-to-use.test.js`, `test/e2e/frame_dock.mjs`.
