// lib/skin/radar.js -- `radar`: where a panel is now, made a reference.
// A panel whose selection means something elsewhere (the table: which rows,
// which columns, of what type) says its coordinate to the resident cursor
// panel each time it changes (panel-frame reportCursor {coord}) -- never the
// values. That keeps moving; it becomes a reference only when a person types
// `radar`: the coordinate of the panel focused last is put on the receiving
// side as one line with a reference, and kept by the cursor panels as the
// last reference (cursor.ref), so that an input in another window can take
// it with "@" (the dialogue window: `eval @`).
//   coord: {type, table?, ids: [row id], cols: [column key], scope: 'row' | 'cell'}
//   ref:   {kind: 'coord', type, table, ids, cols, scope, panel: <bus id>, name}
// tezcatl does not know what the ids mean: "@" puts them in the line as they are.
(function (root) {
  'use strict';

  function strs(a) { return Array.isArray(a) ? a.filter(function (v) { return typeof v === 'string' && v; }) : []; }

  // anything -> a sound coordinate | null (one with no row is none)
  function sound(c) {
    if (!c || typeof c !== 'object' || typeof c.type !== 'string' || !c.type) return null;
    const ids = strs(c.ids);
    if (!ids.length) return null;
    return { type: c.type, table: typeof c.table === 'string' ? c.table : '', ids: ids, cols: strs(c.cols), scope: c.scope === 'row' ? 'row' : 'cell' };
  }

  // the cursor panels' answers (cursor.state, one a window) -> the coordinate
  // of the panel focused last that has one -> {coord, who: {id, name}} | null
  // (prefer: a bus id -- that panel's, when it has one: a skin asking for its own table)
  function pick(states, prefer) {
    const carets = {};   // bus id -> the newest caret with a coordinate
    let hist = [];
    (states || []).forEach(function (s) {
      if (!s) return;
      Object.keys(s.carets || {}).forEach(function (k) {
        const c = s.carets[k];
        const coord = c && sound(c.coord);
        if (!coord || !c.id) return;
        if (!carets[c.id] || (c.at || 0) > carets[c.id].at) carets[c.id] = { coord: coord, at: c.at || 0, who: { id: c.id, name: k } };
      });
      // the longest memory of who was focused (a window opened later knows less)
      const h = Array.isArray(s.focusHistory) ? s.focusHistory : [];
      if (h.length && (!hist.length || (h[h.length - 1].at || 0) > (hist[hist.length - 1].at || 0))) hist = h;
    });
    if (prefer && carets[prefer]) return carets[prefer];
    for (let i = hist.length - 1; i >= 0; i--) if (carets[hist[i].id]) return carets[hist[i].id];
    // none of them was focused within memory: the one that moved last
    const all = Object.keys(carets).map(function (k) { return carets[k]; }).sort(function (a, b) { return b.at - a.at; });
    return all[0] || null;
  }
  // -> the last reference said with cursor.ref | null
  function lastRef(states) {
    let best = null;
    (states || []).forEach(function (s) {
      const r = s && s.ref;
      if (r && r.ref && (!best || (r.at || 0) > (best.at || 0))) best = r;
    });
    return best ? best.ref : null;
  }

  function refOf(got) {
    const c = got.coord;
    return { kind: 'coord', type: c.type, table: c.table, ids: c.ids.slice(), cols: c.cols.slice(), scope: c.scope, panel: got.who.id, name: got.who.name };
  }
  // the line of the receiving side
  function line(got) {
    const c = got.coord;
    const n = c.ids.length;
    return 'radar ── ' + (c.table || got.who.name) + '  ' + c.type + (n === 1 ? '' : ' ×' + n) +
      (c.scope === 'row' ? '' : '  [' + c.cols.join(', ') + ']');
  }

  // "@" standing alone in a line (never one inside a word: @attr, a@b) -> text
  const AT = /(^|\s)@(?=\s|$)/g;
  function hasAt(s) { AT.lastIndex = 0; return AT.test(String(s == null ? '' : s)); }
  function insert(s, text) { return String(s).replace(AT, function (_m, pre) { return pre + text; }); }

  // every cursor panel's state (one a window; they answer cursor.query) -> Promise<[state]>
  function ask(bus, later, ms) {
    return new Promise(function (resolve) {
      const got = [];
      const off = bus.on('cursor.state', function (p) { if (p) got.push(p); });
      bus.post('cursor.query');
      (later || setTimeout)(function () { off(); resolve(got); }, ms || 150);
    });
  }
  // the last reference, for the "@" of an input in any window
  function publish(bus, ref) { bus.post('cursor.ref', { ref: ref, at: Date.now() }); }

  // `radar` typed: -> Promise<{line, ref} | {error}>; the reference is kept as the last one
  function run(bus, opts) {
    const o = opts || {};
    return ask(bus, o.setTimeout, o.ms).then(function (states) {
      const got = pick(states, o.prefer);
      if (!got) return { error: 'radar ── no panel has said where it is (a table: move in it once)' };
      const ref = refOf(got);
      publish(bus, ref);
      return { line: line(got), ref: ref };
    });
  }
  // "@" in a line of an input with no receiving side of its own (the dialogue
  // window): the last reference anywhere -> Promise<{line} | {error}>
  function expand(bus, s, textOf, opts) {
    if (!hasAt(s)) return Promise.resolve({ line: s });
    const o = opts || {};
    return ask(bus, o.setTimeout, o.ms).then(function (states) {
      const t = textOf(lastRef(states));
      return t ? { line: insert(s, t) } : { error: '@ ── no reference yet (radar first)' };
    });
  }

  const api = { sound, pick, lastRef, refOf, line, hasAt, insert, ask, publish, run, expand };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).radar = api;
})(typeof self !== 'undefined' ? self : this);
