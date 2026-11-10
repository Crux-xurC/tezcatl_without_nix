# `lib/code/file-changes.js`

Which open code_editor a change of a file concerns, and what to do about it.

**Decisions homed here**: [D-logbook](#d-logbook)

**Takes part in**: [D-rename](lib-code-code-editor-lsp-actions.js.md#d-rename), [D-say-side-effects](lib-core-panel-frame.js.md#d-say-side-effects)

<a id="d-logbook"></a>

## D-logbook — changes on the disk are noticed by joining the bus's "I changed it" with the list of open code_editor, told by a panel living beside them

**Decided**: an open `code_editor` does not notice the disk changing until it saves. This is solved neither by OS watching nor by polling, but
by **the record of operations that went through Tezcatl** joined with **the list of open panels**.

- **The record is the bus**: what changes files is already told — `code.saved {name, path}` (a save) and `fs.changed {op, paths}`
  (make, delete, move). When something else is known to have changed a file: `file.changed {op, paths, source}`
- **The list of open panels**: `code.query` is answered by every `code_editor` everywhere (any window, any skin) with
  `code.here {name, path, dirty}`
- **A panel tells**: `panels/resident/file_changes.html` (launcher `file_changes`, alias `changes`), **living in the same skin as the
  `code_editor`s** (`skin add <column> file_changes`). It acts only when a message comes; it never polls
- **What follows is composed of existing commands** (`lib/code/file-changes.js`): another `code_editor` with the same file and no edits gets
  `code.file edit` (`:e`, keeping the cursor; with edits `:e` refuses by itself, so nothing is lost); one with edits gets a row "`:e!` to
  read again, `:Replay` to apply the copy"; deleted and moved files get rows too. `Enter` brings that `code_editor` forward
  (`code.reveal`). The `code_editor` that made the change is not told
- **Changes outside Tezcatl** (git typed in a terminal, a save in Emacs, an intent) also pass through Tezcatl, so a **decoding patch** can
  be added later that posts `file.changed`. Decoding is not in the core — Tezcatl never reads backends' text meant for people — so, as
  with `D-language-plugins`, it would be a patch one adds and removes
- No log of writes in the relay (`/fs/log`)
- **`GET /fs/stat`** exists and is used only when a person asks: `?path=` gives `{path, exists, size, mtime, base}` (`mtime` in seconds,
  `base` in the save check's form `"sha256:<hex>"`, BOM not counted, so it compares directly with what `code_editor` opened; a missing file
  `{exists: false, base: "absent"}`, unreadable or over 5 MB `base: null`). **`check update [all]`** (`lib/skin/check-commands.js`) sends
  `code.file {op: "check", req}` to the current `code_editor` (`all`: every one of the frame); it compares and answers
  `code.checked {req, name, path, dirty, state}` (`same`, `changed`, `gone`, `unreadable`, `no_path`, `error`), and on a difference posts
  `file.changed {…, source: "check update"}` itself — so `file_changes`, if present, takes it from there. The frame says each answer with
  a reference (`go on`). `code_diff`'s heading times come from it too. No polling

**Alternatives**: inotify in the relay; the relay numbering the writes it passed (`/fs/log?since=N`) with the frame reading every few
seconds and `/fs/stat` when focus comes back; each `code_editor` asking its file's version every few seconds; a push from the relay
(WebSocket, SSE).

**Why not**: saving is the job of Tezcatl's commands and is already told on the bus; with the list of open panels, neither a new record
nor polling is needed. Given to a panel beside the `code_editor`s instead of the frame, the frame's work does not grow, and it works for a
`code_editor` in any skin or window.

**What it removed**: the notification path of watching the disk.

**Files**: `lib/code/file-changes.js` (pure), `panels/resident/file_changes.html`, `lib/code/file-changes-page.js`,
`lib/code/code-editor.js` (`:e` keeps the cursor), `lib/code/code-editor/file-ops.js` (`checkDisk`), `lib/relay/fs_handler.exs`
(`/fs/stat`), `lib/skin/check-commands.js`, `panels/skins/frame.html`, `list_kinds/panels_and_skins.json`,
`test/file-changes.test.js`, `test/check-commands.test.js`, `test/e2e/file_changes.mjs`, `test/e2e/work_place.mjs`.
