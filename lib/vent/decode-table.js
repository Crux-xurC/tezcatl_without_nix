// lib/vent/decode-table.js -- what an intent's answer becomes in the
// decode_emacs panel (D-decode-emacs), the pure parts. An intent that says
// how (its `result.table`, docs/extending/intents.md) has its JSON answer --
// json-serialize'd Lisp: vectors and plists -- made a table; nothing of a
// message's human text is read.
//   table: {
//     from:    where in the answer the rows are: "" (all of it), "files", "0", "a.b"
//     rows:    "objects" (each row a plist: a column by its key) | "arrays" (by
//              its index) | "values" (each row one value: one column)
//     columns: [{key, from, label}]    (from: the key or the index in a row)
//     link:    the column Enter opens as a file (absolute, or from the FS root)
//     line:    the column of the line Enter opens it at (optional)
//     enter:   instead of a link: the key of `keys` Enter does (a branch's row:
//              Enter checks it out)
//     keys:    {"<key>": {intent, params: {name: column}}
//                       | {command, args: {name: column}}
//                       | {table: intent, params: {name: column}}
//                       | {diff: {intent, params: {name: column}, against: column}}
//                       | {diff: {intent, params, path: column,
//                                 against: {intent, params, path: column}}}
//                       | {ask: purpose, intent, param, params: {name: column}}}
//              (confirm: "<what is discarded>" beside an intent -- the key runs on its
//              second press on the same row (D-discard-confirm);
//              ask: a code_vi_minimum for a sentence (minimum.ask, D-minimum);
//              what :m sends becomes the intent's `param`, with `params` from
//              the row if any -- no row needed when there are none.
//              table: the intent's answer in a decode_emacs of its own -- in a
//              frame, `table <intent> ...`. diff: against a column, the
//              intent's version against that file; against an intent, two
//              versions both asked -- `path` the column of each one's file)
//     refresh: the intent asked again after a key (default: this one)
//   }
// An intent's `result.book` (D-run-table, stage 3) is read the same way, for a
// run_table's book: each item of the list one row of a book made from a template.
//   book: {
//     template: the run_table template (a name of tasks/run/, or a path)
//     from, rows:  as a table's
//     put:     {"<variable column of the template>": "<key in an item>" | "<index>"}
//              (rows "values": one column, which gets the item itself)
//   }
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).decodeTable = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROWS = ['objects', 'arrays', 'values'];
  // the grid's own (lib/xipe/matrix-grid.js), r (the panel's: ask again) and b (the table into a book)
  const RESERVED = ['h', 'j', 'k', 'l', 'v', 'y', 'c', 'g', '/', 'r', 'b'];

  // a table spec -> null | what is wrong with it (the resolver says it when the intents load)
  function check(spec) {
    if (!spec || typeof spec !== 'object') return 'table: not an object';
    if (spec.from != null && typeof spec.from !== 'string') return 'table.from: a string ("" for all of it)';
    if (ROWS.indexOf(spec.rows) < 0) return 'table.rows: one of ' + ROWS.join(', ');
    if (!Array.isArray(spec.columns) || !spec.columns.length) return 'table.columns: at least one';
    const keys = spec.columns.map((c) => c && c.key);
    if (keys.some((k) => typeof k !== 'string' || !k)) return 'table.columns[]: each with a key';
    if (keys.some((k, i) => keys.indexOf(k) !== i)) return 'table.columns[]: a key twice';
    if (spec.link != null && keys.indexOf(spec.link) < 0) return 'table.link: not a column (' + spec.link + ')';
    if (spec.line != null && (spec.link == null || keys.indexOf(spec.line) < 0)) return 'table.line: a column, beside a link (' + spec.line + ')';
    if (spec.enter != null && (spec.link != null || !spec.keys || !spec.keys[spec.enter])) return 'table.enter: one of its keys, and no link (' + spec.enter + ')';
    const ks = spec.keys || {};
    for (const k of Object.keys(ks)) {
      if (k.length !== 1) return 'table.keys: one character each (' + k + ')';
      if (RESERVED.indexOf(k) >= 0) return 'table.keys: ' + k + ' is taken by the panel (' + RESERVED.join(' ') + ')';
      const a = ks[k] || {};
      let cols = Object.values(a.params || a.args || (a.diff && a.diff.params) || {});
      if (a.diff) {
        const vs = a.diff.against;
        if (vs && typeof vs === 'object') {
          if (!vs.intent) return 'table.keys.' + k + '.diff.against: a column, or {intent, params, path}';
          if (keys.indexOf(a.diff.path) < 0 || keys.indexOf(vs.path) < 0) return 'table.keys.' + k + '.diff: path (and against.path) the column of the file';
          cols = cols.concat(Object.values(vs.params || {}));
        } else if (keys.indexOf(vs) < 0) return 'table.keys.' + k + '.diff.against: not a column';
      }
      if (a.table != null && (typeof a.table !== 'string' || !a.table)) return 'table.keys.' + k + '.table: an intent id';
      if (!a.intent && !a.command && !a.table && !(a.diff && a.diff.intent)) return 'table.keys.' + k + ': an intent, a command, a table or a diff';
      if (a.ask != null && (typeof a.ask !== 'string' || !a.intent || typeof a.param !== 'string' || !a.param)) return 'table.keys.' + k + '.ask: a purpose, with an intent and the param that gets the sentence';
      if (a.confirm != null && (typeof a.confirm !== 'string' || !a.confirm || !a.intent || a.ask != null)) return 'table.keys.' + k + '.confirm: what is discarded, beside an intent (not an ask)';
      const bad = cols.filter((c) => keys.indexOf(c) < 0);
      if (bad.length) return 'table.keys.' + k + ': not a column: ' + bad.join(', ');
    }
    if (spec.refresh != null && typeof spec.refresh !== 'string') return 'table.refresh: an intent id';
    return null;
  }

  // a book spec -> null | what is wrong with it
  function checkBook(spec) {
    if (!spec || typeof spec !== 'object') return 'book: not an object';
    if (typeof spec.template !== 'string' || !spec.template.trim()) return 'book.template: a run_table template (a name of tasks/run/ or a path)';
    if (spec.from != null && typeof spec.from !== 'string') return 'book.from: a string ("" for all of it)';
    if (ROWS.indexOf(spec.rows) < 0) return 'book.rows: one of ' + ROWS.join(', ');
    const put = spec.put;
    if (!put || typeof put !== 'object' || !Object.keys(put).length) return 'book.put: at least one column';
    if (Object.keys(put).some((k) => typeof put[k] !== 'string')) return 'book.put: each a key (or an index) of an item';
    if (spec.rows === 'values' && Object.keys(put).length !== 1) return 'book.put: one column for rows "values"';
    return null;
  }
  // the answer as rows for a book -> {rows: [{column: value}]} | {error}
  function bookRows(spec, payload) {
    const why = checkBook(spec);
    if (why) return { error: why };
    const list = pick(payload, spec.from || '');
    if (!Array.isArray(list)) return { error: 'the answer has no list at "' + (spec.from || '') + '" (' + (list === undefined ? 'nothing there' : typeof list) + ')' };
    const cols = Object.keys(spec.put);
    return {
      rows: list.map((r) => {
        const out = {};
        cols.forEach((c) => {
          const k = spec.put[c];
          let v;
          if (spec.rows === 'values') v = r;
          else if (spec.rows === 'arrays') v = Array.isArray(r) ? r[Number(k)] : undefined;
          else v = r && typeof r === 'object' ? r[k] : undefined;
          out[c] = cell(v);
        });
        return out;
      }),
    };
  }

  // the part of the answer at `from` -> value | undefined
  function pick(payload, from) {
    if (!from) return payload;
    return String(from).split('.').reduce((v, step) => (v == null ? undefined : v[/^\d+$/.test(step) && Array.isArray(v) ? Number(step) : step]), payload);
  }

  function cell(v) {
    if (v == null || v === false) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || v === true) return String(v);
    return JSON.stringify(v);
  }

  // the answer as a table -> {columns: [{key, label}], rows: [{id, cells}]} | {error}
  function table(spec, payload) {
    const why = check(spec);
    if (why) return { error: why };
    const list = pick(payload, spec.from || '');
    if (!Array.isArray(list)) return { error: 'the answer has no list at "' + (spec.from || '') + '" (' + (list === undefined ? 'nothing there' : typeof list) + ')' };
    const columns = spec.columns.map((c) => ({ key: c.key, label: c.label || c.key }));
    const rows = list.map((r, i) => {
      const cells = {};
      spec.columns.forEach((c, ci) => {
        let v;
        if (spec.rows === 'values') v = ci === 0 ? r : undefined;
        else if (spec.rows === 'arrays') v = Array.isArray(r) ? r[c.from != null ? Number(c.from) : ci] : undefined;
        else v = r && typeof r === 'object' ? r[c.from != null ? c.from : c.key] : undefined;
        cells[c.key] = cell(v);
      });
      return { id: 'r' + i, cells };
    });
    return { columns, rows };
  }

  // the table shown made a book (D-db-session: what an intent's sql.load
  // makes a table of on database window 1) -> {path, book}: the rows of `ids`
  // in that order, the cells as shown, the columns by their keys; the book is
  // ~work/books/decode/<intent>.json, written over each time
  function bookOf(id, args, columns, rows, ids) {
    const byId = {};
    rows.forEach((r) => { byId[r.id] = r; });
    const keys = columns.map((c) => c.key);
    const slug = String(id).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 80) || 'table';
    return {
      path: '~work/books/decode/' + slug + '.json',
      book: {
        name: 'decode/' + slug, intent: id, args: args || {}, columns: keys,
        rows: ids.filter((i) => byId[i]).map((i) => keys.map((k) => byId[i].cells[k])),
      },
    };
  }

  // the arguments a key gives from a row: {name: column} -> {name: value}
  function argsOf(map, row) {
    const out = {};
    Object.keys(map || {}).forEach((name) => { out[name] = row.cells[map[name]]; });
    return out;
  }

  // a diff key's two sides for a row -> {a, b} | {error}; a side is {file} (a
  // file as it is) or {intent, args, copy} (the intent's answer, written to
  // `copy` in the work place): ~work/emacs/<intent>/[<other values>/]<file>
  function diffSides(spec, row, fsRoot) {
    function side(s, pathCol) {
      const file = fsPath(row.cells[pathCol], fsRoot);
      if (!file) return { error: (row.cells[pathCol] || '(empty)') + ' is not under the FS root' };
      const tags = Object.keys(s.params || {}).filter((n) => s.params[n] !== pathCol).map((n) => {
        const v = String(row.cells[s.params[n]] == null ? '' : row.cells[s.params[n]]).replace(/[^A-Za-z0-9._@^~-]/g, '_');
        return !v || /^\.+$/.test(v) ? '-' : v;
      });
      return { intent: s.intent, args: argsOf(s.params, row), copy: '~work/emacs/' + s.intent + '/' + tags.map((t) => t + '/').join('') + file };
    }
    const vs = spec.against;
    if (vs && typeof vs === 'object') {
      const a = side(vs, vs.path), b = side(spec, spec.path);
      return a.error ? a : b.error ? b : { a: a, b: b };
    }
    const file = fsPath(row.cells[vs], fsRoot);
    if (!file) return { error: (row.cells[vs] || '(empty)') + ' is not under the FS root' };
    const a = side(spec, vs);
    return a.error ? a : { a: a, b: { file: file } };
  }

  // a path from Emacs -> the path from the FS root | null (outside it)
  // (fsRoot: the relay's, absolute -- GET /fs)
  function fsPath(p, fsRoot) {
    const s = String(p || '').trim();
    if (!s) return null;
    if (s.charAt(0) !== '/') return s.replace(/^\.\//, '');
    const norm = (x) => {
      const out = [];
      for (const seg of x.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') { if (!out.length) return null; out.pop(); } else out.push(seg);
      }
      return out;
    };
    const a = norm(s), b = fsRoot ? norm(String(fsRoot)) : null;
    if (!a || !b) return null;
    if (a.length < b.length || b.some((seg, i) => a[i] !== seg)) return null;
    return a.slice(b.length).join('/') || null;
  }

  return { ROWS: ROWS, RESERVED: RESERVED, check: check, checkBook: checkBook, bookRows: bookRows, pick: pick, table: table, argsOf: argsOf, bookOf: bookOf, diffSides: diffSides, fsPath: fsPath };
});
