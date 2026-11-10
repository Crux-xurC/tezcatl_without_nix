# `command/command_map.json`

The catalogue of tezcatl commands: name, description, arguments, fallback, and the input line a command stands for.

**Takes part in**: [D-command-target](lib-core-commands.js.md#d-command-target), [D-id-pool](lib-relay-id_pool.exs.md#d-id-pool), [D-juncture](lib-code-juncture.js.md#d-juncture), [D-markdown](lib-code-markdown.js.md#d-markdown), [D-minimum](lib-code-minimum.js.md#d-minimum), [D-mirror](lib-relay-mirror.exs.md#d-mirror), [D-references](lib-skin-recv-refs.js.md#d-references), [D-run-table](lib-task-run-table.js.md#d-run-table), [D-task-list](lib-task-task-list.js.md#d-task-list), [D-task-table](lib-task-task-table.js.md#d-task-table), [D-tree-skin](lib-skin-tree-commands.js.md#d-tree-skin), [D-ui-commands](lib-core-commands.js.md#d-ui-commands), [D-vim-via-input-line](lib-skin-skin-ex.js.md#d-vim-via-input-line), [D-work-list](lib-core-work-log.js.md#d-work-list), [D-work-place](lib-relay-fs_validate.exs.md#d-work-place)

## Selection and revision notes

(Moved from the comments of `command_map.json`, 2026-09-10.)

Tezcatl commands -- browser-local UI operations, the binding_map/intent_map pattern one layer down (never reach emacs-vent). A skin registers
the implementations (lib/core/commands.js register()); this file is the declarative catalogue the palette (panels/tool/list.html?config=commands)
and, later, shortcut bindings read. `keys` is intentionally empty in v0 -- shortcuts are deferred; every command is reachable from the palette.

Record: `keys` stays mostly empty (every command is reachable from the palette). Real bindings must not collide with `panel-frame.js`'
leave key — they came later as `code.json`'s vim `keys` and the lead-key shortcuts (`D-command-target`, `D-lead-key`).
