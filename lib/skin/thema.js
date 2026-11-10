// lib/skin/thema.js -- what a thema shows: the one
// sentence and the colour of the band round its partner panel, from the
// block's settings and what the partner said on the bus. Pure: the page
// (lib/skin/thema-page.js) listens and draws.
//
// cfg: {source, side, color, label, panel, text, min, across}
//   text    a sentence of its own (thema text): shown in place of the source's
//   min     null | "band" (the block made small to its band: the sentence shows when
//           the strip lies across -- `across` "h" --) | "line" (a thin line, no sentence)
//   source  "name"   the place and the panel's name (the frame's heading)
//           "file"   the partner's file (code.opened / code.here), ● when unsaved (code.dirty)
//           "status" what the partner says of itself (panel.status {text, level})
//   color   a colour name of the palette (base, info, warn, alert, calm), a name a style
//           gives (--th-<name>: thema/lcars.css's orange ...), or any CSS colour
//   side    t / b / r / l, or round a corner: tl / tr / bl / br (an L: the band with the
//           sentence on top or bottom, an arm down the side)
//   style   null | a name: the page draws with thema/<name>.css (local/thema/ first)
// heard: {file, dirty, status: {text, level} | null}
// -> {text, level, color}: level null | "info" | "warn" | "alert" (it picks the colour
//    over `color` when set); text "" on a band at the side (r / l): no
//    sentence fits there (a skin's own CSS may turn it, .side-r / .side-l).
//
// Only tezcatl's own structured notices are read; no backend's words are
// interpreted (the partner says what it wants in panel.status).
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).thema = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PALETTE = ['base', 'info', 'warn', 'alert', 'calm'];
  const SIDES = ['t', 'b', 'r', 'l', 'tl', 'tr', 'bl', 'br'];
  const LEVELS = ['info', 'warn', 'alert'];
  const DEFAULTS = { source: 'name', side: 't', color: 'base', thickness: 24 };

  // the settings of a block: defaults < the panel's block (blocks/<panel>.json) < this place's
  function settings(def, here) {
    const o = Object.assign({}, DEFAULTS);
    [def, here].forEach((x) => {
      if (!x || typeof x !== 'object') return;
      if (['name', 'file', 'status'].indexOf(x.source) >= 0) o.source = x.source;
      if (SIDES.indexOf(x.side) >= 0) o.side = x.side;
      if ('style' in x) o.style = typeof x.style === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(x.style) ? x.style : null;
      if (typeof x.color === 'string' && x.color.trim()) o.color = x.color.trim();
      const n = Number(x.thickness);
      if (Number.isFinite(n) && n >= 4 && n <= 200) o.thickness = Math.round(n);
      if ('text' in x) o.text = typeof x.text === 'string' && x.text.trim() ? x.text.trim() : null;
      if ('min' in x) o.min = x.min === 'band' || x.min === 'line' ? x.min : null;
    });
    return o;
  }

  // a colour name of the palette -> the CSS variable; another name -> the variable a
  // style may give, else the CSS colour of that name; #hex, rgb() ... as they are
  function cssColor(c) {
    if (PALETTE.indexOf(c) >= 0) return 'var(--th-' + c + ')';
    if (/^[a-z][a-z0-9-]*$/i.test(c)) return 'var(--th-' + c + ', ' + c + ')';
    return c;
  }
  // which edges the band takes: {t, b, l, r} (tl: top and left ...)
  function edges(side) {
    const s = String(side || 't');
    return { t: s.charAt(0) === 't', b: s.charAt(0) === 'b', l: s === 'l' || s.charAt(1) === 'l', r: s === 'r' || s.charAt(1) === 'r' };
  }

  function show(cfg, heard) {
    const c = cfg || {};
    const h = heard || {};
    const name = [c.label, c.panel].filter(Boolean).join(' ');
    let text = name;
    let level = null;
    if (c.source === 'file') {
      text = (c.label ? c.label + ' ' : '') + (h.file || c.panel || '') + (h.dirty ? ' ●' : '');
      if (h.dirty) level = 'warn';
    } else if (c.source === 'status') {
      const st = h.status;
      const said = st && typeof st.text === 'string' && st.text;
      // a synthesis' band (D-synthesis): its own name, then its main's status
      text = said ? (c.synthesis ? name + ' ── ' : (c.label ? c.label + ' ' : '')) + st.text : name;
      if (st && LEVELS.indexOf(st.level) >= 0) level = st.level;
    }
    if (typeof c.text === 'string' && c.text) text = (c.label ? c.label + ' ' : '') + c.text;
    if (c.min === 'line') text = '';
    else if (c.min === 'band') { if (c.across === 'v') text = ''; }
    else if (c.side === 'r' || c.side === 'l') text = '';
    return { text, level, color: cssColor(level || c.color || DEFAULTS.color) };
  }

  return { DEFAULTS, PALETTE, SIDES, settings, show, cssColor, edges };
});
