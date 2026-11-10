// lib/xipe/matrix-target.js -- which table a matrix.* command (command_map.json:
// matrix.update / matrix.get / matrix.pwd) acts on, when it comes over the
// bus (the palette, another window). Every window that can carry them out is
// a target: a matrix_set's matrix_bar (kind skin: its own table), or a
// matrix.html opened on its own (a table inside a skin is not). Exactly one
// acts:
//   - a skin, if any skin is open: the one focused (or opened) last
//   - else the matrix.html focused (or opened) last
// (the commands are meant for the skin's table; on their
// own they take the latest matrix.html.) With no target at all, the
// invoker's fallback in command_map.json opens a new matrix.html.
//
// The targets know each other over the bus ('matrix.target': hello -> here,
// focus, bye) -- the tree skin's "focused last" claim, extended to two kinds.

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).matrixTarget = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPE = 'matrix.target';

  // opts: { bus, kind: 'skin' | 'page', id?, now? }
  function create(opts) {
    const bus = opts.bus;
    const now = opts.now || Date.now;
    const self = {
      id: opts.id || ('mt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)),
      kind: opts.kind === 'skin' ? 'skin' : 'page',
      ts: now(),
    };
    const peers = new Map();   // id -> {kind, ts}

    function post(op) { bus.post(TYPE, { op: op, id: self.id, kind: self.kind, ts: self.ts }); }

    const off = bus.on(TYPE, function (p) {
      if (!p || typeof p.id !== 'string' || p.id === self.id) return;
      if (p.op === 'bye') { peers.delete(p.id); return; }
      peers.set(p.id, { kind: p.kind === 'skin' ? 'skin' : 'page', ts: Number(p.ts) || 0 });
      if (p.op === 'hello') post('here');
    });
    post('hello');

    function chosen() {
      const all = [{ id: self.id, kind: self.kind, ts: self.ts }];
      peers.forEach(function (v, id) { all.push({ id: id, kind: v.kind, ts: v.ts }); });
      const skins = all.filter(function (t) { return t.kind === 'skin'; });
      const pool = skins.length ? skins : all;
      return pool.reduce(function (a, b) {
        return b.ts > a.ts || (b.ts === a.ts && b.id > a.id) ? b : a;
      });
    }

    return {
      id: self.id,
      // this window was focused: it becomes the latest of its kind
      claim: function () { self.ts = Math.max(now(), self.ts + 1); post('focus'); },
      // should this window carry out a matrix.* command that came over the bus?
      isMine: function () { return chosen().id === self.id; },
      close: function () { post('bye'); off(); },
      peers: function () { return Array.from(peers.keys()); },
    };
  }

  return { create: create, TYPE: TYPE };
});
