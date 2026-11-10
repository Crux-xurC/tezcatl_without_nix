// lib/vent/decode-emacs-page.js -- the page script of the decode_emacs panel
// (panels/resident/decode_emacs.html). A page is what it looks like; what it
// does is here. The page loads it after the scripts it needs.
// The decode_emacs panel (D-decode-emacs): an answer of Emacs made a table. An
// intent that says how (its result.table, docs/extending/intents.md) has its
// JSON answer drawn here as a matrix (lib/xipe/matrix-grid.js as it is) --
// intent.result {id, args, payload, table}, posted by the resolver of the input
// panel. ?intent=<id> keeps the panel to that intent's answers; with
// &args=<JSON> too, it asks that intent once on opening (the frame's
// `table <intent> ...`).
//   Enter     the row's file (the table's `link`: an absolute path is made one
//             from the FS root), at the table's `line` if it has one -- code.open-at;
//             or what the key of the table's `enter` does
//   r         the intent asked again (with the arguments it had)
//   b         the table into a book, ~work/books/decode/<intent>.json (the rows
//             chosen with v, else every row shown, in the order shown) -- what an
//             intent's sql.load makes a table on database window 1 (D-db-session)
//   its keys  the table's `keys` (one with `confirm`: on its second press on the
//             same row within CONFIRM_MS, D-discard-confirm): an intent with the row's values (intent.run
//             to the input panel, then `refresh`), a tezcatl-command, or a diff:
//             an intent whose answer is a text (a version of the file) written to
//             ~work/emacs/<intent>/<path> and compared with the file (code_diff),
//             or two versions both from intents, or an ask: a code_vi_minimum
//             for a sentence (minimum.ask to the frame), and what :m sends runs
//             the intent, then `refresh`, or a table: the intent's answer in a
//             decode_emacs of its own (table.open to the frame)
// Nothing of a message's human text is read: only the intent's JSON answer.
(function () {
  'use strict';
  var T = Tezcatl;
  var bus = T.bus;
  var DT = T.decodeTable;
  var L = T.codeLocate;
  var params = new URLSearchParams(location.search);
  var NAME = params.get('name') || 'decode_emacs';
  var only = params.get('intent') || null;
  var gridEl = document.getElementById('grid-wrap');
  var footEl = document.getElementById('foot');
  var HINT = footEl.textContent;
  T.panelFrame.init({ role: 'decode_emacs', name: NAME });
  if (T.panelFrame.setFocusTarget) T.panelFrame.setFocusTarget(gridEl);
  var env = L.pageEnv(window);

  var shown = null;   // {id, args, table, rows, at}
  var fsRoot = null;
  T.xipePlace.fsRoot(T.config, fetch.bind(window)).then(function (r) { fsRoot = r; });
  var baseP = T.config.load().then(function (c) {
    var u = c && c.connections && c.connections[0] && c.connections[0].url;
    if (!u) return null;
    var x = new URL(u);
    return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host;
  }).catch(function () { return null; });

  function say(text, err) { footEl.textContent = text || HINT; footEl.className = err ? 'err' : ''; }
  function tell(text, err, ref) { say(text, err); bus.post('recv.say', { text: text, cls: err ? 'err' : null, ref: ref || null }); }
  function two(n) { return (n < 10 ? '0' : '') + n; }

  var grid = T.matrixGrid.create({ el: gridEl, bus: bus });
  function empty(text) {
    gridEl.textContent = '';
    var d = document.createElement('div');
    d.className = 'empty';
    d.textContent = text;
    gridEl.appendChild(d);
  }
  empty(only ? 'waiting for ' + only + ' (an intent with a table, from the input panel)' : 'waiting for an intent with a table (from the input panel)');

  function show(p) {
    var t = DT.table(p.table, p.payload);
    var d = new Date();
    document.getElementById('intent').textContent = p.id;
    document.getElementById('when').textContent = two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
    if (t.error) { shown = null; empty(p.id + ': ' + t.error); say('! ' + t.error, true); return; }
    shown = { id: p.id, args: p.args || {}, table: p.table, rows: t.rows };
    grid.setColumns(t.columns);
    grid.setRows(t.rows);
    grid.render();
    say(t.rows.length + ' row(s) ── ' + keyHint());
  }
  function keyHint() {
    var ks = Object.keys((shown && shown.table.keys) || {});
    return (shown && shown.table.link ? 'Enter: open · ' : shown && shown.table.enter ? 'Enter: ' + shown.table.enter + ' · ' : '') + ks.map(function (k) {
      var a = shown.table.keys[k];
      return k + ': ' + (a.ask ? a.ask + ' → ' : '') + (a.intent || a.command || (a.table && 'the table of ' + a.table) || (a.diff && 'diff by ' + a.diff.intent));
    }).concat(['r: ask again', 'b: into a book']).join(' · ');
  }

  bus.on('intent.result', function (p) {
    if (!p || !p.table || (only && p.id !== only)) return;
    show(p);
  });

  // the row under the cursor
  function row() {
    if (!shown) return null;
    var g = grid.getState();
    if (g.cursor.rowIndex == null) return null;
    var id = g.order[g.cursor.rowIndex];
    return shown.rows.filter(function (r) { return r.id === id; })[0] || null;
  }

  // b: the rows chosen (v), else every row shown, into the intent's book
  function toBook() {
    if (!shown) { say('no table yet'); return; }
    var g = grid.getState();
    var ids = g.mode === 'visual' ? grid.coord().ids : g.order;
    var b = DT.bookOf(shown.id, shown.args, g.columns, shown.rows, ids);
    baseP.then(function (base) {
      if (!base) throw new Error('config.json has no relay URL');
      return fetch(base + '/fs/write?path=' + encodeURIComponent(b.path), { method: 'PUT', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: JSON.stringify(b.book, null, 1) + '\n' });
    }).then(function (w) {
      if (!w.ok) throw new Error('could not write ' + b.path + ' (HTTP ' + w.status + ')');
      tell('book ' + b.book.name + ' ── ' + b.book.rows.length + ' row(s) (' + b.path + ')', false);
    }).catch(function (e) { tell('! ' + e.message, true); });
  }

  // an intent asked through the input panel's resolver -> Promise<payload>
  var seq = 0;
  function run(id, args, confirmed) {
    return new Promise(function (resolve, reject) {
      var req = 'de-' + Date.now().toString(36) + '-' + (++seq);
      var done = false;
      function stop() { done = true; off(); offTook(); clearTimeout(timer); }
      var off = bus.on('intent.ran', function (p) {
        if (done || !p || p.req !== req) return;
        stop();
        if (p.ok) resolve(p.payload); else reject(new Error(p.error || 'failed'));
      });
      // a later intent's process started (D-intent-later): no time limit from now
      var offTook = bus.on('intent.took', function (p) {
        if (done || !p || p.req !== req) return;
        clearTimeout(timer);
        say(id + ' ── running (answered when it ends)');
      });
      var ask = { req: req, id: id, args: args || {} };
      if (confirmed) ask.confirmed = true;
      bus.post('intent.run', ask);
      var timer = setTimeout(function () {
        if (done) return;
        stop();
        reject(new Error('no answer for ' + id + ' ── is an input panel open (it runs the intents)?'));
      }, 6000);
    });
  }
  function refresh() {
    if (!shown) return;
    var id = shown.table.refresh || shown.id;
    run(id, shown.table.refresh ? {} : shown.args).catch(function (e) { say('! ' + e.message, true); });
  }

  function openRow() {
    var r = row();
    if (!r || !shown.table.link) return;
    var path = DT.fsPath(r.cells[shown.table.link], fsRoot);
    if (!path) { say('! ' + r.cells[shown.table.link] + ' is not under the FS root (' + (fsRoot || '?') + ')', true); return; }
    var line = shown.table.line ? parseInt(r.cells[shown.table.line], 10) : NaN;
    L.openAt(env, { path: path, line: line > 0 ? line : null, col: null }).then(function (x) { say((x && x.message) || path, !(x && x.ok)); });
  }

  // a diff: the intent's answer (a text: a version of the file) against the
  // file, or two intents' answers against each other (DT.diffSides)
  function diff(spec, r) {
    var sides = DT.diffSides(spec, r, fsRoot);
    if (sides.error) { say('! ' + sides.error, true); return; }
    function fetchSide(x) {
      if (x.file) return Promise.resolve(x.file);
      return run(x.intent, x.args).then(function (text) {
        if (typeof text !== 'string') throw new Error(x.intent + ' did not answer a text');
        return baseP.then(function (base) {
          if (!base) throw new Error('config.json has no relay URL');
          return fetch(base + '/fs/write?path=' + encodeURIComponent(x.copy), { method: 'PUT', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: text });
        }).then(function (w) {
          if (!w.ok) throw new Error('could not write ' + x.copy + ' (HTTP ' + w.status + ')');
          return x.copy;
        });
      });
    }
    say('asking ' + [sides.a.intent, sides.b.intent].filter(Boolean).join(' and ') + '…');
    fetchSide(sides.a).then(function (a) {
      return fetchSide(sides.b).then(function (b) {
        if (T.skinPort && T.skinPort.inSkin(window)) { bus.post('diff.open', { a: a, b: b }); say('diff ── ' + a + ' | ' + b + ' (asked the skin)'); return; }
        var win = env.open(env.sibling('panels/resident/code_diff.html') + '?a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b), 'tezcatl-diff-' + Date.now().toString(36));
        say(win ? 'diff ── ' + a + ' | ' + b : '! could not open a new window (the pop-up was blocked)', !win);
      });
    }).catch(function (e) { say('! ' + e.message, true); });
  }

  // a table: the intent's answer in a decode_emacs of its own -- the frame adds
  // one (or asks the one it has); outside a frame, the answer goes to any
  // decode_emacs that takes it
  function openTable(a, args) {
    if (T.skinPort && T.skinPort.inSkin(window)) { bus.post('table.open', { intent: a.table, args: args }); say('table ── ' + a.table + ' ' + JSON.stringify(args) + ' (asked the skin)'); return; }
    say('asking ' + a.table + '…');
    run(a.table, args).catch(function (e) { say('! ' + e.message, true); });
  }

  function runKey(a, args, confirmed) {
    say(a.intent + ' ' + JSON.stringify(args) + '…');
    run(a.intent, args, confirmed).then(function () {
      tell(a.intent + ' ── done', false);
      refresh();
    }).catch(function (e) { tell('! ' + a.intent + ' ── ' + e.message, true); });
  }

  // an ask: a code_vi_minimum from the frame (minimum.ask); its :m answers minimum.done
  var asking = {};   // req -> {a, args}
  function ask(a, args) {
    if (!(T.skinPort && T.skinPort.inSkin(window))) { say('! ' + a.ask + ' ── asked in a frame only (a code_vi_minimum is added there)', true); return; }
    var req = 'de-ask-' + Date.now().toString(36) + '-' + (++seq);
    asking[req] = { a: a, args: args };
    bus.post('minimum.ask', { req: req, purpose: a.ask });
    say(a.ask + ' ── write it in the code_vi_minimum, :m runs ' + a.intent + ' (:q drops it)');
  }
  bus.on('minimum.done', function (p) {
    var w = p && asking[p.req];
    if (!w) return;
    delete asking[p.req];
    if (p.cancel) { say(w.a.ask + ' ── dropped'); return; }
    var args = Object.assign({}, w.args);
    args[w.a.param] = String(p.text == null ? '' : p.text);
    runKey(w.a, args);
  });

  // a key with confirm (D-discard-confirm): the first press says what goes, the
  // second on the same row within CONFIRM_MS runs it; anything else in between forgets it
  var CONFIRM_MS = 3000;
  var armed = null;   // {k, cells, at}
  function confirmKey(k, a, r) {
    var cells = JSON.stringify(r.cells);
    if (armed && armed.k === k && armed.cells === cells && Date.now() - armed.at <= CONFIRM_MS) {
      armed = null;
      runKey(a, DT.argsOf(a.params, r), true);
      return;
    }
    armed = { k: k, cells: cells, at: Date.now() };
    say(a.confirm + ' ' + JSON.stringify(DT.argsOf(a.params, r)) + ' ── ' + k + ' again to do it (it cannot be undone)', true);
  }

  function key(k) {
    var a = shown && shown.table.keys && shown.table.keys[k];
    if (!a) { armed = null; return false; }
    var r = row();
    if (a.confirm && r) { confirmKey(k, a, r); return true; }
    armed = null;
    if (a.ask != null && !Object.keys(a.params || {}).length) { ask(a, {}); return true; }
    if (!r) { say('a row first'); return true; }
    if (a.ask != null) { ask(a, DT.argsOf(a.params, r)); return true; }
    if (a.diff) { diff(a.diff, r); return true; }
    if (a.table) { openTable(a, DT.argsOf(a.params, r)); return true; }
    if (a.command) {
      T.commands.invoke(a.command, DT.argsOf(a.args, r), { local: true });
      say(a.command + ' ' + JSON.stringify(DT.argsOf(a.args, r)));
      return true;
    }
    runKey(a, DT.argsOf(a.params, r));
    return true;
  }

  // ?intent=<id>&args=<JSON>: asked once on opening (its answer comes as intent.result)
  if (only && params.get('args') != null) {
    var openArgs = {};
    try { openArgs = JSON.parse(params.get('args')) || {}; } catch (_) { say('! args is not JSON: ' + params.get('args'), true); }
    say('asking ' + only + '…');
    run(only, openArgs).catch(function (e) { say('! ' + e.message, true); });
  }

  gridEl.addEventListener('keydown', function (e) {
    if (armed && e.key !== armed.k) armed = null;   // the cursor moved, another key: the first press is forgotten
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // the filter's prompt, and the second key of the grid's chords (c b / c r: a colour), are the grid's
    if (grid.getState().filterPrompt || grid.getState().pendingChord) { var n0 = T.keymap.normalize(e); if (n0 && grid.handleKey(n0)) { e.preventDefault(); grid.render(); } return; }
    if (e.key === 'Enter') { e.preventDefault(); if (shown && shown.table.enter) key(shown.table.enter); else openRow(); return; }
    if (e.key === 'r') { e.preventDefault(); refresh(); return; }
    if (e.key === 'b') { e.preventDefault(); toBook(); return; }
    if (e.key.length === 1 && key(e.key)) { e.preventDefault(); return; }
    var n = T.keymap.normalize(e);
    if (n && grid.handleKey(n)) { e.preventDefault(); grid.render(); }
  });
})();
