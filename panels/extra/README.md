# panels/extra — where new panels go

A new panel is placed here first. Once its use is clear (kept open, or opened and closed) it moves to `resident/` or `tool/`.

## Adding one

1. Make `panels/extra/<name>.html`. The smallest shape:

   ```html
   <!doctype html>
   <html lang="en">
   <head>
   <meta charset="utf-8">
   <title>Tezcatl — <name></title>
   <link rel="stylesheet" href="../../lib/core/tezcatl.css">
   <link rel="stylesheet" href="../../lib/core/fonts.css">
   </head>
   <body>
   <div id="root"></div>
   <script src="../../lib/core/config.js"></script>
   <script src="../../lib/core/panel-bus.js"></script>
   <script src="../../lib/core/panel-frame.js"></script>
   <script src="../../lib/<role>/<name>-page.js"></script>
   </body>
   </html>
   ```

   Behaviour (`Tezcatl.panelFrame.init({role, name})`, bus listeners, registering commands) is not written in the HTML but in
   `lib/<role>/<name>-page.js` (the page is the look, `lib/` the behaviour). Roles are the directories of `lib/`: `core` `vent` `code`
   `skin` `list` `task` `recv` `target` `suggest` `term` `xipe` `view`
2. Add `{ "id": "<name>", "page": "panels/extra/<name>.html", "class": "panel" }` to `list_kinds/panels_and_skins.json` (it opens from the
   launcher and from the frame's `skin add <line> <name>`)
3. If it takes tezcatl commands, follow [docs/extending.md](../../docs/extending.md)
4. Its contract with the bus, `panelFrame` and the skin: the records of `lib/core/panel-frame.js` and `lib/core/panel-bus.js` in
   [docs/files/](../../docs/files/index.md); E2E: [test/e2e/README.md](../../test/e2e/README.md)
