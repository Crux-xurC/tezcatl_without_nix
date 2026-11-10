// lib/recv/tezcatl.js -- tezcatl as a source of the receiving side
// (output_target/tezcatl.json; D-unified-dock). The shape is in lib/recv/xterm.js.
//
// One, always: what the frame says (its lines and their answers, recv.say).
// Its record is the frame's own receiving side, so lines() is null -- the
// frame shows what it keeps.
(function (root) {
  'use strict';
  var T = (root.Tezcatl = root.Tezcatl || {});

  function create() {
    return {
      start: function () {},
      candidates: function () { return [{ key: 'tezcatl', label: 'tezcatl', state: 'open', detail: 'the frame\'s lines' }]; },
      lines: function () { return null; },
    };
  }

  (T.recvSources = T.recvSources || {}).tezcatl = { create: create };
})(typeof self !== 'undefined' ? self : this);
