// lib/task/run-match.js -- `run match` (D-run-table, stage 4), the pure parts: an
// output_log's record (lib/recv/output-log.js parse) cut into the rows of one
// book by its run lines, each row with the lines of its own destination only,
// compared with the book. Nothing is read but the heads of lines (the keys).
//   a row's part   its destination's lines (`sent <dest> <key>`: tezcatl,
//                  xterm:<key>, emacs-vent) from its `send` line to the next row
//                  of the same book sent to the same destination (the end of the
//                  record when none) -- a row to another destination between does
//                  not end it, so a line that came late is still its
//   differs        the first key the part's lines begin with is not the book's
//                  status (done: no key), a row left `sent`, or a status the
//                  book has that the record does not (the book changed since).
//                  A row not in the record (the log start row itself) is said so,
//                  not ≠
(function (root, factory) {
  const mod = factory(root.Tezcatl && root.Tezcatl.outputLog, root.Tezcatl && root.Tezcatl.runTable);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).runMatch = mod;
})(typeof self !== 'undefined' ? self : this, function (OL0, RT0) {
  'use strict';
  const OL = OL0 || (typeof require === 'function' ? require('../recv/output-log.js') : null);
  const RT = RT0 || (typeof require === 'function' ? require('./run-table.js') : null);

  // the books a record has rows of -> [name]
  function books(entries) {
    const out = [];
    entries.forEach((e) => { const m = OL.mark(e); if (m && out.indexOf(m.book) < 0) out.push(m.book); });
    return out;
  }

  function srcOf(dest, key) {
    if (dest === 'xterm') return 'xterm:' + key;
    if (dest === 'tezcatl' || dest === 'emacs-vent') return dest;
    return null;
  }

  // the record and the book -> [{id, input, line, book, logged, key, hit, count, part, differs, why}]
  // (a row sent more than once: its last sending)
  function match(entries, book, keys) {
    const name = book.name;
    const sends = [];
    entries.forEach((e, i) => {
      const m = OL.mark(e);
      if (!m || m.book !== name) return;
      if (m.what === 'send') sends.push({ i, id: m.id, input: m.rest.split(' ')[0], line: m.rest.replace(/^\S+ ?/, ''), dest: null, key: null, logged: null, notSent: null });
      else {
        const s = sends.filter((x) => x.id === m.id).pop();
        if (!s) return;
        if (m.what === 'sent') { const w = m.rest.split(' '); s.dest = w[0]; s.key = w[1]; }
        else if (m.what === 'not-sent') s.notSent = m.rest;
        else if (m.what === 'status') s.logged = m.rest.split(' ')[0];
      }
    });
    const last = {};
    sends.forEach((s, k) => {
      const src = srcOf(s.dest, s.key);
      const nxt = src ? sends.slice(k + 1).find((x) => srcOf(x.dest, x.key) === src) : null;
      s.end = nxt ? nxt.i : entries.length;
      last[s.id] = s;
    });
    return book.rows.map((row) => {
      const id = RT.cell(book, row, 'id');
      const status = RT.cell(book, row, 'status');
      const s = last[id];
      const base = { id, input: RT.cell(book, row, 'input'), line: RT.cell(book, row, 'line'), book: status, logged: '', key: '', hit: '', count: 0, part: [] };
      // not in the record (before log start -- the start row itself --, or never sent):
      // said, not ≠, but for a row left sent
      if (!s) {
        const sentOut = ['', '-', 'skip', 'stop'].indexOf(status) < 0;
        return Object.assign(base, { differs: status === 'sent', why: status === 'sent' ? 'left sent, not in the record' : sentOut ? 'not in the record' : '' });
      }
      const src = srcOf(s.dest, s.key);
      const part = src ? entries.slice(s.i + 1, s.end).filter((e) => e.src === src) : [];
      let hit = null;
      for (const e of part) { const m = RT.match(keys, e.text); if (m) { hit = { key: m.key, text: e.text }; break; } }
      const r = Object.assign(base, { input: s.input, line: s.line, logged: s.logged || '', key: hit ? hit.key : '', hit: hit ? hit.text : '', count: part.length, part });
      let why = '';
      if (status === 'sent') why = 'left sent';
      else if (s.notSent != null) why = status === 'send-failed' ? '' : 'not sent in the record: ' + s.notSent;
      else if (!src) why = status === 'done' || status === '' ? '' : 'its destination\'s lines are not recorded';
      else if (hit && hit.key !== status) why = 'the record has ' + hit.key + ' (' + hit.text + ')';
      else if (!hit && status !== 'done' && status !== '') why = 'no key in the record, the book says ' + status;
      return Object.assign(r, { differs: !!why, why });
    });
  }

  return { books, match, srcOf };
});
