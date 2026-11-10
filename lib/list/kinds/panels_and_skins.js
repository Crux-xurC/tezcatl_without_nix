// lib/list/kinds/panels_and_skins.js -- the list kind "panels_and_skins": the launcher (opens a page of list_kinds/panels_and_skins.json).
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;
  // how a tab or a window is opened, and with what settings (config.json launcher): lib/core/open-page.js
  var op = typeof module === 'object' && module.exports ? require('../../core/open-page.js') : Tezcatl.openPage;
  var settings = op.settings(null);
  op.loadSettings().then(function (s) { settings = s; }, function () {});

  // mode: 'tab' | 'window' | null (config.json launcher.open-mode)
  function openPage(it, mode, api) {
    if (!it) return null;
    var r = op.open(it, mode, settings);
    if (api && api.log) api.log((r.ok ? 'opened ' : 'popup blocked: ') + it.id + '  (' + r.plan.mode + ')');
    if (api && api.bus) api.bus.post('launcher.fill', { id: it.id });
    return r.plan;
  }

  kinds.panels_and_skins = {
    fill: function (cfg) {
      var items = (cfg && Array.isArray(cfg.items) && cfg.items) || [];
      return items.map(function (it) {
        return {
          id: it.id,
          label: it.id + (it['class'] === 'skin' ? '  (skin)' : ''),
          sub: it.desc || '',
          raw: it,
        };
      });
    },
    onSelect: function (item, cfg, api) {
      openPage(item && item.raw, null, api);
    },
    onKey: function (chord, item, cfg, api) {
      var mode = cfg && cfg.keys && cfg.keys[chord];
      if (mode) openPage(item && item.raw, mode, api);
    },
  };
})(typeof self !== 'undefined' ? self : this);
