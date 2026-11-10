// lib/list/kinds/work.js -- the list kind "work": what is running and what ran (the work store's record).
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;
  function lib() { return (root.Tezcatl && root.Tezcatl.workLog) || (typeof require === 'function' ? require('../../core/work-log.js') : null); }

  // The record is the work store's (panels/invisible/work.html, in a skin):
  // asked over the bus (work.query -> work.rows), read again when it says it
  // changed (work.changed) and every cfg.pollMs (a running row turns slow
  // with time). cfg.only "running": what is still waited for (`work watch`).
  //   Enter -- to the panel that fired the row;  Del -- stop it (work.cancel:
  //   the pair's cancel, when it has one)
  function ask(api, type, payload, answer, ms) {
    return new Promise(function (resolve) {
      var req = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var done = false;
      var off = api.bus.on(answer, function (p) {
        if (done || !p || p.req !== req) return;
        done = true; off();
        resolve(p);
      });
      api.bus.post(type, Object.assign({ req: req }, payload || {}));
      setTimeout(function () { if (!done) { done = true; off(); resolve(null); } }, ms || 600);
    });
  }

  kinds.work = {
    fill: function (cfg, api) {
      return ask(api, 'work.query', { only: (cfg && cfg.only) || null }, 'work.rows').then(function (p) {
        if (!p) { if (api.log) api.log('! no work store answered (it lives in a skin: open the frame)'); return []; }
        return p.rows.map(function (r) {
          var s = lib().show(r);
          return { id: String(r.n), label: s.label, sub: s.sub, raw: r };
        });
      });
    },
    // the newest first
    order: function (items) { return items.slice().sort(function (a, b) { return b.raw.n - a.raw.n; }); },
    subscribe: function (cfg, api, onChange) {
      var stop = false;
      function again() { if (!stop) kinds.work.fill(cfg, api).then(function (items) { if (!stop) onChange(items); }); }
      var off = api.bus.on('work.changed', again);
      var t = setInterval(again, (cfg && cfg.pollMs) || 2000);
      return function () { stop = true; off(); clearInterval(t); };
    },
    remove: function (item, cfg, api) {
      return ask(api, 'work.cancel', { n: item.raw.n }, 'work.cancelled').then(function (p) {
        if (api.log) api.log(p ? (p.ok ? '' : '! ') + p.message : '! no work store answered');
      });
    },
    onSelect: function (item, cfg, api) {
      var id = item.raw.from && item.raw.from.id;
      if (!id) return;
      api.bus.post('code.reveal', {}, { to: id });
      api.bus.post('focus', {}, { to: id });
      if (api.log) api.log('to ' + (item.raw.from.role || '') + ' ' + (item.raw.from.name || ''));
    },
  };
})(typeof self !== 'undefined' ? self : this);
