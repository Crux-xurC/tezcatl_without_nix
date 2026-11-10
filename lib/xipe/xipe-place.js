// lib/xipe/xipe-place.js -- where a Xipe Totec function is defined, as a path
// tezcatl can open.
// Xipe Totec's card/list and row/list give a function's place as `path` (from
// the project's root) and `line`; a code_editor opens a path from the FS root
// (the relay's TEZCATL_FS_ROOT). The two roots are each side's own: the
// project's is in `initialize`'s answer (project.root), the FS root in
// GET /fs's (root), both absolute. toFs puts one under the other -- a
// project outside the FS root has no path a code_editor can open, and that is
// said rather than guessed. Nothing of Xipe Totec's text is read: only the
// two structured fields.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).xipePlace = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // an absolute path's segments, "." and ".." worked out -> [segment] | null (not absolute, or above /)
  function segments(abs) {
    if (typeof abs !== 'string' || abs.charAt(0) !== '/') return null;
    const out = [];
    const parts = abs.split('/');
    for (let i = 0; i < parts.length; i++) {
      const s = parts[i];
      if (s === '' || s === '.') continue;
      if (s === '..') { if (!out.length) return null; out.pop(); continue; }
      out.push(s);
    }
    return out;
  }

  // (FS root, project root: absolute; rel: from the project's root) -> the
  // path from the FS root | null (outside it, or something is missing)
  function toFs(fsRoot, projectRoot, rel) {
    if (typeof rel !== 'string' || !rel || rel.charAt(0) === '/') return null;
    const base = segments(fsRoot);
    const proj = segments(projectRoot);
    if (!base || !proj) return null;
    const file = segments('/' + proj.concat(rel.split('/')).join('/'));
    if (!file || file.length <= base.length) return null;
    for (let i = 0; i < base.length; i++) if (file[i] !== base[i]) return null;
    return file.slice(base.length).join('/');
  }

  // -> {place(rel) -> path from the FS root | null, why: null | why no path can be opened}
  function resolver(fsRoot, projectRoot) {
    let why = null;
    if (!projectRoot) why = 'Xipe Totec did not say where its project is';
    else if (!fsRoot) why = 'the relay did not say where the FS root is';
    else if (toFs(fsRoot, projectRoot, 'x') == null) why = 'the project (' + projectRoot + ') is outside the FS root (' + fsRoot + ')';
    return { place: function (rel) { return why ? null : toFs(fsRoot, projectRoot, rel); }, why: why };
  }

  // the relay's http base from config.json's connections[0].url (ws -> http)
  function httpBase(c) {
    const u = c && c.connections && c.connections[0] && c.connections[0].url;
    if (typeof u !== 'string') return null;
    try { const x = new URL(u); return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host; } catch (_) { return null; }
  }
  // the FS root, absolute (GET /fs) -> Promise<string | null>; never rejects
  function fsRoot(config, fetchFn) {
    const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!config || !config.load || !f) return Promise.resolve(null);
    return config.load().then(function (c) {
      const base = httpBase(c);
      if (!base) return null;
      return f(base + '/fs?path=', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j && typeof j.root === 'string' ? j.root : null; });
    }).catch(function () { return null; });
  }

  return { toFs: toFs, resolver: resolver, fsRoot: fsRoot, httpBase: httpBase };
});
