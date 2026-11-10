# `panels/resident/code_editor.html`

The page of code_editor (the file editor; `code_vi` until 2026-11-08).

**Decisions homed here**: [D-code-editor](#d-code-editor)

**Takes part in**: [D-command-target](lib-core-commands.js.md#d-command-target)

<a id="d-code-editor"></a>

## D-code-editor — the file editor is a role, `code_editor`; its keymap is code.json's `editorKeymap`

**Decided** (2026-11-08): the panel that edits files is named for its role, `code_editor`, not for one keymap (`code_vi`).

- The page names no keymap. A file editor (`editable` with `files: true`) takes `code.json`'s **`editorKeymap`** (`"vim"` by default;
  `"emacs"`, `"default"`); every other CodeMirror pane (viewers, `code_cmd_in`, `code_xipe_in`) keeps taking `keymap`. `?keymap=` pins
  one, `code.configure {keymap}` changes it at run time. Each keymap's quirks stay in `keymapAdapter` (`lib/code/code-editor.js`)
- Where the frame asks "is this the file editor" (opening a file, `:` lines, `check`, `:Diff`, the last one used) it asks one place:
  `EDITORS` / `isEditor` in `lib/skin/frame-layout.js`. Another editor panel is one entry there
- The old name still works where a person or a saved file wrote it: `code_vi` and `codevi` are aliases (`list_kinds/panels_and_skins.json`,
  the launcher), `:m code_vi <file>` (`lib/code/minimum.js`), and a saved skin's `code_vi` reads back as `code_editor` (`RENAMED` in
  `frame-layout.js` `fromJson`)
- **Each keymap has its keys** (`keys` in `code.json` per keymap, over `DEFAULT_KEYS` of
  [`lib/code/editor-keys.js`](lib-code-editor-keys.js.md)); a key still only names a tezcatl command. The adapter maps them: vim with its
  own maps, any other as a CodeMirror keymap above the keymap's own (so emacs' `M-x` is tezcatl's `code.to-input`). The adapter also
  says the mode (`code.mode`, `code.here`: vim's, null for the others)
- **`code.to-input`** is vim's `:#` as a command (to the skin's input line), so a keymap without ex commands reaches the input line
- **The input line's `:` lines are the editor's to allow** (`inputLineEx` in `code.json`; when it does not say, only vim takes them). A file
  editor tells it on `code.ready {inputLineEx}` and `code.input-line-ex {on}` when it changes; `lib/skin/skin-ex.js` then refuses the
  line without sending it (the frame's `:Diff` too). Only the spelling is off: the `code.*` commands, keys and the palette still work
- What stays vim's: the ex commands typed inside the editor (`Vim.defineEx`: `:w`, `:#` …). The input line's `:` lines and the `code.*`
  commands do not go through vim ([D-vim-via-input-line](lib-skin-skin-ex.js.md#d-vim-via-input-line))

**Alternatives**: a new panel per keymap (`code_emacs` …), each checked by name wherever the editor is looked for; `code.json`'s one
`keymap` for every pane.

**Why not**: the name was checked in about ten places, so every new editor panel meant finding and changing them all. One `keymap` for every
pane would make the read-only viewers and the one-line inputs modal as soon as the file editor is vim.

**Alternatives (the input line's `:` lines)**: an on / off per tezcatl command; the skin asking the editor's keymap before each line.
**Why not**: turning `code.write` off would also stop emacs' own way to save; asking each time is a round trip and makes the skin know the
keymaps. What a person met unasked was the `:` spelling, so the spelling is what an editor turns off.

**Not yet**: the kill-ring bridge for emacs (`@replit/codemirror-emacs` keeps its kill ring inside; `copy` still feeds Tezcatl's ring), and
a Kakoune-like keymap — [issues.md](../issues.md).

## Notes from verification

**Note** — the older notes below are as of 2026-09-10. Since then **`code_editor` saves itself with `PUT /fs/write`** (`code.save-request` is
gone, `D-files-in-elixir`); it has a path and opens, creates, deletes and moves files with vim's ex commands; copies, `:Reconnect`, the LSP
commands and "go to this place in this file" came after. The record of `lib/code/code-editor.js` is the current one.

## Selection and revision notes

(Moved from the comments of `panels/resident/code_editor.html` on 2026-09-10; saving and paths changed since — see the record of
`lib/code/code-editor.js`.)

code_editor.html — the buffer EDITOR panel. This comment is the design's source of truth.

  - The viewer's shared core plus **editing**: it calls `createCodeEditor` with `editable:true` and wires the keymap, saving and the
    kill-ring bridge on top
  - The smallest stand-in for an Emacs buffer. Editing goes through ③, not vent (D-files-in-elixir); this page never touches vent
  - The tree's and skins' `code.open` open this `code_editor`; read-only previews (diffs, peeks) are code.html

Never (as code.html): load lib/core/ws.js or touch vent; build an LCARS look. (Then it also "held no path and only sent
`code.save-request` on Mod-s"; now the editor holds its path and saves itself.)

What it adds to code.html:
  - `vim({ status: true })` (in `extraExtensions`, before the base keymaps)
  - the kill-ring bridge: out — `killring.add { text, source }`, polling vim's unnamed register (`y` `d` `x` `c`) on `onUpdate` and on blur
    (as Emacs' kill ring takes deletions too; flushed on blur so "yank then Esc-y" lands before the picker asks); in — `killring.yank { text
    }`: `setText` into the `"` register (linewise when it ends in `\n`, as `yy` stores it), then a real vim `p` (not echoed back into the ring)
  - the dirty dot and a read-only badge (`code.set` / `code.configure`'s `readOnly`)

Decided:
  1. a single Esc → CM/vim normal (panel-frame lets singles through); a double Esc → panel-frame `yield` (leaving the pane). vim's keymap and
     panel-frame's leave key are deliberately not unified (per surface)
  2. CodeMirror 6 bundled once with esbuild (see code.html)
  3. opened alone = an empty scratch buffer with vim; `?name=` the bus identity, `?lang=` a language hint for tests
