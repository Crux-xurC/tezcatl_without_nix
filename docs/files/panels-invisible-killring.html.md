# `panels/invisible/killring.html`

The page of killring (invisible).

## Selection and revision notes

(Moved from the comments of `panels/invisible/killring.html`, 2026-09-10.)

Invisible: renders nothing. ?debug dumps the ring.

killring.html -- the kill-ring aggregator (the shared yank register, cursor.html's sibling). Invisible, one per skin (or in the daemon).

It is PURE STORAGE. It holds the ring, persists it to `~work/store/killring.json` (`D-store`), and answers the bus. It does NOT deliver text anywhere and does NOT touch
the clipboard -- the killring list panel (panels/tool/list.html?config=killring) owns delivery (vim `p` into an editor, or clipboard for a
terminal) and the skin owns focus/close. See the `killring` list kind.

Bus API (panel-bus, UI-local -- never emacs-vent):
  in:  killring.add    { text, source? }   prepend (dedup: identical text moves to front); cap RING_MAX
  in:  killring.remove  { id }             drop one entry
  in:  killring.query                      -> broadcast killring.list
  out: killring.list   { items:[{id,text,source,ts}] }   newest first

Record: the kill-ring picker's pure store, read by the `killring` list kind over the bus. Fed from everywhere (`copy` in editors and
terminals — read-only viewers and terminal selections too; the opt-in clipboard mirror); delivery is `killring.yank` for code and `insert`
for others, with `navigator.clipboard.writeText` each time. De-duplication makes many panels reading the same clipboard harmless.
