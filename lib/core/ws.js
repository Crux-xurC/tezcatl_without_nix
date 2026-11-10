(function (root) {
  'use strict';
  const Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  // config.json unreadable: the relay (emacs-vent's own :4000 refuses browsers)
  const DEFAULT_URL = 'ws://127.0.0.1:4100/';

  let sock = null;
  let handlers = { onMessage: function () {}, onState: function () {} };

  const clientId = (function () {
    try {
      if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    } catch (_) {}
    return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  })();

  function withName(url) {
    try {
      const search = (typeof location !== 'undefined' && location.search) || '';
      const name = new URLSearchParams(search).get('name');
      if (!name) return url;
      const u = new URL(url);
      u.searchParams.set('name', name);
      u.searchParams.set('id', clientId);
      return u.toString();
    } catch (_) {
      return url;
    }
  }

  function firstConnectionUrl(cfg) {
    var list = cfg && cfg.connections;
    if (!Array.isArray(list) || list.length === 0) return null;
    var first = list[0];
    var url = first && typeof first.url === 'string' && first.url.trim();
    return url || null;
  }

  function loadUrl() {
    return Tezcatl.config.load()
      .then(function (cfg) {
        var url = firstConnectionUrl(cfg);
        if (!url) {
          console.error(
            'config.json: connections[0].url is missing or empty; not connecting',
          );
        }
        return url;
      })
      .catch(function (e) {
        console.warn('config.json unavailable, using default url', e);
        return DEFAULT_URL;
      });
  }

  function connect(url, h) {
    handlers = h;
    open(url);
  }

  function connectFromConfig(h) {
    handlers = h;
    loadUrl().then(function (url) {
      if (url) { open(url); return; }
      handlers.onState('no-config');
    });
  }

  // every (re)connect with a new ticket (lib/core/ticket.js, D-poca-secret)
  function open(url) {
    const target = withName(url);
    handlers.onState('connecting', target);
    Tezcatl.ticket.url(target).then(function (ticketed) {
      sock = new WebSocket(ticketed);

      sock.onopen = function () { handlers.onState('open', url); };

      sock.onclose = function () {
        handlers.onState('closed', url);
        setTimeout(function () { open(url); }, 2000);
      };

      sock.onerror = function () { sock.close(); };

      sock.onmessage = function (evt) {
        const msg = Tezcatl.protocol.parseMessage(evt.data);
        if (msg) handlers.onMessage(msg);
      };
    });
  }

  function send(obj) {
    if (!sock || sock.readyState !== WebSocket.OPEN) return false;
    sock.send(JSON.stringify(obj));
    return true;
  }

  function isOpen() {
    return !!sock && sock.readyState === WebSocket.OPEN;
  }

  Tezcatl.ws = {
    connect: connect,
    connectFromConfig: connectFromConfig,
    send: send,
    isOpen: isOpen,
    DEFAULT_URL: DEFAULT_URL,
  };
})(typeof self !== 'undefined' ? self : this);
