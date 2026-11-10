# `lib/core/open-page.js`

Opening a page of Tezcatl in a new tab or a new window: the one place that does it. The launcher (`main.html`, its startup windows, the
pages list `panels/tool/list.html?config=panels_and_skins`), the frame's line `open <page> [tab|window]`, and a command's `fallback`
(`lib/core/commands.js`) go through it.

**Decisions homed here**: [D-open-page](#d-open-page)

<a id="d-open-page"></a>

## D-open-page — a tab or a window is the features given to `window.open`; the settings are config.json `launcher`

**Decided** (2026-10-22, crux with the flow Poca windows → Tezcatl knows the way → `open` from the input line → `database.html`):

- **Tab or window**: `window.open(url, name, features)` with no features is a tab, with features a window. This is the Web's own rule, and
  Poca follows it (a `window.open` with features, or a shift-click, opens a new Poca window; one without, a tab of the page's window —
  Poca's `README.md`, "The window"). Tezcatl asks Poca nothing of its own, so the same code runs in a plain Chromium (`t --no-auth`).
  The size the features ask is a hint (Poca opens every window at 1200×800)
- **A key press first**: Chromium's pop-up blocker works in Poca too — `window.open` with no key press or click shortly before
  gets `null` and nothing opens. A line typed in the input form, a key in the launcher's list and a command's fallback (400 ms after the
  key, in the window where it was pressed) are within it; a page opened only because a bus message arrived is not. `window.open`
  returns the window in Poca as in a browser, so what is said (opened or refused) is true
- **Inherited**: a tab or window Poca opens from a Tezcatl page keeps who opened it, so its requests carry Poca's secret and the relay
  answers it ([D-poca-secret](lib-relay-secret_gate.exs.md#d-poca-secret)); one opened from a Poca started separately gets nothing.
  Nothing of the opener is passed to the page but its window name (`?name=`, for pages whose launcher entry has `"name": true`); the
  pages talk over the bus as before
- **Settings**: `config.json` `launcher` — `open-mode` (`tab` | `window`: what is opened when nothing says which), `window-features`
  (never empty: a window is told apart by them), `window-name` (`{n}` a new number each time). The `open` block of
  `list_kinds/panels_and_skins.json` (the same three, written twice) is gone
- **Which page**: an id or alias of `list_kinds/panels_and_skins.json` (panels and skins); a command's fallback gives its own page
- **The line**: `open <page> [tab|window]` in the frame's input line (the words in any order). It opens from the frame's window, within
  the key press (the settings and the list are read when the frame starts). The receiving side says `opened <page> in a new tab|window`,
  or `! the pop-up was refused (…) -- allow pop-ups for this origin`; an unknown page is said too
- **Fallback**: `command_map.json` `"fallback": {"open": "<page>?x={arg}", "mode": "tab" | "window"}` — no `mode`: `open-mode`. What was
  opened (or refused) is said beside the command (`D-say-side-effects`); before, it said "a new window" for what was a tab

**Why**: a command or a line opening a page outside the skin had only `window.open` from wherever it ran, always a tab, and Poca had one
window. With Poca's windows keeping the secret, a window is as usable as a tab; keeping the choice in the standard features leaves Poca
knowing nothing of Tezcatl and Tezcatl knowing nothing of Poca.

**Alternatives**: a Poca API for windows (Poca would know what it shows, and plain Chromium would need another path); a tezcatl command
`page.open` with a `line` (a `line`'s arguments are all required words, and the mode is optional); `opener` for the opened page (the bus
is already the way pages talk).

**What was not done**: `launcher.html` (the minimal start page that opens no WebSocket) keeps its own table of targets and its own
`window.open`.

**Files**: `lib/core/open-page.js`, `test/open-page.test.js`; its users `main.html`, `lib/list/kinds/panels_and_skins.js`,
`lib/core/commands.js`, `lib/skin/frame-lines.js` (and `lib/skin/frame-page.js`, `panels/skins/frame.html`, `panels/tool/list.html`).
