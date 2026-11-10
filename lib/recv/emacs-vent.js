// lib/recv/emacs-vent.js -- emacs-vent as a source of the receiving side
// (output_target/emacs-vent.json; D-unified-dock). The shape is in lib/recv/xterm.js.
//
// One, always: its own WebSocket to the relay (config.json connections), as
// panels/resident/output.html has -- the context (buffer-name / window /
// frame) and the events, one line each (buffer.changed left out, a line the
// same as the one before counted, as output.html does).
(function (root) {
  'use strict';
  var T = (root.Tezcatl = root.Tezcatl || {});
  var KEEP = 200;

  function create() {
    var state = 'connecting';
    var context = null;
    var rec = [];
    var changed = function () {};

    function ts() { return new Date().toTimeString().slice(0, 8); }
    function add(text, cls) {
      var last = rec[rec.length - 1];
      if (last && last.base === text) {
        last.n += 1;
        last.text = ts() + ' ' + text + ' ×' + last.n;
      } else {
        rec.push({ base: text, n: 1, text: ts() + ' ' + text, cls: cls || '' });
        if (rec.length > KEEP) rec.splice(0, rec.length - KEEP);
      }
      changed('emacs');
    }

    function onMessage(m) {
      switch (m.kind) {
        case 'context':
          context = m;
          add('context  ' + m['buffer-name'] + '  ' + m.window + '  ' + m.frame, 'ctx');
          break;
        case 'event':
          if (m.type === 'buffer.changed') break;
          add('[' + (m.source === null ? 'null' : m.source) + '] ' + m.type + (m.content !== undefined ? ' ' + JSON.stringify(m.content) : ''), 'ev');
          break;
        default:
          add(String(m.kind), 'meta');
      }
    }

    function start(onChange) {
      changed = onChange || changed;
      T.ws.connectFromConfig({
        onMessage: onMessage,
        onState: function (s) {
          state = s;
          if (s === 'open') T.ventInit.requestContext(T.ws.send);
          changed();
        },
      });
    }

    function candidates() {
      return [{ key: 'emacs', label: 'emacs-vent', state: state, detail: context ? String(context['buffer-name']) : '' }];
    }

    function lines() { return rec.map(function (r) { return { text: r.text, cls: r.cls }; }); }

    return { start: start, candidates: candidates, lines: lines };
  }

  (T.recvSources = T.recvSources || {})['emacs-vent'] = { create: create };
})(typeof self !== 'undefined' ? self : this);
