(function (root, factory) {
  const mod = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).ventInit = mod;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const EXPR = '(emacs-vent-send-context)';

  function requestContext(send) {
    const T = (root.Tezcatl = root.Tezcatl || {});
    if (!T.text || !T.protocol || typeof send !== 'function') return false;

    const body = T.text.encode(EXPR);
    if (body.error) return false;

    const seq = [{ key: ':', modifiers: ['meta'] }]
      .concat(body.events)
      .concat([{ key: 'return', modifiers: [] }]);

    return send(T.protocol.encodeInput(seq));
  }

  return { requestContext: requestContext };
});
