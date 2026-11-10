// lib/list/kinds/killring.js -- the list kind "killring": the kill ring picker.
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  kinds.killring = (function () {
    var origin = null;

    function wireOrigin(api) {
      api.bus.on('killring.origin', function (p) {
        if (p && p.id) origin = { id: p.id, kind: p.kind || null };
      });
    }

    function toItems(payload) {
      var arr = (payload && Array.isArray(payload.items)) ? payload.items : [];
      return arr.map(function (e) {
        var oneLine = String(e.text || '').replace(/\s+/g, ' ').trim();
        return {
          id: e.id,
          label: oneLine.length > 80 ? oneLine.slice(0, 80) + '…' : (oneLine || '(blank)'),
          sub: (e.source ? '<' + e.source + '>  ' : '') + String(e.text || '').length + ' chars',
          raw: e,
        };
      });
    }

    function deliver(item, pop, api) {
      var text = item && item.raw && item.raw.text;
      if (typeof text !== 'string') return;
      if (origin && origin.kind === 'code') {
        api.bus.post('killring.yank', { text: text, pop: pop }, { to: origin.id });
      } else if (origin && origin.id) {
        api.bus.post('insert', { text: text }, { to: origin.id });
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard &&
          navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {});
      }
      if (pop) api.bus.post('killring.remove', { id: item.raw.id });
      api.bus.post('killring.done', { originId: origin && origin.id });
    }

    return {
      fill: function (cfg, api) {
        wireOrigin(api);
        return new Promise(function (resolve) {
          var done = false;
          var off = api.bus.on('killring.list', function (payload) {
            if (done) return;
            done = true; off();
            resolve(toItems(payload));
          });
          api.bus.post('killring.query');
          setTimeout(function () { if (!done) { done = true; off(); resolve([]); } }, 500);
        });
      },
      subscribe: function (cfg, api, onChange) {
        wireOrigin(api);
        var off = api.bus.on('killring.list', function (payload) {
          onChange(toItems(payload));
        });
        api.bus.post('killring.query');
        return off;
      },
      remove: function (item, cfg, api) {
        api.bus.post('killring.remove', { id: item.raw && item.raw.id });
      },
      onSelect: function (item, cfg, api) {
        deliver(item, false, api);
      },
      onKey: function (chord, item, cfg, api) {
        var mode = cfg && cfg.keys && cfg.keys[chord];
        if (mode === 'keep' || mode === 'pop') deliver(item, mode === 'pop', api);
      },
    };
  })();
})(typeof self !== 'undefined' ? self : this);
