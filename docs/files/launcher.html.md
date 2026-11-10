# `launcher.html`

The page of launcher (minimal).

## Selection and revision notes

(Moved from the comments of `launcher.html`, 2026-09-10.)

Plain text is yellow-green; code is green on dark grey (before, #eee ground with the inherited light-grey text made it the same tone as the
ground and unreadable). The page ground #111 / #ddd comes from lib/core/tezcatl.css.

---

Unique per launch, even across reloads. window.open(url, name) reuses an existing browsing context of the same name -- so a colliding name
would silently re-navigate an old window instead of opening a new one (and the log would still say "opened"). A per-page-load tag (timestamp +
random) plus a within-page counter keeps every name distinct.
Resolve config once, at load time, into a plain variable. The submit handler must call window.open synchronously inside the user gesture or
the popup blocker eats it -- so it never awaits anything.
Grammar: "new <what> [<how>]".
  <what> = input | output | dialogue-input | dialogue-output | xterm | w_list | … (required) -> which page to open
           ("term" -> "xterm";  "wlist" / "windows" -> "w_list")
  <how>  = tab | window            (optional)  -> tab or separate window
Token order is free; a leading "new" is optional. Empty or unknown <how> falls back to config.json's launcher.open-mode.
xterm.html (PTY), the list.html configs (they poll GET /windows or ride the bus) and the skin (its child iframes hold the vent sockets) are
not themselves vent connections: they do not read ?name= and are not in the relay's /windows registry. The browsing-context name (2nd arg to
window.open) still keeps each window distinct.
pin root-absolute: this page is at repo root so a bare relative also resolves, but keep every open site consistent with list.html / main.html.

Record: a minimal launcher that does not depend on the catalogue, with a hard-coded map — the fallback when `main.html` cannot read
`list_kinds/panels_and_skins.json`. The hard-coded map must be kept in step with `panels_and_skins.json` (an open chore); the
root-absolute rule of `pagePlan` applies to `openWindow` too.
