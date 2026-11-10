# `lib/skin/suggest.js`

What the suggestion shell computes (D-suggestions): the next word of the input line from a source's table, and where the cursor goes in the grid of candidates.

**Decisions homed here**: [D-suggestions](#d-suggestions)

<a id="d-suggestions"></a>

## D-suggestions — the next word of the input line is chosen from a panel of candidates per source; one shell, sources as tables

**Decided**: lines of the input line can be built without remembering them. A person chooses; a chosen word is only added to the input
line, never run (it goes through the input line, where a person looks and sends).

- **Candidates are a panel named per source** (`suggestion_list_<source>`): one shell (`panels/extra/suggestion_list.html?config=<source>`)
  listed once per source in the launcher (as `bookmarks` and `agenda` are `list.html` under names). **One panel shows one source, never
  mixed** — where candidates come from is visible by name (files as candidates are fine, but not behind one's back)
- **The shell takes three things**: a grid shape (rows × columns), the selecting keys (`1234567890` by default; `?keys=`, else
  `ui.keys.suggestSelect`), the source. A page shows as many as cells; numbers go to the first cells up to the number of keys (in 4×3,
  cells 11 and 12 have none and are reached by the cursor)
- **The shape is the place's**: a source may have its own, but in the dock it takes the dock's (5×2); placed with `skin add` in a
  frame's area it keeps its own
- **A candidate is the next word after the input line's contents**. A source is a list of lines (`skin add line` …), split at blanks;
  with an empty line, first words (`skin`, `block`, `tree` …). **Order as written in the source** (never alphabetical: frequent ones first).
  A half-typed word (`ski`) narrows by prefix and is replaced when chosen; a blank follows a chosen word. An argument's place (`<panel>`,
  `<ratio>`) shows its hint, not a word
- **The cursor is the way; digits, `-`, `^` are shortcuts** (no exceptions). With a running index `i`, rows `R`, cells per page `N`:

  | Key | Move |
  |---|---|
  | `j` `↓` / `k` `↑` | `i + 1` / `i − 1` (5's next is 6, across columns) |
  | `l` `→` / `h` `←` | `i + R` / `i − R` (the same row of the next column; past the edge, the next page) |
  | `^` / `-` | `i + N` / `i − N` (the same cell of the next / previous page) |
  | a digit | go to that cell of the page and choose it |
  | `Enter` | choose the current cell |

  The page shown is `i ÷ N`, the cell the remainder; filled top to bottom, then the next column. "Go next door, else take the next" comes
  from the arithmetic, not cases. **It stops at both ends** (no wrapping). An empty target cell goes to the last candidate of that column
  (of that page for `^`) if any, else does not move. The `←-` and `→^` marks light only when there is a page to turn to
- **After choosing it stays**: the word is added, the candidates become the next word's, the cursor returns to the first (choosing again and
  again builds a line); a changed filter also returns to page 1
- **Sources** are `suggestion/index.json` (order, letter, label, scripts, the word and description columns): `line` (`l`), `intent` (`i`),
  `dict` (`d`; its words may come anywhere in the line: `anywhere` — narrowed only by the half-typed word). The line table is
  **`suggestion/line.json`** (`line` — the words, `<…>` `[…]` arguments, `a|b` alternatives; `desc`; `in` — which input lines take it:
  `frame`, `tree`, `matrix`, `code_editor`). In the dock, with tezcatl as destination, `?in=frame,code_editor`
- **A source's shape is matrix's `{columns, rows}`** (`D-matrix-shell`); the shell reads the word and description columns it is told;
  new information comes as columns. Converting is each source's adapter (`lib/suggest/<id>.js`); the table is read once on opening, the
  index for "the next word" built then (never saved)
- **Only what has no other origin, and what a person took, is saved**: the input lines' table is written and is the truth (shipped in
  `suggestion/`; `test/suggestion.test.js` checks it against `command/README.md`); intents (`binding_map.json`) and the dictionary
  (`dict.json`) are only converted on reading (never stored twice); later sources (files the tree shows, language-server symbols, Xipe
  Totec's cards) are saved when a person takes them, by a person's command (never rewritten along the way)
- **The shell does not know the input line**: it takes "the text to narrow by" and says "the word chosen" and "leave". Which input it is
  bound to is the skin's (as `skin-dict.js`). It does not `panelFrame.init`. It does not resolve `Shift+arrow` itself either: it says
  `suggest.leave {key}` and the skin, which knows the dock, decides. Alone in a window it keeps its own line (choosing adds,
  `Backspace` takes a word back)
- **In the dock**: moving is from the dock grid's adjacency (`dockLayout.neighbor`): `Shift+arrow` goes to the neighbour part that takes
  keys (the input line, `@gsel`, `@sugg`, `input_target`), skipping parts that do not (a clock) — the same below, left and right, and
  following any layout in `local/docks/`. In `standard`: input → candidates `Shift+↓`, back `Shift+↑`, candidates ⇄ source `Shift+←` /
  `Shift+→`. From the input line, `↓` `→` work at the end of the line, `↑` `←` at its start (a selection inside is never taken).
  **The source is `@gsel`**, one line of the frame's DOM: the chosen source with `▼` and the others with their letters; `↑↓` cycles
  (the shell reloads with another `?config=`), a letter chooses and goes back, `Enter` goes to the candidates; `;g` (`dock.suggest`)
  comes here. **The candidates are `@sugg`**: the frame's shell iframe (`?in=frame,code_editor&rows=5&cols=2`), sent `suggest.filter` at
  every change; `suggest.pick` goes into the input line, the keyboard stays. The source does not follow the input's destination; when
  the destination is not tezcatl, `line` candidates are dimmed with a note

**Alternatives**: a new tree JSON with children; reading the tables of `command/README.md` at run time; `list.html` as it is; left and
right moving columns and pushing in the next five at the edge; one panel mixing all sources; registration per skin; saving every source
once; showing the source list where the candidates are.

**Why not**: the hierarchy comes from splitting lines at blanks — a flat list is enough. The README is Markdown for people; tidying it
would break candidates. `list.html` keeps focus in its own filter, where one-letter keys go, colliding with digits and `hjkl` — and the
filter is the input line's text, so no field is needed. Pushing at the edge changes a key's meaning by whether one is at the edge. Mixed
sources hide where a candidate came from. Saving what has an origin keeps candidates stale after the origin changes. A list where the
candidates are would appear to the right after moving left.

**What it removed**: the frame's input lines had no machine-readable list (`USAGE` had only sub-command names); "a candidate UI for the
intent palette" (one of the sources); a command to swap the dock's candidates.

**Left**: the name and place of the command that saves a table a person took (the first three sources need none).

**Files**: `panels/extra/suggestion_list.html`, `lib/skin/suggestion-list-page.js`, `lib/skin/suggest.js` (pure: shape, index, next
word), `lib/suggest/line.js`, `lib/suggest/intent.js`, `lib/suggest/dict.js`, `suggestion/index.json`, `suggestion/line.json`,
`lib/skin/dock-layout.js` (`neighbor`), `lib/skin/frame-dock.js`, `list_kinds/panels_and_skins.json`, `config.json`,
`test/suggest.test.js`, `test/suggestion.test.js`, `test/e2e/suggestion_list.mjs`, `test/e2e/frame_suggest.mjs`.
