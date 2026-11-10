# `lib/core/virtual-keyboard.js`

The virtual keyboard's model: 87 keys, the last five lit, fading every two seconds.

**Decisions homed here**: [D-remote-window](#d-remote-window)

**Takes part in**: [D-lead-key](lib-core-lead.js.md#d-lead-key)

<a id="d-remote-window"></a>

## D-remote-window — xpra's screen gets the mouse only; the keyboard is a Tezcatl panel's, sent without interpretation (a plan)

**A plan** (not implemented, no date; xpra not tried):

- Aim: other GUI applications inside the frame — xpra's HTML5 client shown in a panel. For remote monitoring and the like (deep learning,
  mail, a file server or NAS), not a daily workplace. The delay of keys going "B → relay → X → xpra → D's screen" is accepted
- **Five panels, not one composite** (the skin composes, `D-skin-as-container`): D `xpra.html` (the screen; **mouse only**); A (which xpra
  the virtual keyboard is tied to, and whether it is reachable — listens to B's destination); A' (the log of what was sent); B (the keys
  from Enter to Enter; **the real keyboard's focus is here**; sent uninterpreted); C (a virtual keyboard: the combinations browsers or the
  OS take, and modifier locks, by click)
- **D never gets the keyboard**: xpra's page is another origin, so with focus inside it the frame cannot see the leave key, B cannot show
  the keys, and keys the browser takes (`Ctrl+W`, `Ctrl+T`) never arrive
- **Only B has the destination**, posts it when it changes, the others listen. Before changing, B sends "release all modifiers" to the old
  one and clears a half-typed line. The tie shows by colour (A takes D's thema colour)
- **`Esc`**: twice is still the leave key; one to the remote is `C-[` (as Emacs' input panel; configurable, and `Esc` on C)
- **The log** is kept by default, in a file of a fixed number of lines in the work place, readable by its owner only; one line from Enter
  to Enter, operations without Enter (`Ctrl+S`) as the key's name. **Not keeping** is B's switch ("until the next Enter" by default, or
  always); while not keeping, B's mark changes and the characters are hidden, and A' shows only "one line, not kept" (passwords)
- xpra is one started outside (`D-start-outside`), bound to `127.0.0.1` (`D-loopback`)
- **Undecided**: how keys go in — the relay injecting into xpra's DISPLAY (no change to the client; needs a resident injector — likely) or
  serving xpra's page through the relay on the same origin and passing keys into the iframe (depends on the client's insides); raw `Esc`
  to a remote vim, with another leave key; what A can show (the destination, the injector alive, locked modifiers can; the remote's
  focused window title is unknown; whether xpra's screen is connected is not visible from outside)
- Needs first: the work place (`D-work-place`), panels posting `panel.status`
- Later: A, A' and B went into the dock (`D-unified-dock`); keys taken by the browser can also be written as characters (`D-lead-key`);
  C lights from the input line's lead-key state, and a click puts the notation into the input line (`D-lead-key`'s virtual keyboard)

**Files** (planned): `lib/core/virtual-keyboard.js` and its panel exist (from `D-lead-key`); the xpra panel and the injector do not.
