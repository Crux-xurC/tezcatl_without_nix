# `lib/relay/mirror.exs`

The copies of what code_editor is editing: an insurance, not something to rely on.

**Decisions homed here**: [D-mirror](#d-mirror)

**Takes part in**: [D-rename](lib-code-code-editor-lsp-actions.js.md#d-rename)

<a id="d-mirror"></a>

## D-mirror — copies of edits live in slots in the user's state directory; the original is reopened and the copy replayed

**Decided**: the text being edited in a `code_editor` is kept inside Tezcatl as a **copy**, apart from the file. One mechanism covers a
language server that fell and a save stopped on a conflict with the disk. **The copy is insurance, not something to rely on** — so it is
kept small and never piles up.

- **Where**: `$XDG_STATE_HOME/tezcatl/mirror` (else `~/.local/state/tezcatl/mirror`; `TEZCATL_MIRROR_DIR`). Copies are flat under
  `files/` as `<hash of the path>-<file name>` (a slot's `file`) — nested relative paths broke when a copy of `foo` stopped
  `foo/bar.ex`'s directory from being made, and the GenServer kept falling with the relay's supervisor; old slots are moved at start.
  The slot table is `index.json`. A copy that cannot be written (disk full, permissions) answers 500 `not_written` without falling;
  `code_editor` says so once. Outside the project, so build tools, language servers and Xipe Totec's scans never pick copies up even with
  their extensions. **Outside both the page server's directory and the FS root** (earlier, inside Tezcatl's directory, any copy was
  readable through DNS rebinding on `:4001`). The place is not a command: the relay reads it at start; changing it while running would
  need moving the table and contents, and would let a page say where to write
- **A copy is only a place to save**: `code_editor` stays open on the original path (language, LSP root and URI are the original's); the
  copy's path is never opened (no root marks, the LSP would not know the project)
- **N slots** (`mirror.slots` in `code.json`, 10): opening a file puts it in its slot (owned by that `code_editor`); over N, the slot opened
  longest ago goes. **One slot, the latest version** (replaying applies the copy once = one step of undo)
- **Written**: when the file opens, when unsaved edits have been still for `mirror.idleMs` (2000 ms), on `:Mirror`, at the start of
  `:Reconnect`, and after a successful save (to match the text)
- **Removed**: when its `code_editor` closes **saved** (`sendBeacon` on `pagehide` → `POST /mirror/close`), when pushed out. **Closing
  unsaved keeps it**: closing (`skin del`, `skin read`, reloading or closing the window) is never refused; the slot is marked
  `unsaved_closed` (with the time) and kept (`POST /mirror/close?…&unsaved=1&text=1` carries the text at that moment; a slot pushed out
  while open is made again). The `code_editor` posts `code.closed {name, path, dirty, copy}` and `file_changes` says "panel code_editor <file>
  was closed unsaved"; it also lists marked slots from `GET /mirror/list` on start. `Enter` → opens the file → "a copy is left" →
  `:Replay` → `:w`. **A copy is never applied automatically** (the disk may have changed). A marked copy is **not pushed out and not
  counted** in N; it stays until the file is opened or a person removes it (`d` `d`, `mirror.drop` → `POST /mirror/drop`; unmarked slots
  are never dropped). **Not removed on stop** (a stop by Ctrl+C may not clean up; and removing it would lose edits only in the copy)
- **A copy left is told**: opening a file whose slot has other text (a crash, a closing message lost) — the relay does not overwrite it,
  answers `left`, and `code_editor` says "a copy is left (of when) — :Replay applies it"
- **Reopen and replay**: `:Reconnect` (`code.reconnect`) = `:Mirror` (write the copy; if it cannot, do not reopen — nothing lost) →
  `:e!` (reopen the original; the LSP reconnects; undo is gone here, as in other IDEs) → `:Replay` (the copy applied as one minimal
  change keeping common ends; `u` returns to the reopened version). The cursor goes back. A dropped LSP leaves "lsp: disconnected —
  :Reconnect" in the heading
- **A conflict with the disk**: when a save stops on "the disk changed", the copy has kept up: `:e!` (the disk's new version), `:Replay`,
  save. The copy replaces the text whole — to keep the disk's change, compare and fix (showing the difference is not done)
- **The relay's mouth** (`lib/relay/mirror.exs`): `PUT /mirror?path=&owner=&mode=open|write&slots=N`, `GET /mirror?path=`,
  `GET /mirror/list`, `POST /mirror/close`, `POST /mirror/drop`; not `/fs/write` (copies may be outside the FS root). Slot changes go
  through one GenServer in order. Reflecting into the original is `code_editor`'s usual save — the relay has no "write the copy over the
  original"
- With it: a `code_editor` with unsaved edits refuses a `code.set` that brings a file (`code.openFailed {dirty: true}`, as `:e` refuses); the
  frame then adds a `code_editor` (before, only the sender's record of "unsaved" protected it, and a late record let the text be replaced
  and the copy lost)

**Alternatives**: a small mouth to reconnect only the LSP, keeping the text (undo kept); copies next to the file as Emacs does
(`#a.ex#`, `a.ex~`); removing copies when Tezcatl stops; an operation in the relay to write a copy over the original.

**Why not**: a mouth alone is no insurance for a crash or a conflict. Next to the file, a broken extension loses the language and the
LSP, a kept one is picked up by build tools and scans as real source. Removing on stop: the cleanup may not run, and if it runs it removes
the insurance. Reflecting by replay and the usual save keeps the existing check; no overwrite operation is needed in the relay.

**Left**: showing the difference on a conflict.

**Files**: `lib/relay/mirror.exs`, `main.exs`, `lib/code/code-editor.js`, `lib/code/code-editor/mirror.js`, `lib/code/code-files.js`,
`lib/skin/skin-ex.js`, `command/command_map.json` (`code.mirror`, `code.replay`, `code.reconnect`, `mirror.*`), `code.json`
(`mirror`), `lib/skin/frame-code.js` (`openFile`), `test/relay/mirror_test.exs`, `test/e2e/code_set_guard.mjs`.
