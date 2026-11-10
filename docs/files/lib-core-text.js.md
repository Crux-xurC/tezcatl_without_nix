# `lib/core/text.js`

Turns text into InputEvents for Emacs (code point by code point).

**Takes part in**: [D-single-input](lib-vent-protocol.js.md#d-single-input)

## Notes from verification

**Spec** — it iterates by code point (`for..of`): `.split("")` would cut a surrogate pair (emoji and other non-BMP characters) into two
`\uXXXX` and two keys. No prefix and no final `RET`: Text mode only turns characters into keys; `M-:` / `RET` are the callers'
(`vent-init.js`, `resolver.js`).

**Does not** — read `kbd` notation; add a prefix or a final RET.

**Pitfalls** — `\r\n` and a lone `\r` are normalised to `\n` first, so pasted CRLF text gives one `{key:"return"}` per line break.
`isLoneSurrogate` drops a single code unit in 0xd800–0xdfff; a proper pair arrives from `for..of` as one two-unit string and is not caught.
The `dropped` counter is for the caller's preview (`updateTextPreview` of `input-panel.js`); `text.js` logs nothing. `\t` becomes
`{key:"tab"}`, the same name as emacs-vent-in's special key `"tab"`.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/core/text.js`, 2026-09-10.)

Encode raw text into emacs-vent-in InputEvents -- the Text mode payload
(browser global + CommonJS module).

Used by the Text input mode (browser -> Emacs): the user pastes / types a
block of text and presses Send; encode() turns it into the `sequence' for
one {"kind":"input"} message. This is the §7.4 / §3.6 path: "send text as
one blob", no `kbd' notation parsing, no prefixes and no trailing RET added
(the caller / middleware is responsible for `M-:' / `M-x' / RET -- Text mode
only turns characters into events).

Encoding rules (design doc §5.4):
  \n  -> {key:"return"}      (CR and CRLF are normalized to \n first)
  \t  -> {key:"tab"}
  other C0 control chars and DEL (0x7f) -> dropped (counted)
  lone/broken surrogate                 -> dropped (counted)
  everything else, incl. non-BMP        -> {key: <the character>, modifiers: []}

Iterated by code point (for..of / Array.from), never `.split("")': a
surrogate pair must stay one `key'. A non-BMP character is sent as its two
UTF-16 code units in the JSON string; emacs-vent-in sees a length-1 Elisp
string and `(kbd "X")' yields a single self-inserting character (verified
for e.g. U+1F600).
text: a string. Returns { events: [{key, modifiers}, ...], dropped: N }
on success, or { error: "..." } when there is nothing worth sending.
CRLF / lone CR -> LF, so a pasted multi-line block yields real newlines.
C0 + DEL
