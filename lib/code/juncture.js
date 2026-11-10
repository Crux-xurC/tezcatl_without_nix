// lib/code/juncture.js -- the junctures (D-juncture), the pure parts: the
// `juncture ...` lines of a skin's input form, where back and forward go in
// a file's tree, the tree drawn as the `tree` command draws one, and what
// the relay pushed out said in a line.
//   juncture set [path]       put the file in the index, its text the start (j0)
//   juncture point [path]     the text now as a point, a child of the current one
//   juncture back [path]      the parent of the current point into the code_editor
//   juncture forward [path]   the child taken last into the code_editor
//   juncture tree [path]      the file's juncture_tree panel
// Without a path: the file of the code_editor focused last. A path is read as
// `:e` reads one (./ and ../ from the file of the code_editor meant now). The
// tree is the relay's (GET /juncture/tree, lib/relay/juncture.exs):
// {path, current, nodes: {id: {parent, lastChild, at, ancestor, text}}}.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).juncture = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUBS = ['set', 'point', 'back', 'forward', 'tree'];
  const USAGE = 'juncture set|point|back|forward|tree [path]';
  // code.json "juncture": files in the index, points in a tree (the relay takes 1-100)
  const DEFAULTS = { files: 10, slots: 20 };

  // a line -> null (not a juncture line) | {cmd, path: string | null} | {error}
  // resolve(arg) -> {path} | {error} (lib/code/code-files.js resolve, from the current file)
  function parse(line, resolve) {
    const m = /^\s*juncture(?:\s+([\s\S]*))?$/.exec(String(line == null ? '' : line));
    if (!m) return null;
    const words = (m[1] || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length || SUBS.indexOf(words[0]) < 0) return { error: USAGE };
    if (words.length > 2) return { error: 'one path at most: ' + USAGE };
    if (words.length === 1) return { cmd: words[0], path: null };
    const r = resolve ? resolve(words[1]) : { path: words[1].replace(/^\/+/, '') };
    if (r.error) return { error: r.error };
    if (/^~work(\/|$)/.test(r.path)) return { error: 'a file of the work place has no junctures: ' + r.path };
    return { cmd: words[0], path: r.path };
  }

  // code.json "juncture" -> {files, slots}, each 1-100, the defaults otherwise
  function limits(cfg) {
    const c = cfg || {};
    function n(v, d) { return Number.isInteger(v) && v >= 1 && v <= 100 ? v : d; }
    return { files: n(c.files, DEFAULTS.files), slots: n(c.slots, DEFAULTS.slots) };
  }

  // where back goes: the parent of the current point | null (at j0)
  function backOf(tree) {
    const n = tree && tree.nodes && tree.nodes[tree.current];
    return n && typeof n.parent === 'string' ? n.parent : null;
  }

  // where forward goes: the child taken last | null (at a leaf)
  function forwardOf(tree) {
    const n = tree && tree.nodes && tree.nodes[tree.current];
    return n && typeof n.lastChild === 'string' && tree.nodes[n.lastChild] ? n.lastChild : null;
  }

  function num(id) { return parseInt(String(id).slice(1), 10) || 0; }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  // milliseconds since the epoch -> "19:30:05" (local time)
  function clock(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return '';
    const d = new Date(ms);
    return two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  }

  // the tree as `tree` draws one: the file's path, then a row per point, the
  // children oldest first -> [{id: null | id, text}] (id null: the path's row)
  function draw(tree) {
    if (!tree || !tree.nodes) return [];
    const kids = {};
    const roots = [];
    Object.keys(tree.nodes).forEach(function (id) {
      const p = tree.nodes[id].parent;
      if (typeof p === 'string' && tree.nodes[p]) (kids[p] = kids[p] || []).push(id);
      else roots.push(id);
    });
    function byAge(a, b) { return num(a) - num(b); }
    const rows = [{ id: null, text: tree.path || '' }];
    function row(id, lead, last) {
      const n = tree.nodes[id];
      let text = lead + (last ? '└── ' : '├── ') + id + '  ' + clock(n.at);
      if (n.ancestor) text += '  start';
      if (id === tree.current) text += '  ← current';
      rows.push({ id: id, text: text });
      const cs = (kids[id] || []).sort(byAge);
      cs.forEach(function (c, i) { row(c, lead + (last ? '    ' : '│   '), i === cs.length - 1); });
    }
    const rs = roots.sort(byAge);
    rs.forEach(function (r, i) { row(r, '', i === rs.length - 1); });
    return rows;
  }

  function base(p) { return String(p || '').split('/').pop(); }
  // what the relay pushed out (the answer to /juncture/set or /point), each
  // a line for the receiving pane -> [string]
  function dropped(path, answer, lim) {
    const a = answer || {};
    const l = limits(lim);
    const out = [];
    (Array.isArray(a.dropped) ? a.dropped : []).forEach(function (p) {
      out.push('juncture: dropped the tree of ' + p + ' (' + l.files + ' files)');
    });
    const ps = Array.isArray(a.dropped_points) ? a.dropped_points : [];
    if (ps.length) out.push('juncture: dropped ' + ps.join(', ') + ' of ' + base(path) + ' (' + l.slots + ' points)');
    return out;
  }

  return {
    SUBS: SUBS, USAGE: USAGE, DEFAULTS: DEFAULTS,
    parse: parse, limits: limits, backOf: backOf, forwardOf: forwardOf, clock: clock, draw: draw, dropped: dropped,
  };
});
