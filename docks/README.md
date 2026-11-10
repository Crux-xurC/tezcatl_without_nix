# docks/ — how the frame's dock is dressed

The dock is a unit placed outside the frame's columns (`panels/skins/frame.html`) with a fixed set of parts (`D-dock`). A `<name>.json` here
decides its parts and how they are laid out below, left and right (CSS grids). Searched like blocks: `local/docks/<name>.json` (not in git,
yours) → `docks/<name>.json` → built in (`DEFAULT` of `lib/skin/dock-layout.js`, the same as `standard.json`).

```json
{
  "name": "standard",
  "side": "b",
  "size": { "b": "14em", "l": "36em", "r": "36em" },
  "parts": { "map": "panel_abstract", "form": "@form", "recv": "@recv", "help": null },
  "grid": {
    "b": { "areas": ["help form recv", "map form recv"], "rows": [1, 2], "cols": [2, 6, 6] },
    "l": { "areas": ["help map", "form form", "recv recv"], "rows": [1, 1, 3], "cols": [1, 1] },
    "r": "l"
  }
}
```

| Field | Meaning |
|---|---|
| `side` | the side a new frame's dock stands on (`b` below, `l` left, `r` right); `frame.html?dock=l` wins |
| `size` | the thickness per side (the height below, the width left and right): `em`, `rem`, `px`, `%`, `vh`, `vw` |
| `parts` | a part's name → a panel's name (a direct child iframe of the frame; the page from `list_kinds/panels_and_skins.json`, else `panels/extra/<name>.html`), `"@form"` (the input line), `"@recv"` (the receiving side), `"@gsel"` (the candidates' source on one line), `"@sugg"` (the candidates' shell — `D-suggestions`), or `null` (a part not made yet — an empty box with its name dimmed) |
| `grid` | a CSS grid per side: `areas` is one string per row with part names separated by blanks (`.` is empty; one name must form a rectangle); `rows` and `cols` are integer ratios (`fr`); `"r": "l"` means "right is like left" |

The standard dock's bottom row is `dbls` (`db_list`, the database windows, `D-db-session`): one line high; `db list open` / `close` change
that row's size (kept in the skin as its `dock rows`).

Every dock has exactly one `@form` and one `@recv` (the input line and the receiving side belong to the frame's page).

`Shift+arrow` moves to the part that takes keys next to it in that direction on the grid (`@form`, `@gsel`, `@sugg`, `input_target`,
`output_target`); rearrange the grid and the arrows follow what you see.

What is changed on the spot (`dock side`, `dock size`, `dock rows`, `dock cols`; `dock reset` removes them) is kept not in a file but in the
skin (`"dock"` in `skin save`'s JSON). The commands: [command/README.md](../command/README.md).
