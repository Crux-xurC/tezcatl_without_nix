// lib/skin/frame-render.js -- the frame's drawing (D-frame, D-block): its lines
// and panels in #stage, a block as its thema under the whole box and the panel
// over it but its band. A panel never moves in the DOM -- its iframe is placed
// absolutely and only its box changes -- so switching or resizing never
// reloads it (a code_editor keeps its edits).
//
// A synthesis (D-synthesis) is drawn as a block whose room holds its panels,
// laid out by its definition (lib/skin/synthesis.js); every iframe of it is
// this page's, as a block's are, and carries the place's id (data-frame-id).
// Its main is the box's `frame` (the way in); `panes` are all its panels by k.
// A panel inside is named <place id>.<k> on the bus; the main's page gets what
// it kept (synthesis.keep) as its query, and kept=saved when read from a saved skin.
//
// The page (lib/skin/frame-page.js) gives `h`:
//   {T, F, stage, whatEl, atEl, state(), catalog, opening, store, sayName(),
//    focusId(id, enterIt), drawn(cfg), syntheses}
// -> {render(), boxes, pageOf(panel, id)}
// drawn: what the map is to show (the panels' places and boxes), after each drawing.
(function (root) {
  'use strict';

  function create(h) {
    var T = h.T, F = h.F, stage = h.stage, store = h.store;
    var boxes = {};   // id -> {el, frame, at} (a block: also thema, cfg, inner, innerY, arm)
    function pct(v) { return (v * 100).toFixed(4) + '%'; }

    function pageOf(panel, id, query) {
      var e = h.catalog[panel];
      var u = new URL(T.config.sibling(e ? e.page : 'panels/' + panel + '.html'), location.href);
      if (query) Object.keys(query).forEach(function (k) { u.searchParams.set(k, query[k]); });
      if (!u.searchParams.get('name')) u.searchParams.set('name', id);
      // what the panel is opened with: a path (code_editor), or its query (code_diff: {a, b})
      var o = h.opening[id];
      if (typeof o === 'string') u.searchParams.set('path', o);
      else if (o) Object.keys(o).forEach(function (k) { u.searchParams.set(k, o[k]); });
      return u.toString();
    }

    // the px of a minimised block (block min): its band, or a line
    var LINE_PX = 4;
    function minPx(p) {
      if (!p.block || !p.block.min) return 0;
      return p.block.min === 'line' ? LINE_PX : T.thema.settings(store.blockDefs[p.panel], p.block).thickness;
    }
    window.addEventListener('resize', function () { render(); });

    // a synthesis' panel k -> its bus name
    function innerName(id, k) { return id + '.' + k; }
    // the box of a synthesis: its band (a block's thema) and its room with its panels
    function synthesisBox(p, def) {
      var bel = document.createElement('div');
      bel.className = 'pane block synthesis';
      var thema = document.createElement('iframe');
      thema.className = 'thema';
      thema.tabIndex = -1;
      thema.title = p.syn.own + ' thema';
      thema.src = T.config.sibling('panels/extra/thema.html') + '?name=' + encodeURIComponent(p.id + '-thema');
      var room = document.createElement('div');
      room.className = 'room';
      bel.appendChild(thema);
      bel.appendChild(room);
      var inner = def.panels.map(function (x) {
        var f = document.createElement('iframe');
        f.className = 'inner';
        f.setAttribute('data-frame-id', p.id);
        f.setAttribute('data-inner', String(x.k));
        f.title = x.panel;
        var q = Object.assign({}, x.query || {});
        if (x.k === def.main) {
          Object.assign(q, p.syn.keep || {});
          if (p.syn.saved) q.kept = 'saved';
        }
        f.src = pageOf(x.panel, innerName(p.id, x.k), q);
        room.appendChild(f);
        return f;
      });
      stage.appendChild(bel);
      bel.addEventListener('pointerdown', function (ev) { if (ev.target === bel) h.focusId(p.id, true); });
      var b = boxes[p.id] = { el: bel, frame: inner[def.main], content: room, panes: inner, def: def, thema: thema, at: null, cfg: null };
      thema.addEventListener('load', function () { pushThema(boxes[p.id]); });
      return b;
    }
    function placeInner(b) {
      var rr = b.content.getBoundingClientRect();
      var boxesIn = T.synthesis.layout(b.def)(b.def.axis === 'v' ? rr.width : rr.height);
      boxesIn.forEach(function (x) {
        var f = b.panes[x.k];
        f.style.left = pct(x.x); f.style.top = pct(x.y); f.style.width = pct(x.w); f.style.height = pct(x.h);
      });
    }

    function render() {
      var state = h.state();
      var sr = stage.getBoundingClientRect();
      var r = F.rects(state, { subPx: state.axis === 'v' ? sr.width : sr.height, fixedPx: minPx });
      h.sayName();
      h.drawn({
        columns: r.columns,
        panels: r.panels.map(function (p) {
          return { place: F.placeText({ col: p.col, row: p.row }), panel: p.syn ? p.syn.own : p.panel, x: p.x, y: p.y, w: p.w, h: p.h, focused: p.focused };
        }),
      });
      h.whatEl.textContent = state.name + ' · ' + state.type + (state.axis === 'v' ? ' v' : '') + ' (' + state.ratio.join(' : ') + ')';
      var f = F.at(state, state.focus);
      h.atEl.textContent = f ? 'focus ' + F.placeText(state.focus) + ' ' + F.nameOf(f) : '';
      Array.prototype.slice.call(stage.querySelectorAll('.col')).forEach(function (el) { el.remove(); });
      r.columns.forEach(function (c) {
        var el = document.createElement('div');
        el.className = 'col' + (c.empty ? '' : ' used');
        el.style.left = pct(c.x);
        el.style.width = pct(c.w);
        el.style.top = pct(c.y);
        el.style.height = pct(c.h);
        if (c.empty) el.textContent = (state.axis === 'v' ? 'row ' : 'column ') + c.col + ' *';
        stage.insertBefore(el, stage.firstChild);
      });
      var live = {};
      r.panels.forEach(function (p) {
        live[p.id] = true;
        var b = boxes[p.id];
        if (!b && p.syn) {
          // a synthesis: drawn once its definition is read (looked for now; drawn again then)
          var def = h.syntheses.get(p.panel);
          if (def === undefined) { h.syntheses.look(p.panel).then(function () { render(); }); return; }
          if (!def) {
            var miss = document.createElement('div');
            miss.className = 'pane missing';
            miss.textContent = p.syn.own + ' ── no synthesis "' + p.panel + '" (syntheses/' + p.panel + '.json)';
            stage.appendChild(miss);
            b = boxes[p.id] = { el: miss, frame: null, at: null };
          } else b = synthesisBox(p, def);
        }
        if (!b && p.block) {
          // a block: the thema under the whole box, the panel over it but its band
          var bel = document.createElement('div');
          bel.className = 'pane block';
          var thema = document.createElement('iframe');
          thema.className = 'thema';
          thema.tabIndex = -1;
          thema.title = p.panel + ' thema';
          thema.src = T.config.sibling('panels/extra/thema.html') + '?name=' + encodeURIComponent(p.id + '-thema');
          var main = document.createElement('iframe');
          main.className = 'main';
          main.setAttribute('data-frame-id', p.id);
          main.title = p.panel;
          main.src = pageOf(p.panel, p.id);
          bel.appendChild(thema);
          bel.appendChild(main);
          stage.appendChild(bel);
          // the band takes no pointer: a click there lands on the box
          bel.addEventListener('pointerdown', function (ev) { if (ev.target === bel) h.focusId(p.id, true); });
          b = boxes[p.id] = { el: bel, frame: main, thema: thema, at: null, cfg: null };
          thema.addEventListener('load', function () { pushThema(boxes[p.id]); });
        }
        if (!b) {
          var el = document.createElement('div');
          el.className = 'pane';
          var head = document.createElement('div');
          head.className = 'head';
          var at = document.createElement('span');
          var what = document.createElement('span');
          what.className = 'what';
          what.textContent = p.panel;
          head.appendChild(at);
          head.appendChild(what);
          var frame = document.createElement('iframe');
          frame.setAttribute('data-frame-id', p.id);
          frame.title = p.panel;
          frame.src = pageOf(p.panel, p.id);
          el.appendChild(head);
          el.appendChild(frame);
          stage.appendChild(el);
          head.addEventListener('pointerdown', function () { h.focusId(p.id, true); });
          b = boxes[p.id] = { el: el, frame: frame, at: at };
        }
        if (b.at) b.at.textContent = F.placeText({ col: p.col, row: p.row });
        if (b.thema) {
          if (!(p.panel in store.blockDefs)) store.lookBlock(p.panel);
          // a synthesis' band says its main's status unless its block or the place says otherwise
          var dressed = store.blockDefs[p.panel];
          if (b.panes && !(dressed && dressed.source)) dressed = Object.assign({}, dressed || {}, { source: 'status' });
          var set = T.thema.settings(dressed, p.block);
          var th = set.thickness + 'px';
          // made small: the panel hidden (not reloaded), the band is the box
          var content = b.content || b.frame;
          content.style.display = set.min ? 'none' : '';
          // an iframe is not stretched by its offsets: its size is given. An L (tl ...) takes two edges
          var e = T.thema.edges(set.side);
          var isL = (e.t || e.b) && (e.l || e.r);
          // an L's arm may be wider than its band (its style's --th-arm, said by the thema)
          var aw = isL && b.arm ? b.arm + 'px' : th;
          content.style.top = e.t ? th : '0';
          content.style.left = e.l ? aw : '0';
          content.style.width = e.l || e.r ? 'calc(100% - ' + aw + ')' : '100%';
          content.style.height = e.t || e.b ? 'calc(100% - ' + th + ')' : '100%';
          // an L's inner corner, rounded by its style (--th-inner, said by the thema): that corner of the panel
          var rr = isL && b.inner ? b.inner + 'px ' + (b.innerY || b.inner) + 'px' : '0';
          content.style.borderTopLeftRadius = e.t && e.l ? rr : '0';
          content.style.borderTopRightRadius = e.t && e.r ? rr : '0';
          content.style.borderBottomLeftRadius = e.b && e.l ? rr : '0';
          content.style.borderBottomRightRadius = e.b && e.r ? rr : '0';
          // a synthesis' band: its own name, its main's status
          b.cfg = Object.assign(set, { partner: b.panes ? innerName(p.id, b.def.main) : p.id, panel: F.nameOf(p), label: F.placeText({ col: p.col, row: p.row }), focused: p.focused,
            synthesis: !!b.panes,
            across: state.axis === 'v' ? 'v' : 'h' });
          pushThema(b);
        }
        b.el.style.left = pct(p.x);
        b.el.style.top = pct(p.y);
        b.el.style.width = pct(p.w);
        b.el.style.height = pct(p.h);
        b.el.classList.toggle('focused', p.focused);
        if (b.panes) placeInner(b);
      });
      Object.keys(boxes).forEach(function (id) {
        if (!live[id]) { boxes[id].el.remove(); delete boxes[id]; }
      });
    }

    // the thema's settings into its page (same origin; again when it has loaded)
    function pushThema(b) {
      if (!b || !b.thema || !b.cfg) return;
      try { if (b.thema.contentWindow && b.thema.contentWindow.themaSet) b.thema.contentWindow.themaSet(b.cfg); } catch (_) {}
    }

    // a thema says the inner corner its style rounds and the width of its arm (thema-page.js sayInner)
    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || d.type !== 'tezcatl.thema.inner' || ev.origin !== location.origin) return;
      Object.keys(boxes).forEach(function (id) {
        var b = boxes[id];
        if (b.thema && b.thema.contentWindow === ev.source) {
          b.inner = Number(d.px) || 0;
          b.innerY = Number(d.py) || b.inner;
          b.arm = Number(d.arm) || 0;
          render();
        }
      });
    });

    return { render: render, boxes: boxes, pageOf: pageOf, innerName: innerName };
  }

  (root.Tezcatl = root.Tezcatl || {}).frameRender = { create: create };
})(typeof self !== 'undefined' ? self : this);
