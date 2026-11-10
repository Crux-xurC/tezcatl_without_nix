# Adding a language

To connect a language (an extension) Tezcatl does not know to a language server and give it colours in the editors (`code`, `code_editor`) —
without touching Tezcatl's code ([D-language-plugins](../files/lib-code-code-languages.js.md#d-language-plugins)).

## 1. What goes where

| To | Write | Build |
|---|---|---|
| connect a language server only | the id and extensions in `languages` of `code.json` + the same id in `lsp.json` | none |
| colours too (a hand-written grammar) | `grammar` on top + one plugin file (§3) | none |
| colours too (a grammar from npm) | `grammar` on top + a file made with `languages/build.mjs` (§4) | node and npm (the core bundle is not rebuilt) |

Built-in languages (the table of `lib/code/code-languages.js`: `javascript`, `python`, `elixir`, `nix`, `ocaml`, `haskell` …) are coloured
with nothing written. Writing the same id in `code.json` overrides its extensions or grammar.

**Taking effect**: reopen the editor's window (`code.json` is read when a window opens). The relay need not restart (`lsp.json` is read at
every attach — but servers' commands are looked up on the relay's PATH).

## 2. The language table (`languages` in `code.json`)

```json
{
  "tabSize": 2,
  "languages": {
    "go":   { "extensions": ["go"], "filenames": ["go.mod"], "names": ["golang"],
              "grammar": "languages/go.js" },
    "zig":  { "extensions": ["zig", "zon"] }
  }
}
```

| Field | Meaning |
|---|---|
| the key (`go`) | the language id. **Make it equal to the key in `lsp.json`'s `servers`**; compared in lower case |
| `extensions` | extensions (with or without the leading `.`) |
| `filenames` | whole file names (`go.mod`, `Makefile` …) |
| `names` | aliases (usable as `code.configure {language: "golang"}`) |
| `grammar` | the grammar plugin's path, relative to Tezcatl's root (as `page` in `list_kinds`), or a URL. Without it, no colours (a built-in language keeps the bundle's grammar) |

- Lookup order: name → file name → extension; at every step the user's table beats the built-in one
- Mistyped entries are skipped; the first is shown in the editor's heading (all of them in the browser console)
- A running window can be given `code.configure {languages: {...}}` on the bus; the table is replaced whole

For a language server only, write the id and extensions here and the server under the same id in `lsp.json`:

```json
"zig": { "command": ["zls"], "rootMarkers": ["build.zig", ".git"] }
```

## 3. A grammar plugin (by hand, no build)

One ES module. **Its default export is a function that takes the kit and returns a CodeMirror Extension.**

```js
// languages/mylang.js
export default ({ language }) => language.StreamLanguage.define({
  name: 'mylang',
  token(stream) {
    if (stream.match(/^#.*/)) return 'comment';
    if (stream.match(/^(let|in)\b/)) return 'keyword';
    if (stream.match(/^"[^"]*"/)) return 'string';
    stream.next();
    return null;
  },
});
```

- The `kit` (the core bundle's `languageKit`) holds `state`, `view`, `language`, `commands`, `autocomplete`, `lint` (`@codemirror/*`) and
  `common`, `lr`, `highlight` (`@lezer/*`) — each the package's own namespace (`kit.language.StreamLanguage`, `kit.highlight.tags` …)
- **Never import CodeMirror yourself**: with two copies of a package, the grammar's tags never reach the core's highlighter and nothing is
  coloured. Take everything from `kit`
- The names `token` returns (`comment`, `keyword`, `string`, `number`, `variableName`, `typeName` …) are those of CodeMirror 5 modes; a CM5
  mode (from `@codemirror/legacy-modes` or your own) goes into `StreamLanguage.define(<mode>)` as it is
- A working example: `test/e2e/fixtures/demo-lang.js`

## 4. A Lezer grammar from npm (`languages/build.mjs`)

Grammars on npm (`@codemirror/lang-go`, `codemirror-lang-*` …) carry CodeMirror with them, so `languages/build.mjs` makes them one plugin
file: the shared parts (§3's kit packages) are rewritten to read the core bundle, everything else (the grammar's tables …) is bundled in.

1. Write a short source file (keep it in `languages/src/`):

   ```js
   // languages/src/go.js
   import { go } from '@codemirror/lang-go';
   export default () => go();
   ```

2. In a scratch directory, install the grammar and esbuild, then build:

   ```
   mkdir /tmp/lang && cd /tmp/lang && npm init -y
   npm i esbuild @codemirror/lang-go
   node <tezcatl>/languages/build.mjs <tezcatl>/languages/src/go.js
   #  -> <tezcatl>/languages/go.js
   ```

   A second argument changes where it goes (default `languages/<source name>`). The output reads the core bundle by **a path relative to
   its own place**, so keep it under Tezcatl's root

3. Write `"grammar": "languages/go.js"` in `languages` of `code.json`

- Shared parts are named by the versions installed in the scratch directory. If the grammar uses a new function of a part newer than the core
  bundle's (versions in `lib/vendor/codemirror/README.md`), loading fails — install the README's versions and build again
- Check each grammar's licence; if it is not MIT, put its text in `languages/` (Elixir's: `LICENSE-elixir`)
- The shipped examples: `languages/src/elixir.js` → `languages/elixir.js` (`codemirror-lang-elixir`); `languages/src/mariadb.js` →
  `languages/mariadb.js` (`@codemirror/lang-sql` in the MariaDB dialect — the database window's command line, `?lang=mariadb`)

## 5. Checking

- The editor's heading shows the id (`text` when no id resolves)
- No colours and `grammar <path>: …` in the heading → the plugin cannot be loaded, or its default export is not a function
- No colours and nothing said → the plugin carries its own CodeMirror (§3, §4)
- In a real browser: `test/e2e/highlight.mjs` (a sample per language, and a hand-written plugin added with `code.configure {languages}`)
