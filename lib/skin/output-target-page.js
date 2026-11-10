// lib/skin/output-target-page.js -- where the receiving side takes its lines
// from (panels/extra/output_target.html; D-unified-dock). The counterpart of
// input_target: the sources are output_target/index.json (order, letter) and
// output_target/<id>.json (label, the scripts of its way, lib/recv/<id>.js,
// which registers Tezcatl.recvSources[<id>]). Each lists the candidates there
// now, one row each, picked by its letter (with a number after it when there
// are more than one) or a click: the choice is said (recv.chosen) and kept.
//
// The skin asks which record to show (recv.show {id, key, follow}: the one
// chosen, or -- while the keyboard is in its input form -- where the input
// sends, follow true) and is answered with it (recv.lines {id, key, label,
// follow, own, missing, lines}), again whenever it moves. own: the record is
// the frame's own (tezcatl), so no lines. A candidate that is not here (a
// destination with no source, or gone) gives tezcatl's, with missing set.
// Alone in a window, the chosen record shows under the list.
//
// It takes a recv.show only when meant for it (as input_target takes
// lead.send): in a skin, from its siblings or the skin page; alone, only one
// addressed to it. It is not one of the panels focused last (no panelFrame.init).
(function () {
  'use strict';
  var T = window.Tezcatl;
  var params = new URLSearchParams(location.search);
  T.bus.identify({ role: 'output_target', name: params.get('name') || null });

  var headEl = document.getElementById('head');
  var listEl = document.getElementById('list');
  var linesEl = document.getElementById('lines');
  var noteEl = document.getElementById('note');

  var ctx = { siblings: function () { return T.skinPort.siblings(window) || []; } };
  var srcs = [];         // [{id, letter, label, way}]
  var chosen = { id: 'tezcatl', key: 'tezcatl' };
  var shown = null;      // {id, key, follow, to}: what the skin asked for
  var typed = '';
  var timer = null;
  var lastSent = null;   // the last recv.lines sent (its addressee and body)

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

  // the rows now: [{code, src, cand}]
  function rows() {
    var out = [];
    srcs.forEach(function (s) {
      var cs = s.way.candidates();
      cs.forEach(function (c, i) { out.push({ code: s.letter + (cs.length > 1 ? String(i + 1) : ''), src: s, cand: c }); });
    });
    return out;
  }
  function find(rs, id, key) { return rs.filter(function (r) { return r.src.id === id && r.cand.key === key; })[0] || null; }
  function tez(rs) { return rs.filter(function (r) { return r.src.id === 'tezcatl'; })[0] || null; }

  function stateText(s) { return s === 'open' ? 'connected' : s; }

  function show() {
    var rs = rows();
    var cur = find(rs, chosen.id, chosen.key);
    var sh = shown ? find(rs, shown.id, shown.key) || tez(rs) : null;
    listEl.textContent = '';
    rs.forEach(function (r) {
      var el = document.createElement('div');
      el.className = 'row' + (r === cur ? ' on' : '') + (r === sh ? ' shown' : '');
      el.innerHTML = '<span class="code"></span><span class="label"></span><span class="state"></span><span class="detail"></span>';
      el.querySelector('.code').textContent = r.code;
      el.querySelector('.label').textContent = r.cand.label;
      el.querySelector('.state').textContent = stateText(r.cand.state);
      el.querySelector('.state').className = 'state ' + r.cand.state;
      el.querySelector('.detail').textContent = r.cand.detail || '';
      el.addEventListener('click', function () { choose(r); });
      listEl.appendChild(el);
    });
    headEl.textContent = '← ' + (cur ? cur.cand.label : '(gone) choose again');
    if (shown && shown.follow && sh) {
      var f = document.createElement('span');
      f.className = 'follow';
      f.textContent = '   now: ' + sh.cand.label + ' (following the input)';
      headEl.appendChild(f);
    }
    // alone: the chosen record here
    if (!T.skinPort.siblings(window)) {
      var ls = cur ? cur.src.way.lines(cur.cand.key) : null;
      linesEl.textContent = ls ? ls.slice(-60).map(function (l) { return l.text; }).join('\n') : '';
      linesEl.scrollTop = linesEl.scrollHeight;
    }
  }

  // the record shown, to the skin that asked
  function answer() {
    timer = null;
    if (!shown) return;
    var rs = rows();
    var hit = find(rs, shown.id, shown.key);
    var r = hit || tez(rs);
    if (!r) return;
    var ls = r.src.way.lines(r.cand.key);
    var msg = {
      id: r.src.id, key: r.cand.key, label: r.cand.label, follow: !!shown.follow, own: ls === null,
      missing: hit ? null : (shown.label || shown.id), lines: ls || [],
    };
    // the same answer again is not sent (a terminal printing while another record is shown)
    var k = shown.to + '\n' + JSON.stringify(msg);
    if (k === lastSent) return;
    lastSent = k;
    T.bus.post('recv.lines', msg, { to: shown.to });
  }
  function soon() { if (!timer) timer = setTimeout(answer, 120); }

  // a source moved (an xterm prints at every chunk): the list is drawn and the
  // record answered at most once in DRAW_MS, not at each change
  var DRAW_MS = 120;
  var drawTimer = null;
  function changed() {
    if (!drawTimer) drawTimer = setTimeout(function () { drawTimer = null; show(); }, DRAW_MS);
    soon();
  }

  function choose(r) {
    chosen = { id: r.src.id, key: r.cand.key };
    note('');
    show();
    T.bus.post('recv.chosen', { id: r.src.id, key: r.cand.key, label: r.cand.label });
  }

  function note(text, cls) { noteEl.textContent = text || ''; noteEl.className = cls || ''; }

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.key.length !== 1) return;
    var rs = rows();
    var code = typed + e.key;
    var exact = rs.filter(function (r) { return r.code === code; })[0];
    var longer = rs.some(function (r) { return r.code.length > code.length && r.code.indexOf(code) === 0; });
    if (exact && !longer) { typed = ''; choose(exact); e.preventDefault(); return; }
    if (longer) { typed = code; note(code + '…'); e.preventDefault(); return; }
    typed = '';
    note('nothing is "' + code + '"', 'err');
  });

  function forMe(meta) {
    var me = T.bus.self.id;
    if (meta.to && meta.to !== me) return false;
    var sib = T.skinPort.siblings(window);
    if (!sib) return meta.to === me;
    var from = meta.from && meta.from.id;
    return from === T.skinPort.id(window) || sib.some(function (x) { return x.id === from; });
  }

  T.bus.on('recv.show', function (p, meta) {
    if (!forMe(meta) || !p || !p.id) return;
    shown = { id: p.id, key: p.key || null, label: p.label || null, follow: !!p.follow, to: meta.from.id };
    // a destination's key is its own (input_target's): one source with one candidate is that one
    var s = srcs.filter(function (x) { return x.id === p.id; })[0];
    if (s && !p.key) { var cs = s.way.candidates(); if (cs.length === 1) shown.key = cs[0].key; }
    show();
    lastSent = null;
    answer();
  });

  getJson('output_target/index.json').then(function (index) {
    var list = (index && index.sources) || [];
    return list.reduce(function (p, t) {
      return p.then(function () {
        return getJson('output_target/' + t.id + '.json').then(function (cfg) {
          return (cfg.scripts || []).reduce(function (q, src) { return q.then(function () { return load(src); }); }, Promise.resolve())
            .then(function () {
              var reg = T.recvSources && T.recvSources[t.id];
              if (!reg) throw new Error('lib/recv for "' + t.id + '" did not register');
              var way = reg.create(ctx);
              srcs.push({ id: t.id, letter: t.letter, label: cfg.label || t.id, way: way });
              way.start(changed);
            });
        }).catch(function (err) { note(t.id + ': ' + (err && err.message || err), 'err'); });
      });
    }, Promise.resolve());
  }).then(function () {
    show();
    T.sourcesReady = true;
    soon();
  }, function (err) { note(String(err && err.message || err), 'err'); });
})();
