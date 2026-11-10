// lib/skin/frame-page.js -- the page script of the frame
// (panels/skins/frame.html). A page is what it looks like; what it does, its
// tezcatl-commands included, is here. The page loads it after the scripts
// it needs.
// The frame: 1..4 columns side
// by side (A..D, `skin main`; `skin axis v` turns it
// into rows), panels stacked in each (`skin sub`), and under them the dock: the map of
// the skin (panel_abstract), a one-line input form and, right of it, the receiving
// side where the answers come (a dialogue).
// It starts empty, named workspace_N, and panels are added while it is used.
// That name (`skin name`, `skin save <name>`) is also who this window is on
// the bus and in its title.
// This window's layout lives in sessionStorage; `skin save` keeps it under
// its name in ~work/store/frame-skins.json (lib/core/store.js; opened again
// with `skin read <name>` or frame.html?skin=<name>). The state and the commands: lib/skin/frame-layout.js.
//
// This file puts the frame together; its parts are
//   lib/skin/frame-store.js   this window's skin, the saved ones, the blocks
//   lib/skin/frame-render.js  drawing the lines and panels (and the blocks' themas)
//   lib/skin/frame-focus.js   the focus outside the panels, the map, the leave key
//   lib/skin/frame-lines.js   what runs a line of the input form; the commands that are a line
//   lib/skin/frame-dock.js    the dock: the map, the input_target, the input form and the receiving side, the virtual keyboard
//   lib/skin/frame-code.js    the wiring between the panels and code_editor
//
// The panels are wired to each other (as the tree skin's are): a tree in the
// frame opens a file (Enter) in the frame's code_editor -- the one that has the
// file already, else the code_editor meant now (the focused one, else the one
// used last, else the first), never over unsaved edits (s promise);
// a ":" line in the input form goes to that code_editor (`:w`, `:e`, `:12`,
// `:find`, `:grep` ... lib/skin/skin-ex.js), and code_editor's `:#` comes to the input
// form and goes back after the line is sent. `skin add` / `skin focus` go
// into the panel when run, as Enter does in the map.
// A line of the receiving side about a panel or a place in a file carries it
// as a reference (shown as @2 1, @path:12 -- lib/skin/recv-refs.js); `go on`
// goes to the last one, and "@" alone in a line is replaced by it. `radar`
// makes a reference of where the panel focused last is (a table's selection:
// lib/skin/radar.js). `lsp list` / `stop` / `timeout` / `restart` are the
// language servers' (lib/skin/lsp-commands.js); `check update [all]` asks
// whether the disk is still what the code_editor opened (lib/skin/check-commands.js).
// `diff -n A,B` adds a code_diff panel with two saved files, `diff -f A,B` puts
// them into the one there, `:Diff` compares the code_editor meant now with its
// file through the scratch (lib/code/code-diff.js).
// A synthesis (D-synthesis, lib/skin/synthesis.js) is one panel to the skin:
// `skin add <name>` places it, `syn <word>` moves inside it; frame.html?synthesis=<name>
// starts a frame holding it alone (?keep.<key>=<value>: what its main starts with). Its main keeps a few values with
// synthesis.keep; the skin port tells a panel of it its synthesis (synthesisOf).
(function () {
  'use strict';
  var T = Tezcatl;
  var F = T.frameLayout;
  var bus = T.bus;
  var stage = document.getElementById('stage');
  var whatEl = document.getElementById('what');
  var atEl = document.getElementById('at');

  var sfx = Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);
  var seq = 0;
  function newId() { seq += 1; return 'f' + sfx + '-' + seq; }

  T.panelFrame.init({ role: 'skin' });
  // the dock: the map, the input_target, the input form and the receiving side, the virtual keyboard
  var dock = T.frameDock.create({
    T: T, bus: bus, sfx: sfx, placeOfId: placeOfId,
    enter: function () { return enter(); },
    runDirect: function (line) { catalogP.then(function () { run(line); }); },
    mine: function (c) { return mine(c); },
    pageOf: function (panel) { return catalog && catalog[panel] ? catalog[panel].page : 'panels/extra/' + panel + '.html'; },
    loaded: function (panel) { if (panel === 'panel_abstract' && focus) focus.pushAbs(); },
    changed: function () { render(); },
  });
  document.getElementById('cursor').src = T.config.sibling('panels/invisible/cursor.html');
  document.getElementById('killring').src = T.config.sibling('panels/invisible/killring.html');
  // the record of what is running and who is open (lib/core/work-page.js)
  document.getElementById('work').src = T.config.sibling('panels/invisible/work.html');

  // -- the receiving side: the dock's ---------------------------------------------
  var refs = dock.refs;
  // every line said is also posted (recv.out) for the panels that watch what
  // the frame answers (a run_table: lib/task/run-table-page.js)
  function recv(text, cls, ref) {
    dock.say(text, cls, ref);
    bus.post('recv.out', { text: String(text), cls: cls || null });
  }

  function placeOfId(id) { return state ? F.placeText(F.find(state, id)) : null; }
  // go on: to what the last line with a reference points at -- a panel of this
  // frame is focused, a place in a file is code.open-at's
  function goOn() {
    var ref = refs.last();
    if (!ref) { recv('! go on ── no line with a reference (@...) yet', 'err'); return false; }
    if (ref.kind === 'panel') {
      var at = F.find(state, ref.id);
      if (!at) { recv('! go on ── that panel is closed', 'err'); return false; }
      focusId(ref.id, true);
      recv('go on ── ' + F.placeText(at) + ' ' + F.at(state, at).panel);
      return true;
    }
    if (ref.kind === 'bus') {
      // a panel of another window: asked to come forward (code_editor answers code.reveal, any panel `focus`)
      bus.post('code.reveal', {}, { to: ref.id });
      bus.post('focus', {}, { to: ref.id });
      recv('go on ── ' + (ref.name || 'the panel') + ' (another window: switch to it yourself if it did not come forward)');
      return true;
    }
    if (ref.kind === 'coord') {
      // the panel that was there: one of this frame's is focused; another window's is asked to take the focus
      var mine = Object.keys(boxes).filter(function (id) { return busIdOf(id) === ref.panel; })[0];
      if (mine) focusId(mine, true);
      else if (ref.panel) bus.post('focus', {}, { to: ref.panel });
      recv('go on ── ' + (ref.table || ref.name || 'the panel') + (mine ? '' : ' (another window: switch to it yourself if it did not come forward)'));
      return true;
    }
    return code.openAt({ path: ref.path, line: ref.line, col: ref.col }).then(function (r) {
      recv((r.ok ? '' : '! ') + 'go on ── ' + r.message, r.ok ? null : 'err');
      return !!r.ok;
    });
  }

  // -- what the frame keeps: lib/skin/frame-store.js ---------------------------
  // this window's skin, the saved ones, and each panel's block (drawn again
  // when a block is found for the first time)
  var store = T.frameStore.create({ sibling: T.config.sibling, onNew: function () { render(); }, store: T.store });
  var saved = store.saved, findSaved = store.findSaved, lookBlock = store.lookBlock, setBlock = store.setBlock;
  var storeP = store.ready();
  var blockDefs = store.blockDefs;

  // -- the panels there are (the launcher's list: class "panel") ----------------
  var catalog = {};   // id or alias -> {id, page}
  var catalogP = T.config.panels()
    .then(function (doc) {
      (doc.items || []).forEach(function (it) {
        if (it.class !== 'panel' || !it.page || /^panels\/invisible\//.test(it.page)) return;
        var e = { id: it.id, page: it.page };
        catalog[it.id] = e;
        (it.aliases || []).forEach(function (a) { catalog[a] = e; });
      });
    })
    .catch(function (e) { recv('! panels_and_skins.json: ' + (e && e.message || e), 'err'); });
  // the dock's parts are up before the list is read: one whose page it names is made again (db_list)
  catalogP.then(function () { dock.pagesRead(); });
  // the syntheses (D-synthesis): their definitions, read once each, after the catalog
  var synLoad = T.synthesis.create({
    sibling: T.config.sibling,
    resolve: function (name) { return catalog[name] ? catalog[name].id : null; },
    said: function (t) { recv('! ' + t, 'err'); },
  });
  var syntheses = {
    get: synLoad.get,
    look: function (name) { return catalogP.then(function () { return synLoad.look(name); }); },
  };
  var ctx = {
    resolve: function (name) { return catalog[name] ? catalog[name].id : null; }, newId: newId,
    synthesis: function (name) { return synLoad.get(name) || null; },
    // where skin add <panel> puts it (its block's "at"; read before, run())
    placeOf: function (panel) { return blockDefs[panel] && blockDefs[panel].at; },
  };

  // -- the state ------------------------------------------------------------------
  var params = new URLSearchParams(location.search);
  // ?synthesis=<name>: a frame holding it alone. A page window.open opened has a
  // copy of its opener's sessionStorage (the Web's rule): only a reload keeps it
  var wantSyn = params.get('synthesis');
  var nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
  if (wantSyn && nav && nav.type !== 'navigate' && store.work()) wantSyn = null;
  var state = wantSyn ? null : F.fromJson(store.work(), newId);
  // ?skin=<name>: looked for when the page is up (findSaved); a new skin's
  // workspace_N is chosen once the saved names are read (storeP)
  var wantSkin = null;
  if (!state && params.get('skin')) wantSkin = params.get('skin');
  var unnamed = !state || !state.name;
  if (!state) state = F.create('A', F.defaultName([]));
  // ?dock=l|b|r: the side of the dock of a skin that has not chosen one (D-dock)
  if (T.dockLayout.SIDES.indexOf(params.get('dock')) >= 0 && !(state.dock && state.dock.side)) {
    state.dock = Object.assign({}, state.dock || {}, { side: params.get('dock') });
  }

  function keep() { store.keep(F.toJson(state)); }

  // who this window is: the skin's name (workspace_N, or the one given by
  // skin name / skin save / skin read) -- on the bus and in the title
  var saidName = null;
  function sayName() {
    if (state.name === saidName) return;
    saidName = state.name;
    bus.identify({ name: state.name });
    document.title = 'Tezcatl — ' + state.name;
  }
  sayName();

  // -- drawing: lib/skin/frame-render.js -----------------------------------------
  var opening = {};   // a panel added to show something -> a code_editor's path (code_editor.html?path=), or a query ({a, b}: code_diff)
  var view = T.frameRender.create({
    T: T, F: F, stage: stage, whatEl: whatEl, atEl: atEl, state: function () { return state; },
    catalog: catalog, opening: opening, store: store, sayName: sayName,
    focusId: function (id, enterIt) { focusId(id, enterIt); },
    drawn: function (cfg) { focus.setAbs(cfg); },
    syntheses: syntheses,
  });
  var boxes = view.boxes;
  // the dock first (its side and size are the room the lines have), then the lines
  function render() { dock.apply(state.dock); view.render(); }

  // -- the focus and the map: lib/skin/frame-focus.js ------------------------------
  var focus = T.frameFocus.create({
    T: T, F: F, bus: bus, state: function () { return state; }, setState: function (s) { state = s; },
    keep: keep, render: render, boxes: boxes, ctx: ctx, catalogP: catalogP, atEl: atEl,
    abs: function () { return dock.partOf('panel_abstract'); }, form: dock.form, inDock: dock.has,
    code: function () { return code; },
  });
  var enter = focus.enter, busIdOf = focus.busIdOf, focusId = focus.focusId, focusAbs = focus.focusAbs;

  // -- the syntheses' panels -------------------------------------------------------
  function selfOf(frame) {
    try { var t = frame.contentWindow.Tezcatl; return t && t.bus && t.bus.self && t.bus.self.id ? t.bus.self : null; } catch (_) { return null; }
  }
  // a panel's window -> what its synthesis is, for that panel | null (not in one)
  function synthesisOf(win) {
    var ids = Object.keys(boxes);
    for (var i = 0; i < ids.length; i++) {
      var b = boxes[ids[i]];
      if (!b.panes) continue;
      var k = b.panes.findIndex(function (f) { try { return f.contentWindow === win; } catch (_) { return false; } });
      if (k < 0) continue;
      var at = F.find(state, ids[i]);
      var it = at && F.at(state, at);
      if (!it || !it.syn) return null;
      return {
        own: it.syn.own, name: it.panel, place: F.placeText(at), self: k, main: b.def.main, moves: Object.keys(b.def.move),
        members: b.def.panels.map(function (x) {
          var me = selfOf(b.panes[x.k]);
          return { k: x.k, panel: x.panel, main: x.k === b.def.main, name: view.innerName(ids[i], x.k), id: me ? me.id : null };
        }),
      };
    }
    return null;
  }
  // a synthesis' main keeps a few values (a database window's number): over a
  // reload and in skin save, given back to its page as its query
  bus.on('synthesis.keep', function (p, meta) {
    var m = meta && meta.from && /^(.+)\.(\d+)$/.exec(meta.from.name || '');
    var at = m && F.find(state, m[1]);
    var it = at && F.at(state, at);
    var b = it && boxes[it.id];
    if (!it || !it.syn || !b || !b.def || Number(m[2]) !== b.def.main) return;
    it.syn.keep = F.keepOf(p);
    it.syn.saved = false;
    keep();
  });

  // -- a line of the input form: lib/skin/frame-lines.js (made below, once code_editor's wiring is) --
  function run(line, quiet, said) { return lines.run(line, quiet, said); }

  // -- the wiring between the panels: lib/skin/frame-code.js ----------------------------
  var code = T.frameCode.wire({
    T: T, F: F, bus: bus, ctx: ctx, sfx: sfx, form: dock.form, opening: opening,
    state: function () { return state; }, setState: function (s) { state = s; },
    keep: keep, render: render, focusId: focusId, recv: recv, busIdOf: busIdOf, refs: refs,
  });
  var codes = code.codes, addCode = code.addCode, skinEx = code.skinEx;
  // -- what a panel of this frame says to the receiving side ---------------------------
  // recv.say {text, cls?, ref?}: the one mouth for a panel to tell the person what
  // happened beside what was asked (a clone opened, a file read
  // again, a request asked again ...), with where to go (`go on`). A reference
  // by bus id becomes this frame's panel when it is one.
  function ownPanel(busId) {
    // a synthesis' panels are its place's (D-synthesis)
    return Object.keys(boxes).filter(function (id) {
      var b = boxes[id];
      return (b.panes || [b.frame]).some(function (f) { var me = f && selfOf(f); return !!me && me.id === busId; });
    })[0] || null;
  }
  function saidRef(ref) {
    if (!ref || ref.kind !== 'bus') return ref || null;
    var own = ownPanel(ref.id);
    return own ? { kind: 'panel', id: own } : ref;
  }
  bus.on('recv.say', function (p, meta) {
    if (!p || typeof p.text !== 'string' || !p.text || !meta || !meta.from) return;
    // only from a panel of this frame (another frame says it of its own)
    var who = ownPanel(meta.from.id);
    if (!who) return;
    var at = F.find(state, who);
    recv((at ? F.placeText(at) + ' ' : '') + p.text, p.cls === 'err' ? 'err' : null, saidRef(p.ref));
  });
  // -- another frame as a destination (D-bridge): the dock of a frame elsewhere (another
  // tab -- Poca's split view) sends lines here and reads what this one says.
  // frame.ask -> frame.here {name} to the asker (lib/target/frame.js, lib/recv/frame.js);
  // skin.line {line} meant for this frame alone (its bus id) runs as a line typed in this
  // input form -- its echo and answer go out as every line said does (recv.out)
  bus.on('frame.ask', function (_p, meta) {
    if (meta && meta.from && meta.from.id) bus.post('frame.here', { name: state.name }, { to: meta.from.id });
  });
  bus.on('skin.line', function (p, meta) {
    if (!meta || meta.to !== bus.self.id || !p || typeof p.line !== 'string' || !p.line.trim()) return;
    catalogP.then(function () { run(p.line.trim()); });
  });
  // this page's own commands that fell back to a new window (lib/core/commands.js)
  T.commands.onSaid = function (text) { recv(text); };

  // -- the record of what is running and who is open (lib/core/work-page.js) -----------
  // a roll call: where this frame's panels are (the store puts it next to who answered)
  bus.on('panel.roll', function (p) {
    bus.post('frame.places', { req: p && p.req, skin: state.name,
      places: F.rects(state).panels.map(function (x) {
        return { id: busIdOf(x.id), place: F.placeText({ col: x.col, row: x.row }), panel: x.panel };
      }).filter(function (x) { return x.id; }) });
  });
  // a panel of this frame, shown: the one here is focused, else it is added (skin add)
  function showPanel(panel) {
    var have = F.rects(state).panels.filter(function (x) { return x.panel === panel; })[0];
    if (have) {
      focusId(have.id, true);
      recv(panel + ' ── at ' + F.placeText({ col: have.col, row: have.row }), null, { kind: 'panel', id: have.id });
      return true;
    }
    return run('skin add ' + panel, true, true);
  }
  var work = T.workCommands.wire({ bus: bus, recv: recv, show: showPanel, whoLine: T.workLog.whoLine });
  // the tezcatl-commands of the frame focused last
  function mine(c) { return !(c && c.remote) || code.active(); }
  var lines = T.frameLines.create({
    T: T, F: F, bus: bus, recv: recv, refs: refs, placeOfId: placeOfId,
    state: function () { return state; }, setState: function (s) { state = s; },
    ctx: ctx, store: store, newId: newId, keep: keep, render: render, enter: enter, focusAbs: focusAbs,
    goOn: goOn, code: code, work: work, catalogP: catalogP, mine: mine, dock: dock,
    syntheses: syntheses, boxes: boxes, enterInner: focus.enterInner,
  });
  // skin.add / skin.focus / work.list / work.cancel / go.on ...: a line each (command_map.json `line`)
  lines.registerLines();
  // open <page>: config.json and the launcher's list read now, so the line opens within its key press
  T.openPage.preload();
  Promise.all([catalogP, storeP]).then(function () {
    if (unnamed) state.name = F.defaultName(Object.keys(saved()));
    if (wantSyn) {
      // ?keep.<key>=<value>: what its main starts with (database id=1 in a new tab: ?keep.id=1)
      var keepQ = {};
      params.forEach(function (v, k) { if (k.indexOf('keep.') === 0) keepQ[k.slice(5)] = v; });
      return lines.addSynthesis(wantSyn, keepQ, false);
    }
    return wantSkin && findSaved(wantSkin).then(function (got) {
      var s = got && F.fromJson(got.json, newId, true);
      if (!s) { recv('! no saved skin "' + wantSkin + '"', 'err'); return; }
      state = s;
      if (!state.name) state.name = wantSkin;
      recv('read "' + wantSkin + '" (' + got.from + ')');
    });
  }).then(function () {
    keep();
    render();
    recv(F.rects(state).panels.length ? state.name + ' ── ready'
      : state.name + ' ── empty. Add with skin add <line> <panel> (e.g. skin add 1 tree). Columns: skin main 1,2,1 or skin add line; rows instead: skin axis v');
    dock.form.focus();
  });

  // how this skin opens a file nobody has: its panels' pageEnv use it
  // (lib/code/code-locate.js) -- a code_editor's :LspDef / cross-file :LspRename, a list's Enter
  // (said here too: a code_editor panel added beside what was asked -- gd, a rename across files)
  // What this skin offers its panels, registered at the skin port
  // (lib/core/panel-frame.js) -- the one place a panel looks at its skin:
  // openNew, and its panels' bus identities with where they are.
  T.skinPort.register(window, {
    // a line for this skin, from the input_target's tezcatl destination
    runLine: function (line) { catalogP.then(function () { run(String(line).trim()); }); return true; },
    // where a lead-key form in this skin sends when no input_target is among its panels
    dockTarget: dock.targetId,
    openNew: function (t) {
      return addCode(t).then(function (r) { recv((r.ok ? '' : '! ') + r.message, r.ok ? null : 'err', r.ok ? r.ref : null); return r; });
    },
    // a synthesis' panels are there too (`synthesis`: its own name); asked by
    // one of them, its own synthesis' panels come first (D-synthesis)
    panels: function (asker) {
      var out = [];
      F.rects(state).panels.forEach(function (x) {
        var b = boxes[x.id];
        if (!b || !b.frame) return;
        var place = F.placeText({ col: x.col, row: x.row });
        (b.panes || [b.frame]).forEach(function (f, k) {
          var self = selfOf(f);
          if (self) out.push({ id: self.id, role: self.role || null, name: self.name || null, place: place,
            panel: b.panes ? b.def.panels[k].panel : x.panel, synthesis: b.panes ? x.syn.own : null });
        });
      });
      var mine = asker && synthesisOf(asker);
      if (mine) out.sort(function (a, c) { return (c.synthesis === mine.own) - (a.synthesis === mine.own); });
      return out;
    },
    synthesisOf: synthesisOf,
    // the asker's block as kept (a copy; read only): a panel can read its settings from the text
    blockOf: function (asker) {
      var ids = Object.keys(boxes);
      for (var i = 0; i < ids.length; i++) {
        var b = boxes[ids[i]];
        if (!b.frame || b.panes || b.frame.contentWindow !== asker) continue;
        var it = F.at(state, F.find(state, ids[i]));
        return it && it.block ? JSON.parse(JSON.stringify(it.block)) : null;
      }
      return null;
    },
  });

  // for the E2E checks
  window.frameSkin = {
    state: function () { return F.toJson(state); },
    run: function (line) { return catalogP.then(function () { return run(line); }); },
    frameAt: function (place) { var p = F.at(state, F.place(place)); return p && boxes[p.id] ? boxes[p.id].frame : null; },
    innerAt: function (place, k) { var p = F.at(state, F.place(place)); var b = p && boxes[p.id]; return b && b.panes ? b.panes[k] || null : null; },
    abs: function () { return dock.partOf('panel_abstract'); },
    target: function () { return dock.partOf('input_target'); },
    vkbd: function () { return dock.partOf('virtual_keyboard'); },
    dock: function () { return dock; },
    codes: function () { return codes; },
  };
})();
