// lib/skin/virtual-keyboard-page.js -- the virtual keyboard
// (panels/extra/virtual_keyboard.html; D-lead-key "仮想キーボード").
//
// Only takes and colours: on the bus message `lead.keys` ({keys: [light...]},
// the lights of lib/core/lead.js reader().feed, sent by the lead-key input form
// as each key is typed) it pushes the keys into five slots and colours them,
// newest first. Every two seconds it pushes an empty slot itself, so what is
// not typed over steps down and goes out: no "clear" message is needed, and
// the timer and the typing never wait on each other.
//
// In a skin it takes `lead.keys` only from the panels of the same skin
// (skinPort.siblings) and the skin page itself (the frame's input form);
// alone in a window, from anyone (for trying it out).
// It is not one of the panels focused last (no panelFrame.init), like the map.
(function () {
  'use strict';
  var T = window.Tezcatl;
  var vk = T.virtualKeyboard;
  var params = new URLSearchParams(location.search);
  T.bus.identify({ role: 'virtual_keyboard', name: params.get('name') || null });

  var TICK_MS = 2000;
  var kbEl = document.getElementById('kb');
  var slots = vk.slots();
  var spans = [];   // [{el, id}]

  vk.render().forEach(function (segs, i) {
    if (i) kbEl.appendChild(document.createTextNode('\n'));
    segs.forEach(function (s) {
      if (!s.id) { kbEl.appendChild(document.createTextNode(s.text)); return; }
      var el = document.createElement('span');
      el.textContent = s.text;
      kbEl.appendChild(el);
      spans.push({ el: el, id: s.id });
    });
  });

  function paint() {
    spans.forEach(function (s) {
      var shade = slots.shade(s.id);
      if (shade < 0) s.el.removeAttribute('data-shade');
      else s.el.setAttribute('data-shade', String(shade));
    });
  }

  function fromSibling(meta) {
    var sib = T.skinPort.siblings(window);
    if (!sib) return true;
    var from = meta && meta.from && meta.from.id;
    return from === T.skinPort.id(window) || sib.some(function (x) { return x.id === from; });
  }

  T.bus.on('lead.keys', function (payload, meta) {
    if (!fromSibling(meta)) return;
    var keys = (payload && payload.keys) || [];
    keys.forEach(function (light) {
      vk.entries(String(light)).forEach(function (e) { slots.push(e); });
    });
    paint();
  });

  setInterval(function () {
    if (slots.empty()) return;
    slots.tick();
    paint();
  }, TICK_MS);

  // the font size that fits the whole board in the panel
  var LINES = vk.render().length;
  var COLS = vk.columns();
  function fit() {
    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:100px;font-family:inherit';
    probe.textContent = 'M'.repeat(50);
    kbEl.appendChild(probe);
    var charW = probe.getBoundingClientRect().width / 50 / 100;   // per px of font size
    kbEl.removeChild(probe);
    var w = document.documentElement.clientWidth;
    var h = document.documentElement.clientHeight;
    if (!charW || !w || !h) return;
    var size = Math.min(w / (COLS * charW), h / (LINES * 1.2));
    kbEl.style.fontSize = Math.max(4, Math.floor(size * 10) / 10) + 'px';
  }
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(document.documentElement);
  else window.addEventListener('resize', fit);
})();
