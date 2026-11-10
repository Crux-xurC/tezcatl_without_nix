// lib/xipe/xipe-session.js -- a persistent client for tezcatl's /xipe relay
// (lib/relay/xipe_socket.exs), for a skin that keeps one connection open
// while it lives (the Xipe dialogue window). Unlike the
// one-shot lib/xipe/xipe-client.js, it stays attached: every notify/* the server
// broadcasts reaches it, and it can send many requests.
//
// Like emacs-vent's single `input` kind, the dialogue window sends only one
// method, `input` {text: <the line as typed>} -- tezcatl never interprets
// the line; Xipe Totec decides whether it answers a held dialogue or runs a
// command.
//
// /xipe is a stateless broadcast relay: every consumer sees
// every response, so ids carry a random per-session tag and a response to
// any other id -- errors included -- is ignored. Frames on /xipe are the
// relay's own {kind: attach|attached|error|exit} envelope, or verbatim
// JSON-RPC.

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).xipeSession = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RECONNECT_MS = 2000;

  function relayXipeUrl(cfg) {
    const u = cfg && cfg.connections && cfg.connections[0] && cfg.connections[0].url;
    if (!u) throw new Error('config.json: no connections[0].url');
    const x = new URL(u);
    x.pathname = '/xipe';
    x.search = '';
    x.hash = '';
    return x.toString();
  }

  // opts: { url, root: "<xipe.json key>", on: {state, reply, notify, info},
  //         WebSocket (tests), reconnectMs }
  function create(opts) {
    const on = opts.on || {};
    const WS = opts.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    const reconnectMs = opts.reconnectMs == null ? RECONNECT_MS : opts.reconnectMs;
    const tag = 'xs-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    let seq = 0;
    let ws = null;
    let ready = false;
    let closedByUser = false;
    let initId = null;
    const pending = {};   // id -> method
    const queue = [];     // frames waiting for ready

    function emit(name, arg) {
      if (typeof on[name] === 'function') { try { on[name](arg); } catch (_) {} }
    }

    function mint() { seq += 1; return tag + '-' + seq; }

    function open() {
      ready = false;
      emit('state', 'connecting');
      ws = new WS(opts.url);
      ws.onopen = function () { ws.send(JSON.stringify({ kind: 'attach', root: opts.root || '.' })); };
      ws.onmessage = function (evt) { handle(evt.data); };
      ws.onclose = function () {
        ready = false;
        emit('state', 'closed');
        if (!closedByUser && reconnectMs > 0) setTimeout(function () { if (!closedByUser) open(); }, reconnectMs);
      };
      ws.onerror = function () {};
    }

    function handle(data) {
      let o = null;
      try { o = JSON.parse(data); } catch (_) { return; }
      if (!o || typeof o !== 'object') return;

      if (typeof o.kind === 'string') {
        if (o.kind === 'attached') {
          // again on an open socket: the relay's upstream reconnected (Xipe
          // Totec restarted) and the new connection is not initialized.
          // Hold sends until it is; replies to what was in flight went with
          // the old connection.
          if (ready) {
            ready = false;
            emit('state', 'connecting');
            const ids = Object.keys(pending);
            const lost = ids.length;
            ids.forEach(function (id) { delete pending[id]; });
            // ids: the requests that will get no answer (whoever waits for one is told)
            emit('info', { kind: 'reattached', reason: lost ? lost + ' request(s) still unanswered will get no answer' : '', ids: ids });
          }
          initId = mint();
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: initId, method: 'initialize', params: {} }));
        } else if (o.kind === 'error' || o.kind === 'exit') {
          emit('info', { kind: o.kind, reason: o.reason });
        }
        return;
      }

      if ('method' in o && !('id' in o)) { emit('notify', { method: o.method, params: o.params }); return; }
      if (!('id' in o) || !('result' in o || 'error' in o)) return;

      if (o.id === initId) {
        initId = null;
        if (o.error) { emit('info', { kind: 'error', reason: 'initialize: ' + (o.error.message || JSON.stringify(o.error)) }); return; }
        ready = true;
        emit('state', 'open');
        emit('info', { kind: 'initialized', project: o.result && o.result.project });
        while (queue.length) ws.send(queue.shift());
        return;
      }

      if (!Object.prototype.hasOwnProperty.call(pending, o.id)) return;   // another consumer's
      const method = pending[o.id];
      delete pending[o.id];
      emit('reply', {
        id: o.id, method: method,
        result: o.result, error: o.error || null,
        dialogue: o.dialogue || null,
      });
    }

    function send(method, params) {
      const id = mint();
      pending[id] = method;
      const frame = JSON.stringify({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
      if (ready) ws.send(frame); else queue.push(frame);
      return id;
    }

    open();

    return {
      send: send,
      input: function (text) { return send('input', { text: String(text) }); },
      isReady: function () { return ready; },
      close: function () { closedByUser = true; try { ws.close(); } catch (_) {} },
    };
  }

  return { create: create, relayXipeUrl: relayXipeUrl };
});
