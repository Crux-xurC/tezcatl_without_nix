// lib/code/code-diff.js -- the code_diff panel and the `diff ...` lines of a
// skin's input form, the pure parts.
//   diff -n A,B    a new code_diff panel showing A (left) and B (right)
//   diff -f A,B    the same two into the code_diff focused (else the one here)
//   :Diff          the code_editor meant now: `:Scratch`, then diff -n ~work/scratch,<its file>
// Only files saved on disk are compared: what is not
// saved yet goes through the scratch. A and B are paths from the FS root
// (~work/... is the work place), ./ and ../ from the file of the code_editor
// meant now. The panel reads both again when something says one changed
// (code.saved, fs.changed, file.changed).
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).codeDiff = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const USAGE = 'diff -n A,B (a new code_diff) / diff -f A,B (the code_diff focused)';
  const EMPTY = 'No object, set file by diff command';

  // a line -> null (not a diff line) | {cmd: 'new' | 'focused', a, b} | {error}
  // resolve(arg) -> {path} | {error} (lib/code/code-files.js resolve, from the current file)
  function parse(line, resolve) {
    const m = /^\s*diff(?:\s+([\s\S]*))?$/.exec(String(line == null ? '' : line));
    if (!m) return null;
    const a = /^(-n|-f)\s+([\s\S]+)$/.exec((m[1] || '').trim());
    if (!a) return { error: USAGE };
    const parts = a[2].split(',').map(function (s) { return s.trim(); });
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { error: 'two paths, with a comma between: ' + USAGE };
    const out = [];
    for (let i = 0; i < 2; i++) {
      const r = resolve ? resolve(parts[i]) : { path: parts[i].replace(/^\/+/, '') };
      if (r.error) return { error: r.error };
      out.push(r.path);
    }
    if (out[0] === out[1]) return { error: 'the same file twice: ' + out[0] };
    return { cmd: a[1] === '-n' ? 'new' : 'focused', a: out[0], b: out[1] };
  }

  function two(n) { return (n < 10 ? '0' : '') + n; }
  // seconds since the epoch -> "2026-10-12 19:30:05" (local time)
  function stamp(sec) {
    if (typeof sec !== 'number' || !isFinite(sec)) return '';
    const d = new Date(sec * 1000);
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' +
      two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  }
  // one side's header: the path and when it was last saved (GET /fs/stat)
  function head(path, stat) {
    if (!path) return '';
    if (!stat) return path;
    if (stat.exists === false) return path + ' · not on the disk';
    const t = stamp(stat.mtime);
    return t ? path + ' · ' + t : path;
  }

  function norm(p) { return String(p == null ? '' : p).trim().replace(/^\/+/, ''); }
  // does a change said on the bus touch one of the two files shown?
  // (code.saved {path}; fs.changed / file.changed {paths})
  function concerns(type, payload, a, b) {
    const p = payload || {};
    const paths = type === 'code.saved' ? [p.path] : (Array.isArray(p.paths) ? p.paths : []);
    const mine = [a, b].filter(Boolean).map(norm);
    return paths.some(function (x) { return x != null && mine.indexOf(norm(x)) >= 0; });
  }

  return { USAGE: USAGE, EMPTY: EMPTY, parse: parse, stamp: stamp, head: head, concerns: concerns };
});
