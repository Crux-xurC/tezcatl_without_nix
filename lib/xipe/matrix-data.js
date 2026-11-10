// lib/xipe/matrix-data.js -- the table's pure pieces: the filter expression
// (a tiny comparator DSL) and CSV. Split out of lib/xipe/matrix-grid.js
// (the table split by what it does); the grid uses them.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).matrixData = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------
  // filter expressions -- a tiny comparator DSL, never `eval`/`Function`.
  // "" (or whitespace) -> matches everything. Leading operator
  // (>=,<=,!=,=,>,<) -> numeric compare if both sides parse as numbers,
  // else lexicographic string compare. No operator -> case-insensitive
  // substring match.
  // ---------------------------------------------------------------------
  const OPERATORS = ['>=', '<=', '!=', '=', '>', '<'];

  function parseFilterExpr(expr) {
    const text = String(expr == null ? '' : expr).trim();
    if (!text) return function () { return true; };

    let op = null;
    let rhs = text;
    for (const candidate of OPERATORS) {
      if (text.slice(0, candidate.length) === candidate) {
        op = candidate;
        rhs = text.slice(candidate.length).trim();
        break;
      }
    }

    if (!op) {
      const needle = text.toLowerCase();
      return function (value) {
        return String(value == null ? '' : value).toLowerCase().indexOf(needle) !== -1;
      };
    }

    const rhsNum = Number(rhs);
    const rhsIsNum = rhs !== '' && !Number.isNaN(rhsNum);

    return function (value) {
      const text2 = String(value == null ? '' : value);
      let cmp;
      if (rhsIsNum && text2.trim() !== '' && !Number.isNaN(Number(text2))) {
        const n = Number(text2);
        cmp = n < rhsNum ? -1 : n > rhsNum ? 1 : 0;
      } else {
        cmp = text2 < rhs ? -1 : text2 > rhs ? 1 : 0;
      }
      switch (op) {
        case '=': return cmp === 0;
        case '!=': return cmp !== 0;
        case '<': return cmp < 0;
        case '<=': return cmp <= 0;
        case '>': return cmp > 0;
        case '>=': return cmp >= 0;
        default: return true;
      }
    };
  }

  // ---------------------------------------------------------------------
  // CSV -- canonical-form strings verbatim, quoted per RFC4180 when needed.
  // ---------------------------------------------------------------------
  function toCSVField(value) {
    const s = String(value == null ? '' : value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function rowsToCSV(columns, rows) {
    const header = columns.map(function (c) { return toCSVField(c.label || c.key); }).join(',');
    const lines = rows.map(function (row) {
      return columns.map(function (c) { return toCSVField(row.cells[c.key]); }).join(',');
    });
    return [header].concat(lines).join('\r\n');
  }

  return { parseFilterExpr: parseFilterExpr, toCSVField: toCSVField, rowsToCSV: rowsToCSV };
});
