// lib/skin/thema-page.js -- the thema panel (panels/extra/thema.html):
// the band round its partner panel in a block, with one sentence and a colour
// (lib/skin/thema.js decides them). It listens and draws; it says nothing on
// the bus and takes no keys -- the frame puts it under its partner and sets it
// with window.themaSet(cfg):
//   {partner: <the partner's panel id = its bus name>, panel, label, focused,
//    source, side, color, thickness}
(function () {
  'use strict';
  var T = window.Tezcatl;
  var bus = T.bus;
  var params = new URLSearchParams(location.search);
  bus.identify({ role: 'thema', name: params.get('name') || null });

  var textEl = document.getElementById('text');
  var styleEl = document.getElementById('style');
  var styleNow = null;
  var cfg = T.thema.settings(null, null);
  var heard = { file: null, dirty: false, status: null };

  function draw() {
    var r = T.thema.show(cfg, heard);
    document.body.className = 'side-' + cfg.side + (cfg.focused ? ' focused' : '') + (cfg.min ? ' min-' + cfg.min : '') +
      (cfg.style ? ' style-' + cfg.style : '');
    document.documentElement.style.setProperty('--th-thickness', cfg.thickness + 'px');
    document.documentElement.style.setProperty('--th-color', r.color);
    useStyle(cfg.style);
    textEl.textContent = r.text;
    textEl.title = r.text;
  }

  // a style: thema/<name>.css -- this machine's local/thema/<name>.css first (not in git,
  // e.g. lcars), then the one the repository gives; none found: plain
  function useStyle(name) {
    if (name === styleNow) return;
    styleNow = name;
    if (!name) { styleEl.href = 'data:text/css,'; return; }   // (its load says the inner corner again: 0)
    var dirs = ['local/thema/', 'thema/'];
    (function next(i) {
      if (i >= dirs.length || styleNow !== name) return;
      var url = T.config.sibling(dirs[i] + name + '.css');
      fetch(url, { cache: 'no-store' }).then(function (r) {
        if (styleNow !== name) return;
        // (a query of its own: the page server sends no cache headers, and an edited style
        // would be drawn from the browser's copy)
        if (r.ok) styleEl.href = url + '?v=' + Date.now().toString(36); else next(i + 1);
      }).catch(function () { next(i + 1); });
    })(0);
  }

  // What a style says of an L (tl ...) that the frame must follow, the panel lying over
  // this page: --th-inner, the radius (px; two numbers: across and down) of the inner
  // corner -- the frame rounds that corner of the panel and #corner shows under it --
  // and --th-arm, the width (px) of the arm when it is not the band's thickness -- the
  // frame moves the panel by it. Said to the frame whenever a style has loaded.
  var saidNow = null;
  function numbers(name) {
    return String(getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim().split(/[\s,/]+/)
      .map(parseFloat).filter(function (n) { return isFinite(n) && n >= 0; });
  }
  function sayInner() {
    var inner = numbers('--th-inner');
    var ix = inner[0] || 0;
    var iy = inner.length > 1 ? inner[1] : ix;
    var arm = Math.min(numbers('--th-arm')[0] || 0, 400);
    // the arm's width as a length, for this page's own layout (thema.html) and the style's
    if (arm > 0) document.documentElement.style.setProperty('--th-armw', arm + 'px');
    else document.documentElement.style.removeProperty('--th-armw');
    var key = ix + ' ' + iy + ' ' + arm;
    if (key === saidNow) return;
    saidNow = key;
    try { window.parent.postMessage({ type: 'tezcatl.thema.inner', px: ix, py: iy, arm: arm }, location.origin); } catch (_) {}
  }
  styleEl.addEventListener('load', sayInner);

  // from the partner only
  function partner(p, meta) {
    return !!(cfg.partner && ((meta && meta.from && meta.from.name === cfg.partner) || (p && p.name === cfg.partner)));
  }
  bus.on('code.opened', function (p, meta) { if (partner(p, meta)) { heard.file = p.path || null; draw(); } });
  bus.on('code.dirty', function (p, meta) { if (partner(p, meta)) { heard.dirty = !!p.dirty; draw(); } });
  bus.on('code.here', function (p, meta) {
    if (!partner(p, meta)) return;
    heard.file = p.path || heard.file;
    heard.dirty = !!p.dirty;
    draw();
  });
  bus.on('panel.status', function (p, meta) {
    if (!partner(p, meta)) return;
    heard.status = p && typeof p === 'object' ? { text: String(p.text == null ? '' : p.text), level: p.level || null } : null;
    draw();
  });

  window.themaSet = function (c) {
    var was = cfg.partner;
    // the frame gives the whole of it each time: what it leaves out (unmin, thema text) is gone
    var next = T.thema.settings(null, c);
    ['partner', 'panel', 'label', 'focused', 'across', 'synthesis'].forEach(function (k) { if (c && k in c) next[k] = c[k]; });
    cfg = next;
    // a new partner: what it has now (a code_editor answers code.query with code.here)
    if (cfg.partner && cfg.partner !== was) {
      heard = { file: null, dirty: false, status: null };
      if (cfg.source === 'file') bus.post('code.query', { req: 'thema-' + Date.now().toString(36) });
    }
    draw();
  };
  draw();
})();
