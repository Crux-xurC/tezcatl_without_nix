# `lib/code/editor-keys.js`

The file editor's keys per keymap, the pure part (D-code-editor): the defaults, merging `code.json`'s `keys`, Emacs' notation into
CodeMirror's, and whether the input line's `:` lines are taken.

**Takes part in**: [D-code-editor](panels-resident-code_editor.html.md#d-code-editor), [D-command-target](lib-core-commands.js.md#d-command-target)

## What it does

- `DEFAULT_KEYS` — per keymap (`vim`, `emacs`, `default`), each key naming a tezcatl command. vim's are the ones `code-editor.js` had
  (`gd`, `K`, `]d` …); emacs' follow Emacs' own (xref `M-.` `M-?` `M-,` `C-M-,`, `M-g n` / `M-g p`, `C-M-a` / `C-M-e`, `C-h .`) and
  `M-x` → `code.to-input` (the skin's input line, where tezcatl's commands are typed — vim's `:#`)
- `mergeKeys(doc)` — `code.json`'s `keys` over the defaults, per keymap; the older flat form (every value a command) is vim's; `""` unmaps
  (`keysOf` leaves it out)
- `toCm(key)` / `bindings(table)` — a non-vim key as Emacs writes it (`C-` `M-` `S-` `s-`, `RET` `TAB` `SPC` `ESC`, a space between
  strokes) or as CodeMirror does → CodeMirror's notation; the keys that cannot be read are returned apart (the editor says them)
- `inputLineEx(setting, keymap)` — `code.json`'s `inputLineEx` when it is `true` / `false`, else only vim

## Why it is written this way

- Pure and apart from `code-editor.js` (an ES module, read by `node --test` with `import()`), so the tables and the notation are tested
  without a browser
- A key names a command and nothing else (`D-command-target`): which command a key runs never depends on the keymap; only the keys do
- vim's keys stay in vim's notation and are mapped with vim's own maps (they are the page's: changing them needs the page read again);
  the others become a CodeMirror keymap above the keymap's own, so a tezcatl key wins over codemirror-emacs' (`M-x`)
