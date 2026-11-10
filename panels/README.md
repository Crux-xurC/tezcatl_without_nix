# panels — the pages of panels and skins

Where a panel is placed tells how it is used. A panel is listed in `list_kinds/panels_and_skins.json` (the launcher and the frame's
`skin add`) by its `page`; what the page does lives in `lib/`, in the directory of its role.

| Directory | What goes there | Now |
|---|---|---|
| `resident/` | panels kept open while working | `code_editor` `code` `tree` `xterm` `input` `output` `file_changes` `lsp_log` `code_outline` `matrix` `markdown` `task_table` `run_table` `run_match` `juncture_tree` `code_diff` `decode_emacs` `code_vi_minimum` `dialogue-*` `code_cmd_in` `code_el_intent` `code_xipe_*` |
| `tool/` | panels opened when needed and closed after | `list` (`commands`, `nav`, `killring`, `w_list`, `lsp`, `problems`, `bookmarks`, `agenda` … — one page for all of them), `xterm_cutoff` |
| `invisible/` | invisible hosts (held by a skin or the daemon) | `daemon` `cursor` `killring` `work` `output_log` |
| `extra/` | **new panels go here first** ([extra/README.md](extra/README.md)) | `thema`, `color`, `virtual_keyboard`, `input_target`, `output_target`, `input_leadkey`, `panel_abstract`, `suggestion_list`, `How_to_use`, `clock` |
| `skins/` | containers that arrange panels | `frame` (the skin to use); the others are prototypes |

Panels only for you (looks of your own, nothing to ship) go under `local/` (not in git), listed in `local/list_kinds/panels_and_skins.json`
(the same shape, read after the shipped list; an id already shipped is kept). Where saved skins are looked for:
[skins/README.md](../skins/README.md).

Pages are two levels down, so `lib/` is read as `../../lib/<role>/<name>`. Other pages are named with
`Tezcatl.config.sibling('panels/<dir>/<name>.html')` (a path from the repository root).
