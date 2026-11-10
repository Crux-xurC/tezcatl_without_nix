# `lib/core/panel-bus.js`

The bus between the panels (one BroadcastChannel).

**Decisions homed here**: [D-bus-ledger](#d-bus-ledger)

**Takes part in**: [D-skin-as-container](lib-core-panes.js.md#d-skin-as-container)

<a id="d-bus-ledger"></a>

## D-bus-ledger — the bus's messages are written in one ledger, checked against the code by a test

**Decided**: the panel bus's messages (`lib/core/panel-bus.js`) were tied only by type strings and implicit shapes — no list like
`command_map.json`, over 120 kinds (126 when counted, including those only posted, only listened to, or replied with `replyTo`, plus `*`
that hears everything). They are written in `bus/messages.json`, one entry each: what it says, who posts, who takes, its shape, **how the
takers are decided** (`scope`) and **how takers narrow** (`filter`). `test/bus-ledger.test.js` checks that every type written as a string
in the pages' `bus.post`, `bus.on`, `bus.onMine`, `replyTo` (in `lib/`, `panels/`, `main.html` …) and in `work.json` is in the ledger, and
that every type in the ledger is still written somewhere. A new message: its entry in the same change.

`scope` is one of five: `notice` (unaddressed: something happened; each taker acts, narrowing by `filter`), `ask` (an unaddressed question;
whoever can answers with `reply`), `to` (addressed to one id; the taker uses `onMine`), `reply` (an answer: addressed to the asker, or
unaddressed and matched by `req`), `claim` (pages of one kind — one per window — say "now it's me"; the others step back).

**Alternatives**: JSON Schema per type, checked on posting; notes in code comments only; putting addressing into the bus first (`post`
with a scope).

**Why not**: a check in `post` stops a page on a broken message — what is needed now is seeing what exists. Over 120 in comments cannot be
searched or tested. Without a ledger there is nothing to decide each message's range from (that is the dock's work, `D-unified-dock`).

**What it removed**: searching the whole code for "who takes this"; takers with no sender (`code.mark`, `diff.get`) and messages with no
taker (`diff.shown` …) show in `note`.

**Found**: unaddressed messages are narrowed in at least five ways — the frame by whether the sender's name is in it (`ours` of
`frame-code.js`) and whether the sender's id is a panel of it (`ownPanel` of `frame-page.js`); `input_target` and the virtual keyboard by
`skinPort.siblings`; thema and the tree skin by matching names; commands by whether the frame was used last (`mine` of `frame-page.js`).
The ledger's `filter` column is that list — the material for the dock to take over routing.

**Files**: `bus/messages.json`, `test/bus-ledger.test.js`.

## Notes from verification

**Spec** — `BroadcastChannel` is the only same-origin transport that crosses both `<iframe>` (a skin's children) and `window.open` (windows
of their own) without a server, so panel ↔ panel and panel ↔ skin **never go through the relay** (`D-stateless-relay`). A message is
`{v:1, type, from:{id,role,name}, to:<id|null>, payload, ts}`. `to` is an addressing hint: everything is broadcast and takers narrow
(`onMine` keeps `to===self.id || to===null`). It carries UI-local intentions only; keys for Emacs are another namespace (`keymap.js`,
`kbd.js`, `protocol.js`). Every type it carries is in `bus/messages.json` (`D-bus-ledger`).

**Does not** — the vent wire (nothing reaches emacs-vent); validating contents (`deliver` checks only `v` and `type`'s type); giving a frame
its identity (`panel-frame.js` calls `identify()`).

**Pitfalls** — without `BroadcastChannel` it degrades: `post` reaches only `on` handlers of the same frame (`opts.echo || frameOnly`;
`frameOnly` is true only when there was no channel at start; after `close()` not even oneself), so cross-frame messages silently fail (one
`console.warn`). `self.id` is `f-<time36>-<rand>`, made once per document. `BroadcastChannel` does not deliver to the sender, and `deliver`
also drops `msg.from.id === self.id`; echoes and same-frame delivery go through `deliver(msg, true)`, skipping that guard (a `{echo: true}`
once never reached oneself — `test/panel-bus.test.js`).

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/core/panel-bus.js`, 2026-09-10.)

Panel bus -- browser-local messaging between Tezcatl panels (browser only).

Every panel page (panels/*.html, panels/**/*.html) and every skin
(panels/skins/*.html) is served from the same origin (:4001), whether it
is an <iframe> inside a skin or a standalone window opened with
window.open. A `BroadcastChannel` is the one transport that spans BOTH of
those, same-origin, with no server involvement -- so panel<->panel and
panel<->skin handoff never goes through the relay (the relay stays
stateless w.r.t. anything but the vent passthrough: overview.md §2).

This is NOT the vent wire. Nothing here reaches emacs-vent. It carries
UI-local intent only: "leave-key pressed" (yield), "focus this panel",
"insert this text", "here is my cursor", "list selection made". Keys sent
to Emacs are a separate namespace (keymap.js / kbd.js / protocol.js).

Message shape on the wire:
  { v: 1, type: <string>, from: {id,role,name}, to: <id|null>,
    payload: <any>, ts: <ms> }
`to` is an optional addressee frame id; the message is still broadcast and
receivers filter. A frame never receives its own posts (unless it also
passes {echo:true} to post()).
This frame's identity. `id` is stable for the life of the document;
`role` / `name` are filled in by identify() (a panel calls it once at
startup -- panel-frame.js does this for every panel).
"input" | "output" | "list" | "cursor" | "skin" | ...
?name= value, when the page was launched with one
type -> Set of listener fns. A "*" bucket gets every message.
Degenerate single-frame mode: post()/on() still work within this one
document, cross-frame does not. Enough for a standalone panel page.
Broadcast a message. opts.to = addressee frame id (optional).
opts.echo = also deliver to this same frame's own listeners (default
false -- a frame does not hear itself).
Never deliver a frame its own broadcast (BroadcastChannel already
omits the sender, but the echo path and a future same-frame transport
could not).
Subscribe. `type` may be "*" for everything. Returns an unsubscribe fn.
Convenience: deliver only messages addressed to this frame (to === our
id) OR broadcast to everyone (to === null). Filters out messages aimed
at some other frame.
