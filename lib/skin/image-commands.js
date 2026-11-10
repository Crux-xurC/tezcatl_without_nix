// lib/skin/image-commands.js -- the `image <path>` line of a skin's input form
// (the line is read by lib/view/image.js parse):
//   image <path>   the image panel meant now shows it (image.show {path}); with
//                  none here, an image panel is added for it
// The panel meant: the focused one, else the first of this skin. The panel
// says what came of it itself (recv.say).
// wire(h) does them for a page.
(function (root) {
  'use strict';

  // h: { bus, I (lib/view/image.js), recv(text, cls, ref),
  //      add(path) -> bool (an image panel added, said on the receiving side),
  //      panels() -> [{id, bus, place, focused}] (this skin's image panels) }
  // -> { handle(line) -> false (not an image line) | bool }
  function wire(h) {
    function err(t, ref) { h.recv('! ' + t, 'err', ref || null); return false; }

    function show(path) {
      const all = h.panels();
      const p = all.filter(function (x) { return x.focused; })[0] || all[0];
      if (!p) return h.add(path);
      if (!p.bus) return err('image ── the image panel at ' + p.place + ' is still loading', { kind: 'panel', id: p.id });
      h.bus.post('image.show', { path: path }, { to: p.bus });
      h.recv('image ── ' + path + ' in the image panel at ' + p.place, null, { kind: 'panel', id: p.id });
      return true;
    }

    function handle(line) {
      const c = h.I.parse(line);
      if (!c) return false;
      if (c.error) return err('image ── ' + c.error);
      return show(c.path);
    }

    return { handle: handle, show: show };
  }

  const api = { wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).imageCommands = api;
})(typeof self !== 'undefined' ? self : this);
