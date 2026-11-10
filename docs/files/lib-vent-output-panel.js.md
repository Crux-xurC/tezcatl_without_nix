# `lib/vent/output-panel.js`

Emacs' output panel: the context and events as lines.

**Decisions homed here**: [D-next-keystroke](#d-next-keystroke)

**Takes part in**: [D-intent-resolution](lib-vent-resolver.js.md#d-intent-resolution)

<a id="d-next-keystroke"></a>

## D-next-keystroke — the context tells where the next key goes; it is not a state sync

**Decided**: the context carries three things only — `buffer-name`, `window`, `frame` — sent when one changes, outside the flush
contract (applied on arrival, not batched). The rule: **only the least needed to interpret the next keystroke**.

**Alternatives**: carry `point`, `region`, `read-only`, `major-mode`, evil state, buffer contents, the window layout — know Emacs'
state fully.

**Why not**: it collides head-on with `D-results-not-display`. And `major-mode` is not needed to interpret the next key — keymaps are
resolved in Emacs; Tezcatl knowing the mode has no use.

**What it removed**: freshness of a sync, the granularity of differences, the endless "which fields are enough".

**Earlier**: the requirement documents listed `major-mode`, `minor-modes`, `point`, `region`, and as candidates `current-command`,
`prefix-argument`, `read-only`, `overwrite-mode`. **Reduced to three fields.** To "a modal editor needs something like major-mode",
the answer is the rule above; Emacs' side does not change.

**In use**: whether text sent is eaten as a command or inserted is **judged by a person looking at `buffer-name`**. Automating it
would be the input middleware's job (`D-empty-middleware`).

**Files**: `emacs-vent-out.el` (emacs-vent), `lib/vent/output-panel.js`, `lib/vent/input-panel.js`.

## Notes from verification

**Spec** — `buffer.changed` is hidden (the file's header says why): a notification without content (`emacs-vent--after-change` sends only
`emacs-vent--send-event("buffer.changed")`), fired once per command-loop turn, so the boundary is already visible from the flushes. Folding
identical consecutive lines into `×N` only reduces noise on screen; it has nothing to do with the wire or the flush contract.

**Does not** — interpret frames (it shows `kind` / `type` as they are); talk to the resolver (`output.html` does not even load it).

**Pitfalls** — the key for "the same as the line before" is `cls + ' ' + html`, so two identical `context` messages fold too (the count stays
in `×N`). `renderTarget` is called only for `context`, so `.target` keeps "(no context yet)" until the first one.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/vent/output-panel.js`, 2026-09-10.)

Output panel: what emacs-vent-out sends (browser only).

Two regions:
  - target : the current vent-in injection target, from the last "context"
    message. Context is a standalone notification (emacs-vent-out context
    rework, 2026-08-28) -- applied on arrival, never buffered behind flush.
  - log    : every inbound message, appended with a timestamp, so past
    traffic stays visible (scrollback). This is an arrival log, not a
    rendered state view, so the A-7 flush contract has nothing to gate
    here; flush just shows up as its own line.

Display-only noise reduction (browser-side; does not touch the wire, the
A-7 flush contract, or emacs-vent-out -- purely how this page renders what
arrives). Two stages:
  1. `buffer.changed` events are not rendered at all. They carry no
     content (`emacs-vent--send-event("buffer.changed")`, no payload --
     notification-only), and one fires per command-loop turn that touched
     a buffer (overview.md §4.5: N characters typed = N turns), so a single
     M-: send can produce hundreds. Nothing is lost by hiding them: `flush`
     already marks every command boundary right next to where a
     buffer.changed would have been.
  2. Once that interleaving noise is gone, consecutive *otherwise-identical*
     lines (a run of `flush`, most often) collapse into one row with a
     "xN" counter instead of one row each -- see append() below.
Consecutive-duplicate guard (stage 2 above): rather than dropping
repeats silently (which would hide how many there were), collapse a
run of consecutive, otherwise-identical lines into one row with a "xN"
counter, refreshed in place. A different line (or the same line again
after something else interrupts the run) always starts a fresh row.
Non-repeating traffic renders exactly as before.
buffer.changed: content-free, one per command-loop turn that
touched a buffer -- see the file header. Not rendered.
