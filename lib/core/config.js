(function (root) {
  'use strict';
  const Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  // this file is <root>/lib/core/config.js: the repository root is two up
  // (lib/ was split by role on; it was one up before)
  const ROOT = '../../';
  const SELF =
    (typeof document !== 'undefined' &&
      document.currentScript &&
      document.currentScript.src) ||
    null;

  function url() {
    if (SELF) {
      try {
        return new URL(ROOT + 'config.json', SELF).href;
      } catch (_) {}
    }
    return './config.json';
  }

  function load() {
    return fetch(url(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('config.json: HTTP ' + r.status);
      return r.json();
    });
  }

  function sibling(rel) {
    if (SELF) {
      try {
        return new URL(ROOT + String(rel).replace(/^\/+/, ''), SELF).href;
      } catch (_) {}
    }
    return './' + String(rel).replace(/^\/+/, '');
  }

  // the pages there are: list_kinds/panels_and_skins.json, with a person's own
  // after it -- local/list_kinds/panels_and_skins.json (not in git; their pages
  // under local/, e.g. local/<name>/<page>.html). An id already shipped is kept.
  function panels() {
    function read(rel, must) {
      return fetch(sibling(rel), { cache: 'no-store' }).then(function (r) {
        if (r.ok) return r.json();
        if (must) throw new Error('panels_and_skins.json: HTTP ' + r.status);
        return { items: [] };
      }, function (e) { if (must) throw e; return { items: [] }; });
    }
    return Promise.all([read('list_kinds/panels_and_skins.json', true), read('local/list_kinds/panels_and_skins.json', false)])
      .then(function (d) {
        var items = (d[0].items || []).slice();
        var have = {};
        items.forEach(function (it) { have[it.id] = true; });
        ((d[1] && d[1].items) || []).forEach(function (it) { if (it && it.id && !have[it.id]) { items.push(it); have[it.id] = true; } });
        return Object.assign({}, d[0], { items: items });
      });
  }

  Tezcatl.config = { url: url, load: load, sibling: sibling, panels: panels };
})(typeof self !== 'undefined' ? self : this);
