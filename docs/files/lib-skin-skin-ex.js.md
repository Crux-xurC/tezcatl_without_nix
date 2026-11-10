# `lib/skin/skin-ex.js`

A skin's code_editor and its input form, wired for Vim's ways: code_editor edits its text; what Vim would do on the command line goes through the skin's input form.

**Decisions homed here**: [D-vim-via-input-line](#d-vim-via-input-line)

**Takes part in**: [D-command-target](lib-core-commands.js.md#d-command-target), [D-frame](lib-skin-frame-layout.js.md#d-frame), [D-id-pool](lib-relay-id_pool.exs.md#d-id-pool), [D-mirror](lib-relay-mirror.exs.md#d-mirror), [D-references](lib-skin-recv-refs.js.md#d-references), [D-work-list](lib-core-work-log.js.md#d-work-list), [D-work-place](lib-relay-fs_validate.exs.md#d-work-place)

<a id="d-vim-via-input-line"></a>

## D-vim-via-input-line — code_editor works inside the text; Vim's command-line work goes through the skin's input line

**Decided**: everyday editing is `code_editor`. It leans to Vim's ways but Vim's windows, buffers and search are not rebuilt inside
CodeMirror.

- `code_editor` (codemirror-vim, its default keymap — [D-code-editor](panels-resident-code_editor.html.md#d-code-editor)) does **editing inside one text** (motions, operators, `:s`, `:g`, registers …) and `:w`, `:e`, `:Delete`,
  `:Rename`, `:Move` on the current file
- What lies outside (buffers, windows, search — what Vim types on its command line) is typed in **the skin's input line** and translated
  by the skin into operations on parts (as the tree skin and the matrix_set synthesis do)
- **`:#`** in `code_editor` (the character is `inputFormEx` in `code.json`, default `#`, one of `! # & < = > @ ~`) moves to the input line
  next to it; `:# <text>` puts the text in. Sending there comes back. Where there is none (a `code_editor` alone): "no input line beside"
- A line of the input line starting with `:` is an ex command for that skin's `code_editor` (`code.file {op, arg, bang}`); one not starting
  with `:` is the skin's own
- One implementation: typed in `code_editor`, sent from the input line, or as a tezcatl command (`code.write`, `code.edit`, `code.delete`,
  `code.rename`, `code.move`) — all reach the same function of `code-editor.js`. The wiring common to skins is `lib/skin/skin-ex.js`

**Alternatives**: Vim's buffers and windows (`:ls`, `:b`, `:sp`), `:grep`, quickfix inside `code_editor`; the input line defining Vim's
whole grammar with every `:` line of `code_editor` sent there; `:*`.

**Why not**: codemirror-vim has no windows, buffers or quickfix, and building them never ends; arranging, switching and listing are
already Tezcatl's parts (panes, lists, several `code_editor`s — `D-skin-as-container`). Sending every `:` needs separating codemirror-vim's
editing commands — one command to move makes the border clear. `*` is read first as a line range by codemirror-vim and cannot be a name.

**What it removed**: the endless "how Vim-like must code_editor be". Several files and search come as input-line commands.

**Files**: `lib/code/code-editor.js` (`inputFormEx`, `code.file`, `cmd.focus`), `lib/code/code-files.js` (`parseEx`),
`lib/skin/skin-ex.js`, `panels/skins/tree.html`, `command/command_map.json` (`code.*`), `code.json`, `test/e2e/code_cmdline.mjs`.
