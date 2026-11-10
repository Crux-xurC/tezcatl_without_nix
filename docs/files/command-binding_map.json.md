# `command/binding_map.json`

The intent ids the input panel can call (and their keys), editor-neutral.

**Takes part in**: [D-intent-resolution](lib-vent-resolver.js.md#d-intent-resolution)

## Notes from verification

**Spec** — `command/binding_map.json` is a thin editor-neutral array of ids (and `keys` if any); what each intent is lives per dialect
(`command/dialects/emacs/`, Emacs' `form` / `sequence`) — two files, as designed. Most entries have no `keys`, so they are reached only by
typing the id (or, now, through the candidates and `intent <id>`). A third source, `command/intents/browser.json`, is dialect-free
(`emacs.kind:"none"`, complete with `browser.backend`); `resolver.js` fetches and merges both. `agenda.open` keeps `"keys": "C-c a"`
(org-mode's own default binding).

**Does not** — run intents (`resolver.js` does).

**Pitfalls** — `magit.stage-file` / `magit.unstage-file` record in their `notes` a fixed bug (they used to call `magit-stage-file`, which does
not exist; the plural function takes a list). `magit.commit` does not use `magit-commit` (`with-editor` needs `emacsclient` on PATH) but
`magit-run-git "commit" "-m" message`. `emacs.hooks-status` / `emacs.vent-context-state` are diagnostic intents depending on emacs-vent's
private variables (`emacs-vent--last-target` …) — probes, unlike ordinary intents.

*Verified 2026-09-06; `intents/browser.json` (2026-09-13) not re-verified.*
