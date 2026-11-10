// lib/list/kinds/nav.js -- the list kind "nav": a skin's navigator of panes and windows (answers nav.list).
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  kinds.nav = {
    fill: function (cfg, api) {
      return new Promise(function (resolve) {
        var done = false;
        var off = api.bus.on('nav.list', function (payload) {
          if (done) return;
          done = true;
          off();
          resolve(mapNav(payload && payload.items));
        });
        api.bus.post('nav.list.query');
        setTimeout(function () {
          if (!done) {
            done = true;
            off();
            resolve([]);
          }
        }, 500);
      });
    },
    subscribe: function (cfg, api, onChange) {
      var off = api.bus.on('nav.list', function (payload) {
        onChange(mapNav(payload && payload.items));
      });
      api.bus.post('nav.list.query');
      return off;
    },
    onSelect: function (item, cfg, api) {
      api.bus.post('command', {
        name: 'nav.goto',
        args: { kind: item.kind, id: item.id, name: item.name },
      });
    },
  };

  function mapNav(items) {
    return (items || []).map(function (it) {
      return {
        id: it.id,
        kind: it.kind,
        name: it.name,
        label: it.label || it.name || it.id,
        sub: it.sub || '',
        raw: it,
      };
    });
  }
})(typeof self !== 'undefined' ? self : this);
