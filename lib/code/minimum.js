// lib/code/minimum.js -- code_vi_minimum (D-minimum), the pure parts: where
// `:m` sends what was written.
//   :m                 back to the panel that asked for it (minimum.ask), else the kill ring
//   :m input           into the skin's input form (as code_editor's `:#` does)
//   :m xterm           pasted into the xterm focused last (not run)
//   :m code_editor <file>  added at the end of the code_editor that has <file> (unsaved)
// `:m` is "mail" (w turned over): this editor has no file, and `:w` would read
// as "saved". :q drops what was written.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).minimum = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const USAGE = ':m / :m input / :m xterm / :m code_editor <file>';

  // the argument of :m -> {to: 'back' | 'input' | 'xterm' | 'code_editor', path} | {error}
  // resolve(arg) -> {path} | {error} (lib/code/code-files.js resolve)
  function parse(arg, resolve) {
    const w = String(arg == null ? '' : arg).trim();
    if (!w) return { to: 'back' };
    if (w === 'input' || w === 'xterm') return { to: w };
    const m = /^code_(?:editor|vi)(?:\s+(\S[\s\S]*))?$/.exec(w);
    if (m) {
      if (!m[1]) return { error: ':m code_editor needs the file: ' + USAGE };
      const r = resolve ? resolve(m[1].trim()) : { path: m[1].trim().replace(/^\/+/, '') };
      return r.error ? { error: r.error } : { to: 'code_editor', path: r.path };
    }
    return { error: 'no such place to send to: ' + w + ' (' + USAGE + ')' };
  }

  return { USAGE: USAGE, parse: parse };
});
