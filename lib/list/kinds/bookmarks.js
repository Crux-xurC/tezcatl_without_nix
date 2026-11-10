// lib/list/kinds/bookmarks.js -- the list kind "bookmarks": bookmarked paths.
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  kinds.bookmarks = (function () {
    // kept in ~work/store/bookmarks.json (lib/core/store.js; the tree panel's
    // ★ writes the same key)
    var KEY = 'tezcatl:bookmarks';

    function clean(arr) {
      return Array.isArray(arr) ? arr.filter(function (b) { return b && typeof b.path === 'string'; }) : [];
    }
    // -> Promise of the bookmarks
    function read() {
      return Tezcatl.store ? Tezcatl.store.load(KEY).then(clean) : Promise.resolve([]);
    }

    function toItems(arr) {
      return arr.map(function (b) {
        return {
          id: b.id || b.path,
          path: b.path,
          dir: !!b.dir,
          label: (b.dir ? '▸ ' : '  ') + (b.name || b.path),
          sub: b.dir ? 'dir' : (b.path.replace(/\/[^/]*$/, '') || '/'),
          raw: b,
        };
      });
    }

    function route(item) {
      if (!item || !item.raw || typeof item.raw.path !== 'string') return null;
      return item.raw.dir
        ? { type: 'bookmark.goto', payload: { path: item.raw.path } }
        : { type: 'code.open', payload: { path: item.raw.path } };
    }

    return {
      fill: function () { return read().then(toItems); },
      subscribe: function (cfg, api, onChange) {
        return api.bus.on('bookmark.changed', function () {
          read().then(function (arr) { onChange(toItems(arr)); });
        });
      },
      order: function (items) {
        return items.slice().sort(function (a, b) {
          if (a.dir !== b.dir) return a.dir ? -1 : 1;
          return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
        });
      },
      remove: function (item, cfg, api) {
        var key = (item.raw && (item.raw.id || item.raw.path));
        if (!Tezcatl.store) return;
        return Tezcatl.store.update(KEY, function (arr) {
          return clean(arr).filter(function (b) { return (b.id || b.path) !== key; });
        }).then(function () { api.bus.post('bookmark.changed', {}); });
      },
      onSelect: function (item, cfg, api) {
        var r = route(item);
        if (r) api.bus.post(r.type, r.payload);
        api.bus.post('bookmark.done', {});
      },
      _route: route,
    };
  })();
})(typeof self !== 'undefined' ? self : this);
