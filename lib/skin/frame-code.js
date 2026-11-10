// lib/skin/frame-code.js -- the frame's wiring between its panels and code_editor:
// which code_editor is meant now, a file into it (a tree's Enter,
// code.open), a code_editor panel added for a file nobody has (skin add --
// :find, the grep list, :LspDef, a cross-file rename), the input form's ":"
// lines and code_editor's `:#` (lib/skin/skin-ex.js), the `lsp ...` lines
// (lib/skin/lsp-commands.js), `check update` (lib/skin/check-commands.js), `juncture ...`
// (lib/skin/juncture-commands.js), `markdown ...` (lib/skin/markdown-commands.js), `image <path>`
// (lib/skin/image-commands.js), `task_table ...`
// (lib/skin/task-table-commands.js), `env ...` (lib/skin/env-commands.js), and the code.* commands (the frame focused last
// runs them).
// The page gives `h`, its own state and drawing:
//   {T, F, bus, ctx, sfx, form (the dock's input form: set(text), focus()), opening, state(), setState(s), keep(),
//    render(), focusId(id, enter), recv(text, cls, ref), busIdOf(id), refs}
// -> {codes, codeNow, addCode, skinEx, setLast(id), openAt(t), active(), lsp, check, juncture, markdown, image, taskTable, runTable, intentLine, logLine, envLine, codeList(), base()}
// A line said about a panel or a place carries it as its reference (ref:
// lib/skin/recv-refs.js), so that `go on` goes there.
(function (root) {
  'use strict';
  function wire(h) {
    var T = h.T, F = h.F, bus = h.bus;
    var codes = {};      // code_editor panel id -> {path, dirty}
    var lastCode = null;  // the code_editor used last in this frame
    function ours(meta) { return !!(meta && meta.from && meta.from.name && F.find(h.state(), meta.from.name)); }
    function isEditor(id) { var p = F.at(h.state(), F.find(h.state(), id)); return !!(p && F.isEditor(p.panel)); }
    bus.on('code.dirty', function (p, meta) { if (ours(meta) && p) (codes[p.name] = codes[p.name] || {}).dirty = !!p.dirty; });
    bus.on('code.opened', function (p, meta) { if (ours(meta) && p) (codes[p.name] = codes[p.name] || {}).path = p.path; });
    // the code_editor meant now: the focused one, else the one used last, else the first
    function codeNow() {
      var f = F.at(h.state(), h.state().focus);
      if (f && F.isEditor(f.panel)) return f.id;
      if (lastCode && isEditor(lastCode)) return lastCode;
      var all = F.rects(h.state()).panels.filter(function (p) { return F.isEditor(p.panel); });
      return all.length ? all[0].id : null;
    }

    var fsBase = null;
    T.config.load().then(function (cfg) {
      var u = cfg && cfg.connections && cfg.connections[0] && cfg.connections[0].url;
      if (u) { var x = new URL(u); fsBase = (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host; }
    }).catch(function () {});

    function saidAdded(r) { h.recv((r.ok ? '' : '! ') + r.message, r.ok ? null : 'err', r.ok ? r.ref : null); }
    // a file into the frame's code_editor (a tree's Enter, `skin`-less: code.open)
    function openFile(path) {
      var have = Object.keys(codes).filter(function (id) { return isEditor(id) && codes[id].path === path; })[0];
      if (have) { h.focusId(have, true); h.recv(path + ' ── to the code_editor that has it (' + F.placeText(F.find(h.state(), have)) + ')', null, { kind: 'panel', id: have }); return; }
      var id = codeNow();
      // no code_editor, or the one meant now has unsaved edits: one more code_editor (skin add), never over the edits
      if (!id || (codes[id] || {}).dirty) {
        addCode({ path: path, line: null, col: null }).then(saidAdded);
        return;
      }
      var who = h.busIdOf(id);
      if (!who || !fsBase) { h.recv('! ' + path + ' ── the code_editor is still loading', 'err'); return; }
      fetch(fsBase + '/fs/read?path=' + encodeURIComponent(path), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (_) {} throw new Error((j && j.error) || ('HTTP ' + r.status)); }); })
        .then(function (text) {
          // the code_editor refuses it over unsaved edits this frame had not heard of
          // yet (code.openFailed {dirty}): then a code_editor of its own, as above
          var prev = codes[id];
          var offFail = bus.on('code.openFailed', function (p, meta) {
            if (!p || !p.dirty || p.path !== path || !meta || !meta.from || meta.from.name !== id) return;
            offFail(); clearTimeout(tm);
            codes[id] = { path: prev && prev.path, dirty: true };
            addCode({ path: path, line: null, col: null }).then(saidAdded);
          });
          var tm = setTimeout(offFail, 3000);
          bus.post('code.set', { text: text, filename: path }, { to: who });
          codes[id] = { path: path, dirty: false };
          h.focusId(id, true);
          h.recv('opened ' + path + ' ── the code_editor at ' + F.placeText(F.find(h.state(), id)), null, { kind: 'panel', id: id });
        })
        .catch(function (e) { h.recv('! ' + path + ' ── could not read: ' + (e && e.message || e), 'err'); });
    }
    bus.on('code.open', function (p, meta) {
      if (!ours(meta) || !p || !p.path) return;
      openFile(p.path);
    });

    // A file nobody here has, in a new code_editor panel -- `skin add` under the
    // code_editor meant now (else in the focused column, else the 1st), opening the
    // path itself (code_editor.html?path=); then the line, and into it. What another
    // skin does with a new window (lib/code/code-locate.js openNew) -> {ok, opened, message, ref}
    function addCode(t) {
      var cur = codeNow();
      var col = cur ? F.find(h.state(), cur).col : (h.state().focus ? h.state().focus.col : 1);
      var r = F.apply(h.state(), F.parse('skin add ' + col + ' code_editor'), h.ctx);
      if (r.error) return Promise.resolve({ ok: false, message: t.path + ' ── ' + r.error });
      var id = F.at(r.state, r.state.focus).id;
      var where = F.placeText(r.state.focus);
      h.opening[id] = t.path;
      codes[id] = { path: t.path, dirty: false };
      h.setState(r.state);
      h.keep();
      h.render();
      return new Promise(function (resolve) {
        var done = false;
        var offFail = bus.on('code.openFailed', function (p, meta) {
          if (done || !meta || !meta.from || meta.from.name !== id) return;
          done = true; off(); offFail();
          resolve({ ok: false, opened: true, message: t.path + ' ── the code_editor at ' + where + ': ' + ((p && p.reason) || 'could not open') });
        });
        var off = bus.on('code.opened', function (p, meta) {
          if (done || !meta || !meta.from || meta.from.name !== id) return;
          done = true; off(); offFail();
          if (t.line) bus.post('code.goto', { line: t.line, col: t.col ? t.col - 1 : 0 }, { to: meta.from.id });
          h.focusId(id, true);
          resolve({ ok: true, opened: true, ref: { kind: 'panel', id: id },
            message: t.path + (t.line ? ':' + t.line : '') + ' ── added a code_editor at ' + where + ' and opened it' });
        });
        setTimeout(function () {
          if (done) return;
          done = true; off(); offFail();
          resolve({ ok: false, opened: true, message: t.path + ' ── cannot confirm the code_editor at ' + where + ' opened it (see its head)' });
        }, 15000);
      });
    }

    // the input form's ":" lines to the code_editor meant now; code_editor's `:#` here
    // :find, the grep list's Enter, :LspDef ...: a path nobody has opens in a code_editor panel here, not a new window
    var locEnv = Object.assign(T.codeLocate.pageEnv(window), { openNew: addCode });
    var skinEx = T.skinEx.wire({
      bus: bus,
      files: T.codeFiles,
      say: function (t, ref) { h.recv(t, /^!/.test(t) ? 'err' : null, ref); },
      code: codeNow,
      // a code_editor of this frame, or its code_vi_minimum (`:m input`)
      isCode: function (meta) {
        if (!ours(meta)) return false;
        var p = F.at(h.state(), F.find(h.state(), meta.from.name));
        return !!(p && (F.isEditor(p.panel) || p.panel === 'code_vi_minimum'));
      },
      focusPane: function (name) { if (!F.find(h.state(), name)) return false; h.focusId(name, true); return true; },
      focusCmd: function (text) { h.form.set(text); h.recv('from code_editor (sending goes back)'); },
      locate: function (target) {
        var t = T.codeLocate.parseTarget(target);
        if (t.error) return Promise.resolve({ ok: false, message: t.error });
        return T.codeLocate.openAt(locEnv, t);
      },
      grep: function (args) {
        var g = T.codeLocate.parseGrep(args);
        if (g.error) return { ok: false, message: g.error };
        var w = locEnv.open(T.codeLocate.grepUrl(locEnv, g.pattern, g.path || ''), 'tezcatl-grep-' + Date.now().toString(36));
        return w ? { ok: true, message: 'searching ' + (g.path || '/') + ' ── the results are in the list window (Enter opens)' }
                 : { ok: false, message: 'could not open a new window (the pop-up was blocked)' };
      },
    });

    // this frame's code_editor: {id, bus (its bus id), place}
    function codeList() {
      return F.rects(h.state()).panels.filter(function (p) { return F.isEditor(p.panel); }).map(function (p) {
        return { id: p.id, bus: h.busIdOf(p.id), place: F.placeText({ col: p.col, row: p.row }) };
      });
    }
    // the input form's `lsp ...` lines: the relay's language servers, and the wait of this frame's code_editor
    var lsp = T.lspCommands.wire({
      bus: bus, recv: h.recv, codeNow: codeNow,
      base: function () { return fsBase; },
      item: function (n) { return h.refs.item('lsp', n); },
      codes: codeList,
    });
    // `check update [all]`: is the disk still what the code_editor opened (lib/skin/check-commands.js)
    var check = T.checkCommands.wire({ bus: bus, recv: h.recv, codeNow: codeNow, codes: codeList });
    // `juncture set|point|back|forward|tree [path]`: the points kept of a file (lib/skin/juncture-commands.js, D-juncture)
    var juncture = T.junctureCommands.wire({
      bus: bus, J: T.juncture, recv: h.recv, codeNow: codeNow,
      codes: function () { return codeList().map(function (c) { return Object.assign({ path: (codes[c.id] || {}).path || null }, c); }); },
      resolve: function (arg) { return T.codeFiles.resolve(pathNow(), arg); },
      showTree: showTree,
      // a file nobody here has: a code_editor added for it, as :find does
      open: function (path) {
        return addCode({ path: path, line: null, col: null }).then(function (r) {
          saidAdded(r);
          return { ok: r.ok, id: r.ref && r.ref.id, message: r.message };
        });
      },
    });
    // -- diff: two saved files in a code_diff panel (lib/code/code-diff.js) ----
    function pathNow() { var id = codeNow(); return (id && codes[id] && codes[id].path) || ''; }
    // the code_diff meant: the focused one, else the first here
    function diffNowId() {
      var f = F.at(h.state(), h.state().focus);
      if (f && f.panel === 'code_diff') return f.id;
      var all = F.rects(h.state()).panels.filter(function (p) { return p.panel === 'code_diff'; });
      return all.length ? all[0].id : null;
    }
    // a code_diff panel added under the code_editor meant now (else in the focused line, else the 1st)
    function addDiff(a, b) {
      var cur = codeNow();
      var col = cur ? F.find(h.state(), cur).col : (h.state().focus ? h.state().focus.col : 1);
      var r = F.apply(h.state(), F.parse('skin add ' + col + ' code_diff'), h.ctx);
      if (r.error) { h.recv('! diff ── ' + r.error, 'err'); return false; }
      var id = F.at(r.state, r.state.focus).id;
      h.opening[id] = { a: a, b: b };
      h.setState(r.state);
      h.keep();
      h.render();
      h.focusId(id, true);
      h.recv('diff ── ' + a + ' | ' + b + ' in a code_diff added at ' + F.placeText(r.state.focus), null, { kind: 'panel', id: id });
      return true;
    }
    // a line of the input form -> false (not a diff line) | bool
    function diff(line) {
      var c = T.codeDiff.parse(line, function (arg) { return T.codeFiles.resolve(pathNow(), arg); });
      if (!c) return false;
      if (c.error) { h.recv('! ' + c.error, 'err'); return false; }
      if (c.cmd === 'new') return addDiff(c.a, c.b);
      var id = diffNowId();
      var who = id && h.busIdOf(id);
      if (!who) { h.recv('! diff -f ── there is no code_diff here (diff -n A,B adds one)', 'err'); return false; }
      bus.post('diff.set', { a: c.a, b: c.b }, { to: who });
      h.focusId(id, true);
      h.recv('diff ── ' + c.a + ' | ' + c.b + ' in the code_diff at ' + F.placeText(F.find(h.state(), id)), null, { kind: 'panel', id: id });
      return true;
    }
    // diff.open {a, b} from a panel of this frame (the juncture_tree's `d`): a code_diff added here
    bus.on('diff.open', function (p, meta) {
      if (!ours(meta) || !p || typeof p.a !== 'string' || typeof p.b !== 'string') return;
      addDiff(p.a, p.b);
    });
    // -- markdown <path>: a markdown panel added under the code_editor meant now (lib/code/markdown-page.js) ----
    function addMarkdown(path) {
      var cur = codeNow();
      var col = cur ? F.find(h.state(), cur).col : (h.state().focus ? h.state().focus.col : 1);
      var r = F.apply(h.state(), F.parse('skin add ' + col + ' markdown'), h.ctx);
      if (r.error) { h.recv('! markdown ── ' + r.error, 'err'); return false; }
      var id = F.at(r.state, r.state.focus).id;
      h.opening[id] = path;
      h.setState(r.state);
      h.keep();
      h.render();
      h.focusId(id, true);
      h.recv('markdown ── ' + path + ' in a markdown panel added at ' + F.placeText(r.state.focus), null, { kind: 'panel', id: id });
      return true;
    }
    var markdown = T.markdownCommands.wire({
      bus: bus, M: T.markdown, recv: h.recv,
      resolve: function (arg) { return T.codeFiles.resolve(pathNow(), arg); },
      add: addMarkdown,
      panels: function () {
        var f = F.at(h.state(), h.state().focus);
        return F.rects(h.state()).panels.filter(function (p) { return p.panel === 'markdown'; }).map(function (p) {
          return { id: p.id, bus: h.busIdOf(p.id), place: F.placeText({ col: p.col, row: p.row }), focused: !!(f && f.id === p.id) };
        });
      },
    });
    // -- image <path>: the image panel of the frame shows it; none: one added in the focused line (lib/view/image-page.js) ----
    function addImage(path) {
      var col = h.state().focus ? h.state().focus.col : 1;
      var r = F.apply(h.state(), F.parse('skin add ' + col + ' image'), h.ctx);
      if (r.error) { h.recv('! image ── ' + r.error, 'err'); return false; }
      var id = F.at(r.state, r.state.focus).id;
      h.opening[id] = path;
      h.setState(r.state);
      h.keep();
      h.render();
      h.focusId(id, true);
      h.recv('image ── ' + path + ' in an image panel added at ' + F.placeText(r.state.focus), null, { kind: 'panel', id: id });
      return true;
    }
    var image = T.imageCommands.wire({
      bus: bus, I: T.image, recv: h.recv,
      add: addImage,
      panels: function () {
        var f = F.at(h.state(), h.state().focus);
        return F.rects(h.state()).panels.filter(function (p) { return p.panel === 'image'; }).map(function (p) {
          return { id: p.id, bus: h.busIdOf(p.id), place: F.placeText({ col: p.col, row: p.row }), focused: !!(f && f.id === p.id) };
        });
      },
    });
    // -- task_table take <path> <name>: a task_table panel added (lib/task/task-table-page.js) ----
    function addTaskTable(path, name, fresh) {
      var cur = codeNow();
      var col = cur ? F.find(h.state(), cur).col : (h.state().focus ? h.state().focus.col : 1);
      var r = F.apply(h.state(), F.parse('skin add ' + col + ' task_table'), h.ctx);
      if (r.error) { h.recv('! task_table ── ' + r.error, 'err'); return false; }
      var id = F.at(r.state, r.state.focus).id;
      h.opening[id] = fresh ? { path: path, table: name, fresh: '1' } : { path: path, table: name };
      h.setState(r.state);
      h.keep();
      h.render();
      h.focusId(id, true);
      h.recv('task_table ── "' + name + '" of ' + path + ' in a task_table added at ' + F.placeText(r.state.focus), null, { kind: 'panel', id: id });
      return true;
    }
    var taskTable = T.taskTableCommands.wire({
      bus: bus, recv: h.recv,
      resolve: function (arg) { return T.codeFiles.resolve(pathNow(), arg); },
      add: addTaskTable,
      panels: function () {
        var f = F.at(h.state(), h.state().focus);
        return F.rects(h.state()).panels.filter(function (p) { return p.panel === 'task_table'; }).map(function (p) {
          return { id: p.id, bus: h.busIdOf(p.id), place: F.placeText({ col: p.col, row: p.row }), focused: !!(f && f.id === p.id) };
        });
      },
    });
    // -- run new <template> [<name>]: a run_table panel added (lib/task/run-table-page.js) ----
    function addRunTable(template, name, fresh, from) {
      var col = h.state().focus ? h.state().focus.col : 1;
      var r = F.apply(h.state(), F.parse('skin add ' + col + ' run_table'), h.ctx);
      if (r.error) { h.recv('! run ── ' + r.error, 'err'); return false; }
      var id = F.at(r.state, r.state.focus).id;
      var o = from ? { intent: from.intent, args: JSON.stringify(from.args || {}) } : { template: template };
      if (name) o.book = name;
      if (fresh) o.fresh = '1';
      h.opening[id] = o;
      h.setState(r.state);
      h.keep();
      h.render();
      h.focusId(id, true);
      h.recv('run ── a run_table of ' + (from ? 'the answer of ' + from.intent : '"' + template + '"') + ' added at ' + F.placeText(r.state.focus), null, { kind: 'panel', id: id });
      return true;
    }
    // run match <record> [<book>]: a run_match panel added (lib/task/run-match-page.js)
    function addRunMatch(log, book) {
      var col = h.state().focus ? h.state().focus.col : 1;
      var r = F.apply(h.state(), F.parse('skin add ' + col + ' run_match'), h.ctx);
      if (r.error) { h.recv('! run match ── ' + r.error, 'err'); return false; }
      var id = F.at(r.state, r.state.focus).id;
      var o = { log: log };
      if (book) o.book = book;
      h.opening[id] = o;
      h.setState(r.state);
      h.keep();
      h.render();
      h.focusId(id, true);
      h.recv('run match ── ' + log + (book ? ' and ' + book : '') + ' at ' + F.placeText(r.state.focus), null, { kind: 'panel', id: id });
      return true;
    }
    var runTable = T.runTableCommands.wire({
      bus: bus, recv: h.recv,
      resolve: function (arg) { return T.codeFiles.resolve(pathNow(), arg); },
      add: addRunTable, match: addRunMatch,
      panels: function () {
        var f = F.at(h.state(), h.state().focus);
        return F.rects(h.state()).panels.filter(function (p) { return p.panel === 'run_table'; }).map(function (p) {
          return { id: p.id, bus: h.busIdOf(p.id), place: F.placeText({ col: p.col, row: p.row }), focused: !!(f && f.id === p.id) };
        });
      },
    });
    // -- log start [<path>] / log stop: an output_log, a hidden panel of this frame (lib/recv/output-log-page.js) ----
    var logLine = T.logCommands.wire({
      bus: bus, recv: h.recv,
      resolve: function (arg) { return T.codeFiles.resolve(pathNow(), arg); },
      mount: function (q) {
        var u = new URL(T.config.sibling('panels/invisible/output_log.html'), location.href);
        Object.keys(q).forEach(function (k) { u.searchParams.set(k, q[k]); });
        var f = document.createElement('iframe');
        f.hidden = true;
        f.title = 'output_log';
        f.src = u.toString();
        document.body.appendChild(f);
        return f;
      },
      unmount: function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); },
      busOf: function (el) { try { var t = el.contentWindow.Tezcatl; return t && t.bus && t.bus.self.id; } catch (_) { return null; } },
    });
    // -- env xterm / show / reload [<path>]: the projects' environments (lib/skin/env-commands.js, D-project-env) ----
    // env xterm: an xterm added where `skin add xterm` puts it, started in the path's project (xterm.html?envpath=)
    var envLine = T.envCommands.wire({
      recv: h.recv, pathNow: pathNow,
      base: function () { return fsBase; },
      resolve: function (arg) { return T.codeFiles.resolve(pathNow(), arg); },
      addXterm: function (path) {
        var r = F.apply(h.state(), F.parse('skin add xterm'), h.ctx);
        if (r.error) return { error: r.error };
        var id = F.at(r.state, r.state.focus).id;
        h.opening[id] = { envpath: path };
        h.setState(r.state);
        h.keep();
        h.render();
        h.focusId(id, true);
        return { ok: true, message: 'an xterm at ' + F.placeText(r.state.focus) + ' in the project of ' + path, ref: { kind: 'panel', id: id } };
      },
    });
    // -- intent <id> [<name>=<value> ...], table <id> [...] (lib/skin/intent-commands.js) ----
    // table: the intent's answer in a decode_emacs of its own -- the one this frame
    // added for that intent is asked again, else one is added (?intent=&args=: it asks)
    var tableSeq = 0;
    function addTable(intent, args) {
      var have = F.rects(h.state()).panels.filter(function (p) {
        var o = h.opening[p.id];
        return p.panel === 'decode_emacs' && o && typeof o === 'object' && o.intent === intent;
      })[0];
      if (have) {
        var req = 'tb-' + Date.now().toString(36) + '-' + (++tableSeq);
        var off = bus.on('intent.ran', function (p) {
          if (!p || p.req !== req) return;
          off();
          if (!p.ok) h.recv('! table ── ' + intent + ': ' + (p.error || 'failed'), 'err');
        });
        bus.post('intent.run', { req: req, id: intent, args: args || {} });
        h.opening[have.id] = { intent: intent, args: JSON.stringify(args || {}) };
        h.focusId(have.id, true);
        h.recv('table ── ' + intent + ' ' + JSON.stringify(args || {}) + ' asked again at ' + F.placeText({ col: have.col, row: have.row }), null, { kind: 'panel', id: have.id });
        return true;
      }
      var col = h.state().focus ? h.state().focus.col : 1;
      var r = F.apply(h.state(), F.parse('skin add ' + col + ' decode_emacs'), h.ctx);
      if (r.error) { h.recv('! table ── ' + r.error, 'err'); return false; }
      var id = F.at(r.state, r.state.focus).id;
      h.opening[id] = { intent: intent, args: JSON.stringify(args || {}) };
      h.setState(r.state);
      h.keep();
      h.render();
      h.focusId(id, true);
      h.recv('table ── ' + intent + ' ' + JSON.stringify(args || {}) + ' in a decode_emacs added at ' + F.placeText(r.state.focus), null, { kind: 'panel', id: id });
      return true;
    }
    var intentLine = T.intentCommands.wire({ bus: bus, recv: h.recv, table: addTable });
    // table.open {intent, args} from a panel of this frame (a decode_emacs key of the kind `table`)
    bus.on('table.open', function (p, meta) {
      if (!ours(meta) || !p || typeof p.intent !== 'string' || !p.intent) return;
      addTable(p.intent, p.args && typeof p.args === 'object' ? p.args : {});
    });
    // task_table.open {path, table} from a panel of this frame (the markdown panel's `t`)
    bus.on('task_table.open', function (p, meta) {
      if (!ours(meta) || !p || typeof p.path !== 'string' || typeof p.table !== 'string') return;
      addTaskTable(p.path, p.table, false);
    });
    // -- minimum [purpose]: a code_vi_minimum at the end of the frame's last line (lib/code/minimum-page.js) ----
    // (asked: minimum.ask {req, purpose, text} from a panel of this frame -- it answers minimum.done to that panel)
    function addMinimum(purpose, ask) {
      var lines = h.state().columns.length || 1;
      var r = F.apply(h.state(), F.parse('skin add ' + lines + ' code_vi_minimum'), h.ctx);
      if (r.error) { h.recv('! minimum ── ' + r.error, 'err'); return false; }
      var id = F.at(r.state, r.state.focus).id;
      var o = {};
      if (purpose) o.purpose = purpose;
      if (ask) { o.req = ask.req; o.from = ask.from; if (ask.text) o.text = ask.text; }
      h.opening[id] = o;
      h.setState(r.state);
      h.keep();
      h.render();
      h.focusId(id, true);
      h.recv('minimum ── a code_vi_minimum at ' + F.placeText(r.state.focus) + (purpose ? ' (' + purpose + ')' : '') + ' ── :m sends it', null, { kind: 'panel', id: id });
      return true;
    }
    function minimumLine(line) {
      var m = /^\s*minimum(?:\s+([\s\S]*))?$/.exec(String(line == null ? '' : line));
      if (!m) return false;
      return addMinimum((m[1] || '').trim(), null);
    }
    bus.on('minimum.ask', function (p, meta) {
      if (!ours(meta) || !p || !p.req) return;
      addMinimum(typeof p.purpose === 'string' ? p.purpose : '', { req: p.req, from: meta.from.id, text: typeof p.text === 'string' ? p.text : '' });
    });
    // -- juncture tree: the juncture_tree panel of a file (lib/code/juncture-tree-page.js) ----
    // the one here shows it (juncture.show), else one is added under the code_editor meant now
    function showTree(path) {
      var have = F.rects(h.state()).panels.filter(function (p) { return p.panel === 'juncture_tree'; })[0];
      if (have) {
        var who = h.busIdOf(have.id);
        if (!who) { h.recv('! juncture tree ── the juncture_tree at ' + F.placeText(have) + ' is still loading', 'err'); return false; }
        bus.post('juncture.show', { path: path }, { to: who });
        h.focusId(have.id, true);
        h.recv('juncture tree ── ' + path + ' in the juncture_tree at ' + F.placeText(have), null, { kind: 'panel', id: have.id });
        return true;
      }
      var cur = codeNow();
      var col = cur ? F.find(h.state(), cur).col : (h.state().focus ? h.state().focus.col : 1);
      var r = F.apply(h.state(), F.parse('skin add ' + col + ' juncture_tree'), h.ctx);
      if (r.error) { h.recv('! juncture tree ── ' + r.error, 'err'); return false; }
      var id = F.at(r.state, r.state.focus).id;
      h.opening[id] = path;
      h.setState(r.state);
      h.keep();
      h.render();
      h.focusId(id, true);
      h.recv('juncture tree ── ' + path + ' in a juncture_tree added at ' + F.placeText(r.state.focus), null, { kind: 'panel', id: id });
      return true;
    }
    // :Diff -- what the code_editor meant now holds against its file on disk:
    // `:Scratch` (its text over ~work/scratch), then diff -n ~work/scratch,<its file>
    function diffNow() {
      var id = codeNow();
      var who = id && h.busIdOf(id);
      var path = pathNow();
      if (!who) { h.recv('! :Diff ── there is no code_editor here', 'err'); return Promise.resolve(false); }
      if (!path) { h.recv('! :Diff ── the code_editor has no file to compare with', 'err'); return Promise.resolve(false); }
      var scratch = T.codeFiles.SCRATCH;
      if (path === scratch) { h.recv('! :Diff ── this is the scratch itself', 'err'); return Promise.resolve(false); }
      return new Promise(function (resolve) {
        var done = false;
        // the code_editor says the scratch is written (fs.changed); else its head says why not
        var off = bus.on('fs.changed', function (p, meta) {
          if (done || !meta || !meta.from || meta.from.id !== who || !p || !Array.isArray(p.paths) || p.paths.indexOf(scratch) < 0) return;
          done = true; off();
          resolve(addDiff(scratch, path));
        });
        bus.post('code.file', { op: 'scratch', arg: '', bang: false }, { to: who });
        setTimeout(function () {
          if (done) return;
          done = true; off();
          h.recv('! :Diff ── the scratch was not written (see the head of the code_editor)', 'err');
          resolve(false);
        }, 5000);
      });
    }

    // a code_editor added after `lsp timeout` waits as the others do
    bus.on('code.ready', function (_p, meta) { if (ours(meta) && isEditor(meta.from.name)) lsp.configure(meta.from.id); });

    // the code.* tezcatl-commands (the palette, another window): the frame focused last runs them
    var active = true;
    function claim() { active = true; bus.post('frame-skin.active', { id: h.sfx }); }
    bus.on('frame-skin.active', function (p) { if (p && p.id !== h.sfx) active = false; });
    window.addEventListener('focus', claim);
    claim();
    T.commands.load().catch(function () {});
    T.commands.listenBus();
    skinEx.register(T.commands, function (ctx) { return (ctx && ctx.local) || active; });
    T.codeLocate.register(T.commands, locEnv, { say: function (t, ref) { h.recv(t, null, ref); }, isMine: function (ctx) { return !(ctx && ctx.remote) || active; } });

    return {
      codes: codes, codeNow: codeNow, addCode: addCode, skinEx: skinEx, lsp: lsp, check: check,
      codeList: codeList, base: function () { return fsBase; }, diff: diff, diffNow: diffNow, juncture: juncture, markdown: markdown, image: image, taskTable: taskTable, runTable: runTable, intentLine: intentLine, logLine: logLine, envLine: envLine, minimum: minimumLine,
      setLast: function (id) { lastCode = id; },
      // to a place in a file (`go on`): the code_editor that has it, else a code_editor panel added here
      openAt: function (t) { return T.codeLocate.openAt(locEnv, t); },
      // is this the frame focused last (the one that runs a command sent around)
      active: function () { return active; },
    };
  }
  (root.Tezcatl = root.Tezcatl || {}).frameCode = { wire: wire };
})(typeof self !== 'undefined' ? self : this);
