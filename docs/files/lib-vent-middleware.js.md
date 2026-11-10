# `lib/vent/middleware.js`

The input middleware: an identity stage kept on the path.

**Decisions homed here**: [D-empty-middleware](#d-empty-middleware)

<a id="d-empty-middleware"></a>

## D-empty-middleware — one stage always on the path; empty for now

**Decided**:

```
Tezcatl UI → normalise (keymap.normalize / kbd.parse / text.encode)
          → Input Middleware  ← identity for now
          → protocol.encodeInput → vent-in → Emacs keymaps
```

`run(events, currentContext) => events`. The resolver (`D-intent-resolution`) came later in front of it: a Form send first tries the
resolver; on a hit it sends its `M-:` / keys **without** the normalisation and the middleware; only on a miss does it take this path.
The middleware itself is unchanged.

**Alternatives**: put the stage in when needed.

**Why not**: one stage, even empty, lets these come later **by additions on Tezcatl's side only**, without touching vent-in or the wire
format: a mapping mechanism; an operating scheme of one's own (`:` as a Meta prefix); deciding Tab by context (accept a candidate,
else Tab to Emacs); bridging per-package bindings; a prefix key before sending text.

**Using it without breaking principle 4**: the middleware turns "a newcomer's operation" into **that package's real default key
sequence** — for Magit's commit it sends `c c`; it never calls Magit's command.

**Known limit (accepted)**: if the user rebound it in the real Emacs, it silently does not work.

**Files**: `lib/vent/middleware.js`.

## Notes from verification

**Spec** — `run(events, currentContext) => events`, the identity. One stage even empty, so that mapping or per-package bridges can come later
**without changing vent-in or the wire format** (`D-empty-middleware`).

**Does not** — anything, today.

**Difference from the design** — the pipeline drawn as "`middleware.run` → `protocol.encodeInput`" no longer shows that the resolver comes
first: `input-panel.js`' `doSend()` tries `resolver.lookup(text)` and, on a miss, goes `kbd.parse` → `middleware.run` →
`protocol.encodeInput`. The middleware is unchanged, but it is no longer the *only* transform on the path (a resolver hit bypasses it).

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/vent/middleware.js`, 2026-09-10.)

Input Middleware -- the one extension seam between normalized input and the
wire encoder (browser global + CommonJS module).

It is deliberately empty (identity) for now. The point of having the seam
at all is that everything below can be added later as a pure Tezcatl-side
change, without touching emacs-vent-in or the wire format:

  - InputEvent -> KeySequence mappings (emacs-vent-in v0.2 §14), loaded and
    validated once, hot-swappable
  - `:` as a Meta prefix and other alternate input schemes / keymaps
  - per-package keybinding bridges (a Magit "Commit" button -> `c c`)
  - context-aware handling (Tab means different things in different modes)

vent-in stays thin throughout; Emacs' own keymap still decides what any
key sequence actually does.
events: array of normalized {key, modifiers} (usually length 1, straight
from keymap.normalize). currentContext: the last "context" message
received from emacs-vent-out, or null. Returns the (possibly transformed
or re-sequenced) event array to encode and send.
