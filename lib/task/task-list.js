// lib/task/task-list.js -- the task list (D-task-list), the pure parts: the
// rows of a task_table cut into the one task list (~work/books/task_list.json),
// and what a row changed there does to the task_table's book.
//   list    {source: <the book's name>, book: <its path>, columns, rows}
//           -- the rows shown in the task_table when it was cut (its filter and
//           order: the rank), each with its id (the key column)
// A change in the list replaces the row of the same id in the book; a row new
// in the list is added to the book; nothing is deleted from the book here (a
// row leaves the list only). DONE / CANCELLED go down to every row under it in
// the book (t-02 -> t-02-01, t-02-01-03 ...), as org closes a subtree.
// Columns and states: tasks/task_table.json (lib/task/task-table.js settings).
(function (root, factory) {
  const TT = (typeof module === 'object' && module.exports) ? require('./task-table.js') : root.Tezcatl.taskTable;
  const mod = factory(TT);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).taskList = mod;
})(typeof self !== 'undefined' ? self : this, function (TT) {
  'use strict';

  const PATH = '~work/books/task_list.json';
  const CASCADE = ['DONE', 'CANCELLED'];

  // the rows `idx` of a saved book (every one with its id) -> {list} | {error}
  function cut(book, idx, cfg) {
    const s = TT.settings(cfg);
    const k = book.columns.indexOf(s.columns.key);
    const rows = idx.map((i) => book.rows[i]).filter(Boolean);
    const noId = rows.filter((r) => !/^[0-9a-z]{8}$/.test(String(r[k] || '').trim()));
    if (noId.length) return { error: noId.length + ' row(s) have no id yet ── w first' };
    return { list: { source: book.name, book: TT.bookPath(book.name), path: book.path, columns: book.columns.slice(), rows: rows.map((r) => r.slice()) } };
  }

  function colOf(doc, cfg, which) { return doc.columns.indexOf(TT.settings(cfg).columns[which]); }
  function idOf(doc, row, cfg) { return String(row[colOf(doc, cfg, 'key')] || '').trim(); }

  // a row of the list as a line of the list panel
  function label(list, row, cfg) {
    const s = TT.settings(cfg);
    const at = (name) => { const i = list.columns.indexOf(name); return i < 0 ? '' : String(row[i] || ''); };
    const pri = at('pri');
    return (at(s.columns.state) ? at(s.columns.state) + ' ' : '') + (pri ? '[#' + pri + '] ' : '') + at(s.columns.task);
  }
  function sub(list, row, cfg) {
    const s = TT.settings(cfg);
    const at = (name) => { const i = list.columns.indexOf(name); return i < 0 ? '' : String(row[i] || ''); };
    return [at(s.columns.no), at('due')].filter(Boolean).join(' · ');
  }

  // the next state in the order of the settings
  function cycle(state, cfg) {
    const st = TT.settings(cfg).states;
    const i = st.indexOf(String(state || ''));
    return st[(i + 1) % st.length];
  }

  // the rows of `doc` under row `i` by their no (t-02 -> t-02-01 ...) -> [index]
  function under(doc, i, cfg) {
    const s = TT.settings(cfg);
    const c = colOf(doc, cfg, 'no');
    const top = TT.parseNo(doc.rows[i] && doc.rows[i][c], s.prefix);
    if (!top) return [];
    return doc.rows.map((r, j) => {
      const n = TT.parseNo(r[c], s.prefix);
      return n && n.length > top.length && top.every((v, x) => n[x] === v) ? j : -1;
    }).filter((j) => j >= 0);
  }

  // the state of list row `i` set (and, for DONE / CANCELLED, of every row
  // under it in the book) -> {list, book, n} (n: the rows of the book changed)
  function setState(list, book, i, state, cfg) {
    const ls = colOf(list, cfg, 'state');
    const bs = colOf(book, cfg, 'state');
    const id = idOf(list, list.rows[i], cfg);
    const nl = Object.assign({}, list, { rows: list.rows.map((r) => r.slice()) });
    const nb = Object.assign({}, book, { rows: book.rows.map((r) => r.slice()) });
    nl.rows[i][ls] = state;
    const bi = nb.rows.findIndex((r) => idOf(nb, r, cfg) === id);
    const touched = [];
    if (bi >= 0) {
      nb.rows[bi][bs] = state;
      touched.push(bi);
      if (CASCADE.indexOf(state) >= 0) under(nb, bi, cfg).forEach((j) => { nb.rows[j][bs] = state; touched.push(j); });
    }
    // the list shows what the book has now for the rows it holds
    const changedIds = new Set(touched.map((j) => idOf(nb, nb.rows[j], cfg)));
    nl.rows.forEach((r) => { if (changedIds.has(idOf(nl, r, cfg))) r[ls] = state; });
    return { list: nl, book: nb, n: touched.length, missing: bi < 0 };
  }

  // a new task (its text, its id) at the end of both: the next top-level no -> {list, book}
  function add(list, book, text, id, cfg) {
    const s = TT.settings(cfg);
    const n = TT.newRow(Object.assign({}, book, { rows: book.rows.filter((r) => {
      const p = TT.parseNo(r[book.columns.indexOf(s.columns.no)], s.prefix);
      return p && p.length === 1;
    }) }), -1, false, cfg);
    const row = (doc) => doc.columns.map((label) => label === s.columns.no ? n.no : label === s.columns.key ? id
      : label === s.columns.state ? s.states[0] || '' : label === s.columns.task ? TT.cellText(text) : '');
    return {
      list: Object.assign({}, list, { rows: list.rows.concat([row(list)]) }),
      book: Object.assign({}, book, { rows: book.rows.concat([row(book)]) }),
      no: n.no,
    };
  }

  // a row out of the list only (the book keeps it)
  function drop(list, i) {
    return Object.assign({}, list, { rows: list.rows.filter((_r, j) => j !== i) });
  }

  // the line of the note that holds `id` (1-based) | null
  function lineOf(text, id) {
    const lines = String(text || '').split('\n');
    for (let i = 0; i < lines.length; i++) if (lines[i].indexOf(id) >= 0) return i + 1;
    return null;
  }

  return { PATH: PATH, cut: cut, label: label, sub: sub, cycle: cycle, under: under, setState: setState, add: add, drop: drop, lineOf: lineOf, idOf: idOf };
});
