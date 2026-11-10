# `lib/core/keymap.js`

Normalises real KeyboardEvents into `{key, modifiers}`.

## Notes from verification

**Spec** — Shift folding (a printable character with Shift folds; a non-printable key keeps `shift`) anticipates `kbd` in emacs-vent-in:
`(kbd "M-X")` and `(kbd "M-S-x")` differ, so adding `shift` to the `"X"` a browser already returns would be eaten silently in Emacs. The
confusion is stopped here.

**Does not** — read `kbd` notation (`kbd.js`).

**Pitfalls** — `isPrintable(key)` checks only `key.length === 1 && key.charCodeAt(0) >= 0x20` and **does not exclude DEL (0x7f)**, unlike
`text.js` and `kbd.js` — consistent with the normalisation rule (C0 control characters only), and harmless in practice (the Delete key
reports `"Delete"`). `LONE_MODIFIER` includes `Fn`; AltGraph is not mapped (unused on the machine it was made on). Also used by the lead-key
notation for printable characters (`D-lead-key`).

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/core/keymap.js`, 2026-09-10.)

KeyboardEvent -> normalized {key, modifiers} for emacs-vent-in (browser
global + CommonJS module). This is the Tezcatl-side normalization the
design doc assigns to the client (emacs-vent-in v0.2 §2.1, §4, §6):
vent-in itself does none of this.

Decisions baked in here (see progress notes):
  - key: KeyboardEvent.key as-is for printable characters (already
    shift-folded by the browser: "X", "!", " "); Emacs names for the
    non-printable keys listed below.
  - shift folding (§6.3): for a printable character, shift is NOT emitted
    as a modifier (it is already in the character). For a non-printable
    key, shift IS kept. `M-X` vs `M-S-x` are different bindings in Emacs;
    the naive `["meta","shift"]` on a printable would be silently unbound.
  - modifiers: ctrlKey->control, altKey->meta, metaKey->super. AltGr is
    not used on this machine, so ctrl+alt passes straight through as
    control+meta. metaKey (Super) is usually grabbed by the WM and never
    arrives -- harmless.
  - lone modifier presses (Control/Alt/Shift/Meta/...) -> dropped.
  - IME: an event with isComposing set -> dropped.
  - any key not printable and not in the table (Insert, F13+, ContextMenu,
    Pause, Dead, Compose, ZenkakuHankaku, Henkan, ...) -> dropped.
A dropped event is returned as null.
KeyboardEvent.key -> emacs-vent-in special key name (must be a subset of
emacs-vent-in--special-keys in emacs-vent-in.el).
Keys that are only ever modifiers -- never sent on their own.
Canonical modifier order. `kbd' in emacs-vent-in does not require it, but
a fixed order keeps output deterministic and readable.
Exactly one code unit and not a C0 control character.
ev: a KeyboardEvent, or any object with the same key/*Key/isComposing
fields. Returns {key, modifiers} or null (drop).
unknown non-printable key
Shift: kept only for non-printable keys (§6.3).
