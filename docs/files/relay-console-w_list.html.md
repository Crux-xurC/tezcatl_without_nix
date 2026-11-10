# `relay-console/w_list.html`

The page of window list (moved).

## Notes from verification

**Spec** — the connection list moved to `panels/tool/list.html?config=w_list`; this page stays for old bookmarks: a `<title>` and one
`meta refresh` line, nothing else.

**Pitfalls** — the relative URL is `../panels/tool/list.html?config=w_list` from `relay-console/`, so it works only when opened from `:4001`
(the page server), as before.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `relay-console/w_list.html`, 2026-09-10.)

w_list is now a config of the generic list primitive: it is
     panels/tool/list.html?config=w_list (list_kinds/w_list.json + the w_list
     adapter in lib/list/list-kinds.js). This file stays as a redirect so old
     bookmarks / main.html's `w_list` target keep working.
