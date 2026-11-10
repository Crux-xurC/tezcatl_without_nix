// lib/list/kinds/code_windows.js -- the list kind "code_windows": the code_editor open now (code.query); Enter goes there.
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  // The code_editor windows open now (lib/code/code-locate.js): each
  // answers code.query with its path; Enter brings it to the front (inside a
  // skin, the skin focuses its pane). Read again every pollMs.
  kinds.code_windows = (function () {
    function locate() { return root.Tezcatl && root.Tezcatl.codeLocate; }
    function env(api) {
      return { bus: api.bus, setTimeout: function (fn, ms) { return root.setTimeout(fn, ms); },
               open: function () { return null; }, sibling: function (r) { return r; } };
    }
    function toItem(c) {
      return { id: c.id, label: (c.dirty ? '● ' : '') + (c.path || '(no path)'), sub: c.name || '', raw: c };
    }
    function fill(cfg, api) {
      if (!locate()) return Promise.resolve([]);
      return locate().query(env(api)).then(function (list) {
        return list.slice().sort(function (a, b) {
          var x = (a.path || '') + ' ' + (a.name || ''), y = (b.path || '') + ' ' + (b.name || '');
          return x < y ? -1 : x > y ? 1 : 0;
        }).map(toItem);
      });
    }
    return {
      fill: fill,
      subscribe: function (cfg, api, onChange) {
        var ms = (cfg && cfg.pollMs) || 1500;
        var stop = false;
        var t = null;
        function tick() {
          if (stop) return;
          fill(cfg, api).then(function (items) { if (!stop) onChange(items); t = root.setTimeout(tick, ms); },
                              function () { t = root.setTimeout(tick, ms); });
        }
        t = root.setTimeout(tick, ms);
        return function () { stop = true; if (t) root.clearTimeout(t); };
      },
      onSelect: function (item, cfg, api) {
        if (!locate() || !item || !item.raw) return;
        return locate().reveal(env(api), item.raw.id).then(function (r) {
          if (api.log) api.log(r.focused ? '' : 'could not bring the window of ' + (item.raw.path || item.raw.name) + ' forward (a browser limit) ── switch to it yourself');
        });
      },
      _toItem: toItem,
    };
  })();
})(typeof self !== 'undefined' ? self : this);
