// lib/target/xterm.js -- the xterm panels of the same skin as destinations of
// input_target (input_target/xterm.json; D-lead-key). The shape is in
// lib/target/emacs-vent.js.
//
// One candidate per xterm panel among the siblings (none alone in a window).
// The keys go as terminal.keys {req, events} to that panel, which turns them
// into a terminal's bytes (lib/term/keys.js) and answers terminal.keys.sent.
// Whether each is connected is asked with terminal.query -> terminal.here,
// when the roster moves (panel.open / panel.close) and every few seconds.
(function (root) {
  'use strict';
  var T = (root.Tezcatl = root.Tezcatl || {});
  var ANSWER_MS = 2000;
  var POLL_MS = 3000;

  function create(ctx) {
    var bus = T.bus;
    var here = {};      // panel id -> {connected}
    var changed = function () {};
    var seq = 0;

    function panels() {
      return (ctx.siblings() || []).filter(function (x) { return x.role === 'xterm'; });
    }

    function ask() {
      panels().forEach(function (p) {
        bus.post('terminal.query', { req: 'q' + (++seq) }, { to: p.id });
      });
      changed();
    }

    function start(onChange) {
      changed = onChange || changed;
      bus.onMine('terminal.here', function (p, meta) {
        var id = meta.from && meta.from.id;
        if (!id) return;
        var was = here[id] && here[id].connected;
        here[id] = { connected: !!(p && p.connected) };
        if (was !== here[id].connected) changed();
      });
      bus.on('panel.open', function () { setTimeout(ask, 300); });
      bus.on('panel.close', function () { setTimeout(changed, 100); });
      setInterval(ask, POLL_MS);
      ask();
    }

    function candidates() {
      return panels().map(function (p) {
        var h = here[p.id];
        return {
          key: p.id,
          label: 'xterm ' + (p.place || p.name || ''),
          state: !h ? 'connecting' : h.connected ? 'open' : 'closed',
          detail: '',
          lines: ['panel: ' + (p.place ? p.place + ' ' : '') + (p.name || p.id)],
        };
      });
    }

    function send(key, events) {
      if (!panels().some(function (p) { return p.id === key; })) {
        return Promise.resolve({ ok: false, error: 'that xterm is gone: choose a destination again' });
      }
      var req = 'k' + (++seq);
      return new Promise(function (resolve) {
        var off;
        var timer = setTimeout(function () { off(); resolve({ ok: false, error: 'the xterm did not answer' }); }, ANSWER_MS);
        off = bus.onMine('terminal.keys.sent', function (p) {
          if (!p || p.req !== req) return;
          clearTimeout(timer);
          off();
          resolve({ ok: !!p.ok, error: p.error || null });
        });
        bus.post('terminal.keys', { req: req, events: events }, { to: key });
      });
    }

    return { start: start, candidates: candidates, send: send };
  }

  (T.targets = T.targets || {}).xterm = { create: create };
})(typeof self !== 'undefined' ? self : this);
