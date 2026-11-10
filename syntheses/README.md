# syntheses — panels that go together, as one panel

A synthesis ([D-synthesis](../docs/files/lib-skin-synthesis.js.md#d-synthesis)) is a set of panels written under a name. In the frame
it is one panel: `skin add <name>` places it (its own name `<name>_<n>`), `skin focus` lands on its **main**, `syn <word>` moves to
its other panels. One synthesis is one file `syntheses/<name>.json`, written by hand; no command edits it.

## Where `skin add` looks

A name that is a panel's (or an alias in `list_kinds/panels_and_skins.json`) is always that panel. Otherwise, in this order:

| Order | Place | git |
|---|---|---|
| 1 | `local/syntheses/<name>.json` | not in git (yours) |
| 2 | `syntheses/<name>.json` (here) | in git |

A synthesis here never has the name of a panel, a skin or an alias — `test/synthesis.test.js` watches.

## The file

```json
{
  "name": "matrix_set",
  "axis": "h",
  "ratio": [1],
  "columns": [[
    ["matrix_bar", 1, 1, false, { "px": 24 }],
    ["matrix_table", 2, 6, false, { "query": { "kind": "xipe_rows", "ref": "all", "root": "." } }],
    ["code_cmd_in", 3, 1]
  ]],
  "main": "matrix_bar",
  "move": { "table": "matrix_table", "line": "code_cmd_in", "bar": "matrix_bar" }
}
```

- `name`: the file's name
- `axis`, `ratio`, `columns`: as `skin save` writes a skin (lines, and the panels in each: `[panel, order, ratio]`); only panels of
  the launcher's list, never a synthesis. A panel's 5th item may give `query` (strings, added to its page's query) and `px` (a fixed
  length along its line, 4 to 400 — a one-line bar)
- `main`: the panel you land on, whose status the band shows, and which takes what the others put out (a command line's `cmd.input`).
  Named once in the synthesis
- `move`: words for `syn <word>` → a panel named once in it (`main` is always there)

The main finds its synthesis' panels through the skin port (`Tezcatl.skinPort.synthesis(window)`: its own name, the members' bus
names and ids) and keeps a few values over a reload with `synthesis.keep` (they come back as its page's query).

## Here

| File | What |
|---|---|
| `database.json` | a database window (D-db-session): `db_bar` (main: number, account, state, password field, the `/sql` socket), the table (kind `given`), a command line in SQL |
| `matrix_set.json` | `matrix_bar` (main), the table, a command line — it replaced the matrix skin |
