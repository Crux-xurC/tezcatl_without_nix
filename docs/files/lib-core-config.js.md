# `lib/core/config.js`

Finds and reads `config.json` (and sibling files) from the script's own location.

## Notes from verification

**Spec** — the absolute URL of `config.json` is computed from `document.currentScript.src` (`new URL('../config.json', SELF)`), so every page
resolves it the same way whatever its depth. `sibling(rel)` builds other root files' URLs the same way (`binding_map.json`, intents,
`input_target/` …). `panels()` (2026-10-23) reads the pages there are — `list_kinds/panels_and_skins.json`, then a person's own
`local/list_kinds/panels_and_skins.json` (not in git; missing is fine; an id already shipped is kept) — for the frame's `skin add` and
`open` (the launcher's lists read the shipped one only).

**Does not** — interpret `config.json` (callers check its shape).

**Pitfalls** — `document.currentScript` is valid only during the initial synchronous run, so `SELF` is captured once at the top level.
Without `SELF` (no document, injected dynamically — the Node tests) it falls back to `'./config.json'` / `'./' + rel` and leaves resolution to
`fetch`.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/core/config.js`, 2026-09-10.)

Resolve and load config.json from one place.

config.json lives at the repo root, next to lib/. Pages that read it sit at
different depths -- main.html at the root, panels/*.html one level down, any
future panels/**/*.html deeper -- so a page-relative "../config.json" only
works by accident of where a page happens to be. This module resolves the URL
against its OWN <script src> instead (lib/core/config.js is always exactly one
directory below the root), so every caller gets the right URL no matter how
deep the page is. All config.json access goes through here.
The URL of this very script -- captured at load time, because
document.currentScript is only valid during initial synchronous execution.
Absolute URL of config.json (one directory up from this script). Falls back
to a plain relative path when there is no document / no currentScript
(non-browser, or the script was injected some other way) and lets the
caller's fetch resolve it.
Fetch + parse config.json. Resolves to the parsed object; rejects on a
network error, a non-OK response, or invalid JSON. Callers decide what a
failure means -- ws.js falls back to a default URL, the panels show an
error and stop.
Absolute URL of a file given RELATIVE TO THE REPO ROOT (the directory
config.json sits in). Same resolution trick as url(): against this
script's own src, so it is right regardless of how deep the calling page
is. e.g. sibling('binding_map.json'), sibling('dialects/emacs/intent_map.json').
