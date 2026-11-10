// lib/code/marks.js -- a mark in a text replaced with ids from a list
// (D-id-pool), the pure parts: `:Replace <mark> <list>` and
// `:w replace <mark> <list>` in code_editor (lib/code/code-editor/replace.js).
// A mark is any run of non-blank characters (`#eigenvalue`); it is found
// where no letter, digit or `_` follows it (`taskmatrix_#eigenvalue` is
// one, `#eigenvalues` is not). The ids come from the relay (POST /ids/take,
// lib/relay/id_pool.exs), one for each mark, in order.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).marks = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const USAGE = ':Replace <mark> <list> / :w replace <mark> <list>';
  const LIST = /^[a-z0-9_-]{1,64}$/;

  // "<mark> <list>" -> {mark, list} | {error}
  function parseArgs(arg) {
    const w = String(arg == null ? '' : arg).trim().split(/\s+/).filter(Boolean);
    if (w.length !== 2) return { error: 'a mark and a list: ' + USAGE };
    if (!LIST.test(w[1])) return { error: 'a list is named with a-z 0-9 _ - (' + w[1] + ')' };
    return { mark: w[0], list: w[1] };
  }

  // the `:w` argument: "" (a plain save) | "replace <mark> <list>" -> {replace: null | {mark, list}} | {error}
  function parseWrite(arg) {
    const s = String(arg == null ? '' : arg).trim();
    if (!s) return { replace: null };
    const m = /^replace(?:\s+([\s\S]*))?$/.exec(s);
    if (!m) return { error: 'there is no :w <path> (:Move moves the file; :w replace <mark> <list>)' };
    const a = parseArgs(m[1]);
    return a.error ? a : { replace: a };
  }

  function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // where the mark is in the text -> [offset]
  function find(text, mark) {
    if (!mark) return [];
    const re = new RegExp(escape(mark) + '(?![A-Za-z0-9_])', 'g');
    const out = [];
    let m;
    while ((m = re.exec(String(text))) !== null) out.push(m.index);
    return out;
  }

  // the changes that put ids[i] where the i-th mark is -> [{from, to, insert}]
  function changes(text, mark, ids) {
    return find(text, mark).slice(0, (ids || []).length).map((at, i) => ({ from: at, to: at + mark.length, insert: ids[i] }));
  }

  return { USAGE: USAGE, parseArgs: parseArgs, parseWrite: parseWrite, find: find, changes: changes };
});
