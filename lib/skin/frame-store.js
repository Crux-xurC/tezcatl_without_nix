// lib/skin/frame-store.js -- what the frame keeps (D-frame, D-block): this
// window's skin (sessionStorage), the saved skins, and each panel's block.
// No drawing: the page (lib/skin/frame-page.js) asks and draws.
//
// A saved skin by name: the saved ones (`skin save`, ~work/store/frame-skins.json
// -- lib/core/store.js) first,
// then the local ones (local/skins/<name>.json -- not in git: a person's own,
// e.g. an LCARS look), then the ones the repository gives (skins/<name>.json
// -- what a release ships). Each file is what `skin save` prints.
//
// A panel's block (its way of wearing a thema): the file local/blocks/<panel>.json,
// else blocks/<panel>.json, with what was set over it (block new,
// block place; ~work/store/frame-blocks.json); none: the defaults (lib/skin/thema.js DEFAULTS -- the panel's
// name on top).
//
//   create({sibling(path), onNew(), store}) ->
//     {ready(), work(), keep(json), saved(), save(name, json), findSaved(name),
//      blockDefs, lookBlock(panel), setBlock(panel, part)}
// onNew: a block found for the first time (the page draws again). saved() is
// what was read last (ready() before the page starts); findSaved, save and
// setBlock read the file again, so another window's saves are seen.
(function (root) {
  'use strict';
  var WORK = 'tezcatl:frame:work';
  var SKINS = 'tezcatl:frame:skins';
  var BLOCKS = 'tezcatl:frame:blocks';
  var SKIN_DIRS = [['local/skins/', 'local/skins'], ['skins/', 'skins']];
  var BLOCK_DIRS = [['local/blocks/', 'local/blocks'], ['blocks/', 'blocks']];

  function readJson(store, key) {
    try { var raw = store.getItem(key); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }
  function writeJson(store, key, v) {
    try { store.setItem(key, JSON.stringify(v)); return true; } catch (_) { return false; }
  }

  function create(h) {
    var store = h.store;
    function asMap(m) { return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; }
    function saved() { return asMap(store.get(SKINS)); }
    // -> Promise<{ok, message, was}>: the skin under its name, over an earlier one
    function save(name, json) {
      var was = false;
      return store.update(SKINS, function (m) {
        m = asMap(m);
        was = !!m[name];
        m[name] = json;
        return m;
      }).then(function (w) { w.was = was; return w; });
    }

    // -> Promise<{json, from} | null>
    function findSaved(name) {
      return store.load(SKINS).then(function (m) {
        var here = asMap(m)[name];
        if (here) return { json: here, from: store.fileOf(SKINS) };
        return fromFiles(name);
      });
    }
    function fromFiles(name) {
      if (!/^[\w.-]+$/.test(String(name || ''))) return Promise.resolve(null);   // a file name: no "/" nor spaces
      return SKIN_DIRS.reduce(function (p, d) {
        return p.then(function (got) {
          if (got) return got;
          return fetch(h.sibling(d[0] + name + '.json'), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { return j ? { json: j, from: d[1] + '/' + name + '.json' } : null; })
            .catch(function () { return null; });
        });
      }, Promise.resolve(null));
    }

    var blockDefs = {};   // panel -> its block (null: none found), once looked for
    var blockFiles = {};  // panel -> Promise of its file's block (null: none)
    function savedBlocks() { return asMap(store.get(BLOCKS)); }
    // -> Promise of the panel's block (null: none); onNew when it was not known yet
    function lookBlock(panel) {
      if (!blockFiles[panel]) {
        blockFiles[panel] = BLOCK_DIRS.reduce(function (p, d) {
          return p.then(function (got) {
            if (got || !/^[\w.-]+$/.test(panel)) return got;
            return fetch(h.sibling(d[0] + panel + '.json'), { cache: 'no-store' })
              .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
          });
        }, Promise.resolve(null)).then(function (j) { return j && typeof j === 'object' ? j : null; });
      }
      return blockFiles[panel].then(function (file) {
        var here = savedBlocks()[panel];
        var def = file || here ? Object.assign({}, file || {}, here || {}) : null;
        var known = panel in blockDefs;
        blockDefs[panel] = def;
        if (!known) h.onNew();
        return def;
      });
    }
    // the kept part of a panel's block (block new, block place), set over the file's
    // -> Promise<{ok, message, kept}>
    function setBlock(panel, part) {
      var kept = null;
      return store.update(BLOCKS, function (bm) {
        bm = asMap(bm);
        kept = bm[panel] = Object.assign({}, bm[panel] || {}, part, { panel: panel });
        return bm;
      }).then(function (w) {
        delete blockDefs[panel];
        lookBlock(panel);
        w.kept = kept;
        return w;
      });
    }

    return {
      ready: function () { return store.ready([SKINS, BLOCKS]); },
      work: function () { return readJson(sessionStorage, WORK); },
      keep: function (json) { return writeJson(sessionStorage, WORK, json); },
      saved: saved,
      save: save,
      findSaved: findSaved,
      blockDefs: blockDefs,
      lookBlock: lookBlock,
      setBlock: setBlock,
    };
  }

  (root.Tezcatl = root.Tezcatl || {}).frameStore = { create: create };
})(typeof self !== 'undefined' ? self : this);
