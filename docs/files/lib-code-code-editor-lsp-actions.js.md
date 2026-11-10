# `lib/code/code-editor/lsp-actions.js`

code_editor's LSP actions: definition, references, rename across files, format, hover, edits from other code_editor.

**Decisions homed here**: [D-rename](#d-rename)

**Takes part in**: [D-say-side-effects](lib-core-panel-frame.js.md#d-say-side-effects), [D-work-list](lib-core-work-log.js.md#d-work-list)

<a id="d-rename"></a>

## D-rename — a rename across files opens each affected file in code_editor and applies it unsaved; all or nothing

**Decided**: when `:LspRename`'s WorkspaceEdit reaches other files, each is opened in a `code_editor` (one that has it; in a frame a panel is
added; alone, a new window — `ensureOpen` in `lib/code/code-locate.js`, the frame's `openNew`), and the edit is applied there **as an
unsaved edit** with `code.edits` (one undo step). A person saves (checks each and `:w`).

- **All or nothing**: file operations (create, move, delete), a file outside the FS root, an affected file with unsaved edits, a file
  that cannot be opened — any one, and nothing is applied anywhere (half a rename leaves broken calls). Everything is opened first.
  **Applying is all or nothing too**: one's own file changes only after every other `code_editor` applied; if one did not, those that
  applied get `code.edits.undo {req}` and undo it (`code.edits.undone {req, ok}`; edited since, it cannot, and says so — `u` remains).
  Those that never answered get it too, so a late apply is undone after
- **A file with a copy closed unsaved is refused**: applying would overwrite that copy with the renamed version; checked against
  `GET /mirror/list`'s `unsaved_closed` before opening, shown again in `file_changes` (`mirror.left {paths, why}`); cleared there with
  `Enter` (open, `:Replay`, `:w`) or `d` `d`, or `mirror.list` / `mirror.drop`. Avoided by practice; nothing is moved aside automatically
- **Only files the language server knows**: the WorkspaceEdit is what the server knows. typescript-language-server without
  `jsconfig.json` / `tsconfig.json` knows only open files, and calls in closed files keep the old name (Tezcatl cannot tell; check with
  `:LspRefs` first)
- The `code_editor`s applied say "a rename was applied (from another code_editor)"; the asker says "n places here, m places in k other files —
  unsaved"

**Alternatives**: the relay writing all at once with a check (against each opened version; nothing if one differs).

**Why not**: the disk would change before a person looks. "A person saves" (`D-files-in-elixir`, `:w`).

**With it**: a panel in a frame opening a file nobody has (`:LspDef`, a rename, `Enter` in a list) adds a `code_editor` to the frame
instead of opening a window — the frame offers its way of opening as `openNew` on the skin port, used by `codeLocate.pageEnv`.

**Files**: `lib/code/code-editor/lsp-actions.js` (`renameAcross`, `receiveUndo`), `lib/code/code-editor.js` (`code.edits`),
`lib/code/code-editor/mirror.js` (`leftPaths`), `lib/code/code-locate.js` (`pageEnv`, `ensureOpen`), `lib/relay/mirror.exs`,
`lib/code/file-changes.js`, `panels/skins/frame.html`, `test/e2e/code_lsp.mjs`, `test/e2e/frame_lsp.mjs`,
`test/e2e/frame_rename_guard.mjs`.
