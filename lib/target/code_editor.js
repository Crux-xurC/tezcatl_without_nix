// lib/target/code_editor.js -- the code_editor panels of the same skin as destinations
// of input_target (input_target/code_editor.json; D-lead-key). The shape is in
// lib/target/emacs-vent.js.
//
// One candidate per code_editor among the siblings (those that answer code.query
// with code.here -- the file editors; a read-only viewer does not). The keys go
// as code.keys {req, events} to that panel, which presses them on its editor
// as typed (vim and code.json's keys take them) and answers code.keys.sent.
// What each shows -- its file, unsaved or not, vim's mode -- comes from
// code.here (asked when the roster moves and every few seconds) and code.mode.
(function (root) {
  'use strict';
  var T = (root.Tezcatl = root.Tezcatl || {});
  var ANSWER_MS = 2000;
  var POLL_MS = 3000;

  function create(ctx) {
    var bus = T.bus;
    var here = {};      // panel id -> {path, dirty, mode}
    var changed = function () {};
    var seq = 0;

    function panels() {
      return (ctx.siblings() || []).filter(function (x) { return x.role === 'code' && here[x.id]; });
    }
    function ask() {
      bus.post('code.query', { req: 'q' + (++seq) });
    }

    function start(onChange) {
      changed = onChange || changed;
      bus.on('code.here', function (p, meta) {
        var id = meta.from && meta.from.id;
        if (!id || !p) return;
        var was = JSON.stringify(here[id] || null);
        here[id] = { path: p.path || null, dirty: !!p.dirty, mode: p.mode || null };
        if (was !== JSON.stringify(here[id])) changed();
      });
      bus.on('code.mode', function (p, meta) {
        var id = meta.from && meta.from.id;
        if (!id || !here[id] || !p) return;
        here[id].mode = p.mode || null;
        changed();
      });
      bus.on('code.opened', function () { setTimeout(ask, 100); });
      bus.on('code.saved', function () { setTimeout(ask, 100); });
      bus.on('panel.open', function () { setTimeout(ask, 300); });
      bus.on('panel.close', function () { setTimeout(changed, 100); });
      setInterval(ask, POLL_MS);
      ask();
    }

    function candidates() {
      return panels().map(function (p) {
        var h = here[p.id];
        var file = h.path ? h.path.replace(/^.*\//, '') : '(no file)';
        return {
          key: p.id,
          label: 'code_editor ' + (p.place || p.name || ''),
          state: 'open',
          detail: file + (h.dirty ? ' ●' : '') + (h.mode ? '  ' + h.mode : ''),
          lines: ['file: ' + (h.path || '(none)') + (h.dirty ? '  (unsaved)' : ''), 'mode: ' + (h.mode || '-')],
        };
      });
    }

    function send(key, events) {
      if (!panels().some(function (p) { return p.id === key; })) {
        return Promise.resolve({ ok: false, error: 'that code_editor is gone: choose a destination again' });
      }
      var req = 'k' + (++seq);
      return new Promise(function (resolve) {
        var off;
        var timer = setTimeout(function () { off(); resolve({ ok: false, error: 'the code_editor did not answer' }); }, ANSWER_MS);
        off = bus.onMine('code.keys.sent', function (p) {
          if (!p || p.req !== req) return;
          clearTimeout(timer);
          off();
          if (here[key] && p.mode !== undefined) { here[key].mode = p.mode; changed(); }
          resolve({ ok: !!p.ok, error: p.error || null });
        });
        bus.post('code.keys', { req: req, events: events }, { to: key });
      });
    }

    return { start: start, candidates: candidates, send: send };
  }

  (T.targets = T.targets || {}).code_editor = { create: create };
})(typeof self !== 'undefined' ? self : this);
