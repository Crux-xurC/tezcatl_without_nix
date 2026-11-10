// lib/list/kinds/dict.js -- the list kind "dict": a dictionary (cfg.dataFile read and written through /fs; dict.entries to the skin).
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;
  var putDoc = kinds.putDoc;
  var readDoc = kinds.readDoc;
  var retryChanged = kinds.retryChanged;

  // Generic dictionary -- one named list of {word, note} per panel,
  // all lists in one JSON doc in cfg.dataFile (real file via /fs, like
  // "task"). The list is the panel's own: ?list= (api.params), else
  // cfg.list, else "default" -- a skin puts one dict pane next to its input
  // panes and forwards this pane's entries to them (lib/skin/skin-dict.js), so
  // "which list does this input use" is decided by the skin's composition.
  //   p (store) -- the newest kill-ring entry, one entry per line, the word
  //                being the part before the first ":" (lib/list/dict.js). The
  //                human chose what to yank; nothing is parsed on its own.
  //   M-a (add) -- the filter field's text, same "word: note" form
  //   Del       -- remove; Enter -- dict.pick (the skin inserts the word)
  // Every read posts dict.entries {list, entries} for the skin to route.
  kinds.dict = (function () {
    function lib() {
      return (root.Tezcatl && root.Tezcatl.dict) ||
        (typeof require === 'function' ? require('../dict.js') : null);
    }

    function listName(cfg, api) {
      var p = api && api.params && typeof api.params.get === 'function' ? api.params.get('list') : null;
      return p || (cfg && cfg.list) || 'default';
    }

    function url(cfg, api, write) {
      var path = (cfg && cfg.dataFile) || 'dict.json';
      return api.fsBase + (write ? '/fs/write' : '/fs/read') + '?path=' + encodeURIComponent(path);
    }

    // -> {doc, error}: a missing file is an empty dictionary; one that cannot
    // be read is an error, and is never written over (updateDoc)
    function fetchDoc(cfg, api) {
      if (!api.fsBase) return Promise.resolve({ doc: { lists: {} }, error: 'no relay URL' });
      return readDoc(url(cfg, api, false), function (d) { return d && typeof d === 'object' && !Array.isArray(d); })
        .then(function (r) { return { doc: lib().normalize(r.doc || { lists: {} }), error: r.error, base: r.base }; });
    }
    function dataFile(cfg) { return (cfg && cfg.dataFile) || 'dict.json'; }
    // read, change (fn(doc) -> doc), write -- refused when the file cannot be
    // read; made again on what is there when it changed meanwhile
    function updateDoc(cfg, api, fn) {
      return retryChanged(function () {
        return fetchDoc(cfg, api).then(function (r) {
          if (r.error) return { ok: false, message: dataFile(cfg) + ' cannot be read, so it is not written (' + r.error + ') ── fix it first' };
          return writeDoc(cfg, api, fn(r.doc), r.base);
        });
      });
    }

    function writeDoc(cfg, api, doc, base) {
      return putDoc(url(cfg, api, true), JSON.stringify(doc, null, 2) + '\n', base);
    }

    function toItem(e) {
      return { id: e.word, label: e.word, sub: e.note || '', raw: e };
    }

    function publish(cfg, api, entries) {
      api.bus.post('dict.entries', { list: listName(cfg, api), entries: entries });
    }

    function load(cfg, api) {
      return fetchDoc(cfg, api).then(function (r) {
        if (r.error && api.log) api.log('! ' + dataFile(cfg) + ' cannot be read (' + r.error + ') ── adding and removing are off');
        return lib().entries(r.doc, listName(cfg, api));
      });
    }

    // add parsed entries to this panel's list (read-modify-write)
    function addEntries(cfg, api, entries) {
      if (!entries.length) { if (api.log) api.log('nothing to store'); return Promise.resolve(); }
      return updateDoc(cfg, api, function (doc) {
        return lib().add(doc, listName(cfg, api), entries);
      }).then(function (w) {
        if (!w.ok) { if (api.log) api.log('! ' + w.message); return w; }
        if (api.log) api.log('stored ' + entries.length + ' in ' + listName(cfg, api) + ': ' +
          entries.map(function (e) { return e.word; }).join(' '));
      });
    }

    function newestKill(api) {
      return new Promise(function (resolve) {
        var done = false;
        var off = api.bus.on('killring.list', function (payload) {
          if (done) return;
          done = true; off();
          var items = (payload && Array.isArray(payload.items)) ? payload.items : [];
          resolve(items.length ? String(items[0].text || '') : null);
        });
        api.bus.post('killring.query');
        setTimeout(function () { if (!done) { done = true; off(); resolve(null); } }, 500);
      });
    }

    return {
      fill: function (cfg, api) {
        return load(cfg, api).then(function (entries) {
          publish(cfg, api, entries);
          return entries.map(toItem);
        });
      },
      subscribe: function (cfg, api, onChange) {
        var ms = (cfg && cfg.pollMs) || 2000;
        var stop = false;
        var t = null;
        var last = null;
        var current = [];
        var offQuery = api.bus.on('dict.query', function () { publish(cfg, api, current); });
        function tick() {
          if (stop) return;
          load(cfg, api).then(function (entries) {
            if (stop) return;
            var key = JSON.stringify(entries);
            if (key !== last) {
              last = key;
              current = entries;
              publish(cfg, api, entries);
              onChange(entries.map(toItem));
            }
            t = setTimeout(tick, ms);
          }, function () { t = setTimeout(tick, ms); });
        }
        tick();
        return function () { stop = true; offQuery(); if (t) clearTimeout(t); };
      },
      onKey: function (chord, item, cfg, api, filterText) {
        var action = cfg && cfg.keys && cfg.keys[chord];
        if (action === 'store') {
          return newestKill(api).then(function (text) {
            if (text == null) { if (api.log) api.log('the kill ring is empty (yank first)'); return; }
            return addEntries(cfg, api, lib().parseYank(text));
          });
        }
        if (action === 'add') {
          var e = lib().parseLine(filterText);
          if (!e) { if (api.log) api.log('add: type "word: note" in the filter first'); return; }
          return addEntries(cfg, api, [e]);
        }
      },
      remove: function (item, cfg, api) {
        return updateDoc(cfg, api, function (doc) {
          return lib().remove(doc, listName(cfg, api), item.raw.word);
        }).then(function (w) {
          if (!w.ok && api.log) api.log('! ' + w.message);
          return w;
        });
      },
      onSelect: function (item, cfg, api) {
        if (item && item.raw) api.bus.post('dict.pick', { list: listName(cfg, api), word: item.raw.word });
      },
      _listName: listName,
      _updateDoc: updateDoc,
      _toItem: toItem,
    };
  })();
})(typeof self !== 'undefined' ? self : this);
