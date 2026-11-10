// lib/skin/dock-layout.js -- the frame's dock as data (D-dock): what a dock is
// made of and how its parts are laid out, and the `dock …` commands. Pure: no
// DOM, no bus, no storage -- lib/skin/frame-dock.js draws it.
//
// A dock is one unit of the skin (as a block is of a panel, D-block): a set of
// parts and, for each side it can stand on, a CSS grid of them. Its file is
// docks/<name>.json (local/docks/ first; docs: docks/README.md):
//   { "name": "standard", "side": "b",
//     "size":  { "b": "14em", "l": "36em", "r": "36em" },
//     "parts": { "map": "panel_abstract", "form": "@form", "recv": "@recv", "help": null, ... },
//     "grid":  { "b": { "areas": ["map form recv", ...], "rows": [1, ...], "cols": [2, 6, 6] },
//                "l": { ... }, "r": "l" } }
// A part is a panel's name (an iframe of the frame page), "@form" / "@recv"
// (the input form and the receiving side, the frame page's own), "@gsel" /
// "@sugg" (the source of the suggestions, one line, and the suggestion shell
// showing it -- D-suggestions), or null (not made yet: an empty box with its name).
// "r": "l" -- the right as the left.
//
// neighbor(r, from, dir, can) -> the part next to `from` toward dir (up, down,
// left, right) on the drawn grid, the first that can(name) along that edge in
// reading order; past parts that cannot, further on; null at the edge. The
// dock's Shift+arrows go by it, so they follow the grid on every side.
//
// What is changed in place lives in the skin (its JSON's "dock"), per side,
// and only what was changed:
//   { "side": "l", "size": { "l": "30em" }, "rows": { "l": [...] }, "cols": { "b": [...] } }
//
// Commands (one line of the input form):
//   dock side l | b | r       where the dock stands (its frames are not reloaded)
//   dock size <length>        its thickness on that side (16em, 240px, 30%)
//   dock rows a,b,…           the sizes of the grid's rows on that side (whole numbers, as fr)
//   dock cols a,b,…           the same for its columns
//   dock reset                the sizes and ratios back to the dock's file (the side stays)
//
// sizePart(dock, def, part, open) -> {dock, message} | {error}: the row a part fills
// alone (the list of database windows, `dbls`) made half the dock (open) or back
// to its file's size -- `db list open | close` (lib/skin/db-commands.js)
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).dockLayout = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIDES = ['b', 'l', 'r'];
  const SIDE_NAMES = { b: 'bottom', l: 'left', r: 'right' };
  const LENGTH = /^\d+(?:\.\d+)?(?:em|rem|px|%|vh|vw)$/;
  const USAGE = 'dock side l|b|r · dock size <length> · dock rows a,b,… · dock cols a,b,… · dock reset';

  // the dock the frame has when no file is found (the same as docks/standard.json)
  const DEFAULT = {
    name: 'standard',
    side: 'b',
    size: { b: '14em', l: '36em', r: '36em' },
    parts: {
      help: 'How_to_use', map: 'panel_abstract', vkbd: 'virtual_keyboard', itgt: 'input_target',
      form: '@form', recv: '@recv', clock: 'clock', gtgt: '@gsel', sugg: '@sugg', otgt: 'output_target',
      dbls: 'db_list',
    },
    grid: {
      b: {
        areas: ['help itgt form recv vkbd', 'map gtgt sugg recv vkbd', 'map clock sugg recv vkbd', 'map otgt sugg recv vkbd', 'dbls dbls dbls dbls dbls'],
        rows: [3, 1, 1, 1, 1], cols: [2, 3, 6, 6, 6],
      },
      l: {
        areas: ['help map', 'vkbd vkbd', 'itgt form', 'gtgt sugg', 'clock sugg', 'otgt sugg', 'recv recv', 'dbls dbls'],
        rows: [2, 4, 3, 1, 1, 1, 6, 1], cols: [1, 2],
      },
      r: 'l',
    },
  };

  function posInt(v) { const n = Number(v); return Number.isInteger(n) && n > 0 && n <= 1000 ? n : null; }
  function ints(a) { return Array.isArray(a) && a.length && a.every((n) => posInt(n) != null) ? a.map(Number) : null; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function cells(areas) { return areas.map((r) => String(r).trim().split(/\s+/)); }

  // a grid of a side, with "r": "l" followed -> {areas, rows, cols} | null
  function gridOf(def, side) {
    let g = def && def.grid && def.grid[side];
    if (typeof g === 'string') g = def.grid[g];
    return g && typeof g === 'object' ? g : null;
  }

  // every named area a rectangle (else CSS drops the whole template)
  function rectangles(rows) {
    const seen = {};
    rows.forEach((r, y) => r.forEach((n, x) => {
      if (n === '.') return;
      const b = seen[n] || (seen[n] = { x0: x, x1: x, y0: y, y1: y, count: 0 });
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
      b.count += 1;
    }));
    return Object.keys(seen).filter((n) => {
      const b = seen[n];
      return (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) !== b.count;
    });
  }

  // a dock's file -> {def} | {error}: the grids sound, the parts named
  function readDef(j) {
    if (!j || typeof j !== 'object' || !j.parts || typeof j.parts !== 'object' || !j.grid || typeof j.grid !== 'object') {
      return { error: 'a dock needs "parts" and "grid"' };
    }
    const parts = {};
    for (const k of Object.keys(j.parts)) {
      const v = j.parts[k];
      if (!/^[a-z][\w]*$/i.test(k)) return { error: 'a part\'s name is a word: "' + k + '"' };
      if (v !== null && (typeof v !== 'string' || !/^(@form|@recv|@gsel|@sugg|[\w.-]+)$/.test(v))) {
        return { error: 'part ' + k + ': a panel\'s name, "@form", "@recv", "@gsel", "@sugg" or null' };
      }
      parts[k] = v;
    }
    const def = { name: typeof j.name === 'string' && j.name ? j.name : 'dock', side: SIDES.indexOf(j.side) >= 0 ? j.side : 'b',
      size: {}, parts, grid: {} };
    for (const s of SIDES) {
      if (j.size && typeof j.size[s] === 'string' && LENGTH.test(j.size[s])) def.size[s] = j.size[s];
      else def.size[s] = DEFAULT.size[s];
      const raw = j.grid[s];
      if (typeof raw === 'string') {
        if (SIDES.indexOf(raw) < 0 || typeof j.grid[raw] !== 'object') return { error: 'grid ' + s + ': "' + raw + '" is not a grid of another side' };
        def.grid[s] = raw;
        continue;
      }
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.areas) || !raw.areas.length) return { error: 'grid ' + s + ': no areas' };
      const rows = cells(raw.areas);
      const w = rows[0].length;
      if (rows.some((r) => r.length !== w)) return { error: 'grid ' + s + ': every row needs ' + w + ' names' };
      const unknown = [...new Set(rows.flat())].filter((n) => n !== '.' && !(n in parts));
      if (unknown.length) return { error: 'grid ' + s + ': not a part: ' + unknown.join(', ') };
      const bent = rectangles(rows);
      if (bent.length) return { error: 'grid ' + s + ': not a rectangle: ' + bent.join(', ') };
      const r = ints(raw.rows) || rows.map(() => 1);
      const c = ints(raw.cols) || rows[0].map(() => 1);
      if (r.length !== rows.length) return { error: 'grid ' + s + ': ' + rows.length + ' rows, ' + r.length + ' sizes' };
      if (c.length !== w) return { error: 'grid ' + s + ': ' + w + ' columns, ' + c.length + ' sizes' };
      def.grid[s] = { areas: rows.map((x) => x.join(' ')), rows: r, cols: c };
    }
    return { def };
  }

  // what is kept in a skin -> a sound one ({} when nothing)
  function sanitize(d) {
    const o = {};
    if (!d || typeof d !== 'object') return o;
    if (typeof d.name === 'string' && /^[\w.-]+$/.test(d.name)) o.name = d.name;
    if (SIDES.indexOf(d.side) >= 0) o.side = d.side;
    for (const k of ['size', 'rows', 'cols']) {
      if (!d[k] || typeof d[k] !== 'object') continue;
      for (const s of SIDES) {
        const v = d[k][s];
        const ok = k === 'size' ? (typeof v === 'string' && LENGTH.test(v) ? v : null) : ints(v);
        if (ok) (o[k] = o[k] || {})[s] = ok;
      }
    }
    return o;
  }

  // the dock as drawn: its file with what the skin changed -> {side, size, areas, rows, cols}
  function resolve(def, dock) {
    const d = sanitize(dock);
    const side = d.side || def.side;
    const g = gridOf(def, side);
    const rows = d.rows && d.rows[side] && d.rows[side].length === g.rows.length ? d.rows[side] : g.rows;
    const cols = d.cols && d.cols[side] && d.cols[side].length === g.cols.length ? d.cols[side] : g.cols;
    return { side, size: (d.size && d.size[side]) || def.size[side], areas: g.areas.slice(), rows: rows.slice(), cols: cols.slice() };
  }

  // the CSS of a resolved dock
  function css(r) {
    return {
      areas: r.areas.map((a) => '"' + a + '"').join(' '),
      rows: r.rows.map((n) => n + 'fr').join(' '),
      cols: r.cols.map((n) => n + 'fr').join(' '),
    };
  }

  // the parts a side shows (each once, in reading order)
  function partsOf(r) { return [...new Set(cells(r.areas).flat())].filter((n) => n !== '.'); }

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  function neighbor(r, from, dir, can) {
    const rows = cells(r.areas);
    const d = DIRS[dir];
    if (!d) return null;
    let box = null;
    rows.forEach((row, y) => row.forEach((n, x) => {
      if (n !== from) return;
      if (!box) box = { x0: x, x1: x, y0: y, y1: y };
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
    }));
    if (!box) return null;
    const ok = can || (() => true);
    // the line of cells just past the edge, then the next, … (along the edge: reading order)
    for (let step = 1; ; step++) {
      const line = [];
      if (d[0]) {
        const x = d[0] > 0 ? box.x1 + step : box.x0 - step;
        if (x < 0 || x >= rows[0].length) return null;
        for (let y = box.y0; y <= box.y1; y++) line.push(rows[y][x]);
      } else {
        const y = d[1] > 0 ? box.y1 + step : box.y0 - step;
        if (y < 0 || y >= rows.length) return null;
        for (let x = box.x0; x <= box.x1; x++) line.push(rows[y][x]);
      }
      const hit = line.find((n) => n !== '.' && n !== from && ok(n));
      if (hit) return hit;
    }
  }

  // -- reading a line -----------------------------------------------------------------
  // -> null (not a dock line) | {error} | {cmd, …}
  function parse(line) {
    // blanks separate the words; a list (1,2) is one word, no blank inside (as skin's: lib/skin/frame-layout.js)
    const words = String(line).trim().split(/\s+/);
    if (words[0] !== 'dock') return null;
    const a = words.slice(2);
    switch (words[1]) {
      case 'side':
        return a.length === 1 && SIDES.indexOf(a[0]) >= 0 ? { cmd: 'side', side: a[0] } : { error: 'dock side l | b | r' };
      case 'size':
        return a.length === 1 && LENGTH.test(a[0]) ? { cmd: 'size', size: a[0] } : { error: 'dock size <length> (16em, 240px, 30%)' };
      case 'rows':
      case 'cols': {
        const list = a.length === 1 ? ints(a[0].split(',')) : null;
        return list ? { cmd: words[1], list } : { error: 'dock ' + words[1] + ' a,b,… (whole numbers)' };
      }
      case 'reset':
        return a.length === 0 ? { cmd: 'reset' } : { error: 'dock reset' };
      default:
        return { error: USAGE };
    }
  }

  // a command on the skin's dock -> {dock, message} | {error}
  function apply(dock, c, def) {
    const d = sanitize(dock);
    const side = d.side || def.side;
    const g = gridOf(def, side);
    switch (c.cmd) {
      case 'side':
        d.side = c.side;
        return { dock: d, message: 'dock side ' + c.side + ' ── the dock on the ' + SIDE_NAMES[c.side] };
      case 'size':
        (d.size = d.size || {})[side] = c.size;
        return { dock: d, message: 'dock size ' + c.size + ' (' + SIDE_NAMES[side] + ')' };
      case 'rows':
      case 'cols': {
        const want = g[c.cmd].length;
        if (c.list.length !== want) return { error: 'the dock has ' + want + ' ' + c.cmd + ' on the ' + SIDE_NAMES[side] + ', got ' + c.list.length };
        (d[c.cmd] = d[c.cmd] || {})[side] = c.list.slice();
        return { dock: d, message: 'dock ' + c.cmd + ' ' + c.list.join(',') + ' (' + SIDE_NAMES[side] + ')' };
      }
      case 'reset': {
        const kept = {};
        if (d.name) kept.name = d.name;
        if (d.side) kept.side = d.side;
        return { dock: kept, message: 'dock reset ── the sizes of docks/' + def.name + '.json (the side stays: ' + SIDE_NAMES[side] + ')' };
      }
      default:
        return { error: USAGE };
    }
  }

  // the row a part fills alone on a grid -> its index | -1
  function rowOfPart(g, part) { return cells(g.areas).findIndex((row) => row.every((n) => n === part)); }
  function sizePart(dock, def, part, open) {
    const d = sanitize(dock);
    const side = d.side || def.side;
    const g = gridOf(def, side);
    const i = rowOfPart(g, part);
    if (i < 0) return { error: 'the dock on the ' + SIDE_NAMES[side] + ' has no row of its own for ' + part + ' (docks/' + def.name + '.json)' };
    const rows = (d.rows && d.rows[side] && d.rows[side].length === g.rows.length ? d.rows[side] : g.rows).slice();
    const others = rows.reduce((a, n, k) => (k === i ? a : a + n), 0);
    rows[i] = open ? Math.max(g.rows[i] + 1, Math.round(others / 2)) : g.rows[i];
    if (rows.every((n, k) => n === g.rows[k])) { if (d.rows) delete d.rows[side]; } else (d.rows = d.rows || {})[side] = rows;
    if (d.rows && !Object.keys(d.rows).length) delete d.rows;
    return { dock: d, message: open ? part + ' takes a third of the dock (rows ' + rows.join(',') + ')' : part + ' back to its line' };
  }

  return { SIDES, DEFAULT, USAGE, readDef, sanitize, resolve, css, partsOf, neighbor, parse, apply, gridOf, clone, sizePart };
});
