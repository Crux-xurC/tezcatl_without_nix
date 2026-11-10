// lib/skin/input-target-page.js -- where the lead-key input form sends
// (panels/extra/input_target.html; D-lead-key, D-unified-dock).
//
// The input form (input_leadkey) does not know where its keys go: it posts
// `lead.send` {id, events, [target]} and this panel hands the events to the
// destination chosen here (or the one whose code is `target`: a run_table's row),
// unread, answering `lead.sent` {id, ok, error, target, dest, key} to the sender
// (target its label; dest and key which destination and candidate it was).
//
// The destinations are input_target/index.json (order and the letter that
// picks one) and input_target/<id>.json (label, the scripts of its way,
// lib/target/<id>.js, which registers Tezcatl.targets[<id>]). Each lists the
// candidates there now: one row each, picked by its letter -- with a number
// after it when there are more than one (t1, t2) -- or a click. The choice is
// kept here; until one is, the first that can take keys now. A choice whose candidate
// is gone sends nothing and says so.
//
// It takes only a `lead.send` meant for it: in a skin, from the panels of the
// same skin (skinPort.siblings) or the skin page itself (the frame's input form,
// when this one is in its dock), unaddressed or addressed to it; alone in a
// window, only one addressed to it (bus `to`). Unaddressed sends from anyone
// would reach every lone input_target open and go out once for each.
// It is not one of the panels focused last (no panelFrame.init), like the map.
(function () {
  'use strict';
  var T = window.Tezcatl;
  var params = new URLSearchParams(location.search);
  T.bus.identify({ role: 'input_target', name: params.get('name') || null });

  var headEl = document.getElementById('head');
  var listEl = document.getElementById('list');
  var whereEl = document.getElementById('where');
  var noteEl = document.getElementById('note');

  var ctx = { siblings: function () { return T.skinPort.siblings(window) || []; } };
  var dests = [];        // [{id, letter, label, way}]
  var chosen = null;     // {id, key}
  var typed = '';        // a letter waiting for its number

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

  // the rows now: [{code, dest, cand}]
  function rows() {
    var out = [];
    dests.forEach(function (d) {
      var cs = d.way.candidates();
      cs.forEach(function (c, i) {
        out.push({ code: d.letter + (cs.length > 1 ? String(i + 1) : ''), dest: d, cand: c });
      });
    });
    return out;
  }
  function chosenRow(rs) {
    if (!chosen) return null;
    return rs.find(function (r) { return r.dest.id === chosen.id && r.cand.key === chosen.key; }) || null;
  }

  function stateText(s) { return s === 'open' ? 'connected' : s; }

  // until one is chosen: the first that can take keys now
  function chooseFirst(rs) {
    if (chosen) return;
    var first = rs.find(function (r) { return r.cand.state === 'open'; });
    if (first) chosen = { id: first.dest.id, key: first.cand.key };
  }

  function show() {
    var rs = rows();
    chooseFirst(rs);
    var cur = chosenRow(rs);
    listEl.textContent = '';
    rs.forEach(function (r) {
      var el = document.createElement('div');
      el.className = 'row' + (r === cur ? ' on' : '');
      el.innerHTML = '<span class="code"></span><span class="label"></span><span class="state"></span><span class="detail"></span>';
      el.querySelector('.code').textContent = r.code;
      el.querySelector('.label').textContent = r.cand.label;
      el.querySelector('.state').textContent = stateText(r.cand.state);
      el.querySelector('.state').className = 'state ' + r.cand.state;
      el.querySelector('.detail').textContent = r.cand.detail || '';
      el.addEventListener('click', function () { choose(r); });
      listEl.appendChild(el);
    });
    if (cur) {
      headEl.textContent = '→ ' + cur.cand.label;
      headEl.className = '';
      whereEl.textContent = (cur.cand.lines || []).join('\n');
    } else {
      headEl.textContent = chosen ? '→ (gone) choose again' : '→ (none)';
      headEl.className = 'gone';
      whereEl.textContent = '';
    }
  }

  // a choice is said (lead.chosen), so that the frame takes the keyboard back
  // to its input form when it sent us here (;i)
  function choose(r) {
    chosen = { id: r.dest.id, key: r.cand.key };
    note('');
    show();
    T.bus.post('lead.chosen', { id: r.dest.id, key: r.cand.key, label: r.cand.label });
  }

  function note(text, cls) {
    noteEl.textContent = text || '';
    noteEl.className = cls || '';
  }

  // a letter, then a number when that letter has more than one row
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.key.length !== 1) return;
    var rs = rows();
    var code = typed + e.key;
    var exact = rs.find(function (r) { return r.code === code; });
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
    // the skin page itself (the frame's own input form) is of the skin too
    return from === T.skinPort.id(window) || sib.some(function (x) { return x.id === from; });
  }

  T.bus.on('lead.send', function (payload, meta) {
    if (!forMe(meta)) return;
    var id = payload && payload.id;
    var events = (payload && payload.events) || [];
    // a line sent before the list was first shown goes where it would have gone
    var rs = rows();
    chooseFirst(rs);
    // target: a code of the list (t, x2 -- a run_table's row), else the one chosen here
    var code = payload && typeof payload.target === 'string' && payload.target.trim() ? payload.target.trim() : null;
    var cur = code ? rs.find(function (r) { return r.code === code; }) || null : chosenRow(rs);
    var reply = function (r) {
      T.bus.post('lead.sent', {
        id: id, ok: !!r.ok, error: r.error || null, target: cur ? cur.cand.label : null,
        dest: cur ? cur.dest.id : null, key: cur ? cur.cand.key : null,
      }, { to: meta.from.id });
    };
    if (!events.length) { reply({ ok: false, error: 'nothing to send' }); return; }
    if (!cur) {
      reply({ ok: false, error: code ? 'no destination "' + code + '" in input_target (' + rs.map(function (r) { return r.code; }).join(' ') + ')'
        : chosen ? 'the destination is gone: choose one in input_target' : 'no destination' });
      return;
    }
    cur.dest.way.send(cur.cand.key, events).then(function (r) { reply(r); },
      function (err) { reply({ ok: false, error: String(err && err.message || err) }); });
  });

  getJson('input_target/index.json').then(function (index) {
    var list = (index && index.targets) || [];
    return list.reduce(function (p, t) {
      return p.then(function () {
        return getJson('input_target/' + t.id + '.json').then(function (cfg) {
          return (cfg.scripts || []).reduce(function (q, src) { return q.then(function () { return load(src); }); }, Promise.resolve())
            .then(function () {
              var reg = T.targets && T.targets[t.id];
              if (!reg) throw new Error('lib/target for "' + t.id + '" did not register');
              var way = reg.create(ctx);
              dests.push({ id: t.id, letter: t.letter, label: cfg.label || t.id, way: way });
              way.start(show);
            });
        }).catch(function (err) { note(t.id + ': ' + (err && err.message || err), 'err'); });
      });
    }, Promise.resolve());
  }).then(function () {
    show();
    // every destination is in: a lead-key form may send here now (the frame's dock waits for this)
    T.targetsReady = true;
  }, function (err) { note(String(err && err.message || err), 'err'); });
})();
