# `lib/relay/fs_handler.exs`

Endpoint ③: list, read, write (checked), delete, rename, grep, stat, clone — the FS root and the work place.

**Decisions homed here**: [D-files-in-elixir](#d-files-in-elixir)

**Takes part in**: [D-logbook](lib-code-file-changes.js.md#d-logbook), [D-work-place](lib-relay-fs_validate.exs.md#d-work-place)

<a id="d-files-in-elixir"></a>

## D-files-in-elixir — file contents never ride the vent protocol

**Decided**:

```
edited in the browser → written to the server's file through ③ → Emacs updates by auto-revert
Emacs changes it (a Magit checkout …) → the server's file changes → the browser reads it again through ③
```

File contents are not on emacs-vent's protocol, but on ③. Do not confuse the two.

**Alternatives**: `buffer.open` / `buffer.edit` / `buffer.save` as vent kinds.

**Why not**: nothing requires going through Emacs' buffers. The file system already is the shared source of truth; Emacs needs only
`(global-auto-revert-mode 1)`, and emacs-vent's code gets nothing added.

**Known caveat**: a modified buffer is not reverted — avoided by the browser owning editing.

**Only the editor writes**: the means of writing are gathered in `code_editor`. A window (tree …) that writes things itself ends up
carrying editing features; the editing tools are in `code_editor`, so writing to the disk is there too. (The earlier form — the side that
handed over a text saved it on `code.save-request` — made `Mod-s` silently do nothing after that window was closed.) Now the giver
only sends `code.set`.

**Writing safely** (the everyday editor is `code_editor`):

- **Checked saves**: `PUT /fs/write` takes an optional `x-tezcatl-base` — what the writer thinks is on the disk: `sha256:<hex>` of
  the text it opened, or `absent` for a new file. The relay compares with the disk's contents now (a UTF-8 BOM not counted) and, if
  they differ, writes nothing and answers 409 `{"code":"changed","current":…}`; `code_editor` stops and offers `:w!` (no header) or `:e!`.
  Without the header it is last-write-wins (the lists' data files). A hash of the contents, not mtime, because the openers (tree,
  skins) hand over only the text of `/fs/read`
- **No directories are made**: writing or moving into a missing directory is 404 `{"code":"no_parent"}`; make it in a terminal
- **Delete and move**: `DELETE /fs/delete?path=` (plain files, the same check), `POST /fs/rename?path=&to=` (only when the target is
  absent; else 409 `{"code":"exists"}`); both check `Origin` strictly, as `/fs/write`
- **The entry is vim's ex in `code_editor`**: `:w[!]`, `:e[!] [<path>]` (a missing path opens empty, `:w` creates it), `:Delete[!]`,
  `:Rename <name>`, `:Move <path>` (vim-eunuch's names). Making, deleting, moving post `fs.changed {op, paths}`; an open tree reads that
  directory again

Bodies are limited to 5 MiB (413). How changes on the disk are noticed: `D-logbook`.

**Files**: `lib/relay/fs_handler.exs`, `lib/relay/fs_validate.exs`, `lib/code/code-editor.js` (saving), `lib/code/code-files.js`
(paths of ex commands), `panels/resident/tree.html` and the skins (they only open and hand over), `main.exs`.

## Notes from verification

**Note** — the older notes below say "v0 is read-only" and "watched with inotify in the relay"; that is history. Now there are
`PUT /fs/write` (checked by `x-tezcatl-base`), `DELETE /fs/delete`, `POST /fs/rename`, `GET /fs/grep`, `GET /fs/stat`, `POST /fs/clone` and
the work place as a second root; nothing watches the disk (`D-logbook`).

## Selection and revision notes

(Moved from the comments of `lib/relay/fs_handler.exs` on 2026-09-10; "v0 is read-only" and the routes are as of then — see the record.)

Endpoint ③: let the browser read the server's disk. Two routes then, one module (`main.exs`):

  ## `GET /fs?path=<rel>`  -- a directory listing

      {"path":"lib","root":"/abs/root","entries":[
        {"name":"config.js","dir":false,"size":2114},
        {"name":"relay","dir":true,"size":0}, ...]}

  `path` is relative to the root (`TEZCATL_FS_ROOT`, default: the relay's cwd -- the repo root when started by `t`). Missing / "" = the
  root. Sorted dirs-first then by name. Hidden entries (`.` prefix) are included.

  ## `GET /fs/read?path=<rel>`  -- a file's bytes

  200 `text/plain; charset=utf-8`. Capped at 5 MiB; larger -> 413.

  ## Not this endpoint

  The vent wire (file bytes never ride vent -- D-files-in-elixir). PTY (`/pty`).

  ## CORS / Origin

  Same stance as `WindowsHandler` GET: a read, so permissive. The request's `Origin` is echoed in `access-control-allow-origin` only when
  allow-listed (`AllowedOrigins`); otherwise no CORS header and the browser blocks its own read. Never a 403 for GET. Headerless (curl /
  tests) is allowed -- anything that can reach `127.0.0.1` can read these files directly anyway (D-loopback). Not auth. Writes check
  `Origin` strictly.

  Path safety is `FsValidate` (pure, unit-tested): a `..` / absolute escape out of the root is a 400. Symlinks are NOT resolved (loopback
  premise). Missing (`:undefined`), valueless `?path` (`true`) or a non-binary all mean "the root".

Record:

- **First made** as read-only ③: the listing JSON and the file bytes (over 5 MiB → 413), the Origin gate and the path check
  (`fs_validate.exs`); the root is `TEZCATL_FS_ROOT` (default: the relay's cwd); file text never rides vent (`D-files-in-elixir`)
- **Watching through inotify in the relay** was decided once and **dropped**: nothing watches the disk; changes are noticed from bus
  messages and `check update` (`D-logbook`)
- **Writing** came: `PUT /fs/write` with `x-tezcatl-base`, `DELETE /fs/delete`, `POST /fs/rename`, no directories made in the FS root
  (`D-files-in-elixir`); the work place as a second root, `GET /fs/stat`, `POST /fs/clone` (`D-work-place`)
- **`GET /fs` carries the absolute root** (`"root"`): `compile-intent.js` needs it to build an absolute `cd`; listing already implied it, so
  nothing new is exposed
- **`/fs/read` is UTF-8 text only**: what does not read as UTF-8 (another encoding, binary) is 415 `{"code":"not_utf8"}` — the browser read
  it as UTF-8, the U+FFFD replacements broke the save check, and `:w!` wrote that text back. "What cannot be written back as read is not
  opened." A BOM is not counted (as in the check)
- **`GET /fs/grep`**: `rg --json --smart-case` under the FS root (`path=`), run through a Port, giving `{matches:[{path, line, col, text}],
  truncated}`; `col` in characters (recounted from rg's byte offsets); at most 1000 matches (`limit=`, up to 5000) and 10 s; no rg → 501
  `no_rg`, a bad regex → 400 `rg`. ripgrep is in the dev shell
