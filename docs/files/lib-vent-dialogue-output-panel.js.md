# `lib/vent/dialogue-output-panel.js`

The dialogue output panel: Proof General's goals and response, and a flat log.

**Decisions homed here**: [D-dialogue-bridge](#d-dialogue-bridge)

<a id="d-dialogue-bridge"></a>

## D-dialogue-bridge — an interactive co-process is split into driving and watching, on the existing kinds

**Decided**: a co-process that keeps printing (Proof General) is bridged as "dialogue input/output", paired with command input/output.
**Driving** (`C-c C-n` …) uses the existing `kind:"input"`; no new input semantics. **Watching** adds one hook of the same shape as
`compilation.*` (for Proof General, `emacs-vent--proof-general-delayed-output` on `proof-shell-handle-delayed-output-hook`), sending
`event.type:"proof-general.output"` with `content:{goals, response}` (Proof General's own formatted text) with the existing
`event`/`flush`. **No new `kind`**: the relay and `protocol.js` are unchanged. The Elisp is not in emacs-vent's main files but in
optional `emacs-vent-out-dialogue.el` / `emacs-vent-in-dialogue.el`.

**Alternatives**: carry Proof General's cursor (the end of what was processed) as an integer and draw in the browser; a new `kind`
for dialogue; a field in `context` for the dialogue buffers.

**Why not**: an integer makes the browser learn Proof General's **drawing rules** for goals and response — the mode-specific knowledge
`D-results-not-display` removed; carrying its formatted text (like a `message` event) avoids position units altogether. A new `kind`
breaks `D-single-input` (one more `type` does not). Stepping does not select `*goals*`/`*response*`, so the injection target (the
script buffer) stays; `context`'s `buffer-name` (`.v`) is enough to tell a session is on.

**What it removed**: new context fields, new kinds, position conversion. Whether the next tool fits is per-tool: `content`'s shape may
differ by tool.

**Not solved by it**: one-off modal choices (minibuffer reads, `y-or-n-p`, transient) — they need a candidate UI.

**Verified**: batch load of real `websocket` + `proof-general`, the wire bytes (`event`+`flush`), following `emacs-vent-mode`. An E2E
through the relay with a real Coq session is not done.

**Files**: `emacs-vent-out-dialogue.el`, `emacs-vent-in-dialogue.el` (emacs-vent), `panels/resident/dialogue-input.html`,
`panels/resident/dialogue-output.html`, `lib/vent/dialogue-output-panel.js`.

## Notes from verification

**Spec** — where `output-panel.js` keeps a flat log, this panel **replaces** two boxes, goals and response — Proof General's own UI is two
lasting buffers, not a scrolling transcript. Other kinds and types (`context`, `hello`, `flush`, other events) fall back to the same flat log
as `output-panel.js` (the code is nearly a copy, not shared).

**Does not** — special handling for event types other than `proof-general.output`; driving (that is `dialogue-input.html` =
`input-panel.js`).

**Pitfalls** — `renderProofGeneralOutput` shows `(none)` for a falsy `goals` / `response` (an empty string included), so "Emacs emptied the
pane on purpose" and "nothing came yet" show the same words.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/vent/dialogue-output-panel.js`, 2026-09-10.)

Dialogue output panel: the listening side of emacs-vent's dialogue bridge
(Emacs-side counterpart: emacs-vent-out-dialogue.el; Proof General is the
first tool bridged).

Unlike output-panel.js (a flat arrival log of every message), this panel
gives the two dialogue streams a persistent box each -- `goals` and
`response` -- replaced in place on every `proof-general.output` event,
mirroring how Proof General itself shows two persistent buffers rather
than a scrolling transcript. Everything else (context/hello/flush/other
event types) still goes to a flat log underneath, reusing the same shape
as output-panel.js so anyone driving via dialogue-input.html / input.html
can see it arrive.

Wire contract (emacs-vent-out-dialogue.el): one new `event.type` value per
bridged tool, e.g. "proof-general.output", with `content: {goals,
response}` (both plain strings, either possibly empty meaning "clear this
pane"). No new `kind`, no relay/vent-in changes -- `protocol.js` already
passes this straight through unmodified.

Log noise reduction (browser-side, same two stages as output-panel.js --
see that file for the full rationale): `buffer.changed` events are not
rendered (content-free, one per command-loop turn), and consecutive
otherwise-identical lines collapse into one row with a "xN" counter.
Consecutive-duplicate guard: collapse a run of consecutive,
otherwise-identical lines into one row with a "xN" counter, refreshed
in place, instead of one row each. See output-panel.js.
buffer.changed: content-free, one per command-loop turn that
touched a buffer -- see output-panel.js. Not rendered.
