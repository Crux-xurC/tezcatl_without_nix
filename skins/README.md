# skins — the skins shipped as a baseline

Skins saved with `skin save` in the frame (`panels/skins/frame.html`), the ones the repository ships. One skin is one file
`skins/<name>.json`, whose contents are exactly the JSON `skin save` prints on the receiving side.

## Where `skin read` looks

`skin read <name>` and `frame.html?skin=<name>` look in this order and open the first found (`findSaved` in `lib/skin/frame-store.js`):

| Order | Place | What | git |
|---|---|---|---|
| 1 | this browser's storage (localStorage) | what `skin save` saved; work in progress lives here | — |
| 2 | `local/skins/<name>.json` | yours only (your arrangements, looks of your own such as an LCARS version) | not in git |
| 3 | `skins/<name>.json` (here) | the shipped baseline | in git |

Only names usable as file names (letters, digits, `_` `.` `-`) are read from files.

## Now and when publishing

- Skins built now may live in the browser through `skin save`; looks only for you go under `local/` (skins, panels and CSS)
- When publishing, the skins to ship are written from `skin save`'s JSON into `skins/<name>.json`. An LCARS look is not shipped; it is shown
  as pictures or video of real use, leaving to each user whether to make it LCARS
