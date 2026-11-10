# `lib/code/juncture.js`

The junctures (D-juncture), the pure parts: the `juncture ...` lines of a skin's input form, where back and forward go in a file's tree, the tree drawn as the `tree` command draws one, and what the relay pushed out said in a line.

**Decisions homed here**: [D-juncture](#d-juncture)

<a id="d-juncture"></a>

## D-juncture — the state of a file a person checked is copied as a point, in a tree per file; applied as an unsaved edit

**Decided**: like Emacs' undo-tree, a branching history seen as a tree and every place reachable — but not edit by edit: **the whole file
at a moment a person chose** (a point). A layer apart from CM6's undo in `code_editor` (step by step, lost on `:e!` and `:Reconnect`), which
stays as it is.

- **One tree per file**. `juncture set` puts the file in the index and its text then is **the root j0** (`ancestor`, never pushed out).
  `juncture point` makes the text now a child of the current point (`set` first if needed; the same text as the last point makes none)
- **Moving**: `juncture back` (the parent), `juncture forward` (the child passed last — each point remembers `lastChild`), `Enter` in the
  `juncture_tree` panel (the chosen point). If the text differs from the current point, **it first becomes a point**, then the move (no edit
  is lost)
- **Applied to `code_editor` as an unsaved edit**, one minimal change keeping common ends (as `:Replay`; `u` undoes). A person saves with `:w`
  (the usual check). The relay never writes the file
- **In the work place** `~work/juncture/` (`D-work-place`): texts as `files/<hash of the path>-<name>/<id>-<name>` (extensions kept), the
  tree in `index.json` (for people to look at; the truth is the relay's GenServer). Readable through `/fs/read`, so `diff` and `code_editor`
  need no special case
- **Gone**: the whole `~work/juncture/` when the relay starts. Pushing out has two levels: the index over `juncture.files` (`code.json`,
  10) drops the whole tree touched longest ago; a file's points over `juncture.slots` (20) drop **the oldest** except j0 and the current
  point, its children hung on its parent (a branch point gone leaves the children siblings, one level up; the only root is j0). What is
  pushed out is said on the receiving side (`D-say-side-effects`)
- **Commands**: `juncture set|point|back|forward|tree [path]` (lines of the frame's input; the tezcatl commands `juncture.*` run as those
  lines). No path: the current `code_editor`'s file (focused, else used last). Short forms later
- **The `juncture_tree` panel** draws in `tree`'s shape, `start` on j0, `← current` on the current point. `Enter` applies, `d` compares with
  the disk in `code_diff` (`diff.open` in a frame), `o` opens the point **read only** (editing and `:w` would make the point's contents
  drift from the relay's record); it reads again on `juncture.changed {path}`

**Alternatives**: naming it `undo` / `redo`; files `juncture_base.json` and `juncture_0…9.json`; texts inside Tezcatl's directory, or removed
when Tezcatl closes; writing the file directly when going back; pushing out "keep branch points, from the oldest with at most one child" or
"if the oldest is a parent, descend to its oldest child".

**Why not**: `undo` / `redo` blur with vim's `u` / `C-r` and Emacs' undo. One table written in order by a GenServer takes the same shape as
the mirror (`D-mirror`). Tezcatl's directory is served by `:4001`. A cleanup on closing may not run (`D-start-outside`). Writing the file
directly is the "write over the original" `D-mirror` refused. The two pushing rules become unnecessary once j0 is a root that never goes
(the tree never splits) — the first counts branch points, the second can reach the current point in a straight tree and remove it.

**Files**: `lib/relay/juncture.exs` (`JunctureStore`, `JunctureHandler`), `lib/code/juncture.js` (pure), `lib/code/code-editor/juncture.js`,
`lib/skin/juncture-commands.js`, `lib/code/juncture-tree-page.js`, `panels/resident/juncture_tree.html`, `main.exs`,
`lib/code/code-editor.js`, `lib/code/code-editor/mirror.js` (`applyText`), `lib/skin/frame-code.js`, `lib/skin/frame-lines.js`,
`command/command_map.json`, `bus/messages.json`, `code.json`, `test/relay/juncture_test.exs`, `test/juncture.test.js`,
`test/juncture-commands.test.js`, `test/e2e/juncture.mjs`.
