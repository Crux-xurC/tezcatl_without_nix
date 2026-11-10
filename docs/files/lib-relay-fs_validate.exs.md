# `lib/relay/fs_validate.exs`

A path that starts with this names the work place (tezcatl's own temporary files: clones, the scratch), the second root of /fs.

**Decisions homed here**: [D-work-place](#d-work-place)

**Takes part in**: [D-files-in-elixir](lib-relay-fs_handler.exs.md#d-files-in-elixir)

<a id="d-work-place"></a>

## D-work-place — Tezcatl's own temporary files (clones, scratch) live in the user's state directory, a second root of `/fs` that looks like ordinary files

**Decided**: the place for a second copy of a file and for comparing unsaved text with the disk. Nothing is made inside the project.

- **The place is `~/.local/state/tezcatl/work/`** (`$XDG_STATE_HOME/tezcatl/work`; `TEZCATL_WORK_DIR`), next to `mirror/`. The relay's
  `/fs` has a second root: a path marked `~work/…` points there (`FsValidate.locate` says which root; a name like `~workbench` is the FS
  root's). For `code_editor` these are ordinary files — opening, editing, `:w`, copies and diff have no special case. `/fs`, `/fs/read`,
  `/fs/write`, `/fs/delete`, `/fs/stat` work the same in both roots; `/fs/rename` never crosses roots (`across_roots` — maybe another
  file system); `/fs/grep` searches the FS root only. **Only inside the work place, writing makes directories** (clones keep their
  original path); the FS root's are still never made
- **No language server for work-place files** (no project marks; diagnostics mean nothing): `lsp.attach` refuses them
  (`codeFiles.isWork`); highlighting still follows the extension
- **Clone**: `:e <path>` (or `code_editor.html?path=`) of a file another `code_editor` has open first asks `code.query` (200 ms; every
  `code_editor` in any window answers `code.here`), then `POST /fs/clone?path=&slots=` copies the disk's version to `~work/clone/<path>` and
  opens that. The heading shows `# ` before the path and "<path> is open in <name> ── this is a clone" (also on the receiving side, with a
  reference to the original — `go on`). The original's unsaved edits are not in it (said so). A file not on the disk opens the clone path
  as new. Reading the same path again (`:e`) and work-place paths do not ask (no clones of clones). Clones are editable — editing from two
  places is sometimes wanted
- **Scratch**: one file, `~work/scratch`. `:Scratch` (`code.scratch`) writes the current text over it (no check) and changes nothing of
  the open file, its unsaved mark or its copy; it posts `fs.changed`. It may also be opened and written like Emacs' `*scratch*`
- **diff compares saved files only**: the `code_diff` panel (`@codemirror/merge`; read only — no slot, no LSP) takes two paths (`?a=&b=`
  or `diff.set {a, b}`), reads them with `/fs/read` and `/fs/stat`, heads each side "path · saved at" ("not on the disk" compares as
  empty), reads again when `code.saved` / `fs.changed` / `file.changed` touches either; `n` `p` `r`. `diff -n A,B` adds one in the current
  `code_editor`'s line, `diff -f A,B` gives them to the focused one (else the first); paths read as `:e` reads them; the same file twice is
  refused. **`:Diff`** = `:Scratch` on the current `code_editor`, wait for its `fs.changed`, then `diff -n ~work/scratch,<file>` (left the
  text, right the disk). Unsaved text against the disk is always this composition. `@codemirror/merge` is a separate file
  (`lib/vendor/codemirror/merge.bundle.js`, 28 KB, built by `languages/build.mjs`, reading the core's `languageKit`) — the core bundle and
  its pinned versions are not rebuilt; it loads only when `code_diff` opens
- **The oldest go first** (keeping such things around only harms a project): `POST /fs/clone` removes clones over `slots`
  (`clone.slots` in `code.json`, 10, 1–100) by the time written, with emptied directories; the one just made stays. Scratch is one file

**Alternatives**: `#name#` inside the project as Emacs' autosave; clones as a read-only viewer with no file; the place inside Tezcatl's
repository; symbols in diff's operands for "the text now" or "the copy".

**Why not**: files inside the project multiply and language servers read them as other files. Without a real file, editing from two
places and diff are impossible. Inside the repository, `:4001` serves it (the reason copies moved out). Writing to scratch and comparing
two saved files keeps diff one way instead of adding symbols.

**What it removed**: "the same file in two `code_editor`s" (diagnostics and copies for one only) — the second is another path; a special
path for `:Diff`.

**Not yet**: the frame's tree `Enter` (`code.open`) looks only inside its frame — a file open in another window opens a second time.

**Files**: `lib/relay/fs_validate.exs` (`locate`), `lib/relay/fs_handler.exs` (the second root, `/fs/stat`, `/fs/clone`,
`prune_clones`), `main.exs`, `lib/code/code-files.js` (`isWork`, `SCRATCH`), `lib/code/code-editor.js`,
`lib/code/code-editor/file-ops.js` (`scratch`, `checkDisk`, `otherWith`, `makeClone`), `lib/code/code-editor/lsp-attach.js`,
`lib/skin/skin-ex.js`, `command/command_map.json` (`code.scratch`), `lib/code/code-diff.js`, `lib/code/code-diff-page.js`,
`panels/resident/code_diff.html`, `lib/vendor/codemirror/merge-entry.js`, `lib/skin/frame-code.js`, `test/relay/fs_handler_test.exs`,
`test/relay/fs_validate_test.exs`, `test/code-diff.test.js`, `test/e2e/work_place.mjs`, `test/e2e/clone.mjs`.

## Selection and revision notes

(Moved from the comments of `lib/relay/fs_validate.exs`, 2026-09-10.)

Pure path validation for `FsHandler` -- turns an untrusted, browser-supplied `?path=` query value into an absolute path that is provably
inside the configured root, or an `{:error, reason}` string the caller turns into a 400.

Split out of `fs_handler.exs` so it is unit-testable without cowboy or the filesystem being in a particular shape (same split as
`PtyValidate` / `pty_socket.exs`).

The relay is loopback-only with no auth (D-loopback), so this guards against the one thing that matters here: a `..` (or absolute-path)
escape out of the root. It does NOT resolve symlinks -- a symlink inside the root that points outside would still be followed by
`File.read/1`. Acceptable under the loopback premise; revisit if ③ ever leaves `127.0.0.1`.

Resolve `rel` against `root` (both the root and the result are absolute).

  * `rel` missing / `""`      -> the root itself
  * `rel` a normal subpath    -> `{:ok, "<root>/<rel>"}` (normalised)
  * `rel` escaping the root    -> `{:error, "path escapes the root"}`
  * `rel` not a binary / NUL  -> `{:error, reason}`

`root` is trusted (it comes from `TEZCATL_FS_ROOT` / the relay cwd, not the request). Normalisation is `Path.expand/2`, which collapses `.`
/ `..` / redundant separators; the result is then required to be the root or to sit under `root <> "/"`. A leading "/" would make
Path.expand ignore the root. `locate` also says which root a path is in (the FS root, or the work place for `~work/…` — `D-work-place`).

Record: the pure part of `fs_handler.exs`, split out for the same reason as `PtyValidate` (ExUnit without erlexec or a real file system).
`..` and absolute escapes are refused; **symlinks are not resolved** (the loopback premise). `test/relay/fs_validate_test.exs` came with it.
