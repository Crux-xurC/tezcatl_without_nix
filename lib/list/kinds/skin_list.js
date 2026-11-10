// lib/list/kinds/skin_list.js -- the list kind "skin_list": the skins kept by
// `skin save` (~work/store/frame-skins.json, lib/core/store.js; D-frame).
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
//
// A row is a skin: its name, then its lines (how many, how many are empty),
// its axis, its ratios and the panels of each line. A panel kept under a name
// that has since changed (lib/skin/frame-layout.js RENAMED: code_vi ->
// code_editor) is marked: `skin read` takes it under the new name, and a
// `skin save` afterwards writes the new one.
//   Enter  the skin in a new frame window (frame.html?skin=<name>), this list stays
//   M-r    the skin read into the frame focused last (skin.read = `skin read <name>`)
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;
  function layout() {
    if (typeof module === 'object' && module.exports) return require('../../skin/frame-layout.js');
    return Tezcatl.frameLayout || null;
  }

  kinds.skin_list = (function () {
    var KEY = 'tezcatl:frame:skins';

    // a saved skin (what `skin save` keeps) -> {lines, empty, axis, ratio, panels: [[name]], renamed: [old]}
    function summary(json) {
      var j = json && typeof json === 'object' ? json : {};
      var cols = Array.isArray(j.columns) ? j.columns : [];
      var renamedTable = (layout() && layout().RENAMED) || {};
      var renamed = [];
      var panels = cols.map(function (col) {
        return (Array.isArray(col) ? col : []).filter(function (p) { return Array.isArray(p) && typeof p[0] === 'string'; })
          .map(function (p) {
            if (renamedTable[p[0]] && renamed.indexOf(p[0]) < 0) renamed.push(p[0]);
            return p[0];
          });
      });
      return {
        lines: cols.length,
        empty: panels.filter(function (ps) { return !ps.length; }).length,
        axis: j.axis === 'v' ? 'v' : 'h',
        ratio: Array.isArray(j.ratio) ? j.ratio.slice() : [],
        panels: panels,
        renamed: renamed,
      };
    }

    function toItem(name, json) {
      var s = summary(json);
      var renamedTable = (layout() && layout().RENAMED) || {};
      var lines = s.lines + ' line' + (s.lines === 1 ? '' : 's') + (s.empty ? ' (' + s.empty + ' empty)' : '');
      var sub = lines + ' · axis ' + s.axis + ' · ' + (s.ratio.length ? s.ratio.join(':') : '-') + ' · ' +
        s.panels.map(function (ps) { return ps.length ? ps.join(', ') : '(empty)'; }).join(' | ');
      if (s.renamed.length) {
        sub += '  ⚠ old name: ' + s.renamed.map(function (o) { return o + ' → ' + renamedTable[o]; }).join(', ') + ' (skin save after reading writes the new one)';
      }
      return { id: name, label: name, sub: sub, raw: { name: name, summary: s } };
    }

    // the saved skins (a map name -> skin) -> rows, by name
    function toItems(map) {
      var m = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
      return Object.keys(m).sort().map(function (n) { return toItem(n, m[n]); });
    }

    function store() { return root.Tezcatl && root.Tezcatl.store; }

    function fill() {
      if (!store()) return Promise.resolve([]);
      return store().load(KEY).then(toItems, function () { return []; });
    }

    var openSettings = null;
    function openSkin(name, api) {
      var op = root.Tezcatl && root.Tezcatl.openPage;
      if (!op) { if (api.log) api.log('! lib/core/open-page.js is missing'); return; }
      var r = op.open('panels/skins/frame.html?skin=' + encodeURIComponent(name), null, openSettings);
      if (api.log) api.log(r && r.error ? '! ' + r.error : 'skin "' + name + '" in a new frame window');
    }

    return {
      fill: fill,
      subscribe: function (cfg, api, onChange) {
        var op = root.Tezcatl && root.Tezcatl.openPage;
        if (op && op.loadSettings) op.loadSettings().then(function (s) { openSettings = s; }, function () {});
        var ms = (cfg && cfg.pollMs) || 3000;
        var stop = false;
        var t = null;
        function tick() {
          if (stop) return;
          fill().then(function (items) { if (!stop) onChange(items); t = root.setTimeout(tick, ms); },
                      function () { t = root.setTimeout(tick, ms); });
        }
        t = root.setTimeout(tick, ms);
        return function () { stop = true; if (t) root.clearTimeout(t); };
      },
      onSelect: function (item, cfg, api) {
        if (item && item.raw) openSkin(item.raw.name, api);
      },
      onKey: function (chord, item, cfg, api) {
        if (!item || !item.raw || !cfg || !cfg.keys || cfg.keys[chord] !== 'read') return;
        var name = item.raw.name;
        if (!/^\S+$/.test(name)) { if (api.log) api.log('! "' + name + '" has a blank: open it with Enter (a new window)'); return; }
        var C = api.commands || (root.Tezcatl && root.Tezcatl.commands);
        if (!C) { if (api.log) api.log('! lib/core/commands.js is missing'); return; }
        C.invoke('skin.read', { name: name }, { onNone: function () { if (api.log) api.log('! no frame takes skin.read ── open it with Enter'); } });
        if (api.log) api.log('skin read ' + name + ' ── in the frame focused last');
      },
      _summary: summary,
      _toItem: toItem,
      _toItems: toItems,
    };
  })();
})(typeof self !== 'undefined' ? self : this);
