// lib/suggest/line.js -- the suggestion source "line" (D-suggestions): the lines
// typed in the input forms, from suggestion/line.json (the table is where
// they are written). ?in=frame,code_editor keeps the rows of those input forms
// only (the dock asks for the ones of its destination); none keeps them all.
//
//   toTable(doc, {in}) -> {columns, rows: [{id, cells}]}   (pure)
//   load(env) -> Promise<table>   env: {getJson(path), params}
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else ((root.Tezcatl = root.Tezcatl || {}).suggestSources = root.Tezcatl.suggestSources || {}).line = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function list(s) { return String(s == null ? '' : s).split(/[\s,]+/).filter(Boolean); }

  function toTable(doc, opts) {
    const want = list(opts && opts.in);
    const rows = [];
    ((doc && doc.rows) || []).forEach((r, i) => {
      if (!r || !r.line) return;
      if (want.length && !list(r.in).some((x) => want.indexOf(x) !== -1)) return;
      rows.push({ id: i + 1, cells: { line: String(r.line), desc: String(r.desc || ''), in: String(r.in || '') } });
    });
    return { columns: (doc && doc.columns) || [{ key: 'line' }, { key: 'desc' }, { key: 'in' }], rows: rows };
  }

  function load(env) {
    return env.getJson('suggestion/line.json').then((doc) => toTable(doc, { in: env.params.get('in') }));
  }

  return { toTable, load };
});
