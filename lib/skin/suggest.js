// lib/skin/suggest.js -- what the suggestion shell computes (D-suggestions): the
// next word of the input line from a source's table, and where the cursor
// goes in the grid of candidates. Pure: no DOM, no bus.
//
//   index(table, cols) -> idx
//     table: {columns, rows} as matrix takes it (rows: [{id, cells}]);
//     cols: {word, desc} -- the keys of the column of lines and of the one
//     that says what a line does. Each line is split on blanks into its
//     words. A word in <...> or [...] is an argument: it matches any word
//     typed there and is never offered, only its hint shown. A word with
//     "|" in it (t|b|r|l) is each of them. cols.anywhere: the lines are
//     words that may come at any place of the line (a dictionary) -- only
//     the word being typed narrows them, not the words before it.
//   next(idx, text) -> {head, partial, items: [{word, desc}], hints: [{hint, desc}]}
//     the words that can follow the input line `text`, in the order of the
//     source (not sorted: what is used most can be put first), narrowed by
//     the word being typed (prefix). head is the line before that word.
//   pick(text, word) -> the input line with the word being typed replaced
//     by `word` and one blank after it
//   move(st, key) -> {i, pick}  st: {i, count, rows, cells, keys}
//     the cursor through the candidates numbered in order (i): j/k one,
//     l/h a column (rows), ^/- a page (cells), a select key (keys) that
//     cell of the page and picks it, Enter picks. Stops at both ends; when
//     the cell moved to is empty and its column (its page for ^) has a
//     candidate, to the last candidate, else it does not move.
//   page(st) -> {page, first, cells: [{i, row, col, key}], prev, next}
//     the cells shown now: filled top to bottom, then the next column.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).suggest = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEYS = '1234567890';

  function words(s) { return String(s == null ? '' : s).trim().split(/\s+/).filter(Boolean); }
  function isArg(w) { return /^[<[].*[>\]]$/.test(w); }

  // one token of a line: an argument, or the words it can be
  function token(w) {
    return isArg(w) ? { arg: w } : { words: w.split('|').filter(Boolean) };
  }

  function index(table, cols) {
    const wordKey = (cols && cols.word) || 'line';
    const descKey = (cols && cols.desc) || 'desc';
    const lines = [];
    ((table && table.rows) || []).forEach((r) => {
      const cells = (r && r.cells) || {};
      const toks = words(cells[wordKey]).map(token);
      if (toks.length) lines.push({ id: r.id, toks: toks, desc: String(cells[descKey] == null ? '' : cells[descKey]) });
    });
    return { lines: lines, anywhere: !!(cols && cols.anywhere) };
  }

  function matches(tok, w) { return tok.arg ? true : tok.words.indexOf(w) !== -1; }

  function split(text) {
    const s = String(text == null ? '' : text);
    const done = s === '' || /\s$/.test(s);
    const ws = words(s);
    const partial = done ? '' : ws.pop();
    const head = done ? s : s.slice(0, s.length - partial.length);
    return { typed: ws, partial: partial, head: head };
  }

  function next(idx, text) {
    const sp = split(text);
    if (idx.anywhere) sp.typed = [];
    const n = sp.typed.length;
    const items = [];
    const hints = [];
    const seen = {};
    const seenHint = {};
    idx.lines.forEach((l) => {
      if (l.toks.length <= n) return;
      for (let k = 0; k < n; k++) if (!matches(l.toks[k], sp.typed[k])) return;
      const t = l.toks[n];
      // the line's own desc when the word ends it; the first line's otherwise
      const desc = l.toks.length === n + 1 ? l.desc : '';
      if (t.arg) {
        if (!seenHint[t.arg]) { seenHint[t.arg] = true; hints.push({ hint: t.arg, desc: l.desc }); }
        return;
      }
      t.words.forEach((w) => {
        if (sp.partial && w.indexOf(sp.partial) !== 0) return;
        if (seen[w]) { if (!seen[w].desc && desc) seen[w].desc = desc; return; }
        seen[w] = { word: w, desc: desc };
        items.push(seen[w]);
      });
    });
    return { head: sp.head, partial: sp.partial, items: items, hints: hints };
  }

  function pick(text, word) {
    return split(text).head + word + ' ';
  }

  function shape(st) {
    const rows = Math.max(1, st.rows | 0);
    const cells = Math.max(rows, st.cells | 0);
    return { rows: rows, cells: cells, keys: st.keys == null ? KEYS : String(st.keys) };
  }

  const STEP = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 };
  const COL = { l: 1, ArrowRight: 1, h: -1, ArrowLeft: -1 };
  const PAGE = { '^': 1, '-': -1 };

  function move(st, key) {
    const sh = shape(st);
    const count = Math.max(0, st.count | 0);
    const i = Math.min(Math.max(0, st.i | 0), Math.max(0, count - 1));
    const stay = { i: i, pick: false };
    if (!count) return stay;
    if (key === 'Enter') return { i: i, pick: true };
    const k = sh.keys.indexOf(key);
    if (key.length === 1 && k !== -1) {
      const cell = Math.floor(i / sh.cells) * sh.cells + k;
      return k < sh.cells && cell < count ? { i: cell, pick: true } : stay;
    }
    let size;
    let d;
    if (STEP[key]) { size = 1; d = STEP[key]; }
    else if (COL[key]) { size = sh.rows; d = COL[key] * sh.rows; }
    else if (PAGE[key]) { size = sh.cells; d = PAGE[key] * sh.cells; }
    else return stay;
    const to = i + d;
    if (to < 0) return stay;
    if (to < count) return { i: to, pick: false };
    // an empty cell: the last candidate when its column (page) has one
    return Math.floor(to / size) * size < count ? { i: count - 1, pick: false } : stay;
  }

  function page(st) {
    const sh = shape(st);
    const count = Math.max(0, st.count | 0);
    const i = Math.min(Math.max(0, st.i | 0), Math.max(0, count - 1));
    const p = Math.floor(i / sh.cells);
    const first = p * sh.cells;
    const cells = [];
    for (let o = 0; o < sh.cells && first + o < count; o++) {
      cells.push({ i: first + o, row: o % sh.rows, col: Math.floor(o / sh.rows), key: o < sh.keys.length ? sh.keys[o] : null });
    }
    return { page: p, first: first, cells: cells, prev: p > 0, next: first + sh.cells < count };
  }

  return { KEYS, index, next, pick, move, page, isArg };
});
