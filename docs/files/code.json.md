# `code.json`

The editor's settings: tab size, keymap, font, autosave, vim keys, copies, clones, LSP waits, juncture limits, languages.

**Takes part in**: [D-command-target](lib-core-commands.js.md#d-command-target), [D-juncture](lib-code-juncture.js.md#d-juncture), [D-language-plugins](lib-code-code-languages.js.md#d-language-plugins), [D-mirror](lib-relay-mirror.exs.md#d-mirror), [D-vim-via-input-line](lib-skin-skin-ex.js.md#d-vim-via-input-line)

## Selection and revision notes

The CodeMirror editor's settings, fetched by `lib/code/code-editor.js` itself (`Tezcatl.config.sibling('code.json')`).

Knobs (as first made; more came later — `keys`, `mirror`, `clone`, `fileChanges`, `lsp`, `juncture`, `inputFormEx`, `languages`):

- `tabSize` — the width a literal Tab is drawn
- `indentUnit` — what Tab and auto-indent insert (`"  "` …); needed the bundle rebuilt
- `lineWrapping` — bool
- `keymap` — `"default"` | `"vim"` | `"emacs"` (the other panes); `editorKeymap` — the same, for the file editor
- `keys` — per keymap (`{"vim": {…}, "emacs": {…}}`; the older flat form is vim's), over `DEFAULT_KEYS` of `lib/code/editor-keys.js`
- `inputLineEx` — `true` | `false`: whether the skin's input line sends `:` lines to the file editor; absent, only vim
  ([D-code-editor](panels-resident-code_editor.html.md#d-code-editor))
- `fontFamily` / `fontSize` — the editor's font (apart from the terminal's `ui.terminal`; an `EditorView.theme` compartment)
- `autosave` — `false` | a debounce in ms; held back when `baselinePath===null` or read-only
- `languages` — at first an unread hook; now the user's language table (`D-language-plugins`)

Policies agreed then:

- `basicSetup()` is kept whole (no knobs for details such as `lineNumbers`)
- no `theme` knob — `oneDark` fixed
- the `EditorView` is built with the defaults synchronously; when `code.json` arrives, compartments (`cfgComp`, `keymapComp` …) are
  reconfigured live (the same late overlay as `resolver.load()`)
- keymap priority: `opts.keymap` > `?keymap=` > `code.json` > the default. The file editor (`code_editor.html`) reads `editorKeymap`
  (default `"vim"`), every other pane `keymap` (default `"default"`) — [D-code-editor](panels-resident-code_editor.html.md#d-code-editor)
  (until 2026-11-08 the page pinned `opts.keymap:"vim"`, whatever `code.json` said)
- the bus verb `code.configure` takes the same knobs at run time

Record:

- **New with `code.json`** — the answer to `code-editor.js` being too thin ("one verb for saving, marks for decoration …"): hard-coded
  `basicSetup()` / `oneDark` / `vim()` opened up as settings
- **`indentUnit` and the `emacs` keymap enabled** — both needed the bundle rebuilt, done with the webLSP bundle work (`indentUnit` and
  `emacs` added to `entry.js`, esbuild)
- **The default `fontFamily` became the shipped font** — `monospace` → `"Senobi Gothic", monospace` (tried `Okuda, …` and briefly
  `Librestile, …`; Librestile's only cut is Extended width and characters overlap, so the display font became Senobi Gothic alone);
  `fontSize` 13 → 17. The editor pages link `lib/core/fonts.css` (`@font-face` for `fonts/`). The fonts are not shipped, so a public copy
  404s and `font-display: swap` falls back to `monospace`
- Verified in a real browser (headless Chromium ⇄ relay: fonts switching, the save flow, LSP diagnostics)
