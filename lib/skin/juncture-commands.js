// lib/skin/juncture-commands.js -- the `juncture ...` lines of a skin's input
// form (D-juncture; the lines are read by lib/code/juncture.js parse):
//   juncture set|point|back|forward [path]
//   juncture tree [path]        the file's juncture_tree panel (the one here shows it, else one is added)
// Without a path: the file of the code_editor meant now (the focused one, else the
// one used last). With one: the code_editor of this skin that has it, else a
// code_editor added for it. The code_editor does the work (code.juncture {req, op} ->
// code.juncture.done, lib/code/code-editor/juncture.js); its answer and what
// the relay pushed out become lines on the receiving side, with the code_editor
// as their reference. `tree` needs no code_editor with a path: the skin shows
// the panel (h.showTree).
// wire(h) does them for a page.
(function (root) {
  'use strict';

  // h: { bus, J (lib/code/juncture.js), recv(text, cls, ref),
  //      codes() -> [{id, bus, place, path}] (this skin's code_editor),
  //      codeNow() -> id | null, resolve(arg) -> {path} | {error},
  //      open(path) -> Promise<{ok, id, message}> (a code_editor added for it),
  //      showTree(path) -> bool (the juncture_tree panel of the skin shows it), setTimeout? }
  // -> { handle(line) -> false (not a juncture line) | Promise<bool>, run(cmd, path) -> Promise<bool> }
  function wire(h) {
    const later = h.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    function err(t, ref) { h.recv('! ' + t, 'err', ref || null); return false; }

    // the code_editor to ask -> Promise<{id, bus} | null> (said why when null)
    function target(cmd, path) {
      const all = h.codes();
      if (path == null) {
        const now = h.codeNow();
        const c = all.filter(function (x) { return x.id === now; })[0];
        if (!c) return Promise.resolve(err('juncture ' + cmd + ' ── there is no code_editor here (focus one, or give a path)'));
        if (!c.path) return Promise.resolve(err('juncture ' + cmd + ' ── the code_editor at ' + c.place + ' has no file', { kind: 'panel', id: c.id }));
        return Promise.resolve(c);
      }
      const have = all.filter(function (x) { return x.path === path; })[0];
      if (have) return Promise.resolve(have);
      return h.open(path).then(function (r) {
        if (!r || !r.ok || !r.id) return err('juncture ' + cmd + ' ── ' + ((r && r.message) || path + ' could not be opened'));
        const c = h.codes().filter(function (x) { return x.id === r.id; })[0];
        return c || err('juncture ' + cmd + ' ── ' + path + ': the code_editor added for it is not here');
      });
    }

    function ask(c, cmd) {
      return new Promise(function (resolve) {
        if (!c.bus) { resolve(null); return; }
        const req = 'jct' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        let done = false;
        const off = h.bus.on('code.juncture.done', function (p) {
          if (done || !p || p.req !== req) return;
          done = true; off();
          resolve(p);
        });
        h.bus.post('code.juncture', { req: req, op: cmd }, { to: c.bus });
        later(function () { if (!done) { done = true; off(); resolve(null); } }, 10000);
      });
    }

    function run(cmd, path) {
      if (cmd === 'tree' && path != null) return Promise.resolve(h.showTree(path));
      return target(cmd, path).then(function (c) {
        if (c && cmd === 'tree') return h.showTree(c.path);
        if (!c) return false;
        return ask(c, cmd).then(function (a) {
          const ref = { kind: 'panel', id: c.id };
          if (!a) return err('juncture ' + cmd + ' ── the code_editor at ' + c.place + ' did not answer', ref);
          h.recv((a.ok ? '' : '! ') + 'juncture ' + cmd + ' ── ' + a.message, a.ok ? null : 'err', ref);
          (a.notes || []).forEach(function (n) { h.recv(n, null, ref); });
          return !!a.ok;
        });
      });
    }

    function handle(line) {
      const c = h.J.parse(line, h.resolve);
      if (!c) return false;
      if (c.error) return Promise.resolve(err(c.error));
      return run(c.cmd, c.path);
    }

    return { handle: handle, run: run };
  }

  const api = { wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).junctureCommands = api;
})(typeof self !== 'undefined' ? self : this);
