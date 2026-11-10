// lib/skin/markdown-commands.js -- the `markdown ...` lines of a skin's input
// form (the lines are read by lib/code/markdown.js parse):
//   markdown <path>      a markdown panel added for that note (each time a new one)
//   markdown follow      the markdown panel meant now follows the code_editor of
//                        this skin that has its note (markdown.follow {on: true})
//   markdown unfollow    back to the saved text (markdown.follow {on: false})
// The panel meant: the focused one, else the first of this skin. The panel
// says what came of it itself (recv.say).
// wire(h) does them for a page.
(function (root) {
  'use strict';

  // h: { bus, M (lib/code/markdown.js), recv(text, cls, ref),
  //      resolve(arg) -> {path} | {error} (from the file of the code_editor meant now),
  //      add(path) -> bool (a markdown panel added, said on the receiving side),
  //      panels() -> [{id, bus, place, focused}] (this skin's markdown panels) }
  // -> { handle(line) -> false (not a markdown line) | bool, run(cmd, path) -> bool }
  function wire(h) {
    function err(t, ref) { h.recv('! ' + t, 'err', ref || null); return false; }

    function run(cmd, path) {
      if (cmd === 'open') return h.add(path);
      const all = h.panels();
      const p = all.filter(function (x) { return x.focused; })[0] || all[0];
      if (!p) return err('markdown ' + cmd + ' ── there is no markdown panel here (markdown <path> adds one)');
      if (!p.bus) return err('markdown ' + cmd + ' ── the markdown panel at ' + p.place + ' is still loading', { kind: 'panel', id: p.id });
      h.bus.post('markdown.follow', { on: cmd === 'follow' }, { to: p.bus });
      return true;
    }

    function handle(line) {
      const c = h.M.parse(line, h.resolve);
      if (!c) return false;
      if (c.error) return err(c.error);
      return run(c.cmd, c.path);
    }

    return { handle: handle, run: run };
  }

  const api = { wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).markdownCommands = api;
})(typeof self !== 'undefined' ? self : this);
