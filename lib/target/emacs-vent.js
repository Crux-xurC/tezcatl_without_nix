// lib/target/emacs-vent.js -- emacs-vent as a destination of input_target
// (input_target/emacs-vent.json; D-lead-key).
//
// A destination registers Tezcatl.targets[<id>] = {create(ctx)}; create gives
//   start(changed)          connect / watch; changed() whenever candidates() moved
//   candidates()            [{key, label, state, detail, lines}] -- the ones there now
//                           (state 'open' when keys can go; key picks one in send)
//   send(key, events)       -> Promise<{ok, error}>: hand the key events over unread
// ctx: {siblings()} -- the panels of the same skin ([] alone in a window).
//
// For emacs-vent: one, always. One WebSocket to the relay (config.json
// connections), the context (buffer-name / window / frame) asked for on open and
// kept from every `context` message, events through the (empty) middleware.
(function (root) {
  'use strict';
  var T = (root.Tezcatl = root.Tezcatl || {});

  function create() {
    var state = 'connecting';
    var context = null;
    var changed = function () {};

    function start(onChange) {
      changed = onChange || changed;
      T.ws.connectFromConfig({
        onMessage: function (m) {
          if (m.kind === 'context') { context = m; changed(); }
        },
        onState: function (s) {
          state = s;
          if (s === 'open') T.ventInit.requestContext(T.ws.send);
          changed();
        },
      });
    }

    function candidates() {
      return [{
        key: 'emacs',
        label: 'emacs-vent',
        state: state,
        detail: context ? String(context['buffer-name']) : '',
        lines: context ? [
          'buffer-name: ' + context['buffer-name'],
          'window:      ' + context.window,
          'frame:       ' + context.frame,
        ] : ['(no context yet)'],
      }];
    }

    function send(_key, events) {
      if (state !== 'open') return Promise.resolve({ ok: false, error: 'emacs-vent is not connected (' + state + ')' });
      var msg = T.protocol.encodeInput(T.middleware.run(events, context));
      return Promise.resolve(T.ws.send(msg) ? { ok: true } : { ok: false, error: 'emacs-vent: the send failed' });
    }

    return { start: start, candidates: candidates, send: send };
  }

  (T.targets = T.targets || {})['emacs-vent'] = { create: create };
})(typeof self !== 'undefined' ? self : this);
