# `lib/core/commands.js`

The dispatcher of tezcatl commands: register, invoke, deliver over the bus, fallbacks.

**Decisions homed here**: [D-command-target](#d-command-target), [D-composition](#d-composition), [D-ui-commands](#d-ui-commands)

**Takes part in**: [D-say-side-effects](lib-core-panel-frame.js.md#d-say-side-effects)

<a id="d-command-target"></a>

## D-command-target — behaviour lives in tezcatl commands and keys only name them; the target is the nearest, inside the same skin

**Decided**: before a key is bound, what it does is defined as a tezcatl command (`command_map.json`); a key only names it, so it can
be changed later. Who runs a command is fixed so that it never wanders:

- **A `code.*` called inside a `code_editor`** (its own keys): that `code_editor` itself (the nearest). A `code_editor` registers its own `code.*` on
  its page with the same table as `COMMANDS` in `lib/skin/skin-ex.js` (without `listenBus`, so other windows' palettes do not reach it)
- **A `code.*` from a skin's input line or palette**: that skin's "current `code_editor`" (through `code.file`)
- **A panel's command** (`lsp.back`, `lsp.forward` of `lsp_log`): called from inside a skin (a `code_editor` adds its skin's bus id as
  `args.skin`; also the skin page's own line and palette), only a panel of that skin takes it — the panel keeps only its own skin's
  record. From outside a skin: the panel focused last. When nobody takes it, the caller says "nothing takes it" (`ctx.onNone` of
  `commands.invoke`)

**Keys**: "key → command" of `code_editor` is `keys` in `code.json`, per keymap since 2026-11-08 (over `DEFAULT_KEYS` of
`lib/code/editor-keys.js`; `""` removes — [D-code-editor](panels-resident-code_editor.html.md#d-code-editor)). vim's defaults: `gd`, `gr`, `K`,
`]d` `[d`, `]]` `[[`, `Ctrl-o` `Ctrl-i`. Bound after `code.json` is read (vim's once: reload the `code_editor` after changing). Commands added with
it: `code.lsp-hover`, `code.diag-next`/`-prev`, `code.def-next`/`-prev`, `code.node-select` (a syntax node; again widens to the
parent), `code.node-parent`/`-next`/`-prev` (Lezer's tree; "no syntax tree" when none), `lsp.back`/`lsp.forward`.

**Files**: `command/command_map.json`, `code.json` (`keys`), `lib/core/commands.js` (`ctx.onNone`), `lib/skin/skin-ex.js` (`COMMANDS`),
`lib/code/code-editor.js` (`defineKeys`, `runCommand`), `panels/resident/code_editor.html`, `test/e2e/code_keys.mjs`.

<a id="d-composition"></a>

## D-composition — commands can be put in a row; values pass as references; no branches, loops or variables (planned)

**Decided** (not implemented — the direction only; the details after the ground is in):

- **In a row**: `A -- B`; a failure stops the row (as Xipe Totec's `--`)
- **`@`**: inside a line, the result of the command before; at the head of a line, the receiving side's last reference (`D-references`)
- **Names**: a row of commands can be named and kept in the user's JSON
- **No branches; no loops but lists; no variables** (Tezcatl and Xipe Totec are tools of a functional mind). With several selected, a
  reference becomes a list and the receiving command applies each or refuses
- A reference of the wrong type (panel, place, list row — named by the adapter) is refused by the receiving command, which says so
- The ground is two: passing values is `D-references`; "the command before ended" is `D-work-list`'s pairs (commands return no results
  today, and across windows only "taken" is known)
- **`matrix value [coordinate]`**: a cell's value as a reference (not named `eval`, which is Xipe Totec's). E.g. closing a panel listed in a
  table: `radar -- matrix value @ -- skin del @`
- **In the dialogue window** only a lone `@` is replaced; `--` is Xipe Totec's, so Tezcatl does not read it (`D-xipe-dialogue`)

The run_table (`D-run-table`) is the part of this that exists: lines in order, values by `{column}`, conditions only as a status match.

**Alternatives**: a composed tezcatl command per combination; a language with conditions, loops and variables.

**Why not**: the first multiplies commands by combinations; the second builds another language inside Tezcatl.

**Files** (planned): `lib/core/commands.js`, the frame's input line (`lib/skin/frame-page.js`), the dialogue window's input,
`lib/xipe/matrix-commands.js`.

<a id="d-ui-commands"></a>

## D-ui-commands — browser-local operations are looked up by name; never mixed with intents

**Decided**: UI-local operations (focus, open, close, layout) are `command/command_map.json` (a declared catalogue) and
`lib/core/commands.js` (the dispatcher). A skin adds implementations with `commands.register(name, fn)`; panels and other windows reach
them with `command` messages on the bus. **Nothing of this reaches emacs-vent** (that is `resolver.js` / `protocol.js`). The same
"names apart from keys" as `binding_map.json` + `resolver.js`, one layer down.

`panels/tool/list.html` is **a generic list container** (a filter field and keys): `?config=<name>` combines `list_kinds/<name>.json`
(the declaration) with an adapter in `lib/list/` (`fill`, `subscribe`, `remove`, `onSelect`). The connection list, the navigator and
the palette share its keys (`↑↓` choose, `Enter` run, `Del` delete); `relay-console/w_list.html` became a redirect.

**Alternatives**: a skin calling pane operations from its own key handlers (no dictionary of names); UI operations as intents in
`resolver.js` / `binding_map.json`.

**Why not**: an intent (`D-intent-resolution`) goes to Emacs and waits for a result (a correlation id, a `condition-case` wrapper,
parsing); a UI-local focus or close has neither. Mixed in one dictionary, code no longer shows whether a name goes to Emacs. As a
dictionary, the palette and shortcuts read the same names.

**What it removed**: squeezing UI operations into the intent dictionary; separate entries for the palette and shortcuts; a one-off
connection page.

**Who runs it, and when nobody does**: a command sent on the bus carries a ticket (`req`); the window that ran it answers
`command.taken {req}`. An implementation returning `false` means "not mine" and does not answer. `listenBus` runs **only commands it
has an implementation of** (before, a window without one called `invoke` and sent it again — with a skin lacking the implementation
open, a command could arrive twice). A `command_map.json` entry with `"fallback": {"open": "<page>?x={arg}"}` makes the caller wait
400 ms and open that page if nobody took it (right after a key, so `window.open` is allowed) — in a new tab, or a window with
`"mode": "window"`, through `lib/core/open-page.js` when the page has it ([D-open-page](lib-core-open-page.js.md#d-open-page)). `matrix.*` prefers a skin, else the
standalone `matrix.html` focused last (`lib/xipe/matrix-target.js`); `matrix.get`'s fallback is `panels/resident/matrix.html?path={path}`.

**Files**: `command/command_map.json`, `lib/core/commands.js`, `lib/list/list-kinds.js`, `list_kinds/*.json`, `panels/tool/list.html`,
`panels/skins/basic.html`.

## Notes from verification

**Spec** — names apart from keys, like `binding_map.json` + `resolver.js` one layer down, but effects are **always UI-local** and never reach
emacs-vent. `command_map.json` is the declared catalogue (`name`, `desc`, `args`, `fallback`, `line`, `quiet`). A skin adds implementations
with `register`; `invoke` runs a local implementation, else posts `command` on the bus for another window's skin; `listenBus()` runs the
commands it implements.

**Does not** — intents (round trips to Emacs); key bindings themselves; the implementations (it is the roster and the delivery).

**Pitfalls** — a registered name missing from the catalogue is listed with `desc:"(unlisted)"` (in the palette with no description). An
implementation that throws is logged (`console.error`) and returns `false`. With no implementation and no bus (Node), it warns and returns
`false`. Duplicate names in `command_map.json` are noted in `problems[]`, the last definition wins.

*Verified 2026-09-06 (before `command.taken`, `fallback` and `line` were added — see `D-ui-commands`).*

## Selection and revision notes

(Moved from the comments of `lib/core/commands.js`, 2026-09-10.)

Tezcatl commands -- the browser-local command dispatcher (browser global
+ CommonJS module). Same shape as binding_map.json + resolver.js, one
layer down: names decoupled from keys, invoked from a palette / a
shortcut / another panel, and the effect is always UI-local -- focus,
open, close, layout. Nothing here reaches emacs-vent (that is resolver.js
/ protocol.js). See docs/structure.md and command/README.md.

  command_map.json         -- the declarative catalogue (name, desc, args,
                              later keys). Read by the palette.
  commands.register(name, fn) -- a skin attaches an implementation.
  commands.invoke(name, args, ctx) -- run the local impl, or (if none) put
                              the request on the bus so a skin elsewhere
                              can handle it.
  commands.listenBus()     -- a skin calls this so `command` bus messages
                              from panels are invoked here.
name -> { name, desc, args }
name -> fn(args, ctx)
A registered command that is not in the catalogue is still callable;
list it so the palette shows it.
Run the local implementation if there is one. Otherwise broadcast a
`command` message so a skin that DID register it (elsewhere in the
page / another window) can run it. Returns the impl's return value, or
false when it was only broadcast / is unknown.
A skin calls this once: `command` bus messages (from list.html's
onSelect, from a panel) get invoked here.
For the palette (panels/tool/list.html?config=commands).
