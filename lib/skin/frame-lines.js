// lib/skin/frame-lines.js -- what runs a line of the frame's input form (D-frame).
//
// A line goes through a few rewrites ("@" alone becomes the last reference of
// the receiving side; ":" alone is `skin focus abs`), is echoed ("> line"),
// then each of LINES is asked in order; the first that takes it runs it.
// `dock …` changes the skin's dock in place (lib/skin/dock-layout.js);
// `open <page> [tab|window]` opens a page outside it (lib/core/open-page.js).
// The last one, `skin …` (and `block …`, `thema …`, `go on`, `skin read`),
// takes whatever is left, and says what is not a command.
//
// The tezcatl-commands whose command_map.json entry gives a `line`
// ("skin add {panel}") are run as that line, in the frame focused last
// (`registerLines`): each {arg} is one word, the catalog of panels is read
// first, and `quiet` leaves the echo out.
//
// The page (lib/skin/frame-page.js) gives `h`:
//   {T, F, bus, recv, refs, placeOfId(id), state(), setState(s), ctx, store,
//    newId, keep(), render(), enter(), focusAbs(), goOn(), code, work,
//    catalogP, mine(c), dock, syntheses, boxes, enterInner(id, k)}
// -> {run(line, quiet, said), registerLines(), addSynthesis(name, keep, quiet)}
// run: quiet says nothing; said leaves the "> line" echo out but says the
// answer (a line run for another, `skin add` from work list ...).
(function (root) {
  'use strict';
  var NEXT = {};   // a line that is not this one's

  function create(h) {
    var T = h.T, F = h.F, code = h.code, skinEx = code.skinEx, recv = h.recv;
    // the database lines (D-db-session): what of the frame they need
    var openSettings = null;
    if (T.openPage.loadSettings) T.openPage.loadSettings().then(function (s) { openSettings = s; });
    var dbLine = T.dbCommands.wire({
      bus: h.bus, recv: recv,
      // the database window focused in this frame: its number (kept by its main)
      focusedNumber: function () {
        var s = h.state();
        var it = F.at(s, s.focus);
        return it && it.syn && it.panel === 'database' && it.syn.keep && Number(it.syn.keep.id) || null;
      },
      addSynthesis: function (name, keep) { return addSynthesis(name, keep, false); },
      openPage: function (page, mode) { return T.openPage.open(page, mode, openSettings); },
      listSize: function (open) {
        var s = h.state();
        var r = T.dockLayout.sizePart(s.dock, h.dock.def(), 'dbls', open);
        if (r.error) return r;
        h.setState(Object.assign({}, s, { dock: r.dock }));
        h.keep();
        h.render();
        return r;
      },
    });
    // lsp / check / work / task_table / run / env / markdown / image / juncture / diff answer false for a line that is not theirs
    function orNext(handle) { return function (line) { var r = handle(line); return r === false ? NEXT : r; }; }

    var LINES = [
      // radar: where the panel focused last is (a table's selection), as a reference
      { name: 'radar', handle: function (line) {
        if (String(line).trim() !== 'radar') return NEXT;
        return T.radar.run(h.bus).then(function (r) {
          if (r.error) { recv('! ' + r.error, 'err'); return false; }
          recv(r.line, null, r.ref);
          return true;
        });
      } },
      // :Diff -- the code_editor meant now against its file on disk, through the scratch
      { name: ':Diff', handle: function (line) {
        if (!/^:\s*Diff\s*$/.test(String(line))) return NEXT;
        var no = skinEx.refused(line);
        if (no) { recv(no, 'err'); return true; }
        var fr = code.diffNow();
        skinEx.sent();
        return fr;
      } },
      // the other ":" lines: the code_editor meant now (lib/skin/skin-ex.js)
      { name: ':', handle: function (line) {
        if (!skinEx.handle(line)) return NEXT;
        skinEx.sent();
        return true;
      } },
      // color <colour> / color <json> <name>: the colour panels (this frame's, or any open; else a new window)
      { name: 'color', handle: function (line) {
        var cm = /^color(?:\s+([\s\S]*))?$/.exec(String(line).trim());
        if (!cm) return NEXT;
        var ca = T.color.parse(cm[1]);
        if (ca.error) { recv('! ' + ca.error, 'err'); return false; }
        T.commands.invoke('color.show', ca);
        recv('color.show ' + (ca.color || ca.json + ' ' + ca.name));
        return true;
      } },
      // lsp list / stop / timeout / restart: the language servers (lib/skin/lsp-commands.js)
      { name: 'lsp', handle: orNext(code.lsp.handle) },
      // check update [all]: is the disk still what the code_editor opened (lib/skin/check-commands.js)
      { name: 'check', handle: orNext(code.check.handle) },
      // work list / watch / cancel <n>, who: what is running and who is open (lib/skin/work-commands.js)
      { name: 'work', handle: orNext(h.work.handle) },
      // minimum [purpose]: a code_vi_minimum at the end of the frame (lib/code/minimum-page.js)
      { name: 'minimum', handle: orNext(code.minimum) },
      // task_table take[!] <path> <name> / save / put[!]: a note's table edited as a table (lib/skin/task-table-commands.js)
      { name: 'task_table', handle: orNext(code.taskTable.handle) },
      // run new[!] <template> [<name>] / start / stop / save[!] <path>: a book of lines sent one by one (lib/skin/run-table-commands.js)
      { name: 'run', handle: orNext(code.runTable.handle) },
      // intent <id> [<name>=<value> ...]: an intent run through the input panel (lib/skin/intent-commands.js)
      { name: 'intent', handle: orNext(code.intentLine.handle) },
      // table <id> [<name>=<value> ...]: its answer in a decode_emacs of its own (lib/skin/intent-commands.js)
      { name: 'table', handle: orNext(code.intentLine.handle) },
      // log start[!] [<path>] / log stop / log: an output_log writing down the output (lib/skin/log-commands.js)
      { name: 'log', handle: orNext(code.logLine.handle) },
      // env xterm / show / reload [<path>]: the projects' environments (lib/skin/env-commands.js)
      { name: 'env', handle: orNext(code.envLine.handle) },
      // markdown <path> / follow / unfollow: a note drawn (lib/skin/markdown-commands.js)
      { name: 'markdown', handle: orNext(code.markdown.handle) },
      // image <path>: a picture of the pages in the frame's image panel (lib/skin/image-commands.js)
      { name: 'image', handle: orNext(code.image.handle) },
      // juncture set|point|back|forward|tree [path]: the points kept of a file (lib/skin/juncture-commands.js)
      { name: 'juncture', handle: orNext(code.juncture.handle) },
      // diff -n A,B / diff -f A,B: two saved files in a code_diff panel (lib/code/code-diff.js)
      { name: 'diff', handle: orNext(code.diff) },
      // dock side / size / rows / cols / reset: the skin's dock, changed in place (lib/skin/dock-layout.js)
      { name: 'dock', handle: function (line) {
        var c = T.dockLayout.parse(line);
        if (!c) return NEXT;
        if (c.error) { recv('! ' + c.error, 'err'); return false; }
        var s = h.state();
        var r = T.dockLayout.apply(s.dock, c, h.dock.def());
        if (r.error) { recv('! ' + r.error, 'err'); return false; }
        h.setState(Object.assign({}, s, { dock: r.dock }));
        h.keep();
        h.render();
        recv(r.message);
        return true;
      } },
      // database [id=1] [tab|window], db login|exit|cancel [<n>], db list open|close: the database windows (lib/skin/db-commands.js)
      { name: 'database', handle: function (line) { var r = dbLine.handle(line); return r === false && !/^\s*(database|db)(\s|$)/.test(line) ? NEXT : r; } },
      // open <page> [tab|window]: a page of the launcher in a new tab or window (lib/core/open-page.js)
      { name: 'open', handle: function (line) {
        var p = T.openPage.runLine(line);
        if (!p) return NEXT;
        return p.then(function (r) {
          recv(r.ok ? r.message : '! ' + r.message, r.ok ? null : 'err');
          return r.ok;
        });
      } },
      // syn [<word>]: into a panel of the synthesis focused (D-synthesis; its definition's move, and main)
      { name: 'syn', handle: function (line) {
        var m = /^syn(?:\s+(\S+))?$/.exec(String(line).trim());
        if (!m) return NEXT;
        var s = h.state();
        var it = F.at(s, s.focus);
        var b = it && h.boxes[it.id];
        if (!it || !it.syn || !b || !b.def) { recv('! syn ── the focus is not on a synthesis (skin focus <place> first)', 'err'); return false; }
        var words = ['main'].concat(Object.keys(b.def.move));
        if (!m[1]) { recv(it.syn.own + ' ── syn ' + words.join(' / ')); return true; }
        var k = m[1] === 'main' ? b.def.main : (Object.prototype.hasOwnProperty.call(b.def.move, m[1]) ? b.def.move[m[1]] : null);
        if (k == null) { recv('! syn ' + m[1] + ' ── ' + it.syn.own + ' has syn ' + words.join(' / '), 'err'); return false; }
        recv('syn ' + m[1] + ' ── ' + b.def.panels[k].panel + ' of ' + it.syn.own, null, { kind: 'panel', id: it.id });
        setTimeout(function () { h.enterInner(it.id, k); }, 0);
        return true;
      } },
      // skin …, block …, thema …, go on, skin read: lib/skin/frame-layout.js (last: it takes the rest)
      { name: 'skin', handle: function (line, quiet) { return skinLine(line, quiet); } },
    ];

    function run(line, quiet, said) {
      if (said) return runSaid(line);
      return runLine(line, quiet);
    }

    function runLine(line, quiet) {
      // "@" alone: the last reference of the receiving side, as text (a panel's
      // place, path:line, the ids of a coordinate -- lib/skin/recv-refs.js text)
      if (T.radar.hasAt(line)) {
        var at = T.recvRefs.text(h.refs.last(), h.placeOfId);
        if (!at) {
          if (!quiet) recv('> ' + line, 'sent');
          recv('! @ ── no line with a reference (@...) to put there', 'err');
          return false;
        }
        line = T.radar.insert(line, at);
      }
      if (!quiet) recv('> ' + line, 'sent');
      // ":" alone: the short form of skin focus abs (any other ":" line is code_editor's)
      if (String(line).trim() === ':') line = 'skin focus abs';
      for (var i = 0; i < LINES.length; i++) {
        var r = LINES[i].handle(line, quiet);
        if (r !== NEXT) return r;
      }
      return false;
    }

    // a line run for another: only `skin …`, its echo left out
    function runSaid(line) {
      var c = F.parse(line);
      if (c.error) { recv('! ' + c.error, 'err'); return false; }
      return addOrApply(c, false);
    }

    function skinLine(line, quiet) {
      var c = F.parse(line);
      if (c.error) { recv('! ' + c.error, 'err'); return false; }
      if (c.cmd === 'go-on') return h.goOn();
      if (c.cmd === 'read') return readSkin(c.name);
      return addOrApply(c, quiet);
    }

    // skin add <panel>: its block (and the place it says) read first; a name
    // that is no panel's: a synthesis' definition read first (D-synthesis)
    function addOrApply(c, quiet) {
      if (c.cmd === 'add' && !c.waited) {
        var nm = h.ctx.resolve(c.panel);
        var waited = Object.assign({}, c, { waited: true });
        if (!nm) return h.syntheses.look(c.panel).then(function () { return runParsed(waited, quiet); });
        if (c.col == null) return h.store.lookBlock(nm).then(function () { return runParsed(waited, quiet); });
      }
      return runParsed(c, quiet);
    }

    function readSkin(name) {
      return h.store.findSaved(name).then(function (got) {
        var s = got && F.fromJson(got.json, h.newId, true);
        if (!s) {
          recv('! no saved skin "' + name + '" (saved: ' + (Object.keys(h.store.saved()).join(', ') || 'none yet') +
            '; no ' + name + '.json in local/skins/ or skins/ either)', 'err');
          return false;
        }
        if (!s.name) s.name = name;
        h.setState(s);
        h.keep();
        h.render();
        recv('read "' + name + '" (' + got.from + ')');
        return true;
      });
    }

    function runParsed(c, quiet) {
      var r = F.apply(h.state(), c, h.ctx);
      if (r.error) { recv('! ' + r.error, 'err'); return false; }
      h.setState(r.state);
      var state = r.state;
      if (c.cmd === 'focus-abs') { h.focusAbs(); return true; }
      if (c.cmd === 'block-new' || c.cmd === 'block-place') {
        var part = c.cmd === 'block-new' ? { source: r.def.source, side: r.def.side } : { at: r.place.at };
        var pn = c.cmd === 'block-new' ? r.def.panel : r.place.panel;
        return h.store.setBlock(pn, part).then(function (w) {
          if (!w.ok) { recv('! ' + w.message, 'err'); return false; }
          r.message = (c.cmd === 'block-new' ? 'made the block of ' + pn : 'skin add ' + pn + ' puts it in line ' + r.place.at) +
            ' (kept) ── to ship it, put this in blocks/' + pn + '.json (local/blocks/ to keep it to yourself):\n' + JSON.stringify(w.kept);
          return shown(c, r, quiet);
        });
      }
      if (c.cmd === 'save') {
        return h.store.save(state.name, F.toJson(state)).then(function (w) {
          if (!w.ok) { recv('! ' + w.message, 'err'); return false; }
          r.message = 'saved "' + state.name + '"' + (w.was ? ' (replaced the earlier one)' : '') + ' ── skin read ' + state.name +
            ' or frame.html?skin=' + state.name + '\n' + JSON.stringify(F.toJson(state));
          return shown(c, r, quiet);
        });
      }
      return shown(c, r, quiet);
    }

    function shown(c, r, quiet) {
      var state = h.state();
      h.keep();
      h.render();
      // the panel added: where `go on` comes back to
      if (r.message && !quiet) recv(r.message, null, c.cmd === 'add' && state.focus ? { kind: 'panel', id: F.at(state, state.focus).id } : null);
      // as Enter in the map: into the panel
      if ((c.cmd === 'add' || c.cmd === 'focus') && !quiet) setTimeout(h.enter, 0);
      return true;
    }

    // -- the tezcatl-commands that are a line (command_map.json `line`) ---------------
    function lineCommand(spec) {
      return function (args, c) {
        if (!h.mine(c)) return false;
        var bad = null;
        var text = spec.line.replace(/\{(\w+)\}/g, function (_m, k) {
          var v = args && args[k] != null ? String(args[k]).trim() : '';
          if (!/^\S+$/.test(v)) bad = bad || k;
          return v;
        });
        if (bad) { recv('! ' + spec.name + ' needs ' + bad + ' (one word)', 'err'); return true; }
        h.catalogP.then(function () { run(text, spec.quiet); });
        return true;
      };
    }
    function registerLines() {
      var ready = T.commands.isLoaded() ? Promise.resolve() : T.commands.load();
      return ready.then(function () {
        T.commands.list().forEach(function (c) { if (c.line) T.commands.register(c.name, lineCommand(c)); });
      }).catch(function (e) { recv('! command_map.json: ' + (e && e.message || e), 'err'); });
    }

    // a synthesis placed for another command (`database id=1`), its main given what to start with
    function addSynthesis(name, keep, quiet) {
      var c = F.parse('skin add ' + name);
      if (c.error) { recv('! ' + c.error, 'err'); return Promise.resolve(false); }
      return Promise.resolve(addOrApply(Object.assign(c, { keep: keep || null }), quiet));
    }

    return { run: run, registerLines: registerLines, addSynthesis: addSynthesis };
  }

  (root.Tezcatl = root.Tezcatl || {}).frameLines = { create: create, NEXT: NEXT };
})(typeof self !== 'undefined' ? self : this);
