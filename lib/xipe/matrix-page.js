// lib/xipe/matrix-page.js -- the page script of the table (panels/resident/matrix.html)
// (a page is what it looks like; what it does, its tezcatl-commands
// included, is here in lib/). The page loads it after the scripts it needs.
(function () {
  'use strict';
  var bus = Tezcatl.bus;
  var q = new URLSearchParams(location.search);
  var kind = q.get('kind');
  var ref = q.get('ref');
  var reqId = q.get('req');
  var xipeRoot = q.get('root') || '.';
  var MC = Tezcatl.matrixCommands;
  // ?path=<kind>:<ref>[@<root>] (matrix.get's fallback opens this) instead of kind/ref/root
  var pathError = null;
  if (!kind && q.get('path') != null) {
    var fromPath = MC.parsePath(q.get('path'));
    if (fromPath.error) { if (q.get('path')) pathError = fromPath.error; }
    else { kind = fromPath.kind; ref = fromPath.ref; xipeRoot = fromPath.root; }
  }

  var bootEl = document.getElementById('boot');
  var placeholderEl = document.getElementById('placeholder');
  var gridWrapEl = document.getElementById('grid-wrap');
  var refLabelEl = document.getElementById('ref-label');
  var msgEl = document.getElementById('msg');
  var csvLinkEl = document.getElementById('csv-link');

  Tezcatl.panelFrame.init({ role: 'matrix', name: q.get('name') || 'matrix:' + (ref || 'boot') });

  // The matrix.* tezcatl-commands (command_map.json), for a matrix.html open
  // on its own. Inside a skin this page is a pane and the skin takes them
  // (lib/xipe/matrix-target.js picks one window: a skin first, else the
  // matrix.html focused last). Answers go to the header's message.
  function serveCommands(handlers) {
    if (Tezcatl.skinPort.inSkin(window) || !bus || !Tezcatl.commands) return;
    var target = Tezcatl.matrixTarget.create({ bus: bus, kind: 'page' });
    window.addEventListener('focus', function () { target.claim(); });
    window.addEventListener('pagehide', function () { target.close(); });
    Tezcatl.commands.load().catch(function () {});
    Tezcatl.commands.listenBus();
    Object.keys(handlers).forEach(function (cmd) {
      Tezcatl.commands.register('matrix.' + cmd, function (args, ctx) {
        if (!(ctx && ctx.local) && !target.isMine()) return false;
        return handlers[cmd](args || {});
      });
    });
  }

  if (!ref) {
    bootEl.hidden = false;
    if (pathError) msgEl.textContent = '(path: ' + pathError + ')';
    // with no table yet: get opens one here, the others have nothing to act on
    serveCommands({
      update: function () { msgEl.textContent = '(matrix update: no table yet)'; return true; },
      pwd: function () { msgEl.textContent = '(matrix pwd: no table yet)'; return true; },
      get: function (args) {
        var t = MC.parsePath(args.path);
        if (t.error) { msgEl.textContent = '(matrix get: ' + t.error + ')'; return true; }
        location.search = '?kind=' + encodeURIComponent(t.kind) + '&root=' + encodeURIComponent(t.root) + '&ref=' + encodeURIComponent(t.ref);
        return true;
      },
    });
    document.getElementById('boot-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var k = document.getElementById('boot-kind').value.trim() || 'xipe';
      var rt = document.getElementById('boot-root').value.trim() || '.';
      var r = document.getElementById('boot-ref').value.trim();
      if (!r) return;
      location.search = '?kind=' + encodeURIComponent(k) + '&root=' + encodeURIComponent(rt) + '&ref=' + encodeURIComponent(r);
    });
    return;
  }

  // The table shown: {kind, ref, root}. It starts from the query and changes
  // with a matrix.load (matrix_bar's `matrix get`); matrix.reload (its
  // `matrix update`) fetches the same one again. Every fetch ends with
  // matrix.loaded {kind, ref, root, ok, message, rows} for whoever asked.
  // The table is never updated by notifications:
  // it shows what was fetched last.
  //
  // "demo" is a built-in fixture so the shell (keybindings/sort/filter/
  // color/CSV) can be exercised by hand without a real backend. "xipe" is
  // the first real adapter: a one-shot card/get fetch over
  // tezcatl's /xipe relay via lib/xipe/xipe-client.js, rendered as one grid row
  // per calc row. Node identity (module.name/anykey, effect) goes in the
  // header, and link rows go in a compact summary line under it. A simple
  // layout: calc rows are the one part that is naturally row-shaped.
  // "g d" open-location is not wired for this kind: card/get's response
  // carries a `sheet` id, not the sheet's path. "xipe_rows" has it (row/list
  // gives each row its function's path and line).
  // "xipe_rows": every calc row as one sentence
  // (lib/xipe/xipe-rows.js), from a one-shot row/list -- the visualisation panel,
  // separate from the dialogue window (panels/skins/xipe.html).
  // "given": a table handed to it by the main of its synthesis (matrix.show
  // {label, columns, rows, message} | {label, error}; a database window's
  // db_bar, D-db-session) -- nothing is fetched; `ref` only names it.
  // Any other `kind` shows a plain "not implemented" placeholder rather
  // than fake data.
  var KINDS = { demo: true, xipe: true, xipe_rows: true, given: true };
  var givenShown = false;
  var current = { kind: kind, ref: ref, root: xipeRoot };
  var loadSeq = 0;

  // A pane/skin already showing this {kind, ref} may claim an incoming
  // matrix.table.open on our behalf (mirrors compile.cutoff's
  // opened/reconfigure pattern) -- we only need to answer for our own ref,
  // never open anything ourselves.
  if (bus) {
    bus.on('matrix.table.open', function (payload) {
      if (payload && payload.kind === current.kind && payload.ref === current.ref) {
        bus.post('matrix.table.opened', { reqId: payload.reqId });
        window.focus();
      }
    });
  }

  var COLOR_KEY = 'tezcatl:matrix:colors';

  // kept in ~work/store/matrix-colors.json (lib/core/store.js); the relay
  // down -- marks just won't persist
  function saveColorEntry(rowId, colKey, letter) {
    Tezcatl.store.update(COLOR_KEY, function (all) {
      all = all && typeof all === 'object' ? all : {};
      if (letter) {
        all[rowId] = all[rowId] || {};
        all[rowId][colKey] = letter;
      } else if (all[rowId]) {
        delete all[rowId][colKey];
        if (!Object.keys(all[rowId]).length) delete all[rowId];
      }
      return all;
    });
  }

  var grid = Tezcatl.matrixGrid.create({
    el: gridWrapEl,
    bus: bus,
    initialColors: Tezcatl.store.get(COLOR_KEY) || {},
    onColorChange: saveColorEntry,
    onDrawn: reportCoord,
    onOpen: openRow,
  });

  Tezcatl.store.load(COLOR_KEY).then(function (all) { if (all && typeof all === 'object') grid.setColors(all); });

  // "g d" on a row: to where its function is defined -- code.open-at (the
  // code_editor that has the file, else a new one: in a frame a code_editor panel of
  // it, else a new window; lib/code/code-locate.js). A row with no place says why.
  var noPlace = null;   // why no row of this table can be opened (the adapter's word), or null
  if (Tezcatl.codeLocate && Tezcatl.commands) {
    Tezcatl.codeLocate.register(Tezcatl.commands, Tezcatl.codeLocate.pageEnv(window), { say: function (s) { msgEl.textContent = '(' + s + ')'; } });
  }
  function openRow(row) {
    if (!row.open || !row.open.path) {
      msgEl.textContent = '(g d: ' + (noPlace || 'this row has no place to open ── its function is gone, or was scanned without its file') + ')';
      return;
    }
    var line = row.open.span && row.open.span.line;
    if (Tezcatl.commands && Tezcatl.codeLocate) Tezcatl.commands.invoke('code.open-at', { path: row.open.path, line: line || 1 }, { local: true });
    else if (bus) bus.post('code.open', { path: row.open.path, span: row.open.span || null });
  }

  // Where the selection is, to the resident cursor panel each time it
  // changes: the table (its path), the type of its rows (the adapter's word),
  // row ids and column keys -- never a value. `radar` makes it a reference
  // (lib/skin/radar.js).
  var rowType = null;
  var saidCoord = '';
  function reportCoord() {
    if (!grid) return;   // drawn while being made
    var c = grid.coord();
    var info = { coord: c.ids.length ? { type: rowType || kind || 'row', table: Tezcatl.matrixCommands.format(current), ids: c.ids, cols: c.cols, scope: c.scope } : null };
    var key = JSON.stringify(info);
    if (key === saidCoord) return;
    saidCoord = key;
    Tezcatl.panelFrame.reportCursor(info);
  }

  gridWrapEl.focus();
  Tezcatl.panelFrame.setFocusTarget(gridWrapEl);

  // cells are clamped to one line (CSS); the cursor cell's full text is here
  var detailEl = document.getElementById('detail');
  function showDetail() {
    var cv = grid.cursorValue();
    if (!cv || !cv.value) { detailEl.hidden = true; return; }
    detailEl.hidden = false;
    detailEl.textContent = '';
    var c = document.createElement('span');
    c.className = 'col';
    c.textContent = cv.column + ': ';
    detailEl.appendChild(c);
    detailEl.appendChild(document.createTextNode(cv.value));
  }

  gridWrapEl.addEventListener('keydown', function (ev) {
    var k = Tezcatl.keymap.normalize(ev);
    if (!k) return;
    if (grid.handleKey(k)) {
      ev.preventDefault();
      grid.render();
      showDetail();
    }
  });

  csvLinkEl.addEventListener('click', function () {
    var blob = new Blob([grid.toCSV()], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (ref || 'matrix') + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  // -- data ---------------------------------------------------------------
  function showGrid(on) {
    gridWrapEl.hidden = !on;
    csvLinkEl.hidden = !on;
    placeholderEl.hidden = on;
    if (!on) detailEl.hidden = true;
  }
  function fail(text) {
    msgEl.textContent = '';
    showGrid(false);
    placeholderEl.textContent = text;
  }

  // fetch t = {kind, ref, root} and show it; resolves to what matrix.loaded says
  function load(t) {
    var seq = ++loadSeq;
    var prev = current;
    current = { kind: t.kind, ref: t.ref, root: t.root || '.' };
    kind = current.kind; ref = current.ref; xipeRoot = current.root;
    var sameTable = prev.kind === kind && prev.ref === ref && prev.root === xipeRoot;
    try {
      var u = new URLSearchParams(location.search);
      u.set('kind', kind); u.set('ref', ref); u.set('root', xipeRoot);
      history.replaceState(null, '', '?' + u.toString());
    } catch (_) {}
    refLabelEl.textContent = kind + ':' + ref;
    var done = function (ok, message, rows) {
      if (seq !== loadSeq) return null;
      var r = { kind: kind, ref: ref, root: xipeRoot, ok: ok, message: message || '', rows: rows || 0 };
      if (bus) bus.post('matrix.loaded', r);
      return r;
    };
    if (!KINDS[kind]) {
      fail('(no adapter for kind="' + kind + '" -- ref=' + ref + ')');
      return Promise.resolve(done(false, 'no adapter for kind="' + kind + '"'));
    }
    showGrid(true);
    if (!sameTable) { grid.setRows([]); grid.render(); detailEl.hidden = true; }
    rowType = kind === 'xipe' ? 'calc_row' : null;
    noPlace = null;
    if (kind === 'given') {
      if (!givenShown) fail('(' + ref + ': no table yet)');
      return Promise.resolve(done(true, '', 0));
    }
    if (kind === 'demo') {
      grid.setColumns([
        { key: 'arg0', label: 'arg0', render: 'text' },
        { key: 'result', label: 'result', render: 'ref' },
        { key: 'compare', label: 'compare', render: 'state' },
        { key: 'eval_count', label: 'eval_count', render: 'number' },
        { key: 'state', label: 'state', render: 'state' },
      ]);
      grid.setRows([
        { id: 'demo01', cells: { arg0: '1', result: '2', compare: 'same', eval_count: '3', state: 'ok' },
          open: { path: 'lib/shop/price.ex', span: { line: 12 } } },
        { id: 'demo02', cells: { arg0: '2', result: '4', compare: 'changed', eval_count: '1', state: 'ok' },
          open: { path: 'lib/shop/price.ex', span: { line: 20 } } },
        { id: 'demo03', cells: { arg0: '⟦demo01⟧', result: '(error)', compare: 'none', eval_count: '0', state: 'eval_error' } },
      ]);
      grid.render();
      showDetail();
      return Promise.resolve(done(true, '', 3));
    }
    if (kind === 'xipe_rows') {
      // `ref` is opaque to the shell; lib/xipe/xipe-rows.js reads "call_ids=a,b"
      // (else: every calc row)
      msgEl.textContent = '(xipe: row/list from root=' + xipeRoot + ' ...)';
      // with the two roots (the project's, the FS root's): a row's `path` is from the first, a code_editor opens from the second
      return Promise.all([
        Tezcatl.xipeClient.call(Tezcatl.config, xipeRoot, 'row/list', Tezcatl.xipeRows.params(ref)),
        Tezcatl.xipePlace.fsRoot(Tezcatl.config),
      ]).then(function (got) {
        if (seq !== loadSeq) return null;
        var result = got[0].result;
        var where = Tezcatl.xipePlace.resolver(got[1], got[0].project && got[0].project.root);
        noPlace = where.why;
        var g = Tezcatl.xipeRows.toGrid(result, where.place);
        rowType = g.type;
        refLabelEl.textContent = 'xipe rows  root=' + xipeRoot + '  ' + g.rows.length + ' rows';
        msgEl.textContent = g.rows.length ? '' : '(no calc rows)';
        grid.setColumns(g.columns);
        grid.setRows(g.rows);
        grid.render();
        showDetail();
        return done(true, '', g.rows.length);
      }).catch(function (err) {
        if (seq !== loadSeq) return null;
        var m = err && err.message ? err.message : String(err);
        fail('(' + m + ')');
        return done(false, m);
      });
    }
    // kind === 'xipe'. `ref` is a address query string, e.g.
    // "module=Calc&name=mul&arity=2" or "row=<call_id>" -- the same column
    // names xipe_totec's own `xipe do card/get <col>=<val>...` CLI takes,
    // just URLSearchParams-encoded instead of space-separated.
    var address = {};
    new URLSearchParams(ref).forEach(function (v, k2) { address[k2] = v; });

    msgEl.textContent = '(xipe: fetching ' + ref + ' from root=' + xipeRoot + ' ...)';

    return Tezcatl.xipeClient.request(Tezcatl.config, xipeRoot, 'card/get', address).then(function (result) {
      if (seq !== loadSeq) return null;
      var matches = (result && result.matches) || [];

      if (matches.length === 0) {
        msgEl.textContent = '(xipe: no match for ' + ref + ')';
        grid.setRows([]);
        grid.render();
        return done(true, 'no match', 0);
      }

      if (matches.length > 1) {
        msgEl.textContent = '(xipe: ' + matches.length + ' candidates, showing the first -- narrow the address to pick one)';
      } else {
        msgEl.textContent = '';
      }

      var card = matches[0];
      var node = card.node || {};
      var calls = card.calls || [];
      var links = card.links || [];

      refLabelEl.textContent = (node.module || '?') + '.' + (node.name || '?') + '/' + (node.anykey == null ? '?' : node.anykey) +
        '  effect=' + (node.effect || 'unknown') + '  status=' + (node.status || '?');

      if (links.length) {
        var linkText = links.map(function (l) { return '--' + l.role + '--> ' + l.ref; }).join('  ');
        msgEl.textContent = (msgEl.textContent ? msgEl.textContent + '  ' : '') + '[links] ' + linkText;
      }

      if (!calls.length) {
        msgEl.textContent = (msgEl.textContent ? msgEl.textContent + '  ' : '') + '(no calc rows)';
      }

      var maxArgs = calls.reduce(function (n, c) { return Math.max(n, (c.args || []).length); }, 0);
      var anyError = calls.some(function (c) { return c.error != null && c.error !== ''; });
      var columns = [];
      for (var i = 0; i < maxArgs; i++) columns.push({ key: 'arg' + i, label: 'arg' + i, render: 'text' });
      columns.push({ key: 'result', label: 'result', render: 'ref' });
      columns.push({ key: 'repr', label: 'repr', render: 'text' });
      columns.push({ key: 'compare', label: 'compare', render: 'state' });
      columns.push({ key: 'eval_count', label: 'eval_count', render: 'number' });
      columns.push({ key: 'state', label: 'state', render: 'state' });
      // eval_error rows carry Xipe Totec's error text -- shown as-is, only
      // when some row has one
      if (anyError) columns.push({ key: 'error', label: 'error', render: 'text' });

      var rows = calls.map(function (c) {
        var cells = {};
        for (var i2 = 0; i2 < maxArgs; i2++) {
          var v = c.args && c.args[i2];
          cells['arg' + i2] = v == null ? '' : String(v);
        }
        cells.result = c.result == null ? '' : String(c.result);
        cells.repr = c.repr == null ? '' : String(c.repr);
        cells.compare = c.compare == null ? '' : String(c.compare);
        cells.eval_count = String(c.eval_count == null ? 0 : c.eval_count);
        cells.state = c.state == null ? '' : String(c.state);
        if (anyError) cells.error = c.error == null ? '' : String(c.error);
        return { id: c.id, cells: cells };
      });

      grid.setColumns(columns);
      grid.setRows(rows);
      grid.render();
      showDetail();
      return done(true, '', rows.length);
    }).catch(function (err) {
      if (seq !== loadSeq) return null;
      // xipe-client's messages already start with "xipe: "
      var m = err && err.message ? err.message : String(err);
      fail('(' + m + ')');
      return done(false, m);
    });
  }

  if (bus) {
    bus.onMine('matrix.reload', function () { load(current); });
    bus.onMine('matrix.load', function (p) {
      if (p && typeof p.kind === 'string' && p.kind) load({ kind: p.kind, ref: p.ref || 'all', root: p.root || '.' });
    });
    // a table given by its synthesis' main (kind given only)
    bus.onMine('matrix.show', function (p) {
      if (current.kind !== 'given' || !p) return;
      refLabelEl.textContent = String(p.label || ref);
      if (p.error) { fail('(' + p.error + ')'); return; }
      givenShown = true;
      showGrid(true);
      grid.setColumns(Array.isArray(p.columns) ? p.columns : []);
      grid.setRows(Array.isArray(p.rows) ? p.rows : []);
      grid.render();
      msgEl.textContent = p.message ? '(' + p.message + ')' : '';
      showDetail();
    });
  }

  function said(label, r) {
    if (r) msgEl.textContent = '(' + label + ' ── ' + MC.format(r) + '  ' + (r.ok ? (r.message ? r.message + ' ' : '') + r.rows + ' rows' : r.message) + ')';
    return r;
  }
  serveCommands({
    update: function () { return load(current).then(function (r) { return said('matrix update', r); }); },
    get: function (args) {
      var t = MC.parsePath(args.path);
      if (t.error) { msgEl.textContent = '(matrix get: ' + t.error + ')'; return true; }
      return load(t).then(function (r) { return said('matrix get', r); });
    },
    pwd: function () { msgEl.textContent = MC.format(current); return true; },
  });

  load(current);
  if (reqId) msgEl.textContent = '(opened via req=' + reqId + ')';
})();
