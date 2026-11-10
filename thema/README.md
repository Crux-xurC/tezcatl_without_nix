# thema — the bands' looks (styles)

The frame's block band **thema** (`panels/extra/thema.html`, `D-block`) has only the mechanism and the shape; its look is a plain coloured
band. Looks such as rounded corners or stripes are added as **styles** (CSS), used with `thema style <name>` (on the spot) or `"style"` in
a dressing `blocks/<panel>.json`.

Searched: `local/thema/<name>.css` (yours, not in git — an LCARS look, for example) → `thema/<name>.css` (shipped); none: the plain look. No
style is shipped now.

## What a style can use

The elements, marks and variables of thema's page (`panels/extra/thema.html`):

| | |
|---|---|
| `#band` | the band holding the text (`#text`); top or bottom (vertical when only right or left) |
| `#arm` | the arm running down the edge of an L (`tl` `tr` `bl` `br`); absent otherwise |
| `#corner` | the inner corner where an L's band meets its arm; not shown by the plain look (draw rounding here) |
| marks on `body` | `.side-<t\|b\|r\|l\|tl\|tr\|bl\|br>`, `.min-<band\|line>` (`block min`), `.focused`, `.style-<name>` |
| `--th-inner` | the radius (px) of an L's inner corner; two numbers for horizontal and vertical (an ellipse). When a style sets it, the frame rounds the main panel's corner by it, so `#corner` shows through as the inner curve (the panel lies over thema, so thema alone cannot draw the inner corner). Default 0 |
| `--th-arm` | an L's arm width (px). Set, the arm gets a width apart from the band's thickness and the frame moves the main panel by it (a thick arm flowing into a thin band — LCARS' elbow — is drawn this way). Default 0 (the band's thickness); up to 400 |
| `--th-armw` | the arm's current width as a length (set by the page; absent without `--th-arm` — write `var(--th-armw, var(--th-thickness))`), for placing the band's start or the corner |
| variables | `--th-<colour name>` (`base`, `info`, `warn`, `alert`, `calm`; names a style adds work directly in `thema color <name>`), `--th-color` (the band's colour now), `--th-fg` (text), `--th-gap` (the ground outside the band), `--th-thickness`, `--th-dim` (brightness when not focused, default .6) |

Rules:

- The main panel moves by the band's thickness (`thickness`); on an L's arm side, by `--th-arm` if a style sets it, else the same thickness
- After rewriting a style, reloading the window draws the new version (the browser's cache is not used)
- The band's text is what the panel said about itself (`panel.status`) or made from Tezcatl's own messages; a style never adds text
- Right- or left-only bands show no text (`lib/skin/thema.js`); to show it turned, a style writes `.side-l #text { writing-mode: vertical-rl;
  }` or similar, and `thema.show` is extended to return the text
