# `lib/vent/vent-init.js`

Asks Emacs for its current context when a vent connection opens.

**Takes part in**: [D-stateless-relay](lib-relay-browser_socket.exs.md#d-stateless-relay)

## Notes from verification

**Spec** — the relay replays no hello / context handshake, so a tab connecting later sends `emacs-vent-send-context` as an `M-:` itself and
fetches the current value — `D-stateless-relay`'s "a tab fetches it itself". The expression is encoded by `text.js`; the `M-:` prefix and
the final `RET` are added here (the split of duties holds).

**Does not** — decide when to call it (each panel's `onState`).

**Pitfalls** — the card started from a real inconsistency: the file existed but **neither the input nor the output page called it from
`onState`**; both now do (`if (s === 'open') Tezcatl.ventInit.requestContext(Tezcatl.ws.send)`), and the output page loads `text.js`.
`requestContext` checks that `T.text`, `T.protocol` exist and `send` is a function before sending, so a wrong script order fails silently
(`false`), not with an exception.

*Verified 2026-09-06.*

## Selection and revision notes

(Moved from the comments of `lib/vent/vent-init.js`, 2026-09-10.)

vent-init.js -- "call this once the socket is open" helper (browser global
+ CommonJS module). Currently one entry: re-request the context.

A tab that connects AFTER emacs-vent's initial hello/context handshake --
e.g. a second/third browser tab reaching emacs-vent through the Phase 8
relay -- never receives that first `context` message (the relay only holds
one uplink and does not replay). So on open it asks Emacs to send the
current target again, by delivering `M-: (emacs-vent-send-context) RET` as
one {"kind":"input"} message. `emacs-vent-send-context` is the Phase 8
addition to emacs-vent-out.el (overview.md §4.1): it calls
`emacs-vent--send-context-now` unconditionally.

The expression body is encoded with text.js (spaces/parens pass straight
through as one event per char); the `M-:` prefix and trailing `RET` are
added here -- text.js never adds prefixes (§5.4a).

Known limitation (overview.md §6.8): if Emacs is in a minibuffer read when
this arrives, the expression text lands in that minibuffer instead of
being evaluated. A caller could guard on the context buffer-name being
" *Minibuf-N*"; this module does not.
send: fn(messageObject) -> truthy on success (typically Tezcatl.ws.send).
Returns send()'s result, or false if the payload could not be built.
