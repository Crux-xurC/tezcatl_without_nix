// lib/skin/frame-dock.js -- the frame's dock (D-unified-dock, D-dock): one unit of
// the skin, beside its lines -- by default (docks/standard.json) the map of the
// skin (panel_abstract), the input_target (where the input form sends), the
// input form (a lead-key form, lib/skin/lead-form.js) with the receiving side,
// the virtual keyboard, and boxes for the parts not made yet. Its parts and
// their grid on each side are data (lib/skin/dock-layout.js); its frames are
// children of the frame page, as a block's are (D-block), and never move in
// the DOM: a change of side or size only changes the grid, nothing reloads.
//
// The dock's file is looked for as a block's is: local/docks/<name>.json, then
// docks/<name>.json; till it is read (or when there is none) the built-in one
// (the same as docks/standard.json) is used, so the parts are up at once.
// What the skin changed in place (its "dock": dock side / size / rows / cols)
// is given to apply() each time the frame draws.
//
// The input form: Enter sends; on an empty line Enter / Escape go into the
// focused panel; Alt+p / Alt+n walk the lines sent. (The keys that move the
// focus are the map's: ":" alone goes there.) It sends through the dock's
// input_target, whose first destination is tezcatl -- the line comes back to
// the frame as runLine and runs as it always did. Until the input_target is
// up, a line runs directly (h.runDirect).
//
// The suggestions (D-suggestions): "@gsel" is one line, the source chosen (▼ lines);
// "@sugg" the suggestion shell (panels/extra/suggestion_list.html) showing
// that source as a 5 x 2 grid, given the input line (suggest.filter) as it
// changes. A word picked there (suggest.pick) goes into the input form, and
// the keyboard stays there for the next. On @gsel, ↑ ↓ turn the source, its
// letter picks one (back to where the keyboard came from), Enter goes into
// the suggestions; ;g (dock.suggest) comes here. When the input form does not
// send to tezcatl, the lines are shown dim with a note.
//
// Shift+arrows move between the parts that take keys (the input form, @gsel,
// @sugg, the input_target) toward the arrow on the grid drawn
// (dockLayout.neighbor), so they follow the dock on every side. From the
// input form, ↓ → only with the caret at the end and ↑ ← at the start (a
// selection in the line is not taken); the shell says its Shift+arrows on the
// bus (suggest.leave).
//
// The source of the receiving side (D-unified-dock): the dock's output_target
// (otgt) lists where lines can come from -- tezcatl (the frame's own), emacs-vent,
// each xterm of the skin -- and a letter there picks one (;o, dock.recv, goes
// there; the choice brings the keyboard back). While the keyboard is in the
// input form (or @gsel / @sugg) the receiving side follows where the input
// sends (lead.chosen) instead. The frame asks output_target for the record to
// show (recv.show) and draws what comes back (recv.lines) over the receiving
// side, with a first line saying whose it is; tezcatl's own lines stay as they
// are underneath. A tezcatl error ("!" line) is put in whichever is shown, so a
// failed line is never out of sight.
//
// The receiving side: what the frame says, a line about a panel or a place
// carrying it as a reference (lib/skin/recv-refs.js) -- shown after its first
// line as @..., and where `go on` goes.
//
// The page (lib/skin/frame-page.js) gives `h`:
//   {T, bus, sfx, placeOfId(id), enter(), runDirect(line), mine(c), pageOf(panel),
//    loaded(panel), changed()}
// pageOf: a panel's page; loaded: one of the dock's frames has loaded;
// changed: the dock's file was read (draw again).
// -> {say(text, cls, ref), refs, form: {el, focus(), set(text)}, targetId(),
//     part(name), partOf(panel), has(el), apply(dock) -> changed?, pagesRead(), def(), name()}
(function (root) {
  'use strict';
  var KEEP = 300;   // lines of the receiving side
  var DIRS = [['local/docks/', 'local/docks'], ['docks/', 'docks']];

  function create(h) {
    var T = h.T, bus = h.bus, D = T.dockLayout;
    var skinEl = document.getElementById('skin');
    var dockEl = document.getElementById('dock');
    var builtIn = D.readDef(D.DEFAULT).def;
    var defs = { standard: builtIn };   // name -> def (read, or the built-in while reading)
    var looking = {};
    var from = { standard: 'built-in' };
    var current = null;                 // the name of the dock drawn
    var drawn = null;                   // what was drawn last (JSON)
    var lastR = null;                   // the grid drawn last (dockLayout.resolve)

    // -- the parts: made once, kept ------------------------------------------------
    var els = {};      // part name -> element
    var panelOf = {};  // part name -> its panel (for partOf)
    var pageAt = {};   // part name -> the page its iframe was opened with
    function partEl(key, val) {
      // the same panel, and the same page (the launcher's list read since may name another)
      if (els[key] && panelOf[key] === val && (els[key].tagName !== 'IFRAME' || !pageAt[key] || pageAt[key] === h.pageOf(val))) return els[key];
      if (els[key] && els[key].tagName === 'IFRAME') els[key].remove();
      var el;
      if (val === '@form') el = document.getElementById('form');
      else if (val === '@recv') el = document.getElementById('recv');
      else if (val === '@gsel') el = gselMake();
      else if (val === '@sugg') {
        el = document.createElement('iframe');
        el.className = 'dock-part';
        el.title = 'suggestions';
        el.setAttribute('data-dock-part', key);
        el.src = suggSrc();
        el.addEventListener('load', function () { sendFilter(); });
        dockEl.appendChild(el);
      } else if (val === null) {
        el = document.createElement('div');
        el.className = 'dock-empty';
        el.textContent = key;
        dockEl.appendChild(el);
      } else {
        el = document.createElement('iframe');
        el.className = 'dock-part';
        el.title = val;
        el.setAttribute('data-dock-part', key);
        pageAt[key] = h.pageOf(val);
        var page = T.config.sibling(pageAt[key]);
        // a page with a query of its own (a list: list.html?config=db_list) takes the name after it
        el.src = page + (page.indexOf('?') < 0 ? '?' : '&') + 'name=' + encodeURIComponent('f' + h.sfx + '-' + key);
        el.addEventListener('load', function () { h.loaded(val); });
        dockEl.appendChild(el);
      }
      els[key] = el;
      panelOf[key] = val;
      return el;
    }
    function partOf(panel) {
      var k = Object.keys(panelOf).filter(function (x) { return panelOf[x] === panel && els[x]; })[0];
      return k ? els[k] : null;
    }
    function has(el) { return !!el && el.tagName === 'IFRAME' && Object.keys(els).some(function (k) { return els[k] === el; }); }

    // -- the dock's file -----------------------------------------------------------------
    function look(name) {
      if (looking[name]) return;
      looking[name] = true;
      DIRS.reduce(function (p, d) {
        return p.then(function (got) {
          if (got || !/^[\w.-]+$/.test(name)) return got;
          return fetch(T.config.sibling(d[0] + name + '.json'), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json().then(function (j) { return { j: j, from: d[1] + '/' + name + '.json' }; }) : null; })
            .catch(function () { return null; });
        });
      }, Promise.resolve(null)).then(function (got) {
        if (!got) {
          if (name !== 'standard') say('! no dock "' + name + '" (local/docks/, docks/): the standard one', 'err');
          return;
        }
        var r = D.readDef(got.j);
        if (r.error) { say('! ' + got.from + ': ' + r.error + ' ── the built-in dock instead', 'err'); return; }
        defs[name] = r.def;
        from[name] = got.from;
        drawn = null;
        h.changed();
      });
    }
    function defOf(name) { return defs[name] || defs.standard; }

    // the skin's dock (as changed in place) drawn: the side, the thickness, the grid, the parts
    // -> whether anything changed (the lines' room then changes too)
    function apply(dock) {
      var d = D.sanitize(dock);
      var name = d.name || 'standard';
      if (!defs[name] || from[name] === 'built-in') look(name);
      current = name;
      var def = defOf(name);
      var r = D.resolve(def, d);
      lastR = r;
      var shown = D.partsOf(r);
      var key = JSON.stringify([name, from[name] || '', r]);
      if (key === drawn) return false;
      drawn = key;
      skinEl.setAttribute('data-dock', r.side);
      var c = D.css(r);
      dockEl.style.flexBasis = r.size;
      dockEl.style.gridTemplateAreas = c.areas;
      dockEl.style.gridTemplateRows = c.rows;
      dockEl.style.gridTemplateColumns = c.cols;
      shown.forEach(function (k) {
        var el = partEl(k, def.parts[k]);
        el.style.gridArea = k;
        el.style.display = '';
      });
      Object.keys(els).forEach(function (k) {
        if (shown.indexOf(k) < 0 || def.parts[k] === undefined) els[k].style.display = 'none';
      });
      var rk = keyOfVal('@recv');
      recvxEl.style.gridArea = rk || '';
      return true;
    }

    // -- the receiving side ---------------------------------------------------------
    var recvEl = document.getElementById('recv');
    var recvxEl = document.getElementById('recvx');
    var refs = T.recvRefs.create(KEEP);
    function say(text, cls, ref) {
      var kept = refs.add(ref);
      String(text).split('\n').forEach(function (t, i) {
        var d = document.createElement('div');
        if (cls) d.className = cls;
        d.textContent = t;
        var mk = kept && i === 0 ? T.recvRefs.mark(kept, h.placeOfId) : '';
        if (mk) {
          var sp = document.createElement('span');
          sp.className = 'ref';
          sp.textContent = ' ' + mk;
          d.appendChild(sp);
        }
        recvEl.appendChild(d);
      });
      while (recvEl.childNodes.length > KEEP) recvEl.removeChild(recvEl.firstChild);
      recvEl.scrollTop = recvEl.scrollHeight;
      // a tezcatl error is seen whatever the receiving side shows
      if (cls === 'err' && other) {
        injected.push(String(text));
        if (injected.length > 20) injected.shift();
        recvxLine(String(text), 'err inj');
        recvxEl.scrollTop = recvxEl.scrollHeight;
      }
    }

    // -- what the receiving side shows: tezcatl's own, or a record from output_target --
    var other = false;        // a record of another source is shown
    var injected = [];        // tezcatl's errors while it is
    var otChosen = { id: 'tezcatl', key: 'tezcatl' };
    var itChosen = { id: 'tezcatl', key: 'tezcatl' };
    var asked = null;         // the last recv.show (JSON)
    function recvxLine(text, cls) {
      var d = document.createElement('div');
      if (cls) d.className = cls;
      d.textContent = text;
      recvxEl.appendChild(d);
    }
    function otgtId() {
      var el = partOf('output_target');
      try { var t = el && el.contentWindow.Tezcatl; return t && t.bus && t.bus.self.id && t.sourcesReady ? t.bus.self.id : null; } catch (_) { return null; }
    }
    function inInput() {
      var a = document.activeElement;
      return a === lineEl || (a && (a === partOfVal('@gsel') || a === partOfVal('@sugg')));
    }
    function wantShown() {
      return inInput() ? { id: itChosen.id, key: itChosen.key, label: itChosen.label || null, follow: true }
        : { id: otChosen.id, key: otChosen.key, label: otChosen.label || null, follow: false };
    }
    // ask output_target for what is to be shown now (again only when it changed, or force)
    function recvAsk(force) {
      var id = otgtId();
      var w = wantShown();
      if (!id) {
        if (w.id === 'tezcatl' || !partOf('output_target')) showOwn();
        return;
      }
      var k = JSON.stringify(w);
      if (k === asked && !force) return;
      asked = k;
      bus.post('recv.show', w, { to: id });
    }
    function showOwn() {
      other = false;
      injected = [];
      dockEl.classList.remove('recv-other');
    }
    bus.on('recv.lines', function (p, meta) {
      if (!meta || !meta.from || meta.from.id !== otgtId() || !p) return;
      if (p.own && !p.missing) { showOwn(); return; }
      if (!other) injected = [];
      other = true;
      dockEl.classList.add('recv-other');
      recvxEl.textContent = '';
      var head = '── ' + (p.missing ? 'no source for ' + p.missing + ': ' : '') + p.label + (p.follow ? ' (following the input)' : '');
      recvxLine(head, 'whose');
      if (p.own) {
        // no source for where the input sends: tezcatl's own lines under the note
        [].forEach.call(recvEl.childNodes, function (n) { recvxEl.appendChild(n.cloneNode(true)); });
      } else {
        (p.lines || []).forEach(function (l) { recvxLine(l.text, l.cls); });
        injected.forEach(function (t) { recvxLine(t, 'err inj'); });
      }
      recvxEl.scrollTop = recvxEl.scrollHeight;
    });
    bus.on('recv.chosen', function (p, meta) {
      if (!meta || !meta.from || meta.from.id !== otgtId() || !p) return;
      otChosen = { id: p.id, key: p.key, label: p.label };
      if (document.activeElement === partOf('output_target')) lineEl.focus();
      recvAsk();
    });
    // where the keyboard is decides what is shown: checked as focus moves (into a frame: the window's blur)
    function focusMoved() { setTimeout(function () { recvAsk(); }, 0); }
    document.addEventListener('focusin', focusMoved);
    document.addEventListener('focusout', focusMoved);
    window.addEventListener('blur', focusMoved);
    window.addEventListener('focus', focusMoved);
    // till output_target is up, ask again now and then (its sources load one by one)
    var waitOtgt = setInterval(function () {
      if (!partOf('output_target')) return;
      if (otgtId()) { clearInterval(waitOtgt); recvAsk(true); }
    }, 300);

    // -- the suggestions (@gsel, @sugg) ------------------------------------------------
    var sources = [{ id: 'line', letter: 'l', label: 'lines' }];   // suggestion/index.json, once read
    var source = 'line';
    var dest = 'tezcatl';     // where the input form sends (lead.chosen)
    var gselEl = null;
    var gselFrom = null;      // where the keyboard came to @gsel from (a letter goes back there)
    function srcOf(id) { return sources.filter(function (x) { return x.id === id; })[0] || sources[0]; }
    function suggSrc() {
      return T.config.sibling('panels/extra/suggestion_list.html') + '?config=' + encodeURIComponent(source) +
        '&in=frame,code_editor&rows=5&cols=2&name=' + encodeURIComponent('f' + h.sfx + '-sugg');
    }
    function gselMake() {
      gselEl = document.createElement('div');
      gselEl.className = 'dock-gsel';
      gselEl.tabIndex = 0;
      gselEl.addEventListener('keydown', gselKey);
      gselEl.addEventListener('click', function () { gselEl.focus(); });
      gselDraw();
      dockEl.appendChild(gselEl);
      return gselEl;
    }
    function gselDraw() {
      if (!gselEl) return;
      var cur = srcOf(source);
      gselEl.textContent = '';
      var head = document.createElement('span');
      head.className = 'cur';
      head.textContent = '▼ ' + cur.label;
      gselEl.appendChild(head);
      sources.forEach(function (x) {
        var sp = document.createElement('span');
        sp.className = 'src' + (x.id === cur.id ? ' on' : '');
        sp.textContent = x.letter + ' ' + x.id;
        gselEl.appendChild(sp);
      });
    }
    function setSource(id) {
      if (id === source) return;
      source = id;
      gselDraw();
      var el = partOfVal('@sugg');
      if (el) el.src = suggSrc();   // the source is read when its suggestions are entered
    }
    function gselKey(e) {
      if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.shiftKey && ARROW[e.key]) { e.preventDefault(); move(keyOfVal('@gsel'), ARROW[e.key]); return; }
      var i = sources.indexOf(srcOf(source));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = sources.length;
        setSource(sources[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n].id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        go(keyOfVal('@sugg'));
      } else if (e.key.length === 1) {
        var hit = sources.filter(function (x) { return x.letter === e.key; })[0];
        if (!hit) return;
        e.preventDefault();
        setSource(hit.id);
        go(gselFrom || keyOfVal('@form'));
      }
    }
    fetch(T.config.sibling('suggestion/index.json'), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var list = j && Array.isArray(j.sources) ? j.sources.filter(function (x) { return x && x.id && x.letter; }) : [];
        if (!list.length) return;
        sources = list.map(function (x) { return { id: x.id, letter: x.letter, label: x.label || x.id }; });
        if (!sources.some(function (x) { return x.id === source; })) setSource(sources[0].id);
        gselDraw();
      })
      .catch(function () {});

    function suggId() {
      var el = partOfVal('@sugg');
      try { var t = el && el.contentWindow.Tezcatl; return t && t.bus && t.bus.self.id; } catch (_) { return null; }
    }
    // the input line to the shell (and a note when the lines are not for where it sends)
    function sendFilter() {
      var id = suggId();
      if (!id) return;
      var note = source === 'line' && dest !== 'tezcatl' ? 'the input form sends to ' + dest + ', not tezcatl' : null;
      bus.post('suggest.filter', { text: lineEl.value, note: note }, { to: id });
    }
    bus.on('suggest.pick', function (p, meta) {
      if (!meta || !meta.from || meta.from.id !== suggId() || !p || typeof p.text !== 'string') return;
      lineEl.value = p.text;
      form.sync();
      form.render();
      sendFilter();
    });
    bus.on('suggest.leave', function (p, meta) {
      if (!meta || !meta.from || meta.from.id !== suggId() || !p || !ARROW[p.key]) return;
      move(keyOfVal('@sugg'), ARROW[p.key]);
    });

    // -- Shift+arrows: to the part next on the grid --------------------------------------
    var ARROW = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    var ENTERS = { '@form': 1, '@gsel': 1, '@sugg': 1, input_target: 1, output_target: 1 };
    function keyOfVal(val) {
      return Object.keys(panelOf).filter(function (k) { return panelOf[k] === val && els[k] && els[k].style.display !== 'none'; })[0] || null;
    }
    function partOfVal(val) { var k = keyOfVal(val); return k ? els[k] : null; }
    function move(from, dir) {
      if (!from || !lastR) return false;
      var to = D.neighbor(lastR, from, dir, function (k) { return !!ENTERS[panelOf[k]] && els[k] && els[k].style.display !== 'none'; });
      if (!to) return false;
      if (panelOf[to] === '@gsel') gselFrom = from;
      go(to);
      return true;
    }
    function go(k) {
      var el = k && els[k];
      if (!el) return;
      var val = panelOf[k];
      if (val === '@form') { lineEl.focus(); return; }
      if (val === '@gsel') { el.focus(); return; }
      if (val === '@sugg') sendFilter();
      try { el.focus(); el.contentWindow.focus(); el.contentDocument.body.focus(); } catch (_) {}
    }

    // the parts are up at once (the built-in dock), before the frame first draws
    apply({});
    // the launcher's list read: the next apply looks at every part's page again
    function pagesRead() { drawn = null; }

    // the input_target's bus id, once every destination is in (targetsReady; till then a line runs directly)
    function targetId() {
      var el = partOf('input_target');
      try { var t = el && el.contentWindow.Tezcatl; return t && t.bus && t.bus.self.id && t.targetsReady ? t.bus.self.id : null; } catch (_) { return null; }
    }

    // -- the input form --------------------------------------------------------------
    var lineEl = document.getElementById('line');
    var form = T.leadForm.mount({
      form: lineEl, sends: document.getElementById('sends'), mark: document.getElementById('mark'),
      note: document.getElementById('lnote'),
    }, { target: targetId, quietOk: function (p) { return p.target === 'tezcatl'; } });
    var history = [];
    var hpos = 0;
    lineEl.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      var empty = !lineEl.value;
      if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && ARROW[e.key]) {
        var a = lineEl.selectionStart, b = lineEl.selectionEnd, n = lineEl.value.length;
        var atEnd = a === b && b === n, atStart = a === b && a === 0;
        var dir = ARROW[e.key];
        if (((dir === 'down' || dir === 'right') && atEnd) || ((dir === 'up' || dir === 'left') && atStart)) {
          if (move(keyOfVal('@form'), dir)) { e.preventDefault(); return; }
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        var line = lineEl.value.trim();
        if (!line) { h.enter(); return; }
        if (targetId()) {
          if (!form.submit()) return;
        } else {
          lineEl.value = '';
          form.sync();
          form.render();
          h.runDirect(line);
        }
        history.push(line);
        hpos = history.length;
        setTimeout(sendFilter, 0);
      } else if (e.key === 'Escape') {
        if (empty && h.enter()) e.preventDefault();
      } else if (e.altKey && (e.code === 'KeyP' || e.code === 'KeyN')) {
        e.preventDefault();
        if (e.code === 'KeyP' && hpos > 0) hpos -= 1;
        if (e.code === 'KeyN' && hpos < history.length) hpos += 1;
        lineEl.value = history[hpos] || '';
        form.sync();
        form.render();
        sendFilter();
      }
    });
    lineEl.addEventListener('input', function () { sendFilter(); });
    // the form focused while the browser's view did not have the keyboard (a page
    // just opened by Poca): keys reach it but no caret or text is drawn till the
    // focus is set again -- so the window asks for it, and the form is focused
    // anew when the window gets it
    function focusLine() {
      try { window.focus(); } catch (_) {}
      if (document.activeElement === lineEl) lineEl.blur();
      lineEl.focus();
    }
    window.addEventListener('focus', function () {
      if (document.activeElement === lineEl) setTimeout(focusLine, 0);
    });
    // ;i (dock.target): to the dock's input_target; a choice there brings the keyboard back
    bus.on('lead.chosen', function (p, meta) {
      if (!meta || !meta.from || meta.from.id !== targetId()) return;
      if (p && p.id && p.id !== dest) { dest = p.id; sendFilter(); }
      if (p && p.id) { itChosen = { id: p.id, key: p.key, label: p.label }; recvAsk(); }
      if (document.activeElement === partOf('input_target')) lineEl.focus();
    });
    // dock.target: ;i -- to the dock's input_target, where a letter picks where the input form sends
    T.commands.register('dock.target', function (_args, c) {
      if (!h.mine(c)) return false;
      var el = partOf('input_target');
      if (!el) return true;
      try { el.focus(); el.contentWindow.focus(); el.contentDocument.body.focus(); } catch (_) {}
      return true;
    });

    // dock.recv: ;o -- to the dock's output_target, where a letter picks where the receiving side takes its lines from
    T.commands.register('dock.recv', function (_args, c) {
      if (!h.mine(c)) return false;
      var k = keyOfVal('output_target');
      if (!k) return true;
      go(k);
      return true;
    });

    // dock.suggest: ;g -- to the source of the suggestions (↑ ↓ turn it, a letter picks it and comes back)
    T.commands.register('dock.suggest', function (_args, c) {
      if (!h.mine(c)) return false;
      var k = keyOfVal('@gsel');
      if (!k) return true;
      gselFrom = document.activeElement === lineEl ? keyOfVal('@form') : null;
      go(k);
      return true;
    });

    return {
      say: say,
      refs: refs,
      form: {
        el: lineEl,
        focus: focusLine,
        // a line put in from outside (code_editor's `:#`): not typing (the form reads it on focus)
        set: function (text) { lineEl.value = text; lineEl.focus(); },
      },
      targetId: targetId,
      part: function (name) { return els[name] || null; },
      partOf: partOf,
      has: has,
      apply: apply,
      pagesRead: pagesRead,
      def: function () { return defOf(current || 'standard'); },
      name: function () { return current || 'standard'; },
    };
  }

  (root.Tezcatl = root.Tezcatl || {}).frameDock = { create: create };
})(typeof self !== 'undefined' ? self : this);
