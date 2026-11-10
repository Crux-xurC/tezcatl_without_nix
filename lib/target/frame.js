// lib/target/frame.js -- another frame as a destination of input_target
// (input_target/frame.json; D-bridge): a line sent here runs in that frame, as
// one typed in its own input form (`skin add …`, `:e …`, `intent …`). The dock
// of one frame drives another -- in another tab, Poca's split view -- and the
// receiving side follows with that frame's lines (lib/recv/frame.js). The
// shape is in lib/target/emacs-vent.js.
//
// One candidate per frame open anywhere but the one this input_target is in:
// frame.ask (to every window) -> frame.here {name} from each frame, asked when
// the list starts and every few seconds (a frame closed drops out). A line is
// chars only, as for tezcatl (lib/target/tezcatl.js): a key with a modifier, or
// a named key, is refused; returns at the end are the line's end.
(function (root) {
  'use strict';
  var T = (root.Tezcatl = root.Tezcatl || {});
  var POLL_MS = 3000;
  var GONE_MS = 7000;   // a frame that did not answer two asks is gone

  // the frame this page is a panel of (its bus id), null alone in a window
  function hostId(w) {
    try {
      var h = w && w.parent && w.parent !== w ? w.parent : null;
      return h && h.Tezcatl && h.Tezcatl.bus && h.Tezcatl.bus.self ? h.Tezcatl.bus.self.id : null;
    } catch (_) { return null; }
  }

  // events -> {text} | {error}: the line as tezcatl takes it
  function lineOf(events) {
    var n = events.length;
    while (n > 0 && events[n - 1].key === 'return' && !(events[n - 1].modifiers || []).length) n--;
    if (!n) return { error: 'frame: an empty line' };
    var text = '';
    for (var i = 0; i < n; i++) {
      var e = events[i];
      if ((e.modifiers && e.modifiers.length) || Array.from(e.key).length !== 1) {
        return { error: 'a frame takes a line of chars, not ' + (T.lead ? T.lead.describe([e]) : e.key) };
      }
      text += e.key;
    }
    return { text: text };
  }

  // the frames answering frame.ask, kept by bus id: {id -> {name, at}}
  function roster(opts) {
    var o = opts || {};
    var bus = o.bus || T.bus;
    var now = o.now || Date.now;
    var self = o.self === undefined ? hostId(root) : o.self;
    var known = {};
    var changed = function () {};

    function ask() {
      bus.post('frame.ask', {});
      var t = now();
      var gone = Object.keys(known).filter(function (id) { return t - known[id].at > GONE_MS; });
      gone.forEach(function (id) { delete known[id]; });
      if (gone.length) changed();
    }

    function start(onChange) {
      changed = onChange || changed;
      bus.onMine('frame.here', function (p, meta) {
        var id = meta && meta.from && meta.from.id;
        if (!id || id === self) return;
        var name = p && typeof p.name === 'string' && p.name ? p.name : '(unnamed)';
        var was = known[id];
        known[id] = { name: name, at: now() };
        if (!was || was.name !== name) changed(id);
      });
      if (o.poll !== false) setInterval(ask, POLL_MS);
      ask();
    }

    function list() {
      return Object.keys(known).map(function (id) { return { id: id, name: known[id].name }; })
        .sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1; });
    }

    return { start: start, ask: ask, list: list, has: function (id) { return !!known[id]; } };
  }

  function create() {
    var bus = T.bus;
    var r = roster({ bus: bus });

    function candidates() {
      return r.list().map(function (f) {
        return { key: f.id, label: 'frame ' + f.name, state: 'open', detail: 'its commands',
                 lines: ['the frame ' + f.name + ' (another tab or window): skin …, :e …, intent …'] };
      });
    }

    function send(key, events) {
      if (!r.has(key)) return Promise.resolve({ ok: false, error: 'that frame is gone: choose a destination again' });
      var l = lineOf(events);
      if (l.error) return Promise.resolve({ ok: false, error: l.error });
      bus.post('skin.line', { line: l.text }, { to: key });
      return Promise.resolve({ ok: true });
    }

    return { start: function (changed) { r.start(changed); }, candidates: candidates, send: send };
  }

  var api = { create: create, roster: roster, lineOf: lineOf, hostId: hostId };
  (T.targets = T.targets || {}).frame = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
