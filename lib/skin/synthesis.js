// lib/skin/synthesis.js -- a synthesis (D-synthesis): a panel written in JSON.
// Its name, looked up, places several panels in one place of the frame; one of
// them is its main (the way in, what speaks for it, where its behaviour lives).
//
// A definition is syntheses/<name>.json (shipped), or local/syntheses/<name>.json
// (yours, over it), written by hand:
//   { "name": "matrix_set", "axis": "h", "ratio": [1],
//     "columns": [[ ["matrix_bar", 1, 1, false, {"px": 24}],
//                   ["matrix", 2, 12, false, {"query": {"kind": "xipe_rows", "ref": "all"}}],
//                   ["code_cmd_in", 3, 3] ]],
//     "main": "matrix_bar",
//     "move": { "table": "matrix", "line": "code_cmd_in" } }
// `axis`, `ratio`, `columns` as `skin save` writes them (lib/skin/frame-layout.js);
// a panel's 5th item: `query` (given to its page) and `px` (a fixed length along
// its line instead of a ratio). `main` and `move` name panels of the
// synthesis (each named once there); `syn main` always exists.
//
//   check(json, name, resolve) -> {def} | {error}
//     resolve(name) -> the panel's canonical name | null (the launcher's list);
//     def: {name, axis, ratio, columns, panels: [{k, panel, col, row, ratio, query, px}], main: k, move: {word: k}}
//   layout(def) -> [{k, panel, x, y, w, h}] (fractions of the synthesis' room)
//   create({sibling(path), resolve(name)}) -> {get(name), look(name)}
//     get: the definition | null (none, or unsound) | undefined (not looked for yet);
//     look: Promise of the same, read once (local/syntheses/ first)
(function (root, factory) {
  const F = (typeof module === 'object' && module.exports) ? require('./frame-layout.js') : (root.Tezcatl && root.Tezcatl.frameLayout);
  const mod = factory(F);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).synthesis = mod;
})(typeof self !== 'undefined' ? self : this, function (F) {
  'use strict';

  const NAME = /^[\w.-]+$/;
  const WORD = /^[a-z][\w-]*$/;
  const DIRS = ['local/syntheses/', 'syntheses/'];

  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  const MAX_LINES = 26;
  function posInt(n) { return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null; }

  function check(j, name, resolve) {
    const bad = (why) => ({ error: 'synthesis ' + name + ': ' + why });
    if (!isObj(j)) return bad('not a JSON object');
    if (j.name !== name) return bad('its "name" is not "' + name + '" (the file\'s name)');
    // as many lines as a frame takes (lib/skin/frame-layout.js MAX_LINES)
    if (!Array.isArray(j.columns) || !j.columns.length || j.columns.length > MAX_LINES || !j.columns.every(Array.isArray)) {
      return bad('"columns" is 1 to ' + MAX_LINES + ' lines, each a list of panels');
    }
    const panels = [];
    const columns = [];
    for (let ci = 0; ci < j.columns.length; ci++) {
      const col = [];
      for (let ri = 0; ri < j.columns[ci].length; ri++) {
        const e = j.columns[ci][ri];
        if (!Array.isArray(e) || typeof e[0] !== 'string' || !e[0]) return bad('line ' + (ci + 1) + ', panel ' + (ri + 1) + ' is not [name, order, ratio]');
        const panel = resolve ? resolve(e[0]) : e[0];
        if (!panel) return bad('no panel "' + e[0] + '" (a synthesis holds panels of the launcher\'s list, never a synthesis)');
        const o = isObj(e[4]) ? e[4] : {};
        let query = null;
        if (o.query !== undefined) {
          if (!isObj(o.query) || !Object.keys(o.query).every((k) => typeof o.query[k] === 'string')) return bad(e[0] + ': "query" is an object of strings');
          query = Object.assign({}, o.query);
        }
        let px = null;
        if (o.px !== undefined) {
          px = posInt(o.px);
          if (!px || px < 4 || px > 400) return bad(e[0] + ': "px" is 4 to 400');
        }
        const p = { k: panels.length, panel, col: ci + 1, row: ri + 1, ratio: posInt(e[2]) || 1, query, px };
        panels.push(p);
        col.push(p);
      }
      columns.push(col);
    }
    if (!panels.length) return bad('it holds no panel');
    // a panel named once in it: main and move point at it by name
    const one = (word) => {
      const canon = resolve ? resolve(word) : word;
      const hits = panels.filter((p) => p.panel === canon);
      return hits.length === 1 ? hits[0].k : (hits.length ? 'twice' : null);
    };
    if (typeof j.main !== 'string' || !j.main) return bad('"main" names its main panel');
    const main = one(j.main);
    if (main === null) return bad('"main" is "' + j.main + '", which it does not hold');
    if (main === 'twice') return bad('"main" is "' + j.main + '", which it holds twice');
    const move = {};
    if (j.move !== undefined) {
      if (!isObj(j.move)) return bad('"move" is an object: a word -> a panel');
      for (const w of Object.keys(j.move)) {
        if (!WORD.test(w)) return bad('"move": "' + w + '" is not a word (a-z first)');
        if (w === 'main') return bad('"move": "main" is there already (syn main)');
        const k = typeof j.move[w] === 'string' ? one(j.move[w]) : null;
        if (k === null || k === 'twice') return bad('"move": ' + w + ' -> "' + j.move[w] + '" is not a panel it holds once');
        move[w] = k;
      }
    }
    const ratio = columns.map((_c, i) => (Array.isArray(j.ratio) && posInt(j.ratio[i])) || 1);
    return { def: { name, axis: j.axis === 'v' ? 'v' : 'h', ratio, columns, panels, main, move } };
  }

  // the panels' boxes inside the synthesis, by the frame's own layout
  function layout(def) {
    const s = {
      axis: def.axis, ratio: def.ratio, focus: null,
      columns: def.columns.map((col) => col.map((p) => ({ id: String(p.k), panel: p.panel, ratio: p.ratio, block: p.px ? { min: 'px', px: p.px } : null }))),
    };
    return function (subPx) {
      const r = F.rects(s, { subPx, fixedPx: (p) => p.block.px });
      return r.panels.map((x) => ({ k: Number(x.id), panel: x.panel, x: x.x, y: x.y, w: x.w, h: x.h }));
    };
  }

  function create(h) {
    const defs = {};    // name -> def | null
    const looks = {};   // name -> Promise
    function get(name) { return defs[name]; }
    function look(name) {
      if (!NAME.test(String(name || ''))) return Promise.resolve(null);
      if (!looks[name]) {
        looks[name] = DIRS.reduce((p, d) => p.then((got) => got || fetch(h.sibling(d + name + '.json'), { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null)).catch(() => null)), Promise.resolve(null))
          .then((j) => {
            if (!j) { defs[name] = null; return null; }
            const c = check(j, name, h.resolve);
            defs[name] = c.def || null;
            if (c.error && h.said) h.said(c.error);
            return defs[name];
          });
      }
      return looks[name];
    }
    return { get, look };
  }

  return { check, layout, create, DIRS };
});
