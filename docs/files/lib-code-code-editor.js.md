# `lib/code/code-editor.js`

The CodeMirror 6 core behind code, code_editor and their variants: bus vocabulary, saving, copies, LSP, keys.

**Takes part in**: [D-block](lib-skin-thema.js.md#d-block), [D-command-target](lib-core-commands.js.md#d-command-target), [D-dictionary](lib-list-dict.js.md#d-dictionary), [D-files-in-elixir](lib-relay-fs_handler.exs.md#d-files-in-elixir), [D-id-pool](lib-relay-id_pool.exs.md#d-id-pool), [D-juncture](lib-code-juncture.js.md#d-juncture), [D-language-plugins](lib-code-code-languages.js.md#d-language-plugins), [D-logbook](lib-code-file-changes.js.md#d-logbook), [D-minimum](lib-code-minimum.js.md#d-minimum), [D-mirror](lib-relay-mirror.exs.md#d-mirror), [D-rename](lib-code-code-editor-lsp-actions.js.md#d-rename), [D-session-service](panels-invisible-daemon.html.md#d-session-service), [D-tree-skin](lib-skin-tree-commands.js.md#d-tree-skin), [D-vim-via-input-line](lib-skin-skin-ex.js.md#d-vim-via-input-line), [D-work-place](lib-relay-fs_validate.exs.md#d-work-place)

## Notes from verification

**Note** — the editor was split into parts under `lib/code/code-editor/` (behaviour unchanged, checked by 23 E2E scenarios): `relay.js`
(the relay's URL, the save check's hash, `/fs` errors), `file-ops.js` (save, open, delete, move, scratch, check, clone), `mirror.js`
(copies), `lsp-attach.js` (the `/lsp` connection), `lsp-actions.js` (definition, references, rename, format, hover, `code.edits` from other
`code_editor`s), `syntax-nav.js` (diagnostics, outline, moving through the syntax tree), `juncture.js`, `replace.js`. Each is `createX(ed)`, `ed`
being this editor's view, the shared state `ed.st` and helpers (`flash` …). Function names in the older notes below (`mirrorPut`, `attachLsp`,
`renameAcross` …) now live in those files. Saving is the editor's own `PUT /fs/write` checked by the opened version's hash; `code.saved` /
`code.saveFailed` are notices it posts (answering `code.file write {req}` with the same `req`); the old `code.save-request`, `opts.onSave`,
`pendingSaveText` are gone.

## Selection and revision notes

(Moved from the comments of `lib/code/code-editor.js` on 2026-09-10; the header below is as of early September — it predates `code.json`'s
parameters, the LSP consumer, saving by the editor itself and the split into `lib/code/code-editor/`; the record after it follows the
changes.)

lib/code/code-editor.js -- the shared CodeMirror 6 core behind two panels:

  panels/resident/code.html     createCodeEditor({ editable: false })          a VIEWER
  panels/resident/code_editor.html  createCodeEditor({ editable: true, extraExtensions: [vim({status:true})], … })   an EDITOR

ES module: it imports the vendored CM6 bundle (lib/vendor/codemirror/cm.bundle.js -- CM6 ships no UMD global, see that dir's README). Both
pages load it with <script type="module">, after the classic <script src> tags that populate window.Tezcatl (config / panel-bus / panel-frame
/ code-languages).

Shared by viewer and editor:
  - one EditorView on a doc string, with reconfigurable slots: language (langComp), read-only (roComp), editable (editComp), history
    (histComp -- code.set drops stale undo)
  - language resolution via Tezcatl.codeLanguages.resolve (pure, tested)
  - dirty tracking against a baseline (the text as last code.set)
  - caret / selection reporting to cursor.html via panel-frame.reportCursor
  - panel-frame init + focus target; `code.ready` announced on start
  - the code.* bus vocabulary (then):
      recv  code.set { text, filename?|language?, readOnly? }  -- doc replace, baseline reset, history dropped (one transaction, so undo
            cannot walk back past a freshly loaded doc: code.set == "open a new buffer"). Clears all mark layers (old marks index the old
            text; consumers re-mark)
      recv  code.get -> reply code.text { name, text, dirty, language, path }
      recv  code.configure { language?|filename?, readOnly?, … }  -- no doc change
      recv  code.mark { id, class, ranges?:[{from,to}], lines?:[n] }  -- REPLACE the decoration layer `id` (char offsets / 1-based whole
            lines). View-only (the viewer takes it too). Layers are the seam for diff lines, search matches …; each consumer owns an `id`
      recv  code.clearMarks { id? }   recv code.goto { line, col? }  (1-based line, 0-based col, clamped; centres and focuses)
      recv  insert (fixed) -> replaceSelection (editor only)    recv focus (fixed)
      send  code.dirty { name, dirty } on transition    send cursor via panel-frame
      send  killring.add { text, source } on a `copy` gesture -- the kill ring collects from every surface (the viewer included), not just
            vim's registers
  - Single Esc -> vim normal, double Esc -> panel-frame yield; deliberately not unified
  - Never loads lib/core/ws.js -- editing goes to endpoint ③, not vent (D-files-in-elixir)
  - role defaults to "code"; a variant page (code_el_intent.html) passes its own, so a skin can address it unambiguously

Record:

- **First made** as the CM6 core shared by `code.html` and `code_editor.html` (checked end to end on the real machine). CM6 is bundled once with
  esbuild in `lib/vendor/codemirror/`; languages resolve through `code-languages.js`
- **`opts.role`** (default `"code"`), so a skin never confuses another role's viewer (`code_el_intent.html`)
- **`copy` → `killring.add`**: selections in a read-only viewer enter the ring too (Emacs' kill-ring spirit, `D-session-service`)
- **Position bookmarks (`bookmark.el`) are out**; if wanted: a `code.goto {line,col}` verb plus `file` in `cursor.state` (apart from the
  tree's path bookmarks)
- **The save round trip**: `code.set`'s `filename` / `path` kept as `baselinePath`; later the editor saves itself with `PUT /fs/write`
  checked by the opened version's hash (`D-files-in-elixir`) — the older `code.save-request` / `pendingSaveText` / `opts.onSave` are gone
- **`code.json` parameters**: fetched by the editor itself; built with defaults, then reconfigured live through compartments (`cfgComp`,
  `keymapComp`). **Per-keymap adapters** (`keymapAdapter(id)` → `{extensions, yankExternal, pollLocalYank}`; the `vim` adapter holds the
  bridge between vim's registers and the kill ring, moved from `code_editor.html`). Keymap priority `opts.keymap` > `?keymap=` > `code.json`
  > `"default"`. Saving is one function (`:w` and the autosave debounce; the `Mod-s` key was removed 2026-10-25, below). `code.configure` takes the tuning knobs; `killring.yank`
  is handled in the core (`adapter.yankExternal`)
- **The LSP consumer**: an `lspComp` compartment, `relayLspUrl` (`connections[0].url` → `/lsp`), `attachLsp(path, lang)` on `code.set` (when
  editable with a path and a language): `{kind:"attach"}` → `{kind:"attached", rootUri, uri, key}` → `new LSPClient({rootUri})` +
  `languageServerSupport(client, uri, lang)` with `lintGutter()`. The transport passes JSON strings through, taking only control frames
  with `kind`. `{kind:"error"}` / `{kind:"exit"}` / `onclose` tear down; `pagehide` detaches. Completion, hover, diagnostics, `didOpen` and
  `didChange` are driven inside `languageServerSupport`; diagnostics are `@codemirror/lint`'s facet, not `code.mark`. Shared documents have
  one owner (`D-lsp-owner`)
- **`indentUnit` and the `emacs` keymap** came with a bundle rebuild (`CFG_DEFAULTS.indentUnit = "  "`; the `emacs` adapter's external yank
  is `replaceSelection`, its local yank left to the `copy` listener; `indentWithTab` stays baked in `basicSetup`)
- **`code.text` carries `path`** (`compile-intent.js` needs the focused code panel's file)
- Verified in a real browser (headless Chromium ⇄ relay ⇄ a real tsserver: `code.set` → edit → save, LSP diagnostics, hover,
  completion, fonts)

- **No save key** (crux, 2026-10-25): `Mod-s` (Ctrl-s) saved; removed as not wanted. Saving is `:w` (`:w!`, the input line's `:w`)
  and `autosave`. Ctrl-s now does nothing in Poca (its Alloy runtime has no page-saving key); an ordinary Chrome would open its own
  save dialog
