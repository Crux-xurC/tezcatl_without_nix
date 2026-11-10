// lib/task/task-table.js -- the task_table panel (D-task-table), the pure
// parts: a note's table (lib/code/markdown.js tables) taken into a book,
// edited as a table, and put back into the note as markdown.
//   book    {name, path, hash, captionAt, align, columns: [label], rows: [[cell]]}
//           (~work/books/<file>.json; cells as markdown source)
//   no      the column of the row's place in the tree, `t-02-01` (prefix and
//           two-digit steps): `o` adds the next sibling, `O` the first free child
//   key     the column of the row's id (`inner_id`): a mark (`#eigenvalue`)
//           or empty until saved, then an id of the relay's list -- an id set
//           is never edited here
// What a book needs is in tasks/task_table.json (defaults below).
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).taskTable = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    columns: { no: 'id', state: 'state', task: 'task', key: 'inner_id' },
    mark: '#eigenvalue',
    list: 'tasks',
    prefix: 't',
    states: ['TODO', 'NEXT', 'DONE', 'CANCELLED'],
  };

  // tasks/task_table.json over the defaults
  function settings(cfg) {
    const c = cfg || {};
    return {
      columns: Object.assign({}, DEFAULTS.columns, c.columns || {}),
      mark: typeof c.mark === 'string' && c.mark ? c.mark : DEFAULTS.mark,
      list: typeof c.list === 'string' && /^[a-z0-9_-]{1,64}$/.test(c.list) ? c.list : DEFAULTS.list,
      prefix: typeof c.prefix === 'string' && /^[A-Za-z]+$/.test(c.prefix) ? c.prefix : DEFAULTS.prefix,
      states: Array.isArray(c.states) && c.states.length ? c.states.slice() : DEFAULTS.states.slice(),
    };
  }

  // the index of a column by its label -> -1 | i
  function col(book, label) { return book.columns.indexOf(label); }

  // a table of the note (tables()) -> {book} | {error}: the columns the settings need must be there
  function take(table, path, hash, cfg) {
    const s = settings(cfg);
    if (!table || table.name == null) return { error: 'the table has no name (a `Table: <name>` line just before or after it)' };
    const need = [s.columns.no, s.columns.state, s.columns.task, s.columns.key];
    const missing = need.filter((c) => table.head.indexOf(c) < 0);
    if (missing.length) return { error: 'the table "' + table.name + '" has no column ' + missing.join(', ') + ' (tasks/task_table.json: ' + need.join(', ') + ')' };
    const width = table.head.length;
    return {
      book: {
        name: table.name, path: path, hash: hash,
        captionAt: table.captionLine != null && table.captionLine > table.line ? 'after' : 'before',
        align: (table.align || []).slice(0, width),
        columns: table.head.slice(),
        rows: table.rows.map((r) => { const x = r.slice(0, width); while (x.length < width) x.push(''); return x; }),
      },
    };
  }

  // -- the key column: protected once set ------------------------------------
  function isSet(value, mark) { const v = String(value == null ? '' : value).trim(); return v !== '' && v !== mark; }
  // may this cell be edited? -> null | why not
  function locked(book, ci, value, cfg) {
    const s = settings(cfg);
    if (book.columns[ci] === s.columns.key && isSet(value, s.mark)) return 'the id ' + String(value).trim() + ' is set ── it is not edited';
    return null;
  }
  // the rows whose key is empty or the mark -> [row index]
  function needIds(book, cfg) {
    const s = settings(cfg);
    const k = col(book, s.columns.key);
    if (k < 0) return [];
    return book.rows.map((r, i) => (isSet(r[k], s.mark) ? -1 : i)).filter((i) => i >= 0);
  }
  // the ids into those rows (in order) -> a new book
  function putIds(book, rows, ids, cfg) {
    const s = settings(cfg);
    const k = col(book, s.columns.key);
    const out = book.rows.map((r) => r.slice());
    rows.forEach((ri, i) => { if (ids[i] != null && out[ri]) out[ri][k] = ids[i]; });
    return Object.assign({}, book, { rows: out });
  }

  // -- the no column: numbering ---------------------------------------------
  function two(n) { return (n < 10 ? '0' : '') + n; }
  // "t-02-01" -> [2, 1] | null
  function parseNo(no, prefix) {
    const m = new RegExp('^' + prefix + '((?:-\\d+)+)$').exec(String(no == null ? '' : no).trim());
    return m ? m[1].slice(1).split('-').map(Number) : null;
  }
  function showNo(steps, prefix) { return prefix + '-' + steps.map(two).join('-'); }
  function isUnder(steps, parent) { return steps.length > parent.length && parent.every((v, i) => steps[i] === v); }

  // a new row by `o` (a sibling of row `at`) or `O` (a child): its no, and
  // where it goes (after `at` and everything under it) -> {no, index}
  function newRow(book, at, child, cfg) {
    const s = settings(cfg);
    const c = col(book, s.columns.no);
    const nos = book.rows.map((r) => parseNo(r[c], s.prefix));
    const here = at >= 0 && at < book.rows.length ? nos[at] : null;
    const parent = here ? (child ? here : here.slice(0, -1)) : [];
    const used = nos.filter((n) => n && n.length === parent.length + 1 && parent.every((v, i) => n[i] === v)).map((n) => n[n.length - 1]);
    const steps = parent.concat([used.length ? Math.max.apply(null, used) + 1 : 1]);
    let index = book.rows.length;
    if (here) {
      index = at + 1;
      while (index < book.rows.length && nos[index] && isUnder(nos[index], here)) index++;
    }
    return { no: showNo(steps, s.prefix), index: index };
  }
  // a blank row with its no and the mark in its key -> [cell]
  function blankRow(book, no, cfg) {
    const s = settings(cfg);
    return book.columns.map((label) => label === s.columns.no ? no : label === s.columns.key ? s.mark : label === s.columns.state ? s.states[0] || '' : '');
  }

  // -- the order a save writes ---------------------------------------------------
  // the rows in the order of the table's sort (column index, dir 1 | -1), as the
  // grid sorts (lib/xipe/matrix-grid.js recompute: numbers as numbers), every
  // row -- a filter hides rows from the eye, never from the book -> [row index]
  function sorted(book, ci, dir) {
    const idx = book.rows.map((_r, i) => i);
    if (ci == null || ci < 0) return idx;
    return idx.slice().sort((a, b) => {
      const va = book.rows[a][ci], vb = book.rows[b][ci];
      const na = Number(va), nb = Number(vb);
      let cmp;
      if (va !== '' && vb !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) cmp = na < nb ? -1 : na > nb ? 1 : 0;
      else { const sa = String(va == null ? '' : va), sb = String(vb == null ? '' : vb); cmp = sa < sb ? -1 : sa > sb ? 1 : 0; }
      return cmp * (dir || 1) || a - b;
    });
  }

  // the book's file in the work place: the name made a file name
  function bookPath(name) {
    const slug = String(name || '').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 80) || 'table';
    return '~work/books/' + slug + '.json';
  }

  // -- back to markdown -------------------------------------------------------
  // a value typed into a cell, as markdown: one line, a bare `|` escaped
  function cellText(v) {
    return String(v == null ? '' : v).replace(/\r?\n/g, ' ').replace(/(^|[^\\])\|/g, '$1\\|').replace(/(^|[^\\])\|/g, '$1\\|').trim();
  }
  // the width a terminal gives a string (wide East Asian characters count 2)
  function width(s) {
    let w = 0;
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      w += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
        (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
        (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd) ? 2 : 1;
    }
    return w;
  }
  function pad(s, w) { return s + ' '.repeat(Math.max(0, w - width(s))); }
  function delim(a, w) {
    const n = Math.max(3, w);
    if (a === 'center') return ':' + '-'.repeat(n - 2) + ':';
    if (a === 'right') return '-'.repeat(n - 1) + ':';
    if (a === 'left') return ':' + '-'.repeat(n - 1);
    return '-'.repeat(n);
  }
  // the book as the text that replaces the table and its caption in the note
  function toMarkdown(book) {
    const n = book.columns.length;
    const w = book.columns.map((c, i) => Math.max(3, width(c), ...book.rows.map((r) => width(r[i] || ''))));
    const line = (cells) => '| ' + cells.map((c, i) => pad(c || '', w[i])).join(' | ') + ' |';
    const table = [line(book.columns), '| ' + w.map((x, i) => delim((book.align || [])[i], x)).join(' | ') + ' |']
      .concat(book.rows.map((r) => line(r.slice(0, n))));
    const caption = 'Table: ' + book.name;
    return (book.captionAt === 'after' ? table.concat(['', caption]) : [caption, ''].concat(table)).join('\n');
  }

  // where the table goes in the note's text -> {from, to, insert} | {error}
  // (`tables` and `findTable` of lib/code/markdown.js, read from that text)
  function putEdit(found, book) {
    if (found.error) return { error: found.error };
    return { from: found.table.from, to: found.table.to, insert: toMarkdown(book) };
  }
  // that edit as code_editor takes edits (code.edits: LSP TextEdits, 0-based line/character)
  function asTextEdit(text, edit) {
    function pos(off) {
      const before = String(text).slice(0, off);
      const line = (before.match(/\n/g) || []).length;
      return { line: line, character: off - (before.lastIndexOf('\n') + 1) };
    }
    return { range: { start: pos(edit.from), end: pos(edit.to) }, newText: edit.insert };
  }

  return {
    DEFAULTS: DEFAULTS, settings: settings, take: take, locked: locked, needIds: needIds, putIds: putIds,
    parseNo: parseNo, newRow: newRow, blankRow: blankRow, cellText: cellText, width: width, sorted: sorted, bookPath: bookPath,
    toMarkdown: toMarkdown, putEdit: putEdit, asTextEdit: asTextEdit,
  };
});
