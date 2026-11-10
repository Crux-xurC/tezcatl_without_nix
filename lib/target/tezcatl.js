// lib/target/tezcatl.js -- tezcatl itself as a destination of input_target
// (input_target/tezcatl.json; D-unified-dock): the line is a command line of the
// skin the input_target is in (the frame's `skin add …`, `:e …`, `:` …), run
// through the skin port (runLine). The shape is in lib/target/emacs-vent.js.
//
// One, there when the skin runs lines. A line is chars only: a key with a
// modifier, or a named key (;e ;h …), is refused (write ;; for a ";").
// Returns at the end are the line's end and dropped: a line pasted with its
// newline (lead.escape makes it ;e) runs as typed.
(function (root) {
  'use strict';
  var T = (root.Tezcatl = root.Tezcatl || {});

  function create() {
    function port() {
      var p = T.skinPort.of(window);
      return p && typeof p.runLine === 'function' ? p : null;
    }

    function candidates() {
      var p = port();
      return [{
        key: 'tezcatl',
        label: 'tezcatl',
        state: p ? 'open' : 'closed',
        detail: p ? 'the skin\'s commands' : '(no skin that runs lines)',
        lines: ['the commands of the skin: skin …, :e …, : (the map), go on …'],
      }];
    }

    function send(_key, events) {
      var p = port();
      if (!p) return Promise.resolve({ ok: false, error: 'tezcatl: no skin here runs lines' });
      var n = events.length;
      while (n > 0 && events[n - 1].key === 'return' && !(events[n - 1].modifiers || []).length) n--;
      if (!n) return Promise.resolve({ ok: false, error: 'tezcatl: an empty line' });
      var text = '';
      for (var i = 0; i < n; i++) {
        var e = events[i];
        if ((e.modifiers && e.modifiers.length) || Array.from(e.key).length !== 1) {
          return Promise.resolve({ ok: false, error: 'tezcatl takes a line of chars, not ' + T.lead.describe([e]) });
        }
        text += e.key;
      }
      p.runLine(text);
      return Promise.resolve({ ok: true });
    }

    return { start: function () {}, candidates: candidates, send: send };
  }

  (T.targets = T.targets || {}).tezcatl = { create: create };
})(typeof self !== 'undefined' ? self : this);
