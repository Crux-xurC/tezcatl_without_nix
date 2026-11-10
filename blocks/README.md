# blocks — how each panel is dressed as a block

The frame's `skin add` places a panel as a **block**: the panel and the band **thema** around it (`panels/extra/thema.html`), showing one
line of text and a colour (`D-block`). Here each panel's default dressing is `<panel>.json`.

```json
{ "panel": "code_editor", "source": "file", "side": "t", "color": "base", "thickness": 24 }
```

| Key | Value | Default |
|---|---|---|
| `source` | where the line comes from: `name` (place and panel name), `file` (that panel's file; ● and the warning colour when unsaved), `status` (what the panel posts as `panel.status {text, level}`) | `name` |
| `side` | where the band is: `t` `b` `r` `l` (no text on right or left bands), or an L: `tl` `tr` `bl` `br` | `t` |
| `color` | a palette name (`base`, `info`, `warn`, `alert`, `calm`) or a CSS colour; a `level` (`info`, `warn`, `alert`) wins | `base` |
| `thickness` | the band's thickness (px, 4–200) | `24` |
| `style` | the band's look ([thema/README.md](../thema/README.md)) | none |
| `at` | the area `skin add <panel>` (without an area) places it in | none (the focused area) |

Searched like skins ([skins/README.md](../skins/README.md)): this browser (`block new`, `block place`) over `local/blocks/<panel>.json`
(yours, not in git — looks such as rounded `thema-lcars` live here) over `blocks/<panel>.json` (shipped); otherwise the default (the panel's
name on top). A skin keeps only what was changed on the spot (`block arrange`'s side …); the dressing itself is read from here each time.

Turning text along a right or left band, rounding corners and such looks are added over thema's page by a skin or CSS under `local/` (see
the CSS notes in `panels/extra/thema.html`).
