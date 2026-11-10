// lib/recv/frame.js -- another frame as a source of the receiving side
// (output_target/frame.json; D-bridge): what that frame says (its lines and their
// answers, recv.out), so that the dock which sends lines to it (lib/target/frame.js,
// the same id: the receiving side follows where the input goes) reads its answers.
// The shape is in lib/recv/xterm.js.
//
// One candidate per frame open anywhere but this one (the roster of
// lib/target/frame.js); one record per frame, from when this one was opened.
(function (root) {
  'use strict';
  var T = (root.Tezcatl = root.Tezcatl || {});
  var KEEP = 200;

  function create(opts) {
    var o = opts || {};
    var bus = o.bus || T.bus;
    var r = (o.roster || T.targets.frame.roster)({ bus: bus, self: o.self });
    var recs = {};   // frame bus id -> [{text, cls}]
    var changed = function () {};

    function start(onChange) {
      changed = onChange || changed;
      r.start(function () { changed(); });
      bus.on('recv.out', function (p, meta) {
        var id = meta && meta.from && meta.from.id;
        if (!id || !p || typeof p.text !== 'string' || !r.has(id)) return;
        var rec = recs[id] || (recs[id] = []);
        String(p.text).split('\n').forEach(function (t) { rec.push({ text: t, cls: p.cls || '' }); });
        if (rec.length > KEEP) rec.splice(0, rec.length - KEEP);
        changed(id);
      });
    }

    function candidates() {
      return r.list().map(function (f) {
        var rec = recs[f.id] || [];
        return { key: f.id, label: 'frame ' + f.name, state: 'open', detail: rec.length ? rec[rec.length - 1].text : '' };
      });
    }

    function lines(key) { return (recs[key] || []).slice(); }

    return { start: start, candidates: candidates, lines: lines };
  }

  var api = { create: create };
  (T.recvSources = T.recvSources || {}).frame = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
