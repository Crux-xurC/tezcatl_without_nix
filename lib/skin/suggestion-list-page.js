// lib/skin/suggestion-list-page.js -- the suggestion shell
// (panels/extra/suggestion_list.html?config=<id>; D-suggestions): the words that
// can follow the input line, from one source, in a grid. What it computes is
// lib/skin/suggest.js; the sources are suggestion/index.json and their
// adapters lib/suggest/<id>.js (read when the shell opens -- a source is read
// only when its suggestions are entered).
//
// It does not know the input form. On the bus it takes
//   suggest.filter {text, [note]} the input line now (back to the first page);
//                                with a note, the suggestions are dim and it is shown
//   suggest.shape {rows, cols}   the grid it is put in (the dock: 5 x 2)
// and says
//   suggest.pick {word, text, source}   a word picked (text: the line with it)
//   suggest.leave {key, source}         Shift+an arrow: where to go is the skin's
// Whoever holds the input form writes the word into it and sends the filter
// again. Alone (no filter taken yet), it keeps the line itself: a pick adds
// to it, Backspace drops the last word.
//
// It takes only a filter or a shape meant for it, as input_target does: in a
// skin, from its siblings or the skin page, unaddressed or addressed to it;
// alone in a window, only one addressed to it. Like the map, it is not one
// of the panels focused last (no panelFrame.init).
//
// ?config=<id> the source (default line); ?rows=&cols= the grid (default 5 x 2);
// ?keys= the select keys (else config.json ui.keys.suggestSelect, else 1234567890);
// ?in= and ?list= go to the source (lib/suggest/line.js, dict.js).
(function () {
  'use strict';
  var T = window.Tezcatl;
  var S = T.suggest;
  var params = new URLSearchParams(location.search);
  var sourceId = params.get('config') || 'line';
  T.bus.identify({ role: 'suggestion_list', name: params.get('name') || null });

  var srcEl = document.getElementById('src');
  var lineEl = document.getElementById('line');
  var hintsEl = document.getElementById('hints');
  var gridEl = document.getElementById('grid');
  var prevEl = document.getElementById('prev');
  var nextEl = document.getElementById('next');
  var noteEl = document.getElementById('note');

  function num(v, d) { var n = parseInt(v, 10); return n > 0 ? n : d; }
  var shape = { rows: num(params.get('rows'), 5), cols: num(params.get('cols'), 2) };
  var keys = params.get('keys');
  var idx = null;        // T.suggest.index of the source, once read
  var text = '';         // the input line
  var driven = false;    // a skin sends the line (suggest.filter)
  var dimNote = null;    // the skin's note: these suggestions are not for where the line goes
  var i = 0;             // the cursor, in the numbering of the candidates
  var now = { items: [], hints: [], head: '', partial: '' };

  function note(t, cls) { noteEl.textContent = t || ''; noteEl.className = cls || ''; }
  function el(tag, cls, t) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (t != null) e.textContent = t;
    return e;
  }
  function st() {
    return { i: i, count: now.items.length, rows: shape.rows, cells: shape.rows * shape.cols, keys: keys == null ? S.KEYS : keys };
  }

  function draw() {
    now = idx ? S.next(idx, text) : now;
    if (i >= now.items.length) i = Math.max(0, now.items.length - 1);
    lineEl.textContent = '';
    lineEl.appendChild(document.createTextNode(now.head));
    lineEl.appendChild(el('span', 'partial', now.partial));
    hintsEl.textContent = now.hints.map(function (h) { return h.hint + (h.desc ? ' ── ' + h.desc : ''); }).join('   ');
    gridEl.style.gridTemplateRows = 'repeat(' + shape.rows + ', auto)';
    gridEl.style.gridTemplateColumns = 'repeat(' + shape.cols + ', minmax(0, 1fr))';
    gridEl.textContent = '';
    var p = S.page(st());
    p.cells.forEach(function (c) {
      var it = now.items[c.i];
      var cell = el('div', 'cell' + (c.i === i ? ' on' : ''));
      cell.appendChild(el('span', 'key', c.key || ''));
      cell.appendChild(el('span', 'word', it.word));
      cell.appendChild(el('span', 'desc', it.desc));
      cell.title = it.word + (it.desc ? '  ' + it.desc : '');
      cell.style.gridRow = String(c.row + 1);
      cell.style.gridColumn = String(c.col + 1);
      cell.addEventListener('click', function () { i = c.i; choose(); });
      gridEl.appendChild(cell);
    });
    prevEl.className = 'turn' + (p.prev ? ' can' : '');
    nextEl.className = 'turn' + (p.next ? ' can' : '');
    gridEl.className = dimNote ? 'dim' : '';
    if (dimNote) note(dimNote);
    else if (idx && !now.items.length && !now.hints.length) note('nothing follows "' + text.trim() + '" in ' + sourceId);
    else if (idx) note(now.items.length ? (p.page + 1) + '/' + Math.ceil(now.items.length / (shape.rows * shape.cols)) : '');
  }

  function choose() {
    var it = now.items[i];
    if (!it) return;
    var line = S.pick(text, it.word);
    T.bus.post('suggest.pick', { word: it.word, text: line, source: sourceId });
    // the next word: from the first page (when a skin drives, its filter follows)
    text = line;
    i = 0;
    draw();
  }

  var ARROWS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1 };
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    if (e.shiftKey && ARROWS[e.key]) {
      T.bus.post('suggest.leave', { key: e.key, source: sourceId });
      e.preventDefault();
      return;
    }
    if (e.key === 'Backspace' && !driven) {
      var w = text.replace(/\s+$/, '').split(/\s+/);
      w.pop();
      text = w.length ? w.join(' ') + ' ' : '';
      i = 0;
      draw();
      e.preventDefault();
      return;
    }
    var s = st();
    var ours = e.key === 'Enter' || ARROWS[e.key] || 'hjkl^-'.indexOf(e.key) !== -1 ||
      (e.key.length === 1 && s.keys.indexOf(e.key) !== -1);
    if (!ours) return;
    e.preventDefault();
    var m = S.move(s, e.key);
    i = m.i;
    if (m.pick) choose(); else draw();
  });

  function forMe(meta) {
    var me = T.bus.self.id;
    if (meta.to && meta.to !== me) return false;
    var sib = T.skinPort.siblings(window);
    if (!sib) return meta.to === me;
    var from = meta.from && meta.from.id;
    return from === T.skinPort.id(window) || sib.some(function (x) { return x.id === from; });
  }

  T.bus.on('suggest.filter', function (payload, meta) {
    if (!forMe(meta)) return;
    driven = true;
    text = String((payload && payload.text) || '');
    dimNote = payload && payload.note ? String(payload.note) : null;
    i = 0;
    draw();
  });
  T.bus.on('suggest.shape', function (payload, meta) {
    if (!forMe(meta)) return;
    shape = { rows: num(payload && payload.rows, shape.rows), cols: num(payload && payload.cols, shape.cols) };
    draw();
  });

  // ---- the source --------------------------------------------------------
  function load(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = T.config.sibling(src);
      s.onload = resolve;
      s.onerror = function () { reject(new Error('cannot load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function getJson(path) {
    return fetch(T.config.sibling(path), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
      return r.json();
    });
  }
  function fsReader(base) {
    return function (path) {
      if (!base) return Promise.resolve({ doc: null, error: 'no relay URL' });
      return fetch(base + '/fs/read?path=' + encodeURIComponent(path), { cache: 'no-store' }).then(function (r) {
        if (r.status === 404) return { doc: null, error: null };
        if (!r.ok) return { doc: null, error: 'HTTP ' + r.status };
        return r.json().then(function (d) { return { doc: d, error: null }; },
          function (e) { return { doc: null, error: 'not readable as JSON (' + (e && e.message || e) + ')' }; });
      }, function (e) { return { doc: null, error: String(e && e.message || e) }; });
    };
  }
  function httpBase(u) {
    try { var x = new URL(u); return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host; } catch (_) { return null; }
  }

  srcEl.textContent = sourceId;
  draw();
  Promise.all([T.config.load().catch(function () { return null; }), getJson('suggestion/index.json')]).then(function (got) {
    var cfg = got[0] || {};
    var k = cfg.ui && cfg.ui.keys && cfg.ui.keys.suggestSelect;
    if (keys == null && typeof k === 'string' && k) keys = k;
    var src = ((got[1] && got[1].sources) || []).filter(function (s) { return s.id === sourceId; })[0];
    if (!src) throw new Error('no source "' + sourceId + '" in suggestion/index.json');
    srcEl.textContent = src.label || src.id;
    document.title = 'Tezcatl — suggestion_list_' + src.id;
    var c0 = (cfg.connections && cfg.connections[0]) || {};
    var env = { getJson: getJson, readFs: fsReader(httpBase(c0.url)), params: params };
    return (src.scripts || []).reduce(function (p, s) { return p.then(function () { return load(s); }); }, Promise.resolve())
      .then(function () {
        var way = T.suggestSources && T.suggestSources[src.id];
        if (!way) throw new Error('lib/suggest for "' + src.id + '" did not register');
        return way.load(env);
      })
      .then(function (table) {
        idx = S.index(table, { word: src.word, desc: src.desc, anywhere: src.anywhere });
        draw();
      });
  }).catch(function (err) { note(String(err && err.message || err), 'err'); });
  // no focus() here: in the dock, the shell is read again when its source changes, and must not take the keyboard
})();
