// lib/code/file-changes-page.js -- the page script of the file_changes panel
// (panels/resident/file_changes.html). A page is what it looks like; what it
// does, its tezcatl-commands included, is here. The page loads it after the
// scripts it needs.
// The file-changes panel:
// put it in the skin next to code_editor (the frame: skin add <column>
// file_changes). It never watches the disk and has no timer: it listens to
// what already says a file changed on the bus -- code.saved / fs.changed
// from any code_editor, and file.changed from decoding patches -- asks every
// code_editor open (code.query, every window) which file each has, and does
// the rest with commands that already exist (lib/code/file-changes.js):
//   a clean code_editor on the changed file -> code.file edit (`:e`: read again,
//   the cursor kept; it refuses over unsaved edits, so nothing is lost)
//   an edited one, a delete, a rename -> listed here; Enter -> code.reveal to
//   that code_editor (in a skin, its pane comes to the front)
// And a code_editor closed with unsaved edits (closing is never refused; its copy
// stays): code.closed from it, and -- when this panel starts, since it
// may have gone with it (a reload) -- the relay's slots marked unsaved_closed.
// Enter opens the file (a code_editor that has it, else in a skin code.open --
// the frame adds a code_editor --, else a new window); that code_editor says a copy is
// left: :Replay, then :w. Nothing is replayed by itself.
// A copy not wanted is thrown away here: `d` twice on its line (POST
// /mirror/drop -- only a copy left by a code_editor closed unsaved, never one a
// code_editor holds now). mirror.left {paths, why} -- a rename refused because it
// would overwrite such copies -- lists them again.
// The tezcatl-commands mirror.list (read the relay's left copies again, come
// here) and mirror.drop {path} do the same from elsewhere.
(function () {
  'use strict';
  var T = Tezcatl;
  var bus = T.bus;
  var C = T.fileChanges;
  var L = T.codeLocate;
  var listEl = document.getElementById('list');
  var countEl = document.getElementById('count');
  var footEl = document.getElementById('foot');
  var NAME = new URLSearchParams(location.search).get('name') || 'file_changes';
  T.panelFrame.init({ role: 'file_changes', name: NAME });
  var env = L.pageEnv(window);

  var items = [];   // newest first: {kind: 'info'|'warn', text, id, name, at, open}  (open: a path to open on Enter)
  var sel = 0;
  function hhmm(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }
  function render() {
    listEl.innerHTML = '';
    items.forEach(function (it, i) {
      var li = document.createElement('li');
      li.className = it.kind + (i === sel ? ' sel' : '');
      var t = document.createElement('span');
      t.className = 't';
      t.textContent = hhmm(it.at);
      li.appendChild(t);
      li.appendChild(document.createTextNode(it.text));
      if (it.name) {
        var w = document.createElement('span');
        w.className = 'who';
        w.textContent = '[' + it.name + ']';
        li.appendChild(w);
      }
      li.addEventListener('click', function () { sel = i; render(); go(); });
      listEl.appendChild(li);
    });
    var warn = items.filter(function (x) { return x.kind === 'warn'; }).length;
    countEl.textContent = warn ? warn + ' notice(s)' : '';
  }
  function add(kind, text, who, open, at) {
    items.unshift({ kind: kind, text: text, id: who && who.id, name: who && who.name, at: at || new Date(), open: open || null });
    if (items.length > 200) items.length = 200;
    sel = 0;
    render();
  }

  // code.json "fileChanges": {"reload": false} turns the reading again off (the default: on)
  var optsP = fetch(T.config.sibling('code.json'), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (doc) { return { reload: !(doc && doc.fileChanges && doc.fileChanges.reload === false) }; })
    .catch(function () { return { reload: true }; });

  // the same change said twice in a row (a new file: code.saved + fs.changed) is one
  var recent = {};
  function onChange(type, payload, meta) {
    var change = C.fromMessage(type, payload, meta);
    if (!change) return;
    var k = C.key(change);
    var now = Date.now();
    if (recent[k] && now - recent[k] < 1500) return;
    recent[k] = now;
    Promise.all([L.query(env), optsP]).then(function (got) {
      var r = C.plan(change, got[0], got[1]);
      r.reload.forEach(function (e) {
        bus.post('code.file', { op: 'edit', arg: '', bang: false }, { to: e.id });
        add('info', 'read ' + e.path + ' again (changed by ' + change.source + ')', e);
        // done beside what was asked: said on the skin's receiving side, with the code_editor to go to
        bus.post('recv.say', { text: 'read ' + e.path + ' again (changed by ' + change.source + ')', ref: { kind: 'bus', id: e.id, name: e.name } });
      });
      r.notices.forEach(function (n) {
        add('warn', n.text, n);
        bus.post('recv.say', { text: n.text, cls: 'err', ref: { kind: 'bus', id: n.id, name: n.name } });
      });
    });
  }
  ['code.saved', 'fs.changed', 'file.changed'].forEach(function (type) {
    bus.on(type, function (p, meta) { onChange(type, p, meta); });
  });

  // a code_editor closed with unsaved edits (one notice per path)
  function closed(n, at) {
    if (n.path && items.some(function (x) { return x.open === n.path; })) return;
    add('warn', n.text, null, n.copy ? n.path : null, at);
  }
  bus.on('code.closed', function (p) { var n = C.closedNotice(p); if (n) closed(n); });
  var baseP = T.config.load().then(function (cfg) {
    var u = cfg && cfg.connections && cfg.connections[0] && cfg.connections[0].url;
    if (!u) return null;
    var x = new URL(u);
    return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host;
  }).catch(function () { return null; });
  // the relay's copies left by a code_editor closed unsaved -> listed (once per path)
  function readLeft() {
    return baseP.then(function (base) {
      if (!base) return 0;
      return fetch(base + '/mirror/list', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (doc) {
          var ns = C.closedFromSlots(doc && doc.slots);
          ns.slice().reverse().forEach(function (n) { closed(n, new Date(n.at)); });
          return ns.length;
        });
    }).catch(function () { return 0; });
  }
  readLeft();
  // a rename refused over such copies: listed again (at the top), with how to tidy up
  bus.on('mirror.left', function (p) {
    C.leftNotices(p).forEach(function (n) {
      items = items.filter(function (x) { return x.open !== n.path; });
      add('warn', n.text, null, n.path);
    });
  });

  // throw away the copy of `path` (a code_editor closed unsaved left it)
  function drop(path) {
    return baseP.then(function (base) {
      if (!base) throw new Error('config.json has no relay URL');
      return fetch(base + '/mirror/drop?path=' + encodeURIComponent(path), { method: 'POST' })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; }); });
    }).then(function (r) {
      var gone = r.status === 200 || r.status === 404;
      if (gone) {
        items = items.filter(function (x) { return x.open !== path; });
        sel = Math.min(sel, Math.max(0, items.length - 1));
        render();
      }
      footEl.textContent = r.status === 200 ? 'dropped the copy of ' + path
        : r.status === 404 ? 'there is no copy of ' + path + ' any more'
        : r.status === 409 ? '! a code_editor has ' + path + ' open now ── the copy is that code_editor\'s (not dropped)'
        : '! could not drop the copy (' + ((r.body && r.body.error) || r.status) + ')';
      return r.status === 200;
    }).catch(function (e) { footEl.textContent = '! could not drop the copy: ' + ((e && e.message) || e); return false; });
  }

  // open a path: the code_editor that has it; else in a skin, the skin's way (code.open); else a new window
  function openPath(path) {
    var inSkin = T.skinPort.inSkin(window);
    var e = inSkin ? Object.assign({}, env, { openNew: function (t) {
      bus.post('code.open', { path: t.path });
      return Promise.resolve({ ok: true, message: t.path + ' ── asked the skin' });
    } }) : env;
    L.openAt(e, { path: path, line: null, col: null }).then(function (r) {
      footEl.textContent = (r && r.message) || path;
    });
  }

  function go() {
    var it = items[sel];
    if (it && it.open) { openPath(it.open); return; }
    if (!it || !it.id) return;
    L.reveal(env, it.id).then(function (r) {
      footEl.textContent = r.focused ? ('to ' + it.name) : (it.name + ' ── could not bring that window forward (switch to it yourself)');
    });
  }
  listEl.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(); }
    else if (e.key === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      var it = items[sel];
      if (!it || !it.open) { footEl.textContent = 'this line has no copy left behind'; armed = null; return; }
      if (armed === it.open) { armed = null; drop(it.open); return; }
      armed = it.open;
      footEl.textContent = 'd again drops the copy of ' + it.open + ' (it cannot be undone)';
      setTimeout(function () { if (armed === it.open) armed = null; }, 3000);
    }
    else if (e.key === 'Delete') { e.preventDefault(); items.splice(sel, 1); sel = Math.min(sel, Math.max(0, items.length - 1)); render(); }
  });
  var armed = null;   // the path a first `d` asked to drop

  // mirror.list / mirror.drop {path}: from the palette or another panel. In a
  // skin (args.skin), only that skin's file_changes takes it.
  function skinId() { return T.skinPort.id(window); }
  function mine(args) { return !(args && args.skin) || args.skin === skinId(); }
  T.commands.register('mirror.list', function (args) {
    if (!mine(args)) return false;
    readLeft().then(function (n) {
      footEl.textContent = n ? n + ' copy(ies) closed unsaved ── Enter opens; :Replay, :w; d d drops' : 'no copies closed unsaved';
      try { window.focus(); } catch (_) {}
      listEl.focus();
    });
    return true;
  });
  T.commands.register('mirror.drop', function (args) {
    if (!mine(args)) return false;
    var path = args && typeof args.path === 'string' ? C.norm(args.path) : '';
    if (!path) { footEl.textContent = '! mirror.drop needs a path'; return true; }
    drop(path);
    return true;
  });
  T.commands.load().catch(function () {});
  T.commands.listenBus();

  T.panelFrame.setFocusTarget && T.panelFrame.setFocusTarget(listEl);
  render();
})();
