# `lib/core/kbd.js`

Reads Emacs `kbd` notation (`C-x C-f`) into InputEvents.

**Takes part in**: [D-single-input](lib-vent-protocol.js.md#d-single-input)

## Notes from verification

**Spec** — its rules differ from `keymap.js` (`S-a` stays a literal `{key:"a", modifiers:["shift"]}`) because its input differs: `keymap.js`
normalises keys the browser returned; `kbd.js` reads notation a person wrote on purpose. (The source has no comment saying so.)

**Does not** — real keyboard events (`keymap.js`).

**Pitfalls** — `SPECIAL_KEYS` was checked string by string against `emacs-vent-in--special-keys` (`return tab backspace delete escape up down
left right home end prior next f1..f12`). `ALIAS.SPC` expands to `' '` (there is no `space` key name: a one-character `" "` is sent).
`isPrintableChar` excludes DEL (`0x7f`), unlike `keymap.js`. A multi-character literal expands to one InputEvent per character, and
`describe()` has no inverse for it (it is display-only, one event).

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/core/kbd.js`, 2026-09-10.)

Parse a subset of Emacs `kbd' notation into emacs-vent-in InputEvents
(browser global + CommonJS module).

Used by the form input (browser -> Emacs, the primary UI): the user types a
key description and presses Send / S-Enter; parse() turns it into the
`sequence' for one {"kind":"input"} message.

Grammar: whitespace-separated tokens. Each token is zero or more modifier
prefixes (C- M- S- s-) then a key body:
  <name>              a bracketed special key; NAME must be one emacs-vent-in
                      accepts: return tab backspace delete escape up down
                      left right home end prior next f1..f12
  RET SPC TAB ESC DEL Emacs aliases -> return / " " / tab / escape / backspace
  x  /  ;  !          a single printable character
  foo                 (no modifiers only) multi-char literal text -> one
                      InputEvent per character, like Emacs `kbd'

  parse(text) -> { events: [{key, modifiers}, ...] }   on success
             -> { error: "..." }                       on any bad token

This does NOT do the §6.3 shift folding keymap.js does for live keydowns:
here the user types explicit notation, so "S-a" is passed through faithfully
as {key:"a",modifiers:["shift"]}. Type "A" for a capital A.
Mirrors emacs-vent-in--special-keys in emacs-vent-in.el (== the values of
keymap.js SPECIAL). Keep in sync.
Resolve a modifier-bearing token's key body to exactly one key name.
Parse one token -> array of InputEvents. Throws a string on a bad token.
No modifiers.
Multi-char literal text -> one event per character.
Human-readable rendering of a parsed sequence, for the preview / log.
