// lib/core/ticket.js -- a ticket for a WebSocket to the relay (D-poca-secret).
// A browser's WebSocket cannot carry the X-Poca-Secret header Poca adds to the
// pages' HTTP requests, so every socket first asks the relay for a one-shot
// ticket (GET /ticket, a plain HTTP request that gets the header) and opens
// with ?ticket=... in its URL. A ticket is good for one handshake within
// seconds: every (re)connect takes a new one.
//
//   Tezcatl.ticket.url(wsUrl) -> Promise<string>  wsUrl with its ticket
//
// A relay running without a secret answers {"ticket": null}: the URL is
// returned as it is. So is it when no ticket can be had (the relay is down,
// or refuses: no secret on the request); the handshake then fails as it would
// have, and the caller's reconnect, if any, tries again with a new ticket.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  // ws://127.0.0.1:4100/pty?x -> http://127.0.0.1:4100/ticket
  function ticketUrl(wsUrl) {
    var u = new URL(wsUrl);
    return (u.protocol === 'wss:' ? 'https:' : 'http:') + '//' + u.host + '/ticket';
  }

  function withTicket(wsUrl, ticket) {
    if (typeof ticket !== 'string' || !ticket) return wsUrl;
    var u = new URL(wsUrl);
    u.searchParams.set('ticket', ticket);
    return u.toString();
  }

  function create(deps) {
    return {
      url: function (wsUrl) {
        var at;
        try { at = ticketUrl(wsUrl); } catch (_) { return Promise.resolve(wsUrl); }
        return deps.fetch(at, { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (o) { return withTicket(wsUrl, o && o.ticket); })
          .catch(function () { return wsUrl; });
      },
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { create: create, ticketUrl: ticketUrl, withTicket: withTicket };
  } else {
    Tezcatl.ticket = create({ fetch: function (u, o) { return fetch(u, o); } });
  }
})(typeof self !== 'undefined' ? self : this);
