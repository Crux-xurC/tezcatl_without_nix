// lib/list/kinds/w_list.js -- the list kind "w_list": the relay's windows (GET /windows); Enter brings one forward, Del closes it.
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  kinds.w_list = {
    fill: function (cfg, api) {
      return fetchWindows(api).then(function (rows) {
        return rows.map(function (w) {
          return {
            id: w.id || '(no id):' + w.name,
            label: w.name || '(no name)',
            sub: w.id || '(no id — not evictable)',
            raw: w,
          };
        });
      });
    },
    subscribe: function (cfg, api, onChange) {
      var ms = (cfg && cfg.pollMs) || 1500;
      var stop = false;
      var t = null;
      function tick() {
        if (stop) return;
        kinds.w_list.fill(cfg, api).then(function (items) {
          if (!stop) onChange(items);
          t = setTimeout(tick, ms);
        }, function () {
          t = setTimeout(tick, ms);
        });
      }
      tick();
      return function () {
        stop = true;
        if (t) clearTimeout(t);
      };
    },
    remove: function (item, cfg, api) {
      var id = item && item.raw && item.raw.id;
      if (!id || !api.windowsUrl) {
        api.log && api.log('not evictable: ' + (item && item.label));
        return;
      }
      return fetch(api.windowsUrl + '/' + encodeURIComponent(id), {
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
              (res.ok ? 'evicted ' : 'evict failed ') +
                (item.raw.name || id) +
                (res.body ? '  ' + JSON.stringify(res.body) : ''),
            );
        });
    },
    onSelect: function (item, cfg, api) {
      api.bus.post('command', {
        name: 'nav.goto',
        args: {
          kind: 'window',
          id: item.raw && item.raw.id,
          name: item.raw && item.raw.name,
        },
      });
    },
  };


  function fetchWindows(api) {
    if (!api.windowsUrl) return Promise.resolve([]);
    return fetch(api.windowsUrl, { cache: 'no-store' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (b) {
        return b && Array.isArray(b.windows) ? b.windows : [];
      })
      .catch(function () {
        return [];
      });
  }
})(typeof self !== 'undefined' ? self : this);
