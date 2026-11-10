# `main.html`

The page of Tezcatl.

**Takes part in**: [D-session-service](panels-invisible-daemon.html.md#d-session-service)

## Now (2026-10-24)

main.html shows nothing of its own: an `<iframe id="frame">` holds `panels/skins/frame.html?skin=main` — the saved skin `skins/main.json`,
the dock and an image panel (the Tezcatlipoca picture) — and it still hosts the daemon and opens `ui.startup.windows`. What it showed
before (the brand, the form, the list of pages) is the panel `pages` (`list.html?config=panels_and_skins`) and `launcher.html`; the form's
`launcher.fill` has no taker now. A startup window blocked is said on a line over the frame (`#err`): main.html is no panel of the frame,
so the frame's receiving side does not take its `recv.say`.

The notes below are of the page before.

## Notes from verification

**Spec** — it opens no WebSocket (no Emacs dependence): the page is only a launcher that makes windows. `cfg` is fetched once
asynchronously and kept, because `window.open` is stopped by popup blockers unless called synchronously inside a user action — the submit
handler cannot `await` anything. It embeds `<iframe id="daemon" hidden src="panels/invisible/daemon.html">`, so it is also the host of the
session services (`D-session-service`); this window is load-bearing.

**Does not** — vent itself (each panel it opens does).

**Pitfalls** — window names are made unique with a `pageTag` + `seq`, because `window.open(url, name)` **reuses and navigates** an existing
browsing context of the same name. Kinds opened without `?name=` (terminals, lists, skins) are not vent connections and stay out of the
relay's ledger (a skin's children connect themselves); every window still gets a unique context name. The form's free word order (`new`
ignored, known words sorted into kind and how to open, the rest into `bad`) lets the **last** of two conflicting kinds win, without an error.
`page` is made `/`-absolute before `window.open`, the same rule as `list.html` (see `lib/list/list-kinds.js`).

*Verified 2026-09-08 (the page normalisation only); the daemon (2026-09-09) not re-verified.*

## Selection and revision notes

(Moved from the comments of `main.html`, 2026-09-10.)

main.html -- the landing / launcher page. Independent of Emacs; it opens no WebSocket.

  Layout:
    - left: the brand image, the launch form (free input), hints
    - right: panels/tool/list.html?config=panels_and_skins embedded in an <iframe> — the page list (declared in
      list_kinds/panels_and_skins.json)
    - the form and the list talk over panel-bus (BroadcastChannel, same origin, not through the relay); main.html is not a panel but rides
      the bus

  Operation:
    - Enter / click in the list -> open the chosen page at once (open.defaultMode, tab by default); its id is mirrored into the form (focus
      is not taken)
    - M-t / M-w in the list -> open in a tab / window explicitly (a user action inside the iframe, so no popup blocker; list-kinds.js'
      panels_and_skins.onSelect / onKey call window.open)
    - Enter in the form -> resolve the typed id and open it with config.json's launcher.open-mode (`id tab` / `id window` to say so); for
      free input (aliases, `output window` …)

  The minimal fallback that does not depend on the manifest is launcher.html (a hard-coded map); this page sends you there when the
  manifest cannot be read.

---

session services (kill-ring / cursor aggregators). Kept alive as long as this launcher tab is open. Singleton: a standalone daemon window, if
also opened, stays dormant.

---

{ items: [...] } from list_kinds/panels_and_skins.json; id / alias -> item. config.json for launcher.* defaults (open-mode /
window-features); failure keeps the built-in defaults. Build the URL for a manifest item and open it (`how` = 'tab' | 'window'). page is
repo-root-relative; this form sits at repo root so a bare relative would also resolve, but pin it root-absolute so every open site reads
`page` the same way as list.html. "id [tab|window]" -- resolve id (or alias) via the manifest.
From the embedded list: launcher.fill { id } -- the list just opened this page (in-iframe, on-gesture). We only MIRROR it into the form; we
must NOT focus()/select() here -- doing so pulled focus out of the list iframe, so its keyboard nav then went to this form and a second
selection appeared to do nothing.
