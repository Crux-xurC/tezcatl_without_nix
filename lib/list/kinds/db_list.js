// lib/list/kinds/db_list.js -- the list kind "db_list": the database windows
// (D-db-session), the relay's ledger GET /sql/windows -- number, account,
// database, state; never a password. Del logs that window out (db.exit over the
// bus: the window does it itself, as `db exit <n>`). Read again when a window
// says something changed (db.changed), and every pollMs.
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  // a ledger row -> a list item
  function item(w) {
    return {
      id: 'db' + w.id,
      label: 'db ' + w.id + (w.id === 1 ? ' (intents)' : '') + '  ' + (w.state || '?'),
      sub: (w.account ? w.account + '@' : '') + (w.database || '') + (w.connection_id ? '  #' + w.connection_id : ''),
      raw: w,
    };
  }

  kinds.db_list = {
    item: item,
    fill: function (cfg, api) {
      if (!api.fsBase) return Promise.resolve([]);
      return fetch(api.fsBase + '/sql/windows', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (b) {
          var ws = b && Array.isArray(b.windows) ? b.windows.slice() : [];
          ws.sort(function (a, c) { return a.id - c.id; });
          return ws.map(item);
        })
        .catch(function () { return []; });
    },
    subscribe: function (cfg, api, onChange) {
      var ms = (cfg && cfg.pollMs) || 10000;
      var stop = false;
      var t = null;
      function tick() {
        if (stop) return;
        if (t) clearTimeout(t);
        kinds.db_list.fill(cfg, api).then(function (items) { if (!stop) onChange(items); });
        t = setTimeout(tick, ms);
      }
      var off = api.bus.on('db.changed', function () { setTimeout(tick, 150); });
      tick();
      return function () { stop = true; if (t) clearTimeout(t); off(); };
    },
    remove: function (item, cfg, api) {
      var id = item && item.raw && item.raw.id;
      if (!id) return;
      api.bus.post('db.exit', { req: 'dblist-' + Date.now().toString(36), id: id });
      api.log && api.log('db exit ' + id + ' asked');
    },
  };
})(typeof self !== 'undefined' ? self : this);
