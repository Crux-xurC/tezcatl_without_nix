// lib/list/kinds/lsp.js -- the list kind "lsp": the language servers running (GET/DELETE /lsp/servers).
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  // Running language servers -- GET/DELETE /lsp/servers, derived from the same
  // relay URL as w_list. A server is started by an editor attaching over /lsp;
  // this panel observes and stops.
  function lspUrl(api) {
    return api.windowsUrl ? api.windowsUrl.replace(/\/windows$/, '/lsp/servers') : null;
  }
  function shortRoot(p) {
    if (typeof p !== 'string') return '';
    var parts = p.split('/').filter(Boolean);
    return parts.length <= 3 ? p : '…/' + parts.slice(-3).join('/');
  }

  kinds.lsp = {
    fill: function (cfg, api) {
      var url = lspUrl(api);
      if (!url) return Promise.resolve([]);
      return fetch(url, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (b) {
          var rows = (b && Array.isArray(b.servers)) ? b.servers : [];
          return rows.map(function (s) {
            return {
              id: s.key,
              label: s.serverId + '  ' + shortRoot(s.root),
              sub: s.status +
                ' · ' + s.consumers + ' pane' + (s.consumers === 1 ? '' : 's') +
                ' · ' + s.docs + ' doc' + (s.docs === 1 ? '' : 's') +
                (s.pid ? ' · pid ' + s.pid : ''),
              raw: s,
            };
          });
        })
        .catch(function () { return []; });
    },
    subscribe: function (cfg, api, onChange) {
      var ms = (cfg && cfg.pollMs) || 1500;
      var stop = false;
      var t = null;
      function tick() {
        if (stop) return;
        kinds.lsp.fill(cfg, api).then(function (items) {
          if (!stop) onChange(items);
          t = setTimeout(tick, ms);
        }, function () {
          t = setTimeout(tick, ms);
        });
      }
      tick();
      return function () { stop = true; if (t) clearTimeout(t); };
    },
    remove: function (item, cfg, api) {
      var key = item && item.raw && item.raw.key;
      var url = lspUrl(api);
      if (!key || !url) { api.log && api.log('not stoppable'); return; }
      return fetch(url + '/' + encodeURIComponent(key), {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      })
        .then(function (r) {
          return r.json().then(
            function (b) { return { ok: r.ok, body: b }; },
            function () { return { ok: r.ok, body: null }; },
          );
        })
        .then(function (res) {
          api.log &&
            api.log(
              (res.ok ? 'stopped ' : 'stop failed ') +
                ((item.raw && item.raw.serverId) || key) +
                (res.body ? '  ' + JSON.stringify(res.body) : ''),
            );
        });
    },
    onSelect: function (item, cfg, api) {
      var s = item && item.raw;
      if (s && api.log) {
        api.log(s.serverId + '  root=' + s.root + '  status=' + s.status +
          '  key=' + s.key);
      }
    },
  };
})(typeof self !== 'undefined' ? self : this);
