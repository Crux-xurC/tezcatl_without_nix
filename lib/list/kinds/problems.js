// lib/list/kinds/problems.js -- the list kind "problems": the diagnostics of the code_editor open now (code.here's diagnostics); Enter goes to the line.
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  // The language servers' diagnostics of every file open in a code_editor
  // (problems): asked as the logbook asks -- code.query,
  // whose code.here answers carry each code_editor's diagnostics -- every pollMs.
  // Only open files (a language server mostly diagnoses those; the whole
  // project is the build's job, compile.run). Errors first, then by file and
  // line. Enter: that code_editor to the front, at the line.
  kinds.problems = (function () {
    var RANK = { error: 0, warning: 1, info: 2, hint: 3 };
    var MARK = { error: 'E', warning: 'W', info: 'I', hint: 'H' };
    function locate() { return root.Tezcatl && root.Tezcatl.codeLocate; }
    function env(api) {
      return { bus: api.bus, setTimeout: function (fn, ms) { return root.setTimeout(fn, ms); },
               open: function () { return null; }, sibling: function (r) { return r; } };
    }
    // code.here answers -> list items (pure)
    function rows(list) {
      var out = [];
      (list || []).forEach(function (c) {
        (c && Array.isArray(c.diagnostics) ? c.diagnostics : []).forEach(function (d) {
          var sev = RANK[d.severity] != null ? d.severity : 'error';
          out.push({
            id: c.id + ':' + d.line + ':' + d.col + ':' + out.length,
            label: MARK[sev] + ' ' + (c.path || '(no path)') + ':' + d.line + ':' + d.col + '  ' + String(d.message || '').split('\n')[0],
            sub: (d.source ? d.source + ' · ' : '') + (c.name || ''),
            raw: { code: c.id, name: c.name, path: c.path, line: d.line, col: d.col, severity: sev },
          });
        });
      });
      return out.sort(function (a, b) {
        var x = a.raw, y = b.raw;
        if (RANK[x.severity] !== RANK[y.severity]) return RANK[x.severity] - RANK[y.severity];
        if ((x.path || '') !== (y.path || '')) return (x.path || '') < (y.path || '') ? -1 : 1;
        return x.line - y.line || x.col - y.col;
      });
    }
    function fill(cfg, api) {
      if (!locate()) return Promise.resolve([]);
      return locate().query(env(api)).then(rows);
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
        var m = item && item.raw;
        if (!locate() || !m) return;
        var e = env(api);
        return locate().reveal(e, m.code).then(function (r) {
          locate().goto(e, m.code, m.line, m.col);
          if (api.log) api.log(r.focused ? '' : 'could not bring the window of ' + (m.path || m.name) + ' forward (a browser limit) ── switch to it yourself');
        });
      },
      _rows: rows,
    };
  })();
})(typeof self !== 'undefined' ? self : this);
