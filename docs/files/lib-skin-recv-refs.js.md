# `lib/skin/recv-refs.js`

What a line of a skin's receiving side points at.

**Decisions homed here**: [D-references](#d-references)

**Takes part in**: [D-say-side-effects](lib-core-panel-frame.js.md#d-say-side-effects)

<a id="d-references"></a>

## D-references — lines on the receiving side can carry a reference to "where / which"; `go on` goes to the last one

**Decided**:

- A line said on the receiving side may carry a reference apart from its text: a panel, a place in a file, a numbered list, a
  coordinate of a table, a panel of another window. Shown as `@2 1`, `@path:line`, `@<name>`. **The text is never read back**
  (`lib/skin/recv-refs.js`: `{kind:"panel", id}`, `{kind:"at", path, line, col}`, `{kind:"list", name, items}`, `{kind:"coord", …}`,
  `{kind:"bus", id, name}`)
- **`go on`** goes to the last line with a panel, place or coordinate reference: a panel is focused (followed by id, so after a swap it
  goes to where the panel is now; a closed one is said), a place is `code.open-at` (the `code_editor` that has it, else one added), another
  window's panel gets `code.reveal` / focus. `go on`'s answer has no reference (typing it again goes to the same place). Also the tezcatl
  command `go.on`
- **Numbered lists**: `lsp list` keeps a list reference; `lsp stop <number>` takes from it (`recv-refs.js` `item`). The numbers point to
  the same things until the list is shown again; one stopped meanwhile is said — a number never stops another server
- **Where a panel "is now" is kept by the resident `cursor` panel** (`panels/invisible/cursor.html`; every frame and skin has one). A
  table posts its selection's coordinate and type when it changes (`{coord: {type, table, ids, cols, scope}}` — the type named by its
  adapter, `calc_row`; never values). Each window has a `cursor`, so the asker gathers answers and takes the newest
  (`lib/skin/radar.js`)
- **`radar`** (the frame's input line, the command line of a `matrix_set` synthesis) turns the coordinate of the panel focused last into a line with
  a reference and makes it "the last reference" (`cursor.ref`): a moving state becomes a reference only when a person types `radar`
- **`@` alone in a line** is replaced by the last reference before it runs (`@attr`, `a@b` untouched): a panel's place now, `path:line`,
  or the row ids separated by blanks (Xipe Totec's `eval` reads them; Tezcatl does not know what ids mean). The frame's input line uses
  its own receiving side's last reference; the dialogue window, which has none, the last `radar` of any window. With no reference, the
  line is not run or sent, and that is said
- **`matrix <operation> [coordinate]`** (planned) would move a table from a coordinate (`radar` reads, `matrix …` writes). Table operations
  are not turned into tezcatl commands one by one (`matrix eval` …) — that would write Xipe Totec's words into Tezcatl; usual operations
  happen on the table, and using a coordinate elsewhere takes two steps
- `lsp list`, `lsp stop <name or number>`, `lsp timeout <ms> [limit]`, `lsp restart` came with it (`lib/skin/lsp-commands.js`): `timeout`
  sends `code.configure {lsp}` to each `code_editor` of the frame (and later ones on `code.ready`), kept until the window closes; `restart`
  needs "the current `code_editor`'s server" — the relay puts `key` in `attached`, `code.here` answers `lsp: {key, serverId}`; only the current
  `code_editor` is `:Reconnect`ed (others on the same server are counted and left to a person — `:Reconnect` takes a copy and reopens, so it
  must not touch unsaved text nobody is looking at)

**Alternatives**: reading `@…` out of the last line's text; a translation layer from table keys to commands; a resident only while a
table exists (`matrix_radar.html`); another symbol that always inserts the table's selection.

**Why not**: text breaks whenever wording changes; a reference also points at `:grep` results and list numbers through one mouth. The
`cursor` panel already does the resident's job — no starting and stopping a resident, no choice between symbols.

**What it removed**: whether a command built from a table key runs at once or after a check — it goes through the input line, and a person
looks and sends.

**Files**: `lib/skin/recv-refs.js`, `lib/skin/radar.js`, `lib/skin/frame-page.js` (`recv`, `goOn`), `lib/skin/frame-layout.js`,
`lib/skin/frame-code.js`, `lib/skin/skin-ex.js`, `lib/code/code-locate.js`, `lib/skin/lsp-commands.js`, `lib/relay/lsp_socket.exs`
(`key`), `lib/xipe/matrix-grid.js` (`coord`, `onDrawn`), `lib/xipe/matrix-page.js`, `lib/xipe/xipe-rows.js`,
`panels/invisible/cursor.html`, `lib/xipe/matrix-bar-page.js`, `panels/skins/xipe.html`, `command/command_map.json` (`go.on`),
`test/recv-refs.test.js`, `test/radar.test.js`, `test/lsp-commands.test.js`, `test/e2e/frame_go_on.mjs`, `test/e2e/radar.mjs`,
`test/e2e/frame_lsp_commands.mjs`.
