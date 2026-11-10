// lib/xipe/xipe-rows.js -- matrix.html's kind="xipe_rows" adapter logic (pure):
// Xipe Totec's row/list result -> the generic grid's {columns, rows}
// (the shell never learns what a row means; this does).
//
// Each calc row becomes one sentence, "<label> (<args>) → <value>",
// from row/list's structured fields -- no Xipe Totec text is parsed. A long
// value (a 4x4 matrix, a stack trace) must not stretch the grid: the page
// clamps cells, and the *shape* summary ("list 4×4") is Xipe Totec's to
// give, since only the REPL holding the value knows it -- when a row
// carries `summary` (for the value) / `args_summary` (per argument), those
// are used instead of the raw text. (xipe_totec: not provided yet.)
//
// `node` column : row/list's `linked` -- whether
// the row's function still exists. A rescan can remove it and leave the
// row's `state` at "ok"; this column is what tells. "ok" / "gone", or
// empty when the result doesn't carry `linked` (an older Xipe Totec).
//
// `open` : where the row's function is defined, for the grid's
// "g d" -- row/list's `path` (from the project's root) put under the FS root
// by `place` (lib/xipe/xipe-place.js), and its `line`. A row whose function
// is gone, or whose file a code_editor cannot reach, has none.

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).xipeRows = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function str(v) { return v == null ? '' : String(v); }

  function shown(raw, summary) {
    return (typeof summary === 'string' && summary !== '') ? summary : str(raw);
  }

  // ⟦<call id>⟧ (Xipe Totec's cell reference) -> ⟦<that row's
  // label>#<short id>⟧ when the referenced row is in the same result; the
  // matrix-grid contract leaves turning ⟦id⟧ into display names to adapters
  function refs(text, labels) {
    if (!labels) return text;
    return text.replace(/⟦([^⟧]+)⟧/g, function (m, id) {
      return labels[id] ? '⟦' + labels[id] + '#' + id.slice(-4) + '⟧' : m;
    });
  }

  function linkCell(linked) {
    return linked === true ? 'ok' : linked === false ? 'gone' : '';
  }

  function sentence(r, labels) {
    const args = (Array.isArray(r.args) ? r.args : []).map(function (a, i) {
      const s = Array.isArray(r.args_summary) ? r.args_summary[i] : null;
      return refs(shown(a, s), labels);
    });
    const head = (r.label || '?') + ' (' + args.join(', ') + ')';
    if (r.state === 'eval_error') return head + ' → (error)';
    if (r.value == null && !r.summary) return head + ' → (not evaluated)';
    return head + ' → ' + shown(r.value, r.summary);
  }

  // ref: an opaque matrix.html ref; "call_ids=a,b" narrows, anything else is all rows
  function params(ref) {
    const p = new URLSearchParams(str(ref));
    const ids = p.get('call_ids');
    return ids ? { call_ids: ids.split(',').filter(Boolean) } : {};
  }

  // place: (path from the project's root) -> path from the FS root | null; without it no row has `open`
  function toGrid(result, place) {
    const rows = (result && Array.isArray(result.rows)) ? result.rows : [];
    const anyError = rows.some(function (r) { return r.error != null && r.error !== ''; });
    const columns = [
      { key: 'sentence', label: 'row', render: 'text' },
      { key: 'node', label: 'node', render: 'state' },
      { key: 'state', label: 'state', render: 'state' },
      { key: 'compare', label: 'compare', render: 'state' },
      { key: 'eval_count', label: 'eval_count', render: 'number' },
    ];
    if (anyError) columns.push({ key: 'error', label: 'error', render: 'text' });
    const labels = {};
    rows.forEach(function (r) { if (r.id && r.label) labels[r.id] = r.label; });
    return {
      // what a row is: said with the selection's coordinate (`radar`)
      type: 'calc_row',
      columns: columns,
      rows: rows.map(function (r) {
        const cells = {
          sentence: sentence(r, labels),
          node: linkCell(r.linked),
          state: str(r.state),
          compare: str(r.compare),
          eval_count: str(r.eval_count == null ? 0 : r.eval_count),
        };
        if (anyError) cells.error = str(r.error);
        const row = { id: r.id, cells: cells };
        const at = typeof place === 'function' && typeof r.path === 'string' && r.path ? place(r.path) : null;
        if (at) row.open = { path: at, span: typeof r.line === 'number' && r.line > 0 ? { line: r.line } : null };
        return row;
      }),
    };
  }

  return { sentence: sentence, params: params, toGrid: toGrid };
});
