// lib/xipe/matrix-commands.js -- the `matrix ...` command line of a matrix_set
// (syntheses/matrix_set.json), read into {cmd, ...} (pure). Its matrix_bar
// (lib/xipe/matrix-bar-page.js) carries them out on its table. Editing, sorting and filtering stay in the table
// itself (lib/xipe/matrix-grid.js); these only choose and fetch the table.
//
//   matrix update          fetch the table shown now again (from its path)
//   matrix get <path>      fetch the table at <path>
//   matrix pwd             show the path of the table shown now
//
// A leading `matrix` may be left out. The same three are tezcatl-commands
// (command_map.json matrix.update / matrix.get {path} / matrix.pwd), so the
// palette or another window can send them; lib/xipe/matrix-target.js picks the
// window that carries them out.
//
// A table's path is what matrix.html's query names: kind, ref, root. Written
//   <kind>:<ref>[@<root>]       e.g. xipe_rows:all  xipe:module=Calc&name=add&arity=2  xipe_rows:all@fake
// (`@<root>` only when root is not "."; a missing ref is "all"), or as the
// query itself (kind=xipe_rows&root=.&ref=all, a leading "?" or a whole
// .../matrix.html?... URL is fine). `pwd` prints the first form, which `get`
// takes back as is.

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).matrixCommands = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const USAGE = 'matrix update / get <path> / pwd (a path is kind:ref or kind:ref@root)';

  function format(t) {
    if (!t || !t.kind) return '';
    const root = t.root == null || t.root === '' ? '.' : String(t.root);
    return t.kind + ':' + (t.ref == null ? '' : t.ref) + (root === '.' ? '' : '@' + root);
  }

  // path -> {kind, ref, root} | {error}
  function parsePath(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return { error: 'no path (e.g. xipe_rows:all)' };
    const qi = s.indexOf('?');
    const query = qi >= 0 ? s.slice(qi + 1) : s;
    if (/(^|&)kind=/.test(query)) {
      const p = new URLSearchParams(query);
      const kind = (p.get('kind') || '').trim();
      if (!kind) return { error: 'no kind: ' + s };
      return { kind: kind, ref: p.get('ref') || 'all', root: p.get('root') || '.' };
    }
    const c = s.indexOf(':');
    const kind = (c >= 0 ? s.slice(0, c) : s).trim();
    let rest = c >= 0 ? s.slice(c + 1) : '';
    let root = '.';
    const at = rest.lastIndexOf('@');
    if (at >= 0) { root = rest.slice(at + 1).trim() || '.'; rest = rest.slice(0, at); }
    if (!kind || /[\s=&]/.test(kind)) return { error: 'cannot read the kind: ' + s + ' (e.g. xipe_rows:all)' };
    return { kind: kind, ref: rest.trim() || 'all', root: root };
  }

  // line -> {cmd, ...} | {error}
  function parse(line) {
    let w = String(line || '').trim().split(/\s+/).filter(Boolean);
    if (w[0] === 'matrix') w = w.slice(1);
    const cmd = w[0];
    const rest = w.slice(1);
    if (!cmd) return { error: 'no command (' + USAGE + ')' };
    switch (cmd) {
      case 'update':
      case 'pwd':
        if (rest.length) return { error: cmd + ': takes no arguments' };
        return { cmd: cmd };
      case 'get': {
        if (rest.length !== 1) return { error: 'get: one path (matrix get xipe_rows:all)' };
        const t = parsePath(rest[0]);
        return t.error ? { error: 'get: ' + t.error } : { cmd: 'get', path: rest[0], table: t };
      }
      default:
        return { error: 'no such command: ' + cmd + ' (' + USAGE + ')' };
    }
  }

  return { parse: parse, parsePath: parsePath, format: format, USAGE: USAGE };
});
