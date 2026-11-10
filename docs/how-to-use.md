# How to use

Day-to-day operation only. Why things are so is in the file records ([files/](files/index.md));
what is promised and what happens outside it is in [scope.md](scope.md).

- **Tezcatl** is the browser window. It puts Emacs, terminals, files, language servers and Xipe Totec
  side by side on one screen, through the relay.
- **Xipe Totec** (a separate project) keeps calls to functions as "calculation rows" and evaluates them
  again and again, comparing with the last value. It works from a terminal (`xipe`) alone; from
  Tezcatl it is used through a dialogue window and a table (§8, §9).

---

## 1. Start and stop

Start tezcatl from **Poca's box** (its `tezcatl` row, `"auth": true`), then open its bookmark (`http://127.0.0.1:4001/main.html`).
Poca hands tezcatl a secret, and the relay serves only Poca's window.

<!-- env:nix -->
What the box runs, by hand:

```
nix develop
t            # needs Poca's POCA_SECRET: from a terminal it starts nothing
t --no-auth  # the pages and the relay without authentication (any local page can use the relay); Ctrl+C stops both
```

<!-- /env:nix -->

The backends are started on their own (Poca's box has an entry for each):

<!-- env:nix -->
```
emacs --fg-daemon                       # your Emacs with emacs-vent loaded and emacs-vent-mode on, :4000
cd /path/to/xipe_totec && elixir main.exs start --port 4200 \
  --lsp ws://127.0.0.1:4100/lsp --fs-root "$TEZCATL_FS_ROOT"           # Xipe Totec, :4200
/path/to/tezcatl/nix/db                 # MariaDB, :3307 (once before: nix/db init)
```
<!-- /env:nix -->

| Port | What |
|---|---|
| `:4001` | the pages. **Always open panels from here** |
| `:4100` | the relay (Elixir). The only thing the browser talks to |
| `:4000` | Emacs (emacs-vent) |
| `:4200` | Xipe Totec (`xipe start`) |
| `:3307` | MariaDB (`nix/db`; the relay's `/sql`, for database windows a person logs in to). Tezcatl's own server, not a system one on 3306 |

- Everything listens on `127.0.0.1` only. Started from Poca, the relay answers only Poca's window (D-poca-secret): the same pages
  opened in another browser load but do nothing
<!-- env:nix -->
- `t` starts nothing if :4001 or :4100 is taken. Each backend is stopped as it was started (Ctrl+C / Poca's box; Emacs:
  `emacsclient -e '(kill-emacs)'`, Xipe Totec: SIGTERM to the pid in `xipe_totec/tables/session.json`)
- Logs: `/tmp/tezcatl-{http,relay}.log`
<!-- /env:nix -->
- Xipe Totec exits at once unless a project was chosen first with `xipe choice project <path>` (§8)
- The files Tezcatl can touch are under `TEZCATL_FS_ROOT`; every path is written from there (set it in `local.env`, read by the dev
  shell)
- From another machine, forward the same port numbers: `ssh -L 4001:127.0.0.1:4001 -L 4100:127.0.0.1:4100 <host>`

---

## 2. Open a screen

`main.html` is a frame of its own: the main skin (`skins/main.json`, the dock and an image panel). From its input line, or any frame's,
`open <name> [tab|window]` opens a page. The list of every page is the panel `pages` (`skin add pages`; `Enter` opens, `M-t` in a tab,
`M-w` in a window), or `launcher.html`. Without `tab` or `window`, `launcher.open-mode` of
`config.json` decides. In Poca a window works like a tab (Poca's own `Ctrl+N` opens an empty Poca window).

| Name | What |
|---|---|
| `frame` | **the frame**: built from empty by adding panels (§3). The one to use. `frame-bd`, `frame-ld`, `frame-rd` open it with the dock below, left, right |
| `tree` / `code_editor` / `code` | the file tree / the editor / a read-only viewer |
| `xterm` / `claude` / `codex` | a terminal / a terminal for Claude Code / for Codex |
| `xipe` / `matrix` | Xipe Totec's dialogue window / its table (§9) |
| `file_changes` / `problems` / `code_outline` / `lsp_log` | panels used beside a `code_editor` (§5) |
| `code_diff` | two saved files side by side (§4; usually from the frame's `:Diff`, `diff -n A,B`) |
| `juncture_tree` | the tree of a file's points (§4 "Keep points and go back"; usually `juncture tree`) |
| `markdown` | a note drawn, read only (§4 "Read a note"; usually `markdown <path>`) |
| `task_table` | a note's table edited as a table (§4 "Edit a note's table"; usually `task_table take <path> <name>` or `t` in a markdown panel) |
| `run_table` / `run_match` | rows sent one by one / a record set beside them (§4 "Send rows one by one"; usually `run new <template>`, `run match <record>`) |
| `decode_emacs` | Emacs' answer as a table (§6) |
| `code_vi_minimum` | write a short text and deliver it (§4 "Write a short text"; usually `minimum`) |
| `killring` / `bookmarks` / `commands` / `lsp` / `w_list` / `agenda` | list panels (§7) |
| `image` | one picture of the pages, fitted (`image <path>` in the frame: `assets/…`; opened alone: the Tezcatlipoca picture) |
| `input` / `output` | send to Emacs / receive from Emacs (§6) |
| `treemacs` / `basic` / `intent` | prototype skins (tree + editor, input + output …) |

A panel also opens alone in a window; arrange windows with your window manager, or put them in a frame.

**In any panel**: `Esc` twice (within 400 ms) leaves the panel. `Esc` then `y` opens the kill ring. To send one `Esc` to Emacs, use `C-[`.

---

## 3. The frame

Decide the columns first, then stack panels in each column. The **dock** sits outside the columns (below by default;
`dock side l|b|r`). In the dock: the map of the screen (`panel_abstract` — the areas and panels as boxes, the focused one filled),
where the input goes (`input_target`), the input line, the receiving side (the commands typed and their answers), the virtual
keyboard, `How_to_use` (the keys and shortcuts — what `config.json` binds), a clock, the suggestions (the next word of the input
line, and its source on one line ▼) and where the receiving side reads from (`output_target`). The layout is `docks/standard.json`.
A place is written "column → position", two words (`2 3` is the third in the second column).

### Focus

- In a panel, `Esc` twice → the input line
- Send `:` alone (short for `skin focus abs`) → the map. On the map, `hjkl` or the arrows move the focus, `Enter` enters that panel,
  `Esc` twice goes back to the input line
- With the input line empty, `Enter` or `Esc` enters the focused panel
- A click on a panel moves there too. Earlier lines of the input line: `Alt+p` / `Alt+n`

### Syntheses: several panels as one

A **synthesis** is a set of panels written as one JSON file under a name (`syntheses/<name>.json`; yours in `local/syntheses/`). In the
frame it is one panel: `skin add matrix_set` places one (named `matrix_set_1`, the next `matrix_set_2`), and `skin focus`, the map,
`skin del`, `skin switch` and `skin zoom` take it whole. Its band says its name and what its main panel says. Going in lands on its
**main**; `syn` alone lists the words for the others (`syn table`, `syn line`, `syn main`). `matrix_set` (it replaced the matrix skin) is
a synthesis of the line saying the table, the table, and a command line (`matrix update`, `matrix get <path>`, `matrix pwd`, `radar`) that
reaches only its own table. `frame.html?synthesis=<name>` opens a frame holding one. How to write one: `syntheses/README.md`
([D-synthesis](files/lib-skin-synthesis.js.md#d-synthesis)).

### The input line and where it sends (lead key)

The input line sends what is typed to the dock's destination. The first destination is tezcatl (the frame's commands — the
lines from "Build" on are these).

- `;i` → the list of destinations; a letter chooses one and goes back to the input line: `t` tezcatl, `e` Emacs (emacs-vent),
  `c` a `code_editor` of the frame, `x` an `xterm` of the frame, `f` another frame — another tab or window, Poca's split view: the line
  runs there as if typed in its own input line (`c1` `c2`, `f1` `f2` when there are several). A click works too
- Keys you cannot type are written `;` and one letter: `;c` Ctrl, `;a` Alt (Meta), `;s` Shift (on a key that is not a character),
  `;w` Super go with the next key (`;cx` = `C-x`, `;c;ax` = `C-M-x`). `;h` `;j` `;k` `;l` arrows, `;e` Return, `;q` Esc, `;t` Tab,
  `;b` Backspace, `;d` Delete, `;f5` F5 (`;f-` `;f=` are F11, F12)
- A plain `;` is `;;`. A `;` in pasted text becomes `;;` by itself
- The second line under the input shows what will be sent (`C-x C-f`). Notation that cannot be sent is red; half-written
  (stopped after `;c`) says "waiting"; neither is sent
- Each key typed lights on the virtual keyboard (darker is newer; it fades every 2 seconds)
- To tezcatl only characters go (a key with a modifier is refused; a final `;e` is dropped as the end of the line — a line pasted
  with its newline works). To a `code_editor` the keys arrive as typed (vim's mode is shown in the list). To an `xterm` as a terminal's
  control sequences
- The characters are changed in `config.json`: `ui.keys.lead` (default `;`), `ui.keys.fnRow` (the F-key row),
  `ui.keys.leadBindings` (shortcuts like `;:` `;i`; `""` removes one)

### Build

Blanks separate the words; a comma joins only a list of ratios, with no blank in it (`skin main 1,2,1`); a place is two words, the
column (area) then the position (`skin focus 2 3`, `skin del 2 3`).

| Command | What it does |
|---|---|
| `skin main 1,2,1` | columns (as many as values, up to 26; the values are ratios) |
| `skin sub 1,2 [column]` | ratios inside a column |
| `skin add <panel>` / `skin add <column> <panel>` / `skin add <column> <position> <panel>` | add a panel (`-bare`: no band) |
| `skin add line [position]` | add a column |
| `skin del line [position]` | take an empty column away (the last when not given) |
| `skin del <column> <position>` / `skin del <panel>` | close |
| `skin switch ver a b [column]` / `skin switch hor a b` | swap inside a column / swap columns |
| `skin focus 2 3` / `skin focus x` / `x -` / `y` / `y -` | there (area, then position) / right, left, down, up |
| `skin focus abs` (short: `:`) | the map (`hjkl`, arrows) |
| `skin equal` / `skin zoom [n]` / `skin unzoom` | even / enlarge the focused one / back (`-m` columns, `-s` inside the column) |
| `skin axis h` / `skin axis v` | columns side by side (default) / rows stacked |
| `go on` | to what the last line with `@…` on the receiving side points at ("References" below) |
| `radar` | the current selection of the table used last, as a line with a reference (§9) |
| `skin name <name>` / `skin save [name]` / `skin read <name>` | name it / save / open (`frame.html?skin=<name>` too). This name (`workspace_N` until named) is the window's name |
| `skin add skin_list` | the saved skins as a list: lines (empty ones), axis, ratios, panels; a panel saved under an old name (`code_vi`) is marked. `Enter` opens one in a new frame window, `M-r` reads it into the frame focused last (`skin.read`) |

A frame being worked on is kept per window (a reload shows the same). The files open in `code_editor` are not kept.

### What is running, who is open (`work`, `who`)

| Line | What it does |
|---|---|
| `work list` | the record of running and finished work in a list panel (newest on top): number, state, what, who, when, how long |
| `work watch` | only what has not ended; what takes long is `slow` |
| `work cancel <number>` | stop that row (language-server requests, for now). `Del` in the list |
| `who` | asks every open panel again and lists them on the receiving side (with their place in the frame) |

- States: `running`, `slow`, `done`, `failed`, `expired`. `Enter` in the list goes to the panel that started it
- `expired`: no end came within the time set (a command nobody took, a file already open …). The times are `expireMs` in
  `work.json` (per pair; commands 2 s, opening a file 10 s by default; none: wait for ever)
- Only work with a fixed start and end is recorded (a save from the input line, opening a file, a table fetched, a language-server
  request, a line sent to Xipe Totec — `work.json`). A `:w` typed in a `code_editor` or a command in a terminal is not
- Nothing is kept: closing the window that records forgets it

### Things done along the way

What tezcatl did beside the command (opened a clone, `file_changes` read a file again, added a `code_editor`, opened a new window,
asked a language server again) appears as one line on the receiving side: at its head the place of the panel that said it,
at its end `@…`, where to go (`go on`).

### References (`go on`)

Lines on the receiving side about a panel or a place in a file end with `@2 1` (that panel's place) or `@path:line`.
`go on` goes to the last line that has one — a panel is focused and entered; a place opens in the `code_editor` that has the file
(one is added when none has).

- They come with: `skin add`'s answer, the lines saying tree's `Enter` or `:find` opened or moved, `lsp restart`'s answer
- Other commands in between do not matter; `go on`'s own answer has none, so typing it again goes to the same place
- After panels were swapped, it goes to where the panel is now, not the place written in the line; a closed panel is said so
- `@` alone in a line is replaced by the last reference before it runs (`:find @`, `skin focus @`): a panel's place now, or
  `path:line`. An `@` inside a word (`@attr`) stays. With no reference yet the line is not run

### Bands (block and thema)

A panel added with `skin add` gets a band with one line of text and a colour.

| Command | What it does |
|---|---|
| `block arrange t` / `b` / `r` / `l` / `tl` / `tr` / `bl` / `br` | where the band is (corners: an L) |
| `block min` / `block min line` / `block unmin` | shrink to the band / to a line / back (edits are kept) |
| `block place <panel> <column>` | the default place of `skin add <panel>` |
| `thema color <name or colour>` / `thickness <px>` / `source <name\|file\|status>` / `text [text]` / `style <name>` / `reset` | the band's colour, thickness, what it shows, a fixed text, its look, back to default |
| `color <colour>` | turn the colour panel into that colour |

### The dock

| Command | What it does |
|---|---|
| `dock side l` / `b` / `r` | the dock left, below, right (its parts are not reloaded) |
| `dock size <length>` | its thickness (`16em`, `240px`, `30%`), kept per side |
| `dock rows a,b,…` / `dock cols a,b,…` | ratios inside the dock |
| `dock reset` | thickness and ratios back (the side stays) |

**Moving in the dock**: `Shift+arrow` goes to the neighbour part that way (the input line, the suggestions, their source,
where it sends). From the input line `↓` `→` work at the end of the line, `↑` `←` at its start (a selection inside stays).
In the standard layout the suggestions are under the input line, their source to the left.

- **Suggestions**: the words that may follow the line, in numbered cells. A number (`Enter`: the cell under the cursor) adds it
  to the input line and stays, for the next word. `jk`, `hl`, `^`, `-` move. An argument's place shows only a hint: go back
  with `Shift+↑` and type it
- **Their source** (`;g` too): `↑↓` cycles `lines`, `intents`, `dict`; a letter (`l`, `i`, `d`) chooses and goes back; `Enter` goes
  to the suggestions. When the input does not go to tezcatl, `lines` is dimmed
- **Where the receiving side reads** (`;o` too): `t` tezcatl (commands and answers), `e` emacs-vent (context and events),
  `x` xterm (a terminal's output as lines of text — to watch a small terminal), `f` another frame (what it says: sending to it with
  `;i f`, its answers come here). A letter chooses and goes back to the input line.
  **While in the input line (and the suggestions) it follows where the input goes** (sending to an xterm shows its output).
  The first line says whose lines they are. A tezcatl error is put in whatever is shown

What is changed is kept in the skin with `skin save`. To change the layout itself, copy `docks/standard.json` to
`local/docks/standard.json` and edit it ([docks/README.md](../docks/README.md)).

### What connects inside the frame

- `Enter` in the tree → opens in the frame's `code_editor`; with none, or one with unsaved edits, a `code_editor` is added
- A line of the input line starting with `:` goes to the current `code_editor` (`:w`, `:e <path>`, `:12`, `:find`, `:grep` …, §4)
- `:#` in a `code_editor` moves to the input line; sending comes back

---

## 4. Edit files (`code_editor`)

Edited with vim's keys. The heading shows the path and `●` while unsaved.

### Files

| Command | What it does |
|---|---|
| `:w` | save (there is no save key: `Ctrl-s` was removed 2026-10-25) |
| `:w!` | save without checking the disk |
| `:e <path>` | open. **A missing file opens empty and `:w` creates it.** Refused with unsaved edits |
| `:e` / `:e!` | read again / read again, dropping the edits here |
| `:Rename <name>` / `:Move <path>` | rename in the same directory / move |
| `:Delete` / `:Delete!` | delete from the disk (the text stays in the editor) |
| `:Scratch` | write the text to the scratch file (`~work/scratch`), over it. The open file does not change |

- Paths are from the FS root; `./` and `../` are from the current file's directory
- Directories are not made: a file in a missing directory cannot be saved — make it in a terminal
- **When the disk changed after the file was opened, saving stops**: choose `:w!` (over it) or `:e!` (read again)
- A file that is not UTF-8 is not opened. Line ends (CRLF) stay as opened. A BOM is dropped on save
- **`:e <path>` of a file another `code_editor` has open opens a clone** (heading `# ~work/clone/<path>`): a copy of the disk's
  version, edited and saved as another file. The other `code_editor`'s unsaved edits are not in it. The receiving side says where the
  original is (`go on`); `:find <path>` goes to the original. Old clones are removed first (`clone.slots` in `code.json`)
- Paths starting `~work/` are **the work place** (`~/.local/state/tezcatl/work/`): Tezcatl's own files, outside the project.
  They open and save as usual (`:e ~work/scratch`); no language server; `:grep` does not look there

### Compare (`code_diff`)

Only **saved files** are compared; unsaved text goes through the scratch file. From the input line:

| Line | What it does |
|---|---|
| `:Diff` | the current `code_editor`'s text against the file on the disk (left the text, right the disk) — the same as `:Scratch` then `diff -n ~work/scratch,<file>` |
| `diff -n A,B` | the two files in a new `code_diff` panel |
| `diff -f A,B` | the same two in the focused `code_diff` (else the first of the frame) |

In `code_diff`: `n` `p` next / previous difference, `j` `k` scroll, `r` read again. Each side's heading is "path · last saved".
It reads again when either is saved. Read only.

### Against the disk (`check update`)

Tezcatl does not watch the disk. When something outside may have changed a file, type:

| Line | What it does |
|---|---|
| `check update` | the current `code_editor` compares the version it opened with the disk; a difference is said on the receiving side and the heading (`go on` goes there) |
| `check update all` | every `code_editor` of the frame |

On a difference, `:e` (`:e!` with unsaved edits). With a `file_changes` panel, a `code_editor` with no edits reads again by itself.

### Find and move

| Command | What it does |
|---|---|
| `:12` / `:12:5` | that line (and column) |
| `:find <path>:12:5` | the `code_editor` that has that file; opened when none has |
| `:grep <pattern> [path]` | ripgrep; results in a list window, `Enter` goes there. A pattern with blanks: `"…"` |

### Language servers

Opening a file of a known language connects by itself (heading `lsp <name>`): diagnostics, completion, hover.

| Key | Command | What it does |
|---|---|---|
| `gd` | `:LspDef` | to the definition (another file opens) |
| `gr` | `:LspRefs` | the list of references |
| `K` | — | the description |
| — | `:LspRename <new name>` | rename. Other files affected are opened in `code_editor` and changed **unsaved**: check and `:w` |
| — | `:LspFormat` | format |
| `]d` / `[d` | — | next / previous diagnostic |
| `]]` / `[[` | — | next / previous definition |
| `Ctrl-o` / `Ctrl-i` | — | back / forward over LSP jumps (with an `lsp_log` panel) |

- `u` undoes each of them
- A slow answer is asked again with twice the time (said in the heading); the limit is `lsp.maxTimeoutMs` in `code.json`
- "lsp: disconnected" → `:Reconnect` (the text is kept)
- A server stops 45 s after its last `code_editor` left. At once: `Del` in the `lsp` panel, or `lsp stop` below

From the input line:

| Line | What it does |
|---|---|
| `lsp list` | the running servers, numbered, on the receiving side |
| `lsp stop <name or number>` | stop one (the number of the last `lsp list`); its `code_editor`s reconnect with `:Reconnect` |
| `lsp timeout <ms> [limit]` | how long this frame's `code_editor`s wait (also those added later), until the window closes; to keep it, `code.json` |
| `lsp restart` | stop the current `code_editor`'s server and reconnect that `code_editor`; others on it `:Reconnect` each |

- A language is added in `lsp.json` (the server) and `languages` of `code.json` (extensions); the server must be on PATH
  ([extending/languages.md](extending/languages.md))
- The server runs with **its project's environment**: the nearest directory with a marker of `project_env.json` (`flake.nix`, `.envrc`,
  `mise.toml` …) has its command run once (`nix print-dev-env --json`, `direnv export json` …), and the server is looked up on that PATH
  first. The first time, the heading says "asking for the project environment"; a failure is said and the relay's own environment is
  used. After changing a flake: `env reload`, then `lsp restart` (below, "A terminal in a project's environment")

### Mirror (insurance)

A `code_editor` keeps a copy of the text being edited in `~/.local/state/tezcatl/mirror/`.

- Closing with unsaved edits is not refused: the copy stays and `file_changes` says so
- To get it back: open the file → "a copy is left" → `:Replay` → `:w`
- When a save stopped on a conflict with the disk: `:e!` → `:Replay` → `:w` (your text replaces it)
- `:Mirror` writes the copy now

### Keep points and go back (juncture)

Keeps the whole file at a moment you choose as a point, in a tree per file (close to Emacs' undo-tree). Separate from `u`'s
step-by-step undo; `:e!` does not remove points. From the input line:

| Line | What it does |
|---|---|
| `juncture set [path]` | put the file in the index; its text now is the root j0 (nothing when it is in) |
| `juncture point [path]` | the text now as a point (a child of the current point; `set` first if needed; the same text makes none) |
| `juncture back [path]` | put the parent point into the `code_editor` |
| `juncture forward [path]` | put the child passed last |
| `juncture tree [path]` | the `juncture_tree` panel (shown in the frame's if there is one, else added) |

- No path: the current `code_editor`'s file (focused, else used last). With a path: the `code_editor` that has it (added if none)
- A point put in is an **unsaved edit**: `u` undoes it; `:w` keeps it
- back / forward while the text differs from the current point first makes the text a point ("the edits were kept as jN")
- Editing after going back and `juncture point` makes a branch; forward goes along the branch passed last

The `juncture_tree` panel:

```
lib/a.ex
└── j0  10:02:00  start
    └── j1  10:15:00
        ├── j2  10:20:00
        └── j3  10:31:05  ← current
```

`j` `k` choose, `Enter` puts that point in, `d` compares it with the disk (`code_diff`), `o` opens the point read only, `r` reads again.

- Points live in the work place (`~work/juncture/`) and **are gone when the relay restarts**
- Limits: `juncture` in `code.json` (`files` 10 — files in the index, `slots` 20 — points per file). Over them the oldest goes
  (said on the receiving side); j0 never goes; the children of a point gone hang on its parent

### Turn marks into ids (`:Replace`)

To give rows or tables ids that never repeat: write a mark first, replace all of them later.

| Command | What it does |
|---|---|
| `:Replace <mark> <list>` | every `<mark>` in the text becomes an id of the list `<list>` (8 lower-case letters and digits). Not saved |
| `:w replace <mark> <list>` | replace, then save |

- A mark has no blanks (e.g. `#eigenvalue`). Not replaced where a letter, digit or `_` follows (`#eigenvalues` is another word);
  anything may come before (`taskmatrix_#eigenvalue` is replaced)
- One `u` undoes all
- The relay keeps the list in `~/.local/state/tezcatl/ids/<list>.json` (names: lower-case letters, digits, `-`, `_`); made on first
  use. An id is never given twice

Example: a table captioned `Table: task matrix #eigenvalue`, saved with `:w replace #eigenvalue tasks`, becomes `Table: task matrix k3x9a2bq`.

### Write a short text and deliver it (`code_vi_minimum`)

A commit message, a path, a line for a terminal — written with vim, then delivered. `minimum [what it is for]` in the input
line adds a small editor at the end of the frame's last column. Then:

| Command | Where to |
|---|---|
| `:m input` | into the skin's input line |
| `:m xterm` | pasted into the xterm focused last (not run) |
| `:m code_editor <file>` | one line at the end of that file's `code_editor` (unsaved; `:w` there) |
| `:m` | back to the panel that asked (when a panel opened it), else the kill ring |
| `:q` | throw it away |

`:m` is "mail" (not `:w` — this editor has no file and saves nothing). Delivered text is cleared; the editor stays.

### Read a note (`markdown`)

A markdown note drawn in a read-only panel; editing is in `code_editor`. From the input line:

| Line | What it does |
|---|---|
| `markdown <path>` | a markdown panel drawing that note (the saved text; read again on save) |
| `markdown follow` | the focused (else the first) markdown panel follows a `code_editor` of the same skin that has the note: draws its unsaved text, marks the block with its cursor |
| `markdown unfollow` | back to the saved text |

- Heading: `disk · saved at` or `following code_editor …` (● while unsaved)
- When the `code_editor` opens another file or closes, following stops (said on the receiving side)
- In the panel: `j` `k` choose a block, `Enter` goes to its line (the followed `code_editor`, else opens one), `f` toggles follow, `r` reads again
- Drawn: headings, emphasis, strike-through, code, quotes, lists, check boxes (`- [ ]`, shown only), GFM tables. A
  `Table: <name>` line just before or after a table is its caption
- A link to a path opens it, `http(s)` in a new window. Images are not loaded ("this panel cannot show an image ── its file is …").
  HTML is not drawn: it shows as text

### Edit a note's table (`task_table`)

A note's table, taken by name, edited as a table and put back. Name the table the pandoc way and give it the four columns:

```markdown
Table: task matrix #eigenvalue

| id      | state | pri | task                     | inner_id    |
|---------|-------|-----|--------------------------|-------------|
| t-01    | TODO  | A   | the order of relay tests | #eigenvalue |
| t-02    | NEXT  |     | the markdown panel       | #eigenvalue |
| t-02-01 | NEXT  |     | how to go back and forth | #eigenvalue |
```

(The column names, the mark and the id list are in `tasks/task_table.json`. `:w replace #eigenvalue tasks` fixes the name and the
row ids first — "Turn marks into ids" above.)

| Line | What it does |
|---|---|
| `task_table take <path> <name>` | that table in a task_table panel (its book — `~work/books/<name>.json` — when there is one, else taken) |
| `task_table take! <path> <name>` | take it again (the book is written over) |
| `task_table save` | save to the book (`w` in the panel) |
| `task_table put` / `put!` | save and put it back into the note (`W`); `!` even when the note's table changed since it was taken |

`t` on a table block in a markdown panel takes it too.

In the panel:

| Key | What it does |
|---|---|
| hjkl, `v`, a click on a heading, `/`, `c`, `y` | as in matrix (move, select, sort, filter, colour, yank) |
| `i` / `Enter` | edit a cell (an edit line below; `Enter` commits, `Esc` cancels). An `inner_id` that has an id is not edited |
| `o` / `O` | add a sibling / a child row, numbered (`t-02`'s sibling is `t-03`, its child `t-02-02`) |
| `d` `d` | delete the row |
| `J` / `K` | move the row down / up (not while sorted) |
| `w` | save to the book: every row in the order shown (rows hidden by a filter stay). Rows whose id is empty or the mark get ids |
| `W` | `w`, then into the note: the table and its caption replaced. A `code_editor` that has the note gets it unsaved (`:w` there), else the file |
| `L` | `w`, then the rows shown (this filter, this order — the rank) cut into the task list; the agenda (`C-c a`) shows it |

Changes in the agenda (the task list) go back to this table's book (`d` and `x` take the tasks under too). An open task_table
reads its book again unless it has edits of its own. Into the note it goes with `W`.

### Send rows one by one (`run_table`)

Instead of typing lines one at a time, rows of a table are sent from the top to their destination. The destination is a letter
of input_target, written per row (`t` tezcatl, `e` emacs-vent, `c` code_editor, `x` xterm, `x2` the second), and a row's line is
written as in the input line (`;e` is Return).

Seven columns are fixed; from the eighth on, columns are variables:

| Column | What |
|---|---|
| `id` | the order: of the rows with an empty status, the smallest goes first |
| `input` | the destination's letter; empty: the one chosen in input_target |
| `line` | what is sent; `{column}` is that row's cell of the variable (a `;` in it goes in as a character) |
| `wait` | seconds to wait; empty: `wait` of `tasks/run_keys.json` (3) |
| `auto` | `F`: when a row above (a smaller id) failed, it is not sent but `skip` |
| `status` | empty is "not yet"; sent is `sent`, then one of below |
| `note` | the output line a key matched, or why it was not sent |

What a status becomes: `done` (the wait went by and no line matched a key — it does not say it worked), a key's name (a line of
the destination's output **began** with that key's text), `send-failed` (not sent), `skip`, `stop`. The keys are
`tasks/run_keys.json` (by default `err` ← `! `, the frame's errors) under the template's `keys` (`""` removes one). The output
watched is tezcatl's (the frame's receiving side) and an xterm's (its lines); emacs-vent and code_editor are not watched: `done` after
the wait. Whatever the status, once it is filled the next row goes. Where it must stop, write `auto` `F`.

| Line | What it does |
|---|---|
| `run new <template> [<name>]` | a book (`~work/books/run/<name>.json`) from a template (`tasks/run/<template>.json`, or the path of a book saved with `run save`), shown in the frame; an existing book of that template is read |
| `run new! <template> [<name>]` | make the book again |
| `run start` | send (`R` in the panel) |
| `run stop` | `stop` in every empty status (`S`); the row going ends with its wait |
| `run save <path>` / `save!` | the book as a file (that becomes a template); `!` over a file that is there |
| `run insert-if <status> #<id>` | **written in a row's `line`** (sent to `t`): when the row above has `<status>`, a copy of row `#<id>` goes just under it (below) |
| `run from <intent> [<name>] [<arg>=<value> …]` | a book made from an intent's answer (below); an existing book of that intent is read; `run from!` asks again |
| `intent <id> [<name>=<value> …]` | run an intent and say its answer; in a row's `line`, it calls an intent from a row |
| `log start [<path>]` / `log stop` / `log` | start, stop, ask about a record of the output (below) |
| `run match <record> [<book>]` | the record set beside the book, row by row (below) |

In the panel: matrix's keys (hjkl, `v`, sort, `/`), and `i` / `Enter` edit a cell, `o` adds a row (the defaults and the next id),
`x` empties its status and note (the next `R` sends it again), `-` leaves it out (status `-`: not sent; `x` takes it back),
`d` `d` deletes. Every change is written to the book at once.

**An intent's answer as rows** (`run from`): when the intent has `result.book` (which template, which key of the answer to which
column — [extending/intents.md](extending/intents.md#resultbook)), `run from <intent>` makes one row of each item. Magit's
`run from magit.changed-files` makes a book of the template `magit_stage`, one row a changed file: leave out the files you do not
want with `-`, then `run start` — with the default `line` `intent magit.stage-file path="{path}"`, only the files left are staged,
one by one (dired's "mark, then act"). To unstage some instead, write `intent magit.unstage-file path="{path}"` in their `line`.
The decode_emacs table is not asked again by the rows (`r` there). An input panel (it runs the intents) must be open.

**Let a row decide the next** (`run insert-if`): "the row above" is the largest id smaller than the row's. When its status matches,
a copy of row `#<id>` (status and note empty, the other columns as they are) goes just under, with an id one decimal down
(`4` → `4.1`, `4.1` → `4.11`), and that copy goes next. The insert-if row itself is `done` at once, its note saying what it did.
A row to copy from is kept from being sent by filling its status (`-` or anything). The condition is a match only — anything
more involved belongs in an Emacs intent.

| id | input | line | status |
|---|---|---|---|
| 1 | x | `make \|\| echo "#fail $?";e` | |
| 2 | t | `run insert-if done #20` | |
| 20 | x | `make install;e` | `-` |

(With `#fail` as a key, a failed `make` makes row 1 `fail`, and `make install` is not inserted. The insert-if row itself becomes
`done`, so another insert-if right under it looks at this row — or the copy — not at row 1.)

**Record, then compare** (`log`, `run match`): make the first row `log start ~work/logs/<name>.log` and the last `log stop`
(a longer wait, for output that comes late). What came out in between (the frame's receiving side, xterms, emacs-vent, each row
sent and ended) is kept, one line each, as text (readable in `code_editor`). No path: `~work/logs/<date>_<time>.log`. After the run,
`run match <that file>` compares, row by row, "the lines of the row's destination" (from the row to the next row sent to the same
destination — lines that came after the wait are in) with the keys, and marks `≠` where the book's status differs. `Enter` shows
that part in full. The book is not changed: to send again, `x` and `R` in the run_table.

To see where an xterm row ends, add a signal to the line and make it a key (the signal must begin a line — after a prompt it is
not seen; in the background, print a newline first: `echo;; echo "#fail"`):

```json
{ "columns": ["id", "input", "line", "wait", "auto", "status", "note", "file"],
  "defaults": { "input": "x", "wait": "10", "auto": "F" },
  "keys": { "fail": "#fail" },
  "rows": [["1", "", "node --test {file} || echo \"#fail $?\";e", "", "", "", "", "test/a.test.js"]] }
```

---

## 5. Panels beside a `code_editor`

| Panel | What | Keys |
|---|---|---|
| `tree` | the file tree | `Enter` open, `o` open in a new window, `m` bookmark |
| `file_changes` | says another `code_editor` saved, deleted or moved a file, and lists `code_editor`s closed unsaved; a `code_editor` with no edits reads again by itself | `Enter` go there, `d` `d` remove the copy, `Del` remove the row |
| `problems` | the diagnostics of the open `code_editor`s | `Enter` to that line |
| `code_outline` | the definitions of the current `code_editor` | vim motions, `/` search, `Enter` to the definition |
| `lsp_log` | the record of LSP operations (definitions, references, renames, descriptions in full) | `Enter` to that place |

Changes made outside Tezcatl (git in a terminal, a save in Emacs) do not show in `file_changes`; the check on saving stops them.
To know earlier, `check update` (§4) — a difference also shows in `file_changes`.

---

## 6. Terminals and Emacs

### Terminal (`xterm`)

- The shell is `pty.shell` in `config.json` (default `bash -l`). Closing the window ends the shell; run long things inside tmux
- Too much output is cut (a marker shows)
- `xterm.html?cmd=<command>` runs that command directly; `?font=`, `?size=` for the look

### A terminal in a project's environment (`env`)

A plain xterm has the relay's own environment (enter a project's by hand: `nix develop` …). From the frame's input line:

| Line | What it does |
|---|---|
| `env xterm [<path>]` | a new xterm started at the root of the path's project (none: the current `code_editor`'s file), with that project's environment; it says which in grey and in its heading |
| `env show [<path>]` | which project, by which marker and command, and what it changes (directories put before PATH, variables set and unset) |
| `env reload [<path>]` | ask that project's environment again next time (none: every project's); running language servers keep theirs till `lsp restart` |

- The project is the nearest directory from the path up to the FS root holding a marker of `project_env.json`; there the first entry
  in order is used. Without Nix, write the line of your tool (`direnv export json`, `mise env --json`, or a script printing
  `{"NAME": "value" | null}`) — [extending.md](extending.md)
- An environment is asked once and kept (a failure too) until `env reload`; the shell's own profile (`bash -l`) still runs after it
- Reloading the window, or opening a saved skin, gives that xterm back as a plain one

### Emacs (`input`, `output`)

Tezcatl sends keys to Emacs without reading them; what happens is up to Emacs' keymaps.

- **Form** (default): build a notation like `C-x C-f` and send with `Shift-Enter`; a plain `Enter` adds `RET`. ↑↓ history
- **Live**: each key sent as typed
- **Text**: pasted text sent one character at a time
- The "unstick Emacs" button sends `C-g`
- The context in `output` is where the next key goes (the minibuffer, the buffer selected)
- `compile.run` in Form sends the compile command of the last `code_editor`'s language to the last `xterm` (the table is `compile.json`)

### Emacs' answer as a table (`decode_emacs`)

When an intent has `result.table` (which part of the answer, made which table —
[extending/intents.md](extending/intents.md#resulttable)), its answer appears as a table in the decode_emacs panel. Keep one
with `skin add <column> decode_emacs` and run the intent from the input panel — or, in the frame, `table <intent> [<name>=<value> …]`:
a decode_emacs of that intent's own is added (asked again when the frame already has one), so several tables stand side by side.

- `Enter`: open the row's file (the table's `link` column; at its `line` if it has one)
- `r`: the same intent again
- `b`: the table into a book, `~work/books/decode/<intent>.json` (the rows chosen with `v`, else every row shown, in the order
  shown; written over each time) — what an intent's `sql.load` makes a table on database window 1 (below)
- The keys the intent set (e.g. `s` stages the row's file): call an intent with the row's values, then fetch the table again.
  A diff key compares the version the intent returned (HEAD …) with the file in `code_diff`, or two versions (a commit's parent and
  the commit). A table key shows another intent's answer in a decode_emacs of its own (the log's `f`: the commit's files)
- hjkl, `v`, sort by a heading, `/`, `c`, `y`: as in matrix
- Without an input panel open (it runs the intents), the keys and `r` say "no answer"
- `decode_emacs.html?intent=<id>` shows only that intent's answers
- Magit: `table magit.changed-files` (`s` `u` `d` `C`, `H` the file's hunks), `table magit.hunks` (`s` / `u` one hunk, `Enter` the file
  at it, `d` against its base), `table magit.log [count=…]` (default 50; `f` the commit's files, there `d` the parent against the
  commit). A saved skin does not keep which intent a decode_emacs shows (open them with `table` again)
- Shaping a table on the database (database window 1 logged in: `database id=1`): `table magit.changed-files`, `b` (all, or `v`
  the rows wanted first), then `table db.magit-section [section=staged]` — the book made a temporary table on window 1 and one section
  taken from it — or `run from db.magit-section` for a run_table staging each. Another shaping is another intent with `sql.load`
  ([extending/intents.md](extending/intents.md))

---

## 7. List panels

Filter by typing. Single-letter keys work while the filter is empty.

| Panel | What | Keys |
|---|---|---|
| `commands` | the command palette | `Enter` run |
| `killring` | yank history | `p` paste, `P` paste and remove, `Del` remove |
| `bookmarks` | what tree's `m` marked | `Enter` open, `Del` remove |
| `lsp` | the running language servers | `Del` stop |
| `w_list` | the windows connected to the relay | `Del` disconnect |
| `agenda` | the task list (cut with task_table's `L`, §4) | `t` next state, `d` DONE, `x` CANCELLED (and the tasks under), type in the filter and `M-n` add, `Enter` that line of the note, `Del` take it off the list (it stays in the table) |
| `xipe_cards` (also `cards`) | Xipe Totec's functions (file:line, class, number of rows; functions with no rows too), fetched once on opening | `Enter` that function's table (`matrix`), `M-d` open its definition in `code_editor` |
| `dict` | the dictionary (`dict.json`): completion for the input lines of the same skin | `p` add the newest kill, type `word: description` and `M-a` add, `Enter` into the input line |

**Suggestions** (`suggestion_list_line`, `suggestion_list_intent`, `suggestion_list_dict`) differ from lists: they show the next
word of the line in cells (5 rows × 2 columns by default, filled top to bottom). `line`: lines of the input line
(`suggestion/line.json`); `intent`: intent ids; `dict`: the dictionary's words (anywhere in the line). `<…>` `[…]` are arguments: a
hint shows instead of a word. A number chooses that cell (`Enter` the one under the cursor); `jk` one, `hl` one column, `^` `-` a
page. Alone in a window the chosen word is added to the panel's line, `Backspace` takes one word back. In the frame they are in
the dock (§3).

---

## 8. Xipe Totec (from a terminal)

Xipe Totec is a separate project with its own documents; this is the part used together with Tezcatl.

<!-- env:nix -->
```
cd <xipe_totec> && nix develop      # the xipe command, usable from any directory
```
<!-- /env:nix -->

Languages: Elixir, OCaml, Haskell. Nothing is written into the target project (the data is in `xipe_totec/tables/`).

### The basic flow

```
xipe choice project ~/work/calc            # choose the target (once; switching is the same)
xipe scan                                  # read the sources (after each change)
xipe show                                  # the functions (nodes) with their ids and rows
xipe do effect/set id=<node> effect=pure   # classify each function's effects, once
xipe do row/add node=<node> args=1,2       # keep a call as a calculation row
xipe eval                                  # evaluate; compared with the last value in compare
```

- **An unclassified function is not evaluated.** `pure` and `reads` are; `writes` and `unknown` only with `--include-writes`
  (`include_writes=true` for `do`). Evaluation is not a sandbox: evaluating `writes` really writes
- **A file added is not read until `xipe table generate`**
- With the same name and arity, a function keeps its id over scans; changing them makes another card
- `xipe scan` alone does not evaluate

### Commands

| Command | What it does |
|---|---|
| `xipe choice project <path>` | register and choose a target |
| `xipe table generate` | make the file → language table again (after adding files, `mix.exs`, `flake.nix`) |
| `xipe scan` / `xipe show` | read / list |
| `xipe eval [id...] [--include-writes]` | evaluate (all when no id) |
| `xipe do <method> [key=value...] [-- <method> ...]` | run methods in a row |
| `xipe dialogue depends <row id>` | put values upstream by hand and evaluate only downstream (`y <value>` / `n`) |
| `xipe dialogue do <method> [key=value...]` | asks for each missing argument, then runs; answers go as typed (below) |
| `xipe dialogue rewrite [<table> [<row> [<column>]]]` | write one value of a table by hand, without evaluating (`args`, `result`, `prev`, `effect`) |
| `xipe search` | a dialogue that filters the tables (`-s`, `-e`, `get id`, `quit dialogue`) |
| `xipe config [key=value]` | per-project settings (`env.path`, `env.refresh`, `eval.timeout`, `eval.boot_timeout`) |
| `xipe dialogue update` | change one setting in a dialogue (file → key → value; also from the dialogue window) |
| `xipe start [--port N]` | run as a server (Poca's box starts it for Tezcatl) |
| `xipe help [<command>]` | the list and descriptions |

### Methods of `xipe do`

| Method | Arguments | What it does |
|---|---|---|
| `row/add` | `node` `args` | make a row |
| `row/update` | `id` `args` | change the arguments and evaluate that row only |
| `row/remove` | `id` | remove |
| `row/set-result` | `id` `result` | write a value without evaluating |
| `row/set-prev` | `id` `prev` | write what the next evaluation compares with (the expected value), without evaluating |
| `row/set-args` | `id` `args` | change only the arguments (no evaluation; the value of the old ones stays) |
| `row/list` | `call_ids` (all when omitted) | the rows (each with its function's `path` and `line`) |
| `row/check` | `on=error,changed,unevaluated` | fail (exit 1) when a row is in that state |
| `row/depends` | `call_ids` | the rows reached upstream through references |
| `effect/set` | `id` `effect` | classify effects |
| `arity/set` | `id` `arities=[1,2]` | for functions with default arguments, which arities can be called |
| `node/resolve` | an address | one function, its id |
| `card/get` / `card/search` | an address | a function and its rows |
| `card/list` | — | the functions (file, line, class, number of rows) |
| `eval` | `call_ids` (all when omitted) | evaluate |
| `eval/status` | — | what is being evaluated |
| `eval/cancel` | `pass_id` (omitted when one runs) | stop a running pass (nothing is recorded); a queued one by its `pass_id` |
| `roster` | — | the tables and columns `search` reads, and the columns `dialogue rewrite` writes |
| `scan/run` | — | the same as `xipe scan` |

An address combines `file=`, `module=`, `name=`, `arity=`, `row=`.

### Answering questions (`dialogue do`, `dialogue rewrite`)

Values that do not fit one line (a list with commas, a string with blanks or quotes) are answered line by line, **as typed**.

```
$ xipe dialogue do row/add
node? …
do> Calc.average/1          ← a function by id or by name
args? (a list of 1: …)
do> {                       ← a line with { alone opens a list
do> [1, 2, 3]               ← one element a line
do> }                       ← a line with } alone closes it
…
Run it? (y/n)
do> y
```

- It asks only for required arguments not on the line (`xipe dialogue do effect/set id=Calc.add/2` asks only `effect`)
- Methods that write the Book show the call and wait for `y/n`
- `xipe dialogue rewrite` asks row id → column → new value: an expected value (`prev`), a value by hand (`result`), only the
  arguments (`args`), a function's class (`effect`). **It does not evaluate**: `eval` afterwards
- `quit dialogue` leaves either without doing anything

### Writing lines

```
xipe do node/resolve module=Calc name=square arity=1 \
     -- effect/set 'id=$0.id' effect=pure \
     -- row/add 'node=$0.id' 'args=[3]' \
     -- row/add 'node=$0.id' 'args=[⟦$2.id⟧]' \
     -- eval 'call_ids=[$2.id,$3.id]'
```

- `--` separates; `$<n>.<key>` is the result of an earlier command (from 0)
- `⟦<row id>⟧` puts that row's result in an argument (a spreadsheet's cell reference)
- **Quote a value with `$`, `⟦⟧`, `[]` or `"` in single quotes** (`'args=["hi"]'`)
- `[]` is empty, `[10]` one element, `1,2` or `[1,2]` two. A list cannot be passed as one argument this way
- **Only the rows named are evaluated**; to evaluate what they refer to, name those too (`xipe eval <R1> <R2>`)
- A row being evaluated cannot be changed (`row_in_pass`)
- To stop without waiting, `xipe do eval/cancel` (from another terminal, or the dialogue window). A stopped pass records nothing

### Reading the results

| Shown | Meaning |
|---|---|
| `ok` / `crash` | evaluated / an exception |
| `timeout` / `max_heap` | stopped at the time (5 s by default) or memory limit per row; lengthen the time with `eval.timeout` in `dialogue update` |
| `eval: limit 5s per row (eval.timeout, <file>), …` | the pass's limit and the file it came from |
| `error  cancelled` | stopped by `eval/cancel`; the pass recorded nothing |
| `skipped` | a referenced value could not be passed: name it too, or `dialogue depends` |
| `not run <reason>` | unclassified, `writes`, a cycle, the function is gone, … |
| `repr=exact` / `binary` / `unsupported` | the value can be written back as source / kept only as bytes / shown only |
| `compare=same` / `changed` / `none` / `skipped` | as last time / changed / first time / not comparable |

### Per language

- **Elixir**: with `mix.exs`, `iex -S mix`; without, only the `defmodule` parts are read. `defp` cannot be a row.
  The REPL is waited for 15 s (lengthen `eval.boot_timeout` in `dialogue update`; for Mix, `mix compile` first)
- **OCaml, Haskell**: need [embody](https://github.com/Crux-xurC/embody) next to Xipe Totec. Arguments are written in that
  language's source. OCaml's `unit` is `args=[()]`. dune, cabal and stack projects must have their dependencies ready. A Haskell
  function returning `IO` is not run
- A target with `flake.nix` runs its REPL in that environment (`shellHook` does not run)

---

## 9. Xipe Totec from Tezcatl

Xipe Totec decides the target (`xipe choice project`). Tezcatl is the window and sends the lines without reading them.

### Dialogue window (`xipe`)

- `Ctrl-Enter` in the input. One line is one send, written as after `xipe` in a terminal (`xipe` and `do` may be left out)
- Start with `help`. Select a line of the answer, copy it, `p` in the dictionary on the right: from then on it completes in the input
- Usable: `help`, `show`, `scan`, `eval`, methods (`row/add …`, `eval/cancel`, `roster`), `search`, `dialogue depends <id>`,
  `dialogue do <method>`, `dialogue rewrite`, `dialogue update`
- Not usable (type them in a terminal): `choice project`, `table generate`, `config`, `refresh` (settings change with `dialogue update`)
- **Several lines sent together run at the same time.** To use the result of a line, wait for its answer or join them with `--`
- Starting a dialogue (`search`, `dialogue depends`, `dialogue do`, `dialogue rewrite`, `dialogue update`) makes the next line its
  answer. **This is shared by all windows**: do not type from another window in the middle. Empty lines are not sent, so a list is
  wrapped in `{` and `}` lines
- A long evaluation is stopped with `eval/cancel` (it arrives at once, apart from the lines waiting)
- Restarting Xipe Totec keeps the window usable (the record shows `# reattached`); a line waiting for an answer gets none
- Changes made with `xipe` in a terminal are taken by the server at its next request

### Table (`matrix`)

The table above, a command line below (`Ctrl-Enter`). The table does not change by itself.

| Command | What it does |
|---|---|
| `matrix update` | fetch the table again (after evaluating in the dialogue window) |
| `matrix get <path>` | fetch that table: `xipe_rows:all` (every row), `xipe_rows:call_ids=<id>,<id>`, `xipe:module=Calc&name=add&arity=2` (one function) |
| `matrix pwd` | the current table's path |

### Database window (`database`)

A window on Tezcatl's own MariaDB (`nix/db`, started from Poca's box), logged in by you
([D-db-session](files/lib-relay-sql.exs.md#d-db-session)). In the frame: `skin add database`. Its line at the top says its number
(`db 2`), `<account>@<host>:<port>/<database>` and its state; it asks at once for the password of the account (masked; `Enter` logs in,
a wrong one gets the server's refusal and is asked again). Below, the table of the last answer, and the command line:

| In the command line (`Ctrl-Enter`) | What it does |
|---|---|
| any statement | sent as it is, the whole text as one statement (never split at `;`); the text stays to be edited and sent again |
| `db login [<account>]` | ask for the password again (after `db exit`, or connecting again when the relay was gone) |
| `db exit` | log out; the window and its number stay |
| `db cancel` | stop the statement running (`KILL QUERY`) |

Each window is its own session: a temporary table stays for the next statement of the same window only. Window 1 is kept for intents:
it logs in but takes no statement. The number survives a reload; a saved skin read again takes a new one.

From the frame's input line (any window):

| Line | What it does |
|---|---|
| `database` | a database window placed in this frame (`skin add database`); `database tab` / `database window`: a new frame holding one |
| `database id=1` | window 1, the intents' (a second one is refused) |
| `db login <n> [<account>]` | window `<n>` asks for the password in its own field (its band says `● password`); go there (`Ctrl+Tab` in Poca). No `<n>`: the database window focused here |
| `db exit <n>` / `db cancel <n>` | window `<n>` logs out / stops its statement |
| `db list open` / `db list close` | the list of database windows at the bottom of the dock made larger / back to one line; `Del` on a row logs that window out |

In the table: `hjkl` move, `v` select, `y` yank, `/` filter, a click on a heading sorts, `c` then `b`/`r`/`y` colours, `w` clears.
In the table of rows (`xipe_rows`), `g` `d` goes to the definition of the row's function (an open `code_editor` if one has it; inside a
frame a `code_editor` is added; otherwise a new window — the heading says where). Rows are as of the last scan. A project outside the FS
root cannot be opened (said so). A row whose `node` is `gone` lost its function in a scan (make it again). Long values are cut; with
the cursor on one, it shows in full below. Other keys do nothing.

### Use the table's selection elsewhere (`radar` and `@`)

To put the selected rows into a line of the dialogue window, two steps:

1. `radar` in the table's command line (or the frame's input line) — the selection becomes "the last reference". The band (the
   receiving side) shows `radar ── xipe_rows:all  calc_row  [sentence]  @<row id>`; several selected rows give several ids
2. `eval @` in the dialogue window — `@` is replaced by the row ids and sent (the record shows the line after replacing)

- `radar` gives only the table's path, the row type, the column keys and the row ids (no values)
- The frame's `radar` is about the table used last (in any window); a table never moved says so
- Only an `@` written alone is replaced. Without `radar` first, the line is not sent and that is said; the same in an answer of a
  dialogue, so to send a lone `@` as a value (OCaml's `[1] @ [2]`) write it without blanks (`[1]@[2]`)

---

## 10. Settings files

Tezcatl (at the top of the repository):

| File | What |
|---|---|
| `config.json` | the relay's URL, the terminal's shell and font, the leave key and lead key (`ui.keys`), windows opened at start (`ui.startup.windows`) |
| `code.json` | the editor: `tabSize`, `indentUnit`, `lineWrapping`, `keymap`, `editorKeymap` (the file editor's), `fontFamily`, `fontSize`, `autosave`, `keys` (keys → commands, per keymap), `inputLineEx` (the input line's `:` lines; by default only with vim), `mirror`, `clone`, `fileChanges` (`reload: false` stops reading again on another's save), `lsp` (waiting times), `juncture`, `languages` |
| `lsp.json` | language → the server's command and the marks of a project's root |
| `project_env.json` | marker → the command that prints a project's environment and its format (`env`, `nix`), `timeoutMs` |
| `xipe.json` | where Xipe Totec is (`connect`: `host`, `port`) |
| `compile.json` | language → its compile command |
| `local.env` | this machine's environment variables (`TEZCATL_FS_ROOT` …); not in git |
| `work.json` | the work shown by `work list` (pairs of start and end messages) |
| `tasks/` | the task_table's columns, the run_table's keys and templates |
| `skins/`, `blocks/`, `thema/`, `docks/` | saved frames, how panels are dressed, the bands' looks, the dock's layouts (yours under `local/`) |

At the top of the FS root (not in git): `tree.json` (the tree skin's slots), `dict.json` (the dictionary). Tasks are notes' tables
and their books (`~work/books/`).

Main environment variables: `TEZCATL_FS_ROOT` (the root of files), `TEZCATL_RELAY_PORT`, `TEZCATL_ALLOWED_ORIGINS` (opened on other
ports), `TEZCATL_MIRROR_DIR`, `TEZCATL_WORK_DIR`, `XIPE_TOTEC_PORT`, `XIPE_TOTEC_LSP=off` (scan without a language server).

<!-- env:nix -->
A new settings file is not seen from `nix develop` until it is `git add`ed.
<!-- /env:nix -->

---

## 11. When something is wrong

| Symptom | Look at |
|---|---|
| panels do not work together | are all opened from `:4001`? |
| `t` starts nothing | "no POCA_SECRET": start it from Poca's box, or `t --no-auth`; "in use": stop the old processes (§1) |
| the pages load but nothing works (no Emacs, no files, no terminal) | opened outside Poca while tezcatl runs from Poca: open it from Poca's bookmark |
| cannot save | read the heading: "the file on disk changed after it was opened" → `:w!` or `:e!`; "no such directory" → make it in a terminal; "nowhere to save" → open it with `:e <path>` first |
| no diagnostics or completion | is `lsp <name>` in the heading? Is the server on PATH (`which`)? Was the relay restarted after entering the dev shell again? Is the file open in another `code_editor`? `stdout outside a frame` in the relay's log: the server's wrapper prints extra output |
| no LSP answer | it asks again with longer waits; if even the limit gets none, `lsp restart` (input line) or `:Reconnect`, or `Del` in the `lsp` panel and open again |
| closed with unsaved edits | `Enter` on the row in `file_changes` → `:Replay` → `:w` |
| a terminal's box drawing is off | for nvim, `:set ambiwidth=single`; keep the monospace font (PlemolJP Console by default) |
| the dialogue window is silent | is there `# connected` in the record? If not, `/tmp/tezcatl-xipe.log` (no target chosen, the port in use) |
| `no project selected` | `xipe choice project <path>` |
| `not run  effect not classified` | classify it with `effect/set` |
| `unknown call id` (`bash.id` …) | `$0.id` was not in single quotes |
| `undefined variable "hi"` | the `"` were lost: `'args=["hi"]'`, or answer `dialogue do row/add` line by line |
| a list cannot be one argument (`[1,2,3]` splits) | `dialogue do row/add` (wrap in `{` and `}` lines, one element a line) |
| evaluation does not end / do not want to wait | `eval/cancel`; `pass_id` is in `eval/status` |
| "arity is neither a number nor a string" | the `$n.…` it refers to is missing (the command before failed) |
| `internal_error` | an error inside Xipe Totec; the server keeps running. Details in `/tmp/tezcatl-xipe.log` |
| a function or row added by the line before is "not there" | the line before has not finished: wait for its answer, or one line with `--` |
| `skipped  upstream ...` | evaluate the referenced id too, or `dialogue depends` |
| `row_in_pass` | the row is being evaluated: check `eval/status`, then again |
| `boot_failed` | the target's code does not compile (the output after says file and line), or the REPL took longer than the limit (15 s) — lengthen `eval.boot_timeout` in `dialogue update` |
| the table does not change | `matrix update` |
| scanning is slow | the first time waits for the language server; to hurry, `XIPE_TOTEC_LSP=off` |
| a run_table key never matches an xterm line | the line began with the prompt: make the signal begin its own line (`echo;; echo "#fail"`) |
