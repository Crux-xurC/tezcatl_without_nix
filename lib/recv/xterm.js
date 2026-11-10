// lib/recv/xterm.js -- the xterm panels of the same skin as sources of the
// receiving side (output_target/xterm.json; D-unified-dock): what each printed, as
// plain lines (lib/recv/term-text.js) -- to see a terminal that is small or
// out of sight go on.
//
// A source registers Tezcatl.recvSources[<id>] = {create(ctx)}; create gives
//   start(changed)    watch; changed() whenever candidates() or a record moved
//   candidates()      [{key, label, state, detail}] -- the ones there now
//   lines(key)        [{text, cls}] -- its record (the last lines), or null when
//                     the record is the frame's own (tezcatl)
// ctx: {siblings()} -- the panels of the same skin ([] alone in a window).
//
// An xterm says what it prints on the bus (terminal.data {bytes}); one record
// per xterm panel, from when this one was opened.
(function (root) {
  'use strict';
  var T = (root.Tezcatl = root.Tezcatl || {});
  var KEEP = 200;

  function create(ctx) {
    var bus = T.bus;
    var recs = {};   // panel id -> {text: termText, dec: TextDecoder}
    var changed = function () {};

    function panels() {
      return (ctx.siblings() || []).filter(function (x) { return x.role === 'xterm'; });
    }
    function rec(id) {
      return recs[id] || (recs[id] = { text: T.termText.create(KEEP), dec: new TextDecoder('utf-8') });
    }

    function start(onChange) {
      changed = onChange || changed;
      bus.on('terminal.data', function (p, meta) {
        var id = meta && meta.from && meta.from.id;
        if (!id || !p || !p.bytes || !panels().some(function (x) { return x.id === id; })) return;
        var r = rec(id);
        r.text.write(r.dec.decode(p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes), { stream: true }));
        changed(id);
      });
      bus.on('panel.open', function () { setTimeout(changed, 300); });
      bus.on('panel.close', function () { setTimeout(changed, 100); });
    }

    function candidates() {
      return panels().map(function (p) {
        var r = recs[p.id];
        var ls = r ? r.text.lines() : [];
        return { key: p.id, label: 'xterm ' + (p.place || p.name || ''), state: 'open', detail: ls.length ? ls[ls.length - 1] : '' };
      });
    }

    function lines(key) {
      var r = recs[key];
      return (r ? r.text.lines() : []).map(function (t) { return { text: t, cls: '' }; });
    }

    return { start: start, candidates: candidates, lines: lines };
  }

  (T.recvSources = T.recvSources || {}).xterm = { create: create };
})(typeof self !== 'undefined' ? self : this);
