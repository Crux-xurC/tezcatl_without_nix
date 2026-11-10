// lib/xipe/xipe-client.js -- thin one-shot client for Xipe Totec's
// wire protocol, spoken over tezcatl's own /xipe relay (lib/relay/
// xipe_socket.exs). Mirrors lib/code/code-editor.js's attachLsp() connection
// shape (relay URL from config.json's connections[0], swap pathname,
// "{kind:...}" control frames before the real protocol starts) but stays
// one-shot rather than a persistent session: open, attach, initialize, send
// exactly one request, resolve with its result, close. There is no
// notify/* subscription here -- a caller that wants live updates (e.g. a
// card re-rendering itself after a `notify/rowChanged`) needs a persistent
// connection, which is a different, not-yet-built shape (see matrix.html's
// kind="xipe" moduledoc note).
//
// Frames on /xipe are exactly two kinds, distinguished the same way
// attachLsp() does it: a plain object with a string "kind" is this relay's
// own control envelope ({"kind":"attach"|"attached"|"error"|"exit"});
// anything else is a verbatim Xipe Totec JSON-RPC frame (request/
// response/notify), forwarded by XipeSocket without re-encoding.

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).xipeClient = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function relayXipeUrl(config) {
    return (config && config.load ? config.load() : Promise.reject(new Error('no Tezcatl.config')))
      .then(function (c) {
        const u = c && c.connections && c.connections[0] && c.connections[0].url;
        if (!u) throw new Error('config.json: no connections[0].url');
        const x = new URL(u);
        x.pathname = '/xipe';
        x.search = '';
        x.hash = '';
        return x.toString();
      });
  }

  // the handshake takes a ticket (lib/core/ticket.js, D-poca-secret); outside
  // a page (the unit tests) there is none to take
  function ticketed(url) {
    const T = typeof self !== 'undefined' && self.Tezcatl;
    return T && T.ticket ? T.ticket.url(url) : Promise.resolve(url);
  }

  // /xipe broadcasts every response to every attached consumer, so ids must
  // be unique across all of them -- a fixed 1/2 would let concurrent calls
  // (several matrix cards, or another tab) resolve with each other's results.
  // A string id (the protocol allows String | integer) with a random per-call tag.
  let seq = 0;
  function mintTag() {
    seq += 1;
    return 'xc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + '-' + seq;
  }

  // request(config, rootKey, method, params) -> Promise<result>
  // `rootKey` is an xipe.json project key at the relay (e.g. "."), not a
  // filesystem path -- the relay resolves it server-side (XipeConfig).
  function request(config, rootKey, method, params) {
    return call(config, rootKey, method, params).then(function (r) { return r.result; });
  }

  // the same, with what `initialize` said of the project open there:
  // -> Promise<{result, project: {id, root} | null}> (root: its directory,
  // absolute -- what a path of card/list / row/list is from)
  function call(config, rootKey, method, params) {
    return relayXipeUrl(config).then(ticketed).then(function (url) {
      return new Promise(function (resolve, reject) {
        const tag = mintTag();
        const initId = tag + '-init';
        const reqId = tag + '-req';
        let settled = false;
        let project = null;
        const ws = new WebSocket(url);

        function fail(err) {
          if (settled) return;
          settled = true;
          try { ws.close(); } catch (_) {}
          reject(err instanceof Error ? err : new Error(String(err)));
        }

        function succeed(result) {
          if (settled) return;
          settled = true;
          try { ws.close(); } catch (_) {}
          resolve(result);
        }

        ws.onopen = function () {
          ws.send(JSON.stringify({ kind: 'attach', root: rootKey }));
        };

        ws.onerror = function () { fail(new Error('xipe: websocket error')); };
        ws.onclose = function () { fail(new Error('xipe: connection closed before a result arrived')); };

        ws.onmessage = function (evt) {
          let o = null;
          try { o = JSON.parse(evt.data); } catch (_) { return; }
          if (!o || typeof o !== 'object') return;

          if (typeof o.kind === 'string') {
            if (o.kind === 'attached') {
              ws.send(JSON.stringify({ jsonrpc: '2.0', id: initId, method: 'initialize', params: {} }));
            } else if (o.kind === 'error') {
              fail(new Error('xipe: ' + o.reason));
            } else if (o.kind === 'exit') {
              fail(new Error('xipe: server exited (' + o.reason + ')'));
            }
            return;
          }

          // A response, correlated by the ids this call minted itself
          // (never the relay's) -- notify/* carries no "id" and is ignored,
          // this being a one-shot fetch, not a live subscription. Responses
          // (errors included) to any other consumer's ids are ignored too.
          if (!('id' in o) || !('result' in o || 'error' in o)) return;
          if (o.id !== initId && o.id !== reqId) return;

          if (o.error) {
            fail(new Error('xipe: ' + (o.error.message || JSON.stringify(o.error))));
          } else if (o.id === initId) {
            project = (o.result && o.result.project) || null;
            ws.send(JSON.stringify({ jsonrpc: '2.0', id: reqId, method: method, params: params || {} }));
          } else {
            succeed({ result: o.result, project: project });
          }
        };
      });
    });
  }

  return { request: request, call: call };
});
