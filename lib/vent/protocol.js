(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).protocol = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function encodeInput(events) {
    return {
      kind: 'input',
      sequence: events.map(function (e) {
        return { key: e.key, modifiers: e.modifiers.slice() };
      }),
    };
  }

  function parseMessage(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch (_) {
      return null;
    }
    if (msg && typeof msg === 'object' && !Array.isArray(msg) &&
        typeof msg.kind === 'string') {
      return msg;
    }
    return null;
  }

  return { encodeInput: encodeInput, parseMessage: parseMessage };
});
