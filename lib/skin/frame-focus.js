// lib/skin/frame-focus.js -- where the keyboard is in the frame (D-frame). The
// focus (the place focused last) is moved outside the panels: the leave key in
// a panel (Esc Esc, config.json ui.keys.leave) comes to the input form;
// `skin focus abs` (":" alone) goes on to the map, where hjkl and the arrow
// keys move it (skin focus x - / y / y - / x) and Enter goes into that panel
// (lib/skin/panel-abstract-page.js). Enter or Escape on an empty line of the
// input form goes into it too, and so does a click.
//
// The page (lib/skin/frame-page.js) gives `h`:
//   {T, F, bus, state(), setState(s), keep(), render(), boxes, ctx, catalogP,
//    atEl, abs(), form, inDock(el), code()}
// -> {enter(), enterInner(id, k), busIdOf(id), focusId(id, enterIt), focusAbs(), setAbs(cfg), pushAbs()}
// enter goes into a synthesis' main (its box's frame); enterInner into its panel k (syn <word>).
// abs(): the dock's map (panel_abstract), or null; pushAbs again when it has loaded.
// form: the dock's input form (lib/skin/frame-dock.js). inDock: whether an element
// is one of the dock's frames (the leave key there comes back to the input form).
// code(): the frame's code_editor wiring, once made.
(function (root) {
  'use strict';

  function create(h) {
    var F = h.F, bus = h.bus, boxes = h.boxes;

    function enter() {
      var state = h.state();
      var p = F.at(state, state.focus);
      var b = p && boxes[p.id];
      if (!b || !b.frame) return false;
      // a block made small: its panel is hidden -- block unmin first
      if (p.block && p.block.min) return false;
      try { b.frame.focus(); b.frame.contentWindow && b.frame.contentWindow.focus(); } catch (_) {}
      // and the caret inside it (panel-frame's `focus`, to the panel's own bus id)
      var who = busIdOf(p.id);
      if (who) bus.post('focus', {}, { to: who });
      if (F.isEditor(p.panel) && h.code()) h.code().setLast(p.id);
      return true;
    }
    // a synthesis' panel k: the place focused, the keyboard there
    function enterInner(id, k) {
      var b = boxes[id];
      var f = b && b.panes && b.panes[k];
      if (!f) return false;
      focusId(id, false);
      try { f.focus(); f.contentWindow && f.contentWindow.focus(); } catch (_) {}
      var who = null;
      try { who = f.contentWindow.Tezcatl.bus.self.id; } catch (_) {}
      if (who) bus.post('focus', {}, { to: who });
      return true;
    }
    // a panel's bus id: same origin, so read from its window
    function busIdOf(id) {
      var b = boxes[id];
      try { return b && b.frame.contentWindow.Tezcatl.bus.self.id; } catch (_) { return null; }
    }
    // the panel with this id is the focused one (enterIt: also put the keyboard there)
    function focusId(id, enterIt) {
      var state = h.state();
      var p = F.find(state, id);
      if (!p) return;
      state.focus = p;
      if (F.isEditor(F.at(state, p).panel) && h.code()) h.code().setLast(id);
      h.keep();
      h.render();
      if (enterIt) enter();
    }
    // a click into a panel: this page loses the focus to that iframe
    window.addEventListener('blur', function () {
      setTimeout(function () {
        var state = h.state();
        var ae = document.activeElement;
        var id = ae && ae.tagName === 'IFRAME' && ae.getAttribute('data-frame-id');
        var cur = F.at(state, state.focus);
        if (id && (!cur || cur.id !== id)) focusId(id, false);
      }, 0);
    });
    // a panel asks to be shown (code_editor's code.reveal -- file_changes, :find ...): matched by its window
    window.addEventListener('message', function (ev) {
      var d = ev && ev.data;
      if (!d || d.type !== 'tezcatl.pane.reveal' || !ev.source || ev.origin !== location.origin) return;
      Object.keys(boxes).forEach(function (id) {
        if (boxes[id].frame.contentWindow === ev.source) { try { window.focus(); } catch (_) {} focusId(id, true); }
      });
    });
    // the leave key in one of the panels: to the input form
    // (which panel: the iframe holding the focus in this page -- not every
    // panel takes ?name=, and a yield from another window is not ours)
    bus.on('yield', function () {
      if (!document.hasFocus()) return;
      var ae = document.activeElement;
      if (h.inDock(ae)) { h.form.focus(); return; }   // from the dock
      var id = ae && ae.tagName === 'IFRAME' && ae.getAttribute('data-frame-id');
      if (!id || !F.find(h.state(), id)) return;
      focusId(id, false);
      h.form.focus();
    });

    // -- the map in the dock (lib/skin/panel-abstract-page.js) -----------------------
    // what there is to draw (same origin; again when it has loaded), and the keys it says back
    var absCfg = null;
    function pushAbs() {
      var absEl = h.abs();
      try { if (absCfg && absEl && absEl.contentWindow && absEl.contentWindow.abstractSet) absEl.contentWindow.abstractSet(absCfg); } catch (_) {}
    }
    function setAbs(cfg) { absCfg = cfg; pushAbs(); }
    function focusAbs() {
      var absEl = h.abs();
      try { absEl.focus(); absEl.contentWindow && absEl.contentWindow.focus(); } catch (_) {}
    }
    window.addEventListener('message', function (ev) {
      var d = ev.data;
      var absEl = h.abs();
      if (!d || d.type !== 'tezcatl.abstract' || ev.origin !== location.origin || !absEl || ev.source !== absEl.contentWindow) return;
      if (d.enter) { enter(); return; }
      if (d.move) h.catalogP.then(function () { moveFocus(d.move); });
    });
    // hjkl / the arrows in the map: the focus moves; the keyboard stays there
    function moveFocus(dir) {
      var r = F.apply(h.state(), F.parse('skin focus ' + dir), h.ctx);
      if (r.error) { h.atEl.textContent = r.error; return; }
      h.setState(r.state);
      h.keep();
      h.render();
    }

    return { enter: enter, enterInner: enterInner, busIdOf: busIdOf, focusId: focusId, focusAbs: focusAbs, setAbs: setAbs, pushAbs: pushAbs };
  }

  (root.Tezcatl = root.Tezcatl || {}).frameFocus = { create: create };
})(typeof self !== 'undefined' ? self : this);
