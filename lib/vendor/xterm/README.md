# vendored: xterm.js

Third-party code, committed to the repo on purpose. Tezcatl is zero-build
(no bundler, no npm at runtime — the browser reads plain `<script>` files),
and CDN loading is ruled out because it breaks the "runs locally / offline"
premise (overview.md §1). So the xterm.js distribution files live here,
updated by hand.

License: MIT (see `LICENSE`). This is `lib/vendor/` third-party code only;
the repository itself has no root `LICENSE` yet (overview.md §12).

## What is here

| file | package | version | copied from (inside the npm tarball) |
|------|---------|---------|--------------------------------------|
| `xterm.js`          | `@xterm/xterm`             | 6.0.0  | `package/lib/xterm.js`             |
| `xterm.css`         | `@xterm/xterm`             | 6.0.0  | `package/css/xterm.css`            |
| `addon-fit.js`      | `@xterm/addon-fit`        | 0.11.0 | `package/lib/addon-fit.js`         |
| `addon-unicode11.js`| `@xterm/addon-unicode11`  | 0.9.0  | `package/lib/addon-unicode11.js`   |
| `LICENSE`           | `@xterm/xterm`             | 6.0.0  | `package/LICENSE`                  |

All files are the upstream UMD builds. Loaded with a plain `<script>` tag
they define globals on `window`:

- `xterm.js`           → `window.Terminal`
- `addon-fit.js`       → `window.FitAddon`        (class: `new FitAddon.FitAddon()`)
- `addon-unicode11.js` → `window.Unicode11Addon`  (class: `new Unicode11Addon.Unicode11Addon()`)

Load `xterm.js` before the addons. `xterm.css` is a plain stylesheet with no
external `url()` references (no fonts/images to vendor).

`addon-unicode11` uses `term.unicode`, which xterm.js 6.0 gates behind a
"proposed API" flag (5.x had it on by default). Construct the terminal with
`new Terminal({ allowProposedApi: true, ... })` or `loadAddon` throws
"You must set the allowProposedApi option to true".

The `.js` files keep their trailing `//# sourceMappingURL=…` comment but the
`.map` files are **not** vendored (~2.1 MB, not needed here). Browser devtools
will silently 404 the maps; nothing else is affected.

## Source and integrity

Tarballs from the npm registry:

- https://registry.npmjs.org/@xterm/xterm/-/xterm-6.0.0.tgz
  - sha256  `908e66e04af6c8dc6b00dd3b54de088e2e81e5ed866284fd6c2fb3c2d1c7a3f6`
  - SRI     `sha256-kI5m4Er2yNxrAN07VN4Iji6B5e2GYoT9bC+zwtHHo/Y=`
- https://registry.npmjs.org/@xterm/addon-fit/-/addon-fit-0.11.0.tgz
  - sha256  `26003b4517a132b64e4ff228fd88a5fda3fff5e606c76093f6dcff772e9ecec0`
  - SRI     `sha256-JgA7RRehMrZOT/Io/Yil/aP/9eYGx2CT9tz/dy6ezsA=`
- https://registry.npmjs.org/@xterm/addon-unicode11/-/addon-unicode11-0.9.0.tgz
  - sha256  `b665667792f916873fe946ba98cc98a1a742af08e163fb66e1c0809c120ca42e`
  - SRI     `sha256-tmVmd5L5Foc/6Ua6mMyYoadCrwjhY/tm4cCAnBIMpC4=`

`addon-fit` 0.11.0 and `addon-unicode11` 0.9.0 each ship the same MIT text
with the single copyright line `Copyright (c) 2019, The xterm.js authors`,
which is already covered by `LICENSE` here — so one `LICENSE` file suffices
for all four vendored files.

## Updating (by hand)

1. Pick the new versions. `@xterm/*` releases the matching addon set on the
   same day as a core release; use that set, not a mismatched mix.
2. For each package:
   ```
   curl -sLO https://registry.npmjs.org/@xterm/xterm/-/xterm-<ver>.tgz
   sha256sum xterm-<ver>.tgz              # record it below
   nix hash file --type sha256 --sri xterm-<ver>.tgz
   tar xzf xterm-<ver>.tgz
   ```
3. Copy the files listed in the "What is here" table to this directory,
   keeping these names (do not add a version to the filename).
4. `node --check xterm.js addon-fit.js addon-unicode11.js`
5. Update the version numbers, URLs and hashes in this README.
6. If a global name or the `new X.X()` shape changed, update
   `panels/xterm.html` (the implementation) to match.

## Addons deliberately NOT vendored

- **`@xterm/addon-web-links`** — not included. overview.md §4.3 wants the
  terminal to detect `path:line:col` and open the file. That is a *custom
  link provider* (`terminal.registerLinkProvider(...)`), not URL detection.
  `addon-web-links` only linkifies real URLs (`http://…`), so it does not
  do the job. If a URL-linkifier is ever wanted, it is ~4 KB; the addon's
  `WebLinkProvider` source is also the reference for writing the custom
  `path:line:col` provider.
- **`@xterm/addon-canvas` / `@xterm/addon-webgl`** — renderer accelerators.
  The default DOM renderer is enough for a LAN dev tool.
- **`addon-search` / `addon-serialize` / `addon-attach` / others** — not
  needed for Phase 8. `addon-attach` in particular assumes a raw-stream WS;
  Tezcatl's PTY transport is framed (panels/xterm.html decision 3).
