# vendored: CodeMirror 6 (bundled)

Third-party code, committed on purpose. Tezcatl is zero-build at runtime (the
browser reads plain files, no bundler, no npm) and CDN loading is ruled out
because it breaks the "runs locally / offline" premise (overview.md §1) --
same rules as `lib/vendor/xterm/`.

Unlike xterm.js, CodeMirror 6 ships **no** UMD/global build: it is ESM split
across ~20 packages. So there is one vendoring-time step: `entry.js` names
exactly what `panels/code.html` imports, and `esbuild` rolls it up into a
single ESM file, `cm.bundle.js`, loaded with `<script type="module">`. The
runtime is still zero-build -- the browser fetches one file.

License: MIT (see `LICENSE` -- CodeMirror's, `Copyright (C) 2018-2021 by
Marijn Haverbeke and others`). Every bundled package below is MIT with the
same or a compatible copyright line, so one `LICENSE` covers them. (The
Elixir grammar, Apache-2.0, is not in this bundle: it is the grammar plugin
`languages/elixir.js`, with its license in `languages/LICENSE-elixir`.)

## What is here

| file | what |
|------|------|
| `cm.bundle.js` | the built bundle. `panels/code.html` imports from this. **generated -- do not edit** |
| `entry.js`     | the bundle's source: the import/export list. Edit this, then rebuild |
| `LICENSE`      | MIT (CodeMirror) |
| `merge.bundle.js` | `@codemirror/merge` (the code_diff panel). **generated -- do not edit**. See "merge.bundle.js" below |
| `merge-entry.js`  | its source: what it exports |
| `markdown.bundle.js` | `@lezer/markdown` with GFM (the markdown panel). **generated -- do not edit**. See "markdown.bundle.js" below |
| `markdown-entry.js`  | its source: what it exports |

`cm.bundle.js` (esbuild 0.28.2, `--format=esm --minify --target=es2020`):

- size 1,183,402 bytes (~395 KB gzipped). Rebuilt 2026-10-06: OCaml / Haskell
  / Nix grammars added, and `languageKit` exported (D-language-plugins)
- sha256 `0086bfb837a7b168f94655fe505b6a6d10aa6be2da475dd059a990617805e289`
- SRI    `sha384-z5pCWprpGed4F2hsLJSGQVDVftYV+q5rE7pYmy7SsXkiL9qS1bLNOu674aNxbMP1`

No `.map` is vendored (browser devtools 404s it silently; nothing else cares).

CodeMirror injects its own CSS from JS (StyleModule) -- there is no
stylesheet to vendor, unlike `xterm.css`.

## Exports (what `cm.bundle.js` provides)

From `entry.js`: `EditorState`, `EditorSelection`, `Compartment`, `Prec`,
`EditorView`, `keymap`, `history`, `historyKeymap`, `syntaxHighlighting`,
`defaultHighlightStyle`, `oneDark`, `vim`, `Vim`, `getCM`, `emacs`,
`indentUnit`, `LSPClient`, `languageServerSupport`, `serverDiagnostics`,
`lintGutter`, `Decoration`, `gutter`, `GutterMarker`, `languageKit`, plus
two helpers:

`emacs` (from `@replit/codemirror-emacs`) is the third keymap adapter in
`lib/code-editor.js` (`code.json` `"keymap"`, alongside `default` / `vim`).
`indentUnit` backs the `code.json` `"indentUnit"` knob. `LSPClient` +
`languageServerSupport` + `serverDiagnostics` + `lintGutter` are webLSP:
`code-editor.js` opens a `/lsp` WebSocket, wraps it as an `LSPClient`
`Transport`, constructs `new LSPClient({ extensions: [serverDiagnostics()] })`
and adds `languageServerSupport(client, fileUri)`. `languageServerSupport`
covers completion / hover / signature help only; `serverDiagnostics()` is the
*client* extension that turns `textDocument/publishDiagnostics` into
`@codemirror/lint` diagnostics (drawn by `lintGutter`).

`Decoration` / `gutter` / `GutterMarker` are the decoration surface
`lib/code-editor.js` builds its `code.mark` / `code.gutter` layers from (diff
+/- lines, LSP diagnostics, search matches). They are re-exported raw -- the
layer logic lives in `code-editor.js`, not here.

`languageKit` is what grammar plugins build from (D-language-plugins,
`docs/extending/languages.md`): the whole `@codemirror/{state,view,language,
commands,autocomplete,lint}` and `@lezer/{common,lr,highlight}` namespaces,
short-named (`kit.language`, `kit.highlight`, ...) and by package name
(`kit.packages["@codemirror/language"]`). A plugin takes them from here
instead of carrying its own copy -- two copies of `@codemirror/language`
means no highlighting. Exporting whole namespaces turns off tree shaking for
these packages; they were nearly all in the bundle already.

- `basicSetup()` -> the editing basics (line numbers, folding, bracket
  matching, autocomplete, the default keymaps, ...). Everything EXCEPT theme,
  language, `readOnly`, `updateListener`, `vim`, and **history** -- those
  `code.html` adds itself. History is separate so `code.html` can keep it in
  a `Compartment` and reconfigure (drop stale undo) on `code.set`.
- `languageExtension(id)` -> a language `Extension` for one of the ids below,
  or `[]` for `null` / unknown. `languageIds()` lists them.

## Bundled versions

Core (`@codemirror/*` unless noted), from the npm registry:

| package | version |
|---|---|
| @codemirror/state | 6.7.4 |
| @codemirror/view | 6.43.11 |
| @codemirror/commands | 6.11.0 |
| @codemirror/language | 6.12.4 |
| @codemirror/search | 6.7.2 |
| @codemirror/autocomplete | 6.20.3 |
| @codemirror/lint | 6.9.7 |
| @codemirror/theme-one-dark | 6.1.3 |
| @codemirror/legacy-modes | 6.5.4 |
| @replit/codemirror-vim | 6.4.0 |
| @replit/codemirror-emacs | 6.1.0 |
| @codemirror/lsp-client | 6.2.5 |
| marked (lsp-client dep, hover markdown) | 15.0.12 |
| vscode-languageserver-protocol (lsp-client dep) | 3.18.3 |
| vscode-jsonrpc (transitive) | 9.0.2 |
| vscode-languageserver-types (transitive) | 3.18.3 |
| @lezer/common | 1.5.2 (pinned: transitive deps would pull 1.5.3) |
| @lezer/highlight | 1.2.3 (pinned: would pull 1.2.5) |
| @lezer/lr | 1.4.10 |
| style-mod | 4.1.3 |
| w3c-keyname | 2.2.8 |
| crelt | 1.0.7 |
| @marijn/find-cluster-break | 1.0.4 |

Languages -- first-party Lezer grammars:

| package | version | id |
|---|---|---|
| @codemirror/lang-javascript | 6.2.5 | `javascript` (jsx + ts on) |
| @codemirror/lang-json | 6.0.2 | `json` |
| @codemirror/lang-html | 6.4.12 | `html` |
| @codemirror/lang-css | 6.3.1 | `css` |
| @codemirror/lang-markdown | 6.5.2 | `markdown` |
| @codemirror/lang-yaml | 6.1.3 | `yaml` |
| @codemirror/lang-python | 6.2.1 | `python` |
| @codemirror/lang-rust | 6.0.2 | `rust` |
| @codemirror/lang-cpp | 6.0.3 | `cpp` |
| @codemirror/lang-sql | 6.10.0 | `sql` |
| @codemirror/lang-xml | 6.1.0 | `xml` |

Languages -- `@codemirror/legacy-modes` 6.5.4 stream parsers (CM5-era, no
parse tree, adequate highlighting): ids `shell`, `lua`, `toml`, `diff`,
`dockerfile`, `ruby`, `erlang`, `ocaml` (mode `mllike`), `haskell`.

Languages -- community Lezer grammars (2026-10-06):

| package | version | license | id |
|---|---|---|---|
| @replit/codemirror-lang-nix | 6.0.1 | MIT | `nix` |

Elixir is a grammar plugin, not in the bundle: `languages/elixir.js`, built
by `languages/build.mjs` from `languages/src/elixir.js`
(`codemirror-lang-elixir` 4.0.1 + `lezer-elixir` 1.1.3, Apache-2.0, ~150 KB --
loaded only when an Elixir file is opened).

The first-party grammars' own `@lezer/<lang>` packages are not pinned (the
table above lists only what is named on the install line): rebuilding the
pre-2026-10-06 `entry.js` with these pins gave 1,143,649 bytes, not the
1,130,664 then committed, so those transitive versions had already moved.

Checked in a real browser by `test/e2e/highlight.mjs` (each language's
sample gets highlighted tokens; a `.txt` stays plain).

## Rebuilding (by hand)

Needs `nodejs` + network for the one-time install (both in `nix develop`;
`esbuild` comes from npm).

```
mkdir -p /tmp/cmbuild && cd /tmp/cmbuild
printf '{ "name": "x", "private": true, "type": "module" }' > package.json
# versions as in the tables above; drop the @x.y.z to take the latest
npm install --no-audit --no-fund \
  @codemirror/state@6.7.4 @codemirror/view@6.43.11 @codemirror/commands@6.11.0 \
  @codemirror/language@6.12.4 @codemirror/search@6.7.2 @codemirror/autocomplete@6.20.3 \
  @codemirror/lint@6.9.7 @codemirror/theme-one-dark@6.1.3 @codemirror/legacy-modes@6.5.4 \
  @replit/codemirror-vim@6.4.0 @replit/codemirror-emacs@6.1.0 @codemirror/lsp-client@6.2.5 \
  @codemirror/lang-javascript@6.2.5 @codemirror/lang-json@6.0.2 @codemirror/lang-html@6.4.12 \
  @codemirror/lang-css@6.3.1 @codemirror/lang-markdown@6.5.2 @codemirror/lang-yaml@6.1.3 \
  @codemirror/lang-python@6.2.1 @codemirror/lang-rust@6.0.2 @codemirror/lang-cpp@6.0.3 \
  @codemirror/lang-sql@6.10.0 @codemirror/lang-xml@6.1.0 \
  @replit/codemirror-lang-nix@6.0.1 esbuild@0.28.2
npm install --no-audit --no-fund @lezer/common@1.5.2 @lezer/highlight@1.2.3 @lezer/lr@1.4.10
npm ls @codemirror/language @codemirror/state   # one copy each, or highlighting breaks
cp <repo>/lib/vendor/codemirror/entry.js .
./node_modules/.bin/esbuild entry.js --bundle --format=esm --minify \
  --legal-comments=none --target=es2020 --outfile=cm.bundle.js
node --check cm.bundle.js
sha256sum cm.bundle.js
openssl dgst -sha384 -binary cm.bundle.js | openssl base64 -A   # SRI
cp cm.bundle.js <repo>/lib/vendor/codemirror/
```

Then update the versions, size and hashes above. If an export name or a
helper's shape changed, update `panels/code.html`.

## merge.bundle.js (the code_diff panel)

`@codemirror/merge` 6.12.2 (MIT) is not in `cm.bundle.js`: it is its own
file, built like a grammar plugin (`languages/build.mjs`), so `cm.bundle.js`
and its pinned versions are not rebuilt. The shared packages
(`@codemirror/state`, `view`, `language`, `@lezer/highlight` ...) are read
from `cm.bundle.js`'s `languageKit`; `style-mod` 4.1.4 is carried inside (its
instances are used through the shared `@codemirror/view`). Loaded only by
`lib/code/code-diff-page.js`. Exports: `MergeView`, `goToNextChunk`,
`goToPreviousChunk`.

- size 28,022 bytes
- sha256 `28e15747e9914bb52d6b34ab05e8473fac2c30d3794fbe2025565be25de6bc05`
- SRI    `sha384-ucPpkTkr5eMpZXWHUI9bsb0h3cxdFss22ZN4fm/VixKKw+NDfNY09xnDDF8DLXAp`

Rebuilding: in the install directory of "Rebuilding (by hand)" (the shared
packages at the versions above, so their export names match),
`npm install --no-audit --no-fund @codemirror/merge@6.12.2`, then
`node <repo>/languages/build.mjs <repo>/lib/vendor/codemirror/merge-entry.js <repo>/lib/vendor/codemirror/merge.bundle.js`.

Checked in a real browser by `test/e2e/work_place.mjs`.

## markdown.bundle.js (the markdown panel)

`@lezer/markdown` 1.7.2 (MIT) with its GFM extensions (tables,
strikethrough, task lists, autolinks). `cm.bundle.js` has the CommonMark
parser inside `@codemirror/lang-markdown`, but neither GFM's table parser nor
a way to reach the parser to configure it. Built like `merge.bundle.js`
(`languages/build.mjs`): `@lezer/common` and `@lezer/highlight` are read
from `cm.bundle.js`'s `languageKit`. 1.7.2, not the latest 1.8.0: that one
was 10 days old when this was built (2026-10-17). Loaded only by
`lib/code/markdown-page.js`. Export: `parser` (CommonMark + GFM).

- size 35,398 bytes
- sha256 `50d3ba283f8927a108108187cef92c01bebbbb3a029b6f16605b3661078c4bed`
- SRI    `sha384-RQepM73nlfOUCAAh0E+E0B+5ndIumVry41tyUnhOTZzOyftPENLSLYEwv1QujguL`

Rebuilding: in an empty directory,
`npm install --no-audit --no-fund @lezer/common@1.5.2 @lezer/highlight@1.2.3 @lezer/lr@1.4.10 @lezer/markdown@1.7.2 esbuild@0.28.2`
(`npm ls @lezer/common` -- one copy), then
`node <repo>/languages/build.mjs <repo>/lib/vendor/codemirror/markdown-entry.js <repo>/lib/vendor/codemirror/markdown.bundle.js`.

Checked in a real browser by `test/e2e/markdown.mjs`.

## Adding a language

Usually: don't touch the bundle. Add the language in `code.json`
`languages` and, for highlighting, a grammar plugin (`docs/extending/languages.md`).
Rebuilding `languages/elixir.js` (the same install directory works):
`npm i codemirror-lang-elixir@4.0.1` there, then
`node <repo>/languages/build.mjs <repo>/languages/src/elixir.js`.

To put a grammar into the bundle itself instead (small ones every user
wants):

1. First-party grammar exists? `npm i @codemirror/lang-<x>`, `import` it in
   `entry.js`, add `<id>: () => <x>()` to `LANGS`, rebuild.
2. Otherwise a `@codemirror/legacy-modes/mode/<x>` stream parser:
   `import { <x> } from "@codemirror/legacy-modes/mode/<x>"`, add
   `<id>: () => StreamLanguage.define(<x>)` to `LANGS`, rebuild.
3. Map the file extension(s) to `<id>` in `lib/code-languages.js` and add a
   case to `test/code-languages.test.js`.
