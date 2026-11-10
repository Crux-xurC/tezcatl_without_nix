// lib/list/kinds/locations.js -- the list kind "locations": places in files (grep results, LSP references); Enter is code.open-at.
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  // Places in files -- {path, line, col, text} -- to go to: a
  // grep (?grep=<pattern>&path=<dir>: the relay's GET /fs/grep) or
  // what a code_editor found (?from=<id>: LSP references, -- asked over
  // the bus, locations.query {id} -> locations.items {id, title, items}).
  // Enter goes there (code.open-at: the code_editor that has the file, or a new
  // one). Read once; `g`... the list is a snapshot, open it again to refresh.
  kinds.locations = (function () {
    function param(api, k) { return api.params && typeof api.params.get === 'function' ? api.params.get(k) : null; }
    function toItem(m, i) {
      return { id: i + ':' + m.path + ':' + m.line + ':' + m.col,
               label: m.path + ':' + m.line + ':' + m.col, sub: m.text || '', raw: m };
    }
    function viaGrep(api, pattern, dir) {
      if (!api.fsBase) return Promise.reject(new Error('config.json has no relay URL'));
      var url = api.fsBase + '/fs/grep?q=' + encodeURIComponent(pattern) + '&path=' + encodeURIComponent(dir || '');
      return fetch(url, { cache: 'no-store' }).then(function (r) {
        return r.json().then(function (b) {
          if (!r.ok) throw new Error((b && b.error) || ('HTTP ' + r.status));
          var where = dir ? dir : '/';
          if (api.log) api.log('grep ' + JSON.stringify(pattern) + ' in ' + where + ' ── ' + b.matches.length + ' match(es)' +
            (b.truncated ? ' (truncated)' : '') + (b.matches.length ? ' ── Enter opens' : ''));
          return b.matches;
        });
      });
    }
    function viaBus(api, id) {
      return new Promise(function (resolve) {
        var done = false;
        var off = api.bus.on('locations.items', function (p) {
          if (done || !p || p.id !== id) return;
          done = true; off();
          var items = Array.isArray(p.items) ? p.items : [];
          if (api.log) api.log((p.title || '') + ' ── ' + items.length + ' item(s)' + (items.length ? ' ── Enter opens' : ''));
          resolve(items);
        });
        api.bus.post('locations.query', { id: id });
        root.setTimeout(function () {
          if (!done) { done = true; off(); if (api.log) api.log('no answer from the code_editor the list came from'); resolve([]); }
        }, 3000);
      });
    }
    return {
      fill: function (cfg, api) {
        var pattern = param(api, 'grep');
        var from = param(api, 'from');
        var p = pattern ? viaGrep(api, pattern, param(api, 'path')) : from ? viaBus(api, from) : Promise.resolve([]);
        return p.then(function (ms) { return ms.map(toItem); }, function (e) {
          if (api.log) api.log('! ' + ((e && e.message) || e));
          return [];
        });
      },
      onSelect: function (item, cfg, api) {
        var m = item && item.raw;
        if (!m || !root.Tezcatl || !root.Tezcatl.commands) return;
        root.Tezcatl.commands.invoke('code.open-at', { path: m.path, line: m.line, col: m.col });
      },
      _toItem: toItem,
    };
  })();
})(typeof self !== 'undefined' ? self : this);
