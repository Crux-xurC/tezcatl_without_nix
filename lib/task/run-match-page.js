// lib/task/run-match-page.js -- the page script of the run_match panel
// (panels/resident/run_match.html; D-run-table, stage 4): an output_log's record
// set beside a run_table's book, one row a row of the book (lib/task/run-match.js).
//   ?log=&book=   the record (a path of the FS root or ~work) and the book's name
//                 (none: the one the record has rows of, when it has one)
//   Enter         the lines of the row's part, under the grid (again: hidden)
//   r             the record and the book read again
// It reads only; the book is changed in its run_table (x, i).
(function () {
  'use strict';
  var T = window.Tezcatl;
  var bus = T.bus;
  var RT = T.runTable, RM = T.runMatch, OL = T.outputLog;
  var params = new URLSearchParams(location.search);
  var NAME = params.get('name') || 'run_match';
  var LOG = (params.get('log') || '').trim();
  var bookArg = (params.get('book') || '').trim() || null;
  var gridEl = document.getElementById('grid-wrap');
  var footEl = document.getElementById('foot');
  var HINT = footEl.textContent;
  var partEl = document.getElementById('part');
  T.panelFrame.init({ role: 'run_match', name: NAME });
  if (T.panelFrame.setFocusTarget) T.panelFrame.setFocusTarget(gridEl);

  var rows = [];
  var shownPart = null;
  function say(text, err) { footEl.textContent = text || HINT; footEl.className = err ? 'err' : ''; }
  function tell(text, err) { say(text, err); bus.post('recv.say', { text: text, cls: err ? 'err' : null }); }

  var baseP = T.config.load().then(function (c) {
    var u = c && c.connections && c.connections[0] && c.connections[0].url;
    if (!u) return null;
    var x = new URL(u);
    return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host;
  }).catch(function () { return null; });
  function read(path) {
    return baseP.then(function (b) {
      if (!b) throw new Error('config.json has no relay URL');
      return fetch(b + '/fs/read?path=' + encodeURIComponent(path), { cache: 'no-store' });
    }).then(function (r) {
      return r.text().then(function (t) {
        if (r.status === 404) throw new Error(path + ': no such file');
        if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
        return t;
      });
    });
  }
  function pageJson(path) {
    return fetch(T.config.sibling(path), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  var COLS = [['id', 'id'], ['input', 'input'], ['line', 'line'], ['book', 'status (book)'], ['logged', 'status (record)'],
    ['key', 'key in the record'], ['hit', 'its line'], ['count', 'lines'], ['diff', '≠'], ['why', 'why']];
  var grid = T.matrixGrid.create({ el: gridEl, bus: bus });
  function show(book) {
    document.getElementById('name').textContent = book.name;
    document.getElementById('from').textContent = 'record ' + LOG;
    var n = rows.filter(function (r) { return r.differs; }).length;
    document.getElementById('state').textContent = n ? n + ' ≠' : 'no ≠';
    grid.setColumns(COLS.map(function (c) { return { key: c[0], label: c[1] }; }));
    grid.setRows(rows.map(function (r, i) {
      return { id: 'm' + i, cells: { id: r.id, input: r.input, line: r.line, book: r.book, logged: r.logged, key: r.key, hit: r.hit, count: String(r.count), diff: r.differs ? '≠' : '', why: r.why } };
    }));
    grid.render();
  }

  function load() {
    partEl.hidden = true;
    shownPart = null;
    if (!LOG) return Promise.reject(new Error('no record ── run match <record> [<book>] in a skin, or ?log='));
    return Promise.all([read(LOG), pageJson('tasks/run_keys.json')]).then(function (got) {
      var entries = OL.parse(got[0]);
      var name = bookArg;
      if (!name) {
        var bs = RM.books(entries);
        if (!bs.length) throw new Error(LOG + ' has no rows of a run_table (no run lines)');
        if (bs.length > 1) throw new Error(LOG + ' has rows of ' + bs.join(', ') + ' ── run match ' + LOG + ' <book>');
        name = bs[0];
      }
      return read(RT.bookPath(name)).then(function (t) {
        var b = null;
        try { b = JSON.parse(t); } catch (_) { throw new Error(RT.bookPath(name) + ' is not JSON'); }
        var f = RT.fromTemplate(b, b.name, b.template);
        if (f.error) throw new Error(RT.bookPath(name) + ': ' + f.error);
        var cfg = RT.settings(got[1], f.book);
        rows = RM.match(entries, f.book, cfg.keys);
        show(f.book);
        gridEl.focus();
        var n = rows.filter(function (r) { return r.differs; }).length;
        tell('run match ── ' + f.book.name + ' against ' + LOG + ': ' + rows.length + ' row(s), ' + (n ? n + ' differ (≠)' : 'none differ'));
      });
    });
  }
  function fail(e) {
    gridEl.textContent = '';
    var d = document.createElement('div');
    d.className = 'empty';
    d.textContent = (e && e.message) || String(e);
    gridEl.appendChild(d);
    tell('! run match ── ' + ((e && e.message) || e), true);
  }

  function here() {
    var g = grid.getState();
    if (g.cursor.rowIndex == null) return null;
    var k = g.order[g.cursor.rowIndex];
    return k == null ? null : rows[Number(String(k).slice(1))];
  }
  function togglePart() {
    var r = here();
    if (!r) return;
    if (shownPart === r) { partEl.hidden = true; shownPart = null; return; }
    shownPart = r;
    partEl.textContent = r.part.length
      ? '#' + r.id + ' ── ' + r.part.length + ' line(s) of its destination\n' + r.part.map(function (e) { return e.n + '  ' + e.time + ' ' + e.src + OL.SEP + e.text; }).join('\n')
      : '#' + r.id + ' ── no line of its destination in the record' + (r.why ? ' (' + r.why + ')' : '');
    partEl.hidden = false;
  }

  gridEl.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (grid.getState().filterPrompt) { var n0 = T.keymap.normalize(e); if (n0 && grid.handleKey(n0)) { e.preventDefault(); grid.render(); } return; }
    if (e.key === 'Enter') { e.preventDefault(); togglePart(); return; }
    if (e.key === 'r') { e.preventDefault(); load().catch(fail); return; }
    var n = T.keymap.normalize(e);
    if (n && grid.handleKey(n)) { e.preventDefault(); grid.render(); if (shownPart && here() !== shownPart) togglePart(); }
  });

  load().catch(fail);
})();
