// lib/skin/panel-abstract-page.js -- the map of a frame
// (panels/extra/panel_abstract.html), at the left of the frame's dock: the
// skin's lines and panels as boxes, the focused one filled, so that moving the
// focus is seen. The frame gives what to draw with window.abstractSet(model):
//   {columns: [{x, y, w, h, empty}], panels: [{place, panel, x, y, w, h, focused}]}
//   (fractions of the stage, as lib/skin/frame-layout.js rects gives them)
//
// The keys that move the focus between the panels are here (not in the input
// form): h j k l and the arrows are `skin focus x -` / `y` / `y -` / `x`,
// Enter goes into the focused panel. They are said to the frame (postMessage
// to the parent), which runs them; the leave key (Esc Esc, panel-frame.js)
// goes back to the input form. The frame comes here with `skin focus abs`
// (":" alone in its input form).
//
// It says nothing on the bus but the leave key, and is not one of the panels
// focused last (no panelFrame.init: a command meant for "the panel focused
// last" must not land here).
(function () {
  'use strict';
  var T = window.Tezcatl;
  var params = new URLSearchParams(location.search);
  T.bus.identify({ role: 'abstract', name: params.get('name') || null });

  var mapEl = document.getElementById('map');
  var MOVES = { h: 'x -', j: 'y', k: 'y -', l: 'x', arrowleft: 'x -', arrowdown: 'y', arrowup: 'y -', arrowright: 'x' };
  function pct(v) { return (v * 100).toFixed(3) + '%'; }
  function box(cls, o) {
    var el = document.createElement('div');
    el.className = cls;
    el.style.left = pct(o.x);
    el.style.top = pct(o.y);
    el.style.width = pct(o.w);
    el.style.height = pct(o.h);
    return el;
  }

  window.abstractSet = function (m) {
    mapEl.textContent = '';
    ((m && m.columns) || []).forEach(function (c) { if (c.empty) mapEl.appendChild(box('line', c)); });
    ((m && m.panels) || []).forEach(function (p) {
      var el = box('cell' + (p.focused ? ' focused' : ''), p);
      el.textContent = p.place || '';
      el.title = (p.place || '') + ' ' + (p.panel || '');
      mapEl.appendChild(el);
    });
  };

  function say(d) {
    try { window.parent.postMessage(Object.assign({ type: 'tezcatl.abstract' }, d), location.origin); } catch (_) {}
  }
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    var mv = MOVES[String(e.key).toLowerCase()];
    if (mv) { e.preventDefault(); say({ move: mv }); }
    else if (e.key === 'Enter') { e.preventDefault(); say({ enter: true }); }
  });

  // where the keyboard is: shown by the border
  function keys() { document.body.classList.toggle('keys', document.hasFocus()); }
  window.addEventListener('focus', keys);
  window.addEventListener('blur', keys);
  keys();
})();
