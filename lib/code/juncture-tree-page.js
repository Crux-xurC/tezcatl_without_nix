// lib/code/juncture-tree-page.js -- the page script of the juncture_tree panel
// (panels/resident/juncture_tree.html). A page is what it looks like; what it
// does is here. The page loads it after the scripts it needs.
// The juncture_tree panel (D-juncture): the points kept of one file, drawn as
// the `tree` command draws (lib/code/juncture.js draw), the current one
// marked. Which file: ?path= when it is opened (a skin's `juncture tree`),
// juncture.show {path} to this panel later. Read again when juncture.changed
// says that file's tree changed, and on `r`.
//   Enter  the point into the code_editor that has the file (a code_editor opened for
//          it when none has): code.juncture {op: go, to} -- unsaved, as back
//          and forward put a point in; the text there is kept as a point first
//   d      the point against the file on disk: in a skin, diff.open {a, b} to
//          it (a code_diff added there); alone, a code_diff window
//   o      the point's text (~work/juncture/...) opened, as a path is opened, read only
// What happened is said in the foot, and to the skin's receiving side (recv.say).
(function () {
  'use strict';
  var T = Tezcatl;
  var bus = T.bus;
  var J = T.juncture;
  var L = T.codeLocate;
  var listEl = document.getElementById('list');
  var pathEl = document.getElementById('path');
  var footEl = document.getElementById('foot');
  var HINT = footEl.textContent;
  var params = new URLSearchParams(location.search);
  var NAME = params.get('name') || 'juncture_tree';
  T.panelFrame.init({ role: 'juncture_tree', name: NAME });
  var env = L.pageEnv(window);

  var path = (params.get('path') || '').replace(/^\/+/, '') || null;
  var tree = null;
  var rows = [];    // J.draw: [{id, text}] (id null: the path's row)
  var selId = null;
  var seq = 0;

  function say(text, err) {
    footEl.textContent = text || HINT;
    footEl.className = err ? 'err' : '';
  }
  // to the skin's receiving side too (a panel alone has none: nobody takes it)
  function tell(text, err, ref) {
    say(text, err);
    bus.post('recv.say', { text: text, cls: err ? 'err' : null, ref: ref || null });
  }

  var baseP = T.config.load().then(function (cfg) {
    var u = cfg && cfg.connections && cfg.connections[0] && cfg.connections[0].url;
    if (!u) return null;
    var x = new URL(u);
    return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host;
  }).catch(function () { return null; });

  function empty(text) {
    listEl.innerHTML = '';
    var d = document.createElement('div');
    d.className = 'empty';
    d.textContent = text;
    listEl.appendChild(d);
  }

  function render() {
    pathEl.textContent = path || '';
    if (!path) { empty('No file ── juncture tree <path> in a skin, or ?path='); return; }
    if (!tree) { empty(path + ' is not set ── juncture set (or juncture point) in a skin'); return; }
    listEl.innerHTML = '';
    rows.forEach(function (r) {
      var li = document.createElement('li');
      li.textContent = r.text;
      li.className = (r.id == null ? 'path' : '') + (r.id === tree.current ? ' current' : '') + (r.id != null && r.id === selId ? ' sel' : '');
      if (r.id != null) li.addEventListener('click', function () { selId = r.id; render(); });
      listEl.appendChild(li);
    });
    var s = listEl.querySelector('li.sel');
    if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
  }

  function load() {
    var mine = ++seq;
    if (!path) { tree = null; rows = []; render(); return Promise.resolve(); }
    return baseP.then(function (base) {
      if (!base) throw new Error('config.json has no relay URL');
      return fetch(base + '/juncture/tree?path=' + encodeURIComponent(path), { cache: 'no-store' });
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (b) {
        if (r.status === 404 && b && b.code === 'not_set') return null;
        if (!r.ok || !b) throw new Error((b && b.error) || ('HTTP ' + r.status));
        return b;
      });
    }).then(function (t) {
      if (mine !== seq) return;
      tree = t;
      rows = J.draw(t);
      // the selection stays on its point; else (gone, or new) on the current one
      if (!t || !t.nodes[selId]) selId = t ? t.current : null;
      render();
    }).catch(function (e) {
      if (mine !== seq) return;
      tree = null; rows = []; render();
      say('! could not read the tree: ' + ((e && e.message) || e), true);
    });
  }

  function ids() { return rows.filter(function (r) { return r.id != null; }).map(function (r) { return r.id; }); }
  function move(d) {
    var all = ids();
    if (!all.length) return;
    var i = all.indexOf(selId);
    selId = all[Math.max(0, Math.min(all.length - 1, (i < 0 ? 0 : i) + d))];
    render();
  }

  function req() { return 'jtp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Enter: the point into the code_editor that has the file (one opened for it when none has)
  function go() {
    if (!tree || !selId) return;
    var to = selId;
    var file = path;
    say('putting ' + to + ' into the code_editor of ' + file + '…');
    L.query(env).then(function (list) {
      var hit = L.find(list, file)[0];
      if (hit) return hit.id;
      return L.ensureOpen(env, file).then(function (r) {
        if (!r.ok) throw new Error(r.message);
        return r.id;
      });
    }).then(function (who) {
      return new Promise(function (resolve) {
        var q = req();
        var done = false;
        var off = bus.on('code.juncture.done', function (p) {
          if (done || !p || p.req !== q) return;
          done = true; off();
          resolve({ who: who, a: p });
        });
        bus.post('code.juncture', { req: q, op: 'go', to: to }, { to: who });
        setTimeout(function () { if (!done) { done = true; off(); resolve({ who: who, a: null }); } }, 10000);
      });
    }).then(function (r) {
      var ref = { kind: 'bus', id: r.who };
      if (!r.a) { tell('juncture ── the code_editor of ' + file + ' did not answer', true, ref); return; }
      tell('juncture ' + to + ' ── ' + r.a.message, !r.a.ok, ref);
      (r.a.notes || []).forEach(function (n) { bus.post('recv.say', { text: n, ref: ref }); });
      return load();
    }).catch(function (e) { tell('! juncture ' + to + ' ── ' + ((e && e.message) || e), true); });
  }

  // d: the point against the file on disk, in a code_diff
  function diff() {
    var n = tree && tree.nodes[selId];
    if (!n) return;
    if (T.skinPort && T.skinPort.inSkin(window)) {
      bus.post('diff.open', { a: n.text, b: path });
      say('diff ── ' + selId + ' | ' + path + ' (asked the skin)');
      return;
    }
    var w = env.open(env.sibling('panels/resident/code_diff.html') + '?a=' + encodeURIComponent(n.text) + '&b=' + encodeURIComponent(path), 'tezcatl-diff-' + Date.now().toString(36));
    say(w ? 'diff ── ' + selId + ' | ' + path + ' in a new window' : '! could not open a new window (the pop-up was blocked)', !w);
  }

  // o: the point's text opened as any path (in a skin, the skin's way), read
  // only -- an edit saved there would change the point under the relay's
  // record of it (code.configure {readOnly}: :w refuses too)
  function open() {
    var n = tree && tree.nodes[selId];
    if (!n) return;
    var id = selId;
    L.ensureOpen(env, n.text).then(function (r) {
      if (!r.ok) { say('! ' + r.message, true); return; }
      bus.post('code.configure', { readOnly: true }, { to: r.id });
      say(id + ' opened, read only ── ' + n.text);
    });
  }

  listEl.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); go(); }
    else if (e.key === 'd') { e.preventDefault(); diff(); }
    else if (e.key === 'o') { e.preventDefault(); open(); }
    else if (e.key === 'r') { e.preventDefault(); load().then(function () { say('read again'); }); }
  });

  // juncture.show {path} (to this one; a skin's `juncture tree <path>`): another file
  bus.onMine('juncture.show', function (p) {
    var want = p && typeof p.path === 'string' ? p.path.replace(/^\/+/, '') : '';
    if (!want) return;
    if (want !== path) { path = want; selId = null; }
    load();
  });
  // a point made, the current point moved: read again when it is this file's
  bus.on('juncture.changed', function (p) {
    if (p && path && String(p.path || '').replace(/^\/+/, '') === path) load();
  });

  T.panelFrame.setFocusTarget && T.panelFrame.setFocusTarget(listEl);
  load();
})();
