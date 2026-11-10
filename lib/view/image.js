// lib/view/image.js -- the image panel (panels/extra/image.html), the pure
// parts: which picture a path names, and the frame's `image <path>` line.
//
// For now a picture is a file of the pages (what :4001 serves -- tezcatl's own
// directory, e.g. assets/tezcatlipoca.png), not one under the FS root: the
// relay's /fs/read answers UTF-8 text only. The path is written from the pages'
// root; it never leaves it.
//
//   image <path>   show it in the frame's image panel (none: one is added)
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).image = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const USAGE = 'image <path> (a picture of the pages, e.g. assets/tezcatlipoca.png)';
  // what an image panel shows when it is given nothing (the main skin's)
  const DEFAULT = 'assets/tezcatlipoca.png';
  const EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

  // a path from the pages' root -> {path} | {error}
  function resolve(arg) {
    const s = String(arg == null ? '' : arg).trim();
    if (!s) return { error: 'no path (' + USAGE + ')' };
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.indexOf('//') === 0) return { error: 'a path of the pages, not a URL: ' + s };
    const out = [];
    for (const seg of s.replace(/^\/+/, '').split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') return { error: 'outside the pages: ' + s };
      out.push(seg);
    }
    if (!out.length) return { error: 'no path (' + USAGE + ')' };
    const path = out.join('/');
    if (!EXT.test(path)) return { error: 'not a picture (png, jpg, gif, webp, svg, avif, bmp, ico): ' + path };
    return { path };
  }

  // a line -> null (not an image line) | {path} | {error}
  function parse(line) {
    const m = /^\s*image(?:\s+([\s\S]*))?$/.exec(String(line == null ? '' : line));
    if (!m) return null;
    return resolve(m[1]);
  }

  return { USAGE, DEFAULT, resolve, parse };
});
