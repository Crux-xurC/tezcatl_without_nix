# `lib/code/code-languages.js`

A file name, path or language name → the language id the bundle builds (and the user's language table).

**Decisions homed here**: [D-language-plugins](#d-language-plugins)

<a id="d-language-plugins"></a>

## D-language-plugins — languages are a table the user owns; grammars are plugins that borrow the core's parts

**Decided** (Tezcatl is also a platform, so extending must be easy): adding a language touches neither Tezcatl's code nor the vendored
bundle.

| To add | Write |
|---|---|
| LSP only | `languages` in `code.json`: `{ "<id>": { "extensions": [...] } }`, and the same id in `lsp.json` |
| highlighting too | `"grammar": "<path of a grammar plugin>"` (from Tezcatl's root) on top |

- **The table**: the built-in table of `lib/code/code-languages.js` (extension, file name, name → id), overlaid by `languages` in
  `code.json` (`{ <id>: { extensions?, filenames?, names?, grammar? } }`); the user's entries win. `code.configure {languages}` replaces
  it whole. The id is `lsp.json`'s key (an id that resolves makes the editor attach to `/lsp`)
- **A grammar plugin**: one ES module whose default export is `(kit) => Extension`. `kit` is the core bundle's `languageKit` — the
  namespaces of `@codemirror/{state,view,language,commands,autocomplete,lint}` and `@lezer/{common,lr,highlight}`
  (`kit.language.StreamLanguage` …). The editor `import()`s it when a file opens, once per page; a failure means no colours and the
  reason in the heading
- **Two ways to make one**: by hand (a CM5-era mode or a tokenizer of one's own, `StreamLanguage.define`) — one file, no build; an npm
  Lezer grammar through `languages/build.mjs` — the shared parts' imports rewritten to read the core's `languageKit.packages`, the rest
  bundled in
- **Languages shipped**: inside the bundle (`entry.js`'s `LANGS`) or as plugins of the same kind (`languages/`, now `elixir.js`,
  pointed at by the built-in table's `GRAMMARS`), chosen by size (Elixir's grammar, ~150 KB, loads only when opened)

**Alternatives**: edit `entry.js` and rebuild the core bundle per language; plugins bundling CodeMirror each (self-contained); an
import map sending `@codemirror/*` to the core bundle.

**Why not**: rebuilding makes users match vendored versions (npm, esbuild, the list of pinned versions). Self-contained plugins make
two `@codemirror/language`s, and the grammar's tags never reach the core's highlighter — no colours (a known CM6 property). An import map
must be written in every editor page (six `code*.html`), not one place in `code-editor.js`.

**What it removed**: the unused hook `languages` in `code.json` got its use; adding LSP alone no longer needs `code-languages.js` edited
(an id that does not resolve never attaches).

**Files**: `lib/code/code-languages.js` (`configure`, `grammar`), `lib/code/code-editor.js` (`applyLanguages`, `loadGrammar`),
`lib/vendor/codemirror/entry.js` (`languageKit`), `languages/` (`build.mjs`, `src/`, `elixir.js`, `LICENSE-elixir`), `code.json`,
[docs/extending/languages.md](../extending/languages.md), `test/e2e/highlight.mjs`, `test/e2e/fixtures/demo-lang.js`.

## Selection and revision notes

(Moved from the comments of `lib/code/code-languages.js`, 2026-09-10.)

code-languages.js -- resolve a filename / path / language name to one of the language ids that lib/vendor/codemirror/cm.bundle.js knows how
to build (`languageExtension(id)`), or null for "plain text".

This is Tezcatl logic, not CodeMirror's: CM only wants a language Extension, never a filename. panels/resident/code.html is deliberately
minimal and does NOT decide what is being edited -- the orchestrator (a skin, a file panel, or a ?lang= query for standalone use) tells it,
and code.html runs the hint through here. Kept as a plain IIFE (like config.js / ws.js) so test/code-languages.test.js can require() it
under `node --test`.

`ruby` / `erlang` are bundled only as manual approximations (`code.configure { language: "ruby" }` for an .ex file); no extension maps to them
automatically except the real .rb / .erl. Canonical ids must stay in sync with LANGS in lib/vendor/codemirror/entry.js. Tables: exact
basename (lowercased) -> id, for files with no useful extension; extension (no dot, lowercased) -> id; a bare language name / alias -> id.
hint: a path ("lib/core/ws.js"), a filename ("Dockerfile"), an extension (".rs" / "rs"), or a language name ("javascript" / "shell-script").
Returns a canonical id string, or null for plain text / unknown. A leading-dot token with no other dot (".rs", ".bashrc") is a bare
extension: the dotfile names that matter (".bashrc" -> shell) are in BY_FILENAME and caught first.

Record:

- Resolves file name / path / language name → the id the bundle builds; the file name is Tezcatl's concern, not CM's.
  `test/code-languages.test.js` came with it
- **`elixir`, `nix`, `ocaml` became real ids** with the LSP languages (`ex` `exs` `eex` `heex` `leex` → `elixir`, `nix`, `ml` `mli` `mll`
  `mly` → `ocaml`, file names `mix.exs`, `dune-project`, `dune`, `dune-workspace`): even without a grammar, a non-null id makes
  `attachLsp(path, langId)` fire, so diagnostics, completion and hover work (checked in a real browser)
- **Four grammars in the bundle** — `ocaml` (legacy-modes' `mllike`), `haskell` (legacy-modes), `nix` (`@replit/codemirror-lang-nix`),
  `elixir` (`codemirror-lang-elixir`, Apache-2.0; moved later into the plugin `languages/elixir.js`); checked by `test/e2e/highlight.mjs`
- **The user's language table and grammar plugins** (`D-language-plugins`): `configure(table)` (`code.json`'s `languages`, replacing the
  user's table whole, returning problems), `grammar(id)` (the plugin's path), the shipped plugins `GRAMMARS` (`elixir` →
  `languages/elixir.js`); `resolve` looks at the user's table first at each step; `list()` returns the user's ids too
