// lib/task/run-table.js -- the run_table panel (D-run-table), the pure parts:
// a book of lines sent one by one, from the smallest id whose status is empty,
// each to its own input (a destination of input_target).
//   book     {name, template, columns: [label], defaults: {label: value},
//            keys: {status: [prefix]}, rows: [[cell]]}
//            (~work/books/run/<name>.json; a template of tasks/run/ is the same
//            shape, and so is a book saved with `run save`)
//   columns  the seven of FIXED first, then the variables: `{name}` in a line
//            is that row's cell, put in as typed chars (the lead doubled)
//   status   empty: not yet. What the runner writes: sent, done (the wait went
//            by with no key seen -- not "it worked"), send-failed, skip (auto F
//            under a failure), stop (run stop). A key's name: a line of the
//            output began with one of its prefixes
// Nothing here reads what a line or an output means: a line is sent as it is
// written, an output line is only compared with the prefixes written before.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).runTable = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FIXED = ['id', 'input', 'line', 'wait', 'auto', 'status', 'note'];
  const OWN = ['sent', 'done', 'send-failed', 'skip', 'stop'];
  // statuses that are not a failure for an auto F row below them
  const NOT_FAILED = ['', 'sent', 'done', 'skip', 'stop'];
  const WAIT = 3;
  const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

  function str(v) { return v == null ? '' : String(v); }

  // keys {status: prefix | [prefix] | "" | []} over keys: "" / [] / null takes one out
  function overKeys(base, over) {
    const out = {};
    Object.keys(base || {}).forEach((k) => { out[k] = base[k].slice(); });
    const errors = [];
    Object.keys(over || {}).forEach((k) => {
      const v = over[k];
      if (v === '' || v == null || (Array.isArray(v) && !v.length)) { delete out[k]; return; }
      const list = (Array.isArray(v) ? v : [v]).filter((p) => typeof p === 'string' && p !== '');
      if (!/^\S+$/.test(k)) { errors.push('the key "' + k + '" is not one word'); return; }
      if (OWN.indexOf(k) >= 0) { errors.push('"' + k + '" is the runner\'s own status, not a key'); return; }
      if (!list.length) { errors.push('the key "' + k + '" has no prefix'); return; }
      out[k] = list;
    });
    return { keys: out, errors };
  }

  // tasks/run_keys.json and a template -> {wait, keys, errors}
  function settings(global, tpl) {
    const g = global || {};
    const base = overKeys({}, g.keys);
    const mine = overKeys(base.keys, (tpl && tpl.keys) || {});
    const w = Number(g.wait);
    return { wait: w > 0 ? w : WAIT, keys: mine.keys, errors: base.errors.concat(mine.errors) };
  }

  // a template (or a saved book) -> {book} | {error}
  function fromTemplate(tpl, name, template) {
    if (!tpl || !Array.isArray(tpl.columns)) return { error: 'no columns' };
    const cols = tpl.columns.map(str);
    for (let i = 0; i < FIXED.length; i++) {
      if (cols[i] !== FIXED[i]) return { error: 'the columns begin ' + FIXED.join(', ') + ' (column ' + (i + 1) + ' is "' + (cols[i] || '') + '")' };
    }
    const vars = cols.slice(FIXED.length);
    for (const v of vars) {
      if (!NAME_RE.test(v)) return { error: 'the variable column "' + v + '" is not a name (letters, digits, _ and -)' };
      if (FIXED.indexOf(v) >= 0 || vars.indexOf(v) !== vars.lastIndexOf(v)) return { error: 'the column "' + v + '" is there twice' };
    }
    const defaults = {};
    Object.keys(tpl.defaults || {}).forEach((k) => { if (cols.indexOf(k) >= 0 && k !== 'id' && k !== 'status') defaults[k] = str(tpl.defaults[k]); });
    const book = { name: str(name) || 'run', template: str(template), columns: cols, defaults, keys: tpl.keys || {}, rows: [] };
    if (typeof tpl.intent === 'string' && tpl.intent) book.intent = tpl.intent;
    (Array.isArray(tpl.rows) ? tpl.rows : []).forEach((r) => {
      const row = blankRow(book);
      (Array.isArray(r) ? r : []).forEach((v, i) => { if (i < cols.length && str(v) !== '') row[i] = str(v); });
      book.rows.push(row);
    });
    book.rows.forEach((r, i) => { if (r[0] === '') r[0] = String(i + 1); });
    return { book };
  }

  function col(book, label) { return book.columns.indexOf(label); }
  function cell(book, row, label) { const i = col(book, label); return i < 0 ? '' : str(row[i]).trim(); }

  // a row with the defaults, its id the next free one
  function blankRow(book) {
    const row = book.columns.map((c) => (book.defaults && book.defaults[c] != null ? str(book.defaults[c]) : ''));
    row[0] = String(nextId(book));
    return row;
  }
  function nextId(book) {
    let max = 0;
    (book.rows || []).forEach((r) => { const n = Number(str(r[0]).trim()); if (Number.isFinite(n) && n > max) max = Math.floor(n); });
    return max + 1;
  }

  function cmpId(a, b) {
    const x = Number(a), y = Number(b);
    if (a !== '' && b !== '' && Number.isFinite(x) && Number.isFinite(y)) return x - y;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function failed(status) { return NOT_FAILED.indexOf(str(status).trim()) < 0; }

  // the row to go now -> null (no row with an empty status) | {index, skip, because}
  // skip: auto F, and a row of a smaller id failed (because: its id)
  function next(book) {
    const S = col(book, 'status');
    let at = -1;
    book.rows.forEach((r, i) => {
      if (str(r[S]).trim() !== '') return;
      if (at < 0 || cmpId(cell(book, r, 'id'), cell(book, book.rows[at], 'id')) < 0) at = i;
    });
    if (at < 0) return null;
    const row = book.rows[at];
    const id = cell(book, row, 'id');
    if (cell(book, row, 'auto').toUpperCase() !== 'F') return { index: at, skip: false };
    const bad = book.rows.filter((r) => r !== row && cmpId(cell(book, r, 'id'), id) < 0 && failed(r[S]));
    if (!bad.length) return { index: at, skip: false };
    bad.sort((a, b) => cmpId(cell(book, a, 'id'), cell(book, b, 'id')));
    return { index: at, skip: true, because: cell(book, bad[0], 'id') };
  }

  // the line of a row with its variables in -> {text} | {error}
  // escape(value): how a value goes in as typed chars (lead.escape)
  function expand(book, index, escape) {
    const row = book.rows[index];
    const line = str(row[col(book, 'line')]);
    if (!line.trim()) return { error: 'the line is empty' };
    const vars = book.columns.slice(FIXED.length);
    const text = line.replace(/\{([A-Za-z_][A-Za-z0-9_-]*)\}/g, (all, name) => {
      const i = vars.indexOf(name);
      if (i < 0) return all;
      const v = str(row[FIXED.length + i]);
      return escape ? escape(v) : v;
    });
    return { text };
  }

  // how long a row waits, in seconds -> {sec} | {error}
  function waitOf(book, index, dflt) {
    const v = cell(book, book.rows[index], 'wait');
    if (v === '') return { sec: dflt > 0 ? dflt : WAIT };
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return { error: 'the wait "' + v + '" is not a number of seconds' };
    return { sec: n };
  }

  // the key a line of output begins with -> null | {key, prefix}
  function match(keys, line) {
    const s = str(line);
    for (const k of Object.keys(keys || {})) {
      for (const p of keys[k]) if (s.indexOf(p) === 0) return { key: k, prefix: p };
    }
    return null;
  }

  // -- run from (stage 3) -----------------------------------------------------
  // rows of an intent's answer (lib/vent/decode-table.js bookRows: [{column: value}])
  // after the book's own, each with the defaults and the next id -> {n} | {error}
  // (only variable columns are put: the line and the rest are the template's)
  function addAnswer(book, items) {
    const vars = book.columns.slice(FIXED.length);
    for (const it of items) {
      const bad = Object.keys(it).filter((c) => vars.indexOf(c) < 0);
      if (bad.length) return { error: 'not a variable column of the template: ' + bad.join(', ') + ' (it has ' + (vars.join(', ') || 'none') + ')' };
    }
    items.forEach((it) => {
      const row = blankRow(book);
      Object.keys(it).forEach((c) => { row[col(book, c)] = oneLine(it[c]); });
      book.rows.push(row);
    });
    return { n: items.length };
  }

  // -- run insert-if (stage 2) -------------------------------------------------
  // the row just above a row: the largest id smaller than its -> index | -1
  function above(book, index) {
    const id = cell(book, book.rows[index], 'id');
    let at = -1;
    book.rows.forEach((r, i) => {
      if (i === index) return;
      const x = cell(book, r, 'id');
      if (cmpId(x, id) < 0 && (at < 0 || cmpId(x, cell(book, book.rows[at], 'id')) > 0)) at = i;
    });
    return at;
  }
  function decimals(s) { const m = /\.(\d+)$/.exec(s); return m ? m[1].length : 0; }
  // an id just under `id`: above it and below the next id there is, one decimal
  // more than it has (4 -> 4.1, 4.1 -> 4.11; 4 with 4.1 there -> 4.01) -> {id} | {error}
  function insertId(book, id) {
    const lo = Number(id);
    if (id === '' || !Number.isFinite(lo)) return { error: 'the id "' + id + '" is not a number ── a row is put under a numbered one only' };
    let hi = Infinity;
    book.rows.forEach((r) => { const n = Number(cell(book, r, 'id')); if (Number.isFinite(n) && n > lo && n < hi) hi = n; });
    for (let p = decimals(id) + 1; p <= 9; p++) {
      const k = Math.pow(10, p);
      const c = (Math.floor(lo * k + 1e-6) + 1) / k;
      if (c < hi) return { id: c.toFixed(p) };
    }
    return { error: 'no id left between ' + id + ' and ' + hi };
  }
  // run insert-if <status> #<from>, run by the row `index`: when the row above it
  // has that status, a copy of row #from (its status and note empty) just under
  // it -> {inserted: id | null, note} | {error}
  function insertIf(book, index, status, from) {
    const src = book.rows.findIndex((r) => cell(book, r, 'id') === String(from));
    if (src < 0) return { error: 'no row #' + from };
    const up = above(book, index);
    const was = up < 0 ? null : cell(book, book.rows[up], 'status');
    if (up < 0 || was !== status) {
      return { inserted: null, note: 'not inserted (' + (up < 0 ? 'no row above' : '#' + cell(book, book.rows[up], 'id') + ' is ' + (was || 'empty')) + ')' };
    }
    const id = cell(book, book.rows[index], 'id');
    const n = insertId(book, id);
    if (n.error) return { error: n.error };
    const row = book.rows[src].slice();
    row[0] = n.id;
    row[col(book, 'status')] = '';
    row[col(book, 'note')] = '';
    book.rows.splice(index + 1, 0, row);
    return { inserted: n.id, at: index + 1, note: 'inserted #' + n.id + ' from #' + from + ' (#' + cell(book, book.rows[up], 'id') + ' was ' + status + ')' };
  }

  // run stop: every empty status `stop` -> how many
  function stopAll(book) {
    const S = col(book, 'status');
    let n = 0;
    book.rows.forEach((r) => { if (str(r[S]).trim() === '') { r[S] = 'stop'; n++; } });
    return n;
  }

  // a row's status and note -> the row changed
  function mark(book, index, status, note) {
    const r = book.rows[index];
    r[col(book, 'status')] = status;
    if (note != null) r[col(book, 'note')] = oneLine(note);
    return r;
  }
  function oneLine(text) { return str(text).replace(/\s*[\r\n]+\s*/g, ' ').slice(0, 300); }

  // the book as it is written (and as a template: run save)
  function toJson(book) {
    return { name: book.name, template: book.template, intent: book.intent || undefined, columns: book.columns.slice(), defaults: Object.assign({}, book.defaults),
      keys: book.keys, rows: book.rows.map((r) => r.slice()) };
  }

  // the book's file in the work place
  function bookPath(name) {
    const slug = str(name).trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 80) || 'run';
    return '~work/books/run/' + slug + '.json';
  }
  // `run new <template>`: a name of tasks/run/ (beside the pages) or a path of the
  // FS root (a book saved with run save) -> {from: 'page' | 'fs', path}
  function templatePath(arg) {
    const a = str(arg).trim();
    if (/[/]/.test(a) || /\.json$/.test(a)) return { from: 'fs', path: a.replace(/^\/+/, '') };
    return { from: 'page', path: 'tasks/run/' + a + '.json' };
  }

  return {
    FIXED, OWN, WAIT, settings, addAnswer, above, insertId, insertIf, overKeys, fromTemplate, blankRow, nextId, next, expand, waitOf, match, stopAll, mark,
    oneLine, failed, toJson, bookPath, templatePath, cell, col,
  };
});
