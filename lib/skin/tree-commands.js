// lib/skin/tree-commands.js -- the tree skin's `tree ...` command line, read into
// {cmd, ...args} (pure). The skin (panels/skins/tree.html) carries them out:
// add / del / order / tag / update become operations of its slots list
// (list.action -> the "slots" kind, which reads, edits, tidies and writes the
// slots file); edit opens a file in its code_editor. These are tezcatl's own
// commands, so reading the line here is fine (the "never interpret" rule is
// for what goes to a backend).
//
//   tree add [<path>]        a slot for <path> (default: the directory selected in the tree)
//   tree del <n>             remove slot <n>
//   tree order <n> <m>       swap slots <n> and <m>
//   tree tag <n> [<text>]    tag slot <n> (no text: clear it)
//   tree update              read the slots file again, tidy it (order, 1..n), refresh the tree
//   tree edit [<path>]       open <path> in code_editor (default: the slots file)
//
// A leading `tree` may be left out. Words split on spaces; "..." or '...'
// keeps spaces (a path with spaces).

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).treeCommands = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const USAGE = 'tree add [path] / del n / order n n / tag n [text] / update / edit [path]';

  function words(line) {
    const out = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(line))) out.push(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]);
    return out;
  }

  function int(w) { return /^\d+$/.test(w || '') ? Number(w) : null; }

  // line -> {cmd, ...} | {error}
  function parse(line) {
    let w = words(String(line || '').trim());
    if (w[0] === 'tree') w = w.slice(1);
    const [cmd, ...rest] = w;
    if (!cmd) return { error: 'no command (' + USAGE + ')' };
    switch (cmd) {
      case 'add':
        if (rest.length > 1) return { error: 'add: one path (quote it with "…" if it has spaces)' };
        return { cmd: 'add', path: rest.length ? rest[0] : null };
      case 'del':
        if (rest.length !== 1 || int(rest[0]) == null) return { error: 'del: one number (tree del 2)' };
        return { cmd: 'del', n: int(rest[0]) };
      case 'order':
        if (rest.length !== 2 || int(rest[0]) == null || int(rest[1]) == null) return { error: 'order: two numbers (tree order 1 3)' };
        return { cmd: 'order', a: int(rest[0]), b: int(rest[1]) };
      case 'tag':
        if (!rest.length || int(rest[0]) == null) return { error: 'tag: a number and text (tree tag 2 web)' };
        return { cmd: 'tag', n: int(rest[0]), tag: rest.slice(1).join(' ') };
      case 'update':
        if (rest.length) return { error: 'update: takes no arguments' };
        return { cmd: 'update' };
      case 'edit':
        if (rest.length > 1) return { error: 'edit: one path' };
        return { cmd: 'edit', path: rest.length ? rest[0] : null };
      default:
        return { error: 'no such command: ' + cmd + ' (' + USAGE + ')' };
    }
  }

  return { parse: parse, words: words, USAGE: USAGE };
});
