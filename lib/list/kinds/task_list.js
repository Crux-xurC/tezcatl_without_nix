// lib/list/kinds/task_list.js -- the list kind "task_list": the task list
// (D-task-list) -- the rows a task_table cut (`L`) into ~work/books/task_list.json,
// in its order (the rank). One file per kind; the table of kinds and what they
// share is lib/list/list-kinds.js. The pure parts are lib/task/task-list.js.
// A change here is written to the list and to the task_table's book (the row of
// the same id; DONE / CANCELLED to every row under it there too), both checked
// against what was read; fs.changed tells an open task_table. Nothing is
// deleted from the book: Del takes a row out of the list only.
// cfg.keys: chord -> 'cycle' | 'done' | 'cancel' | 'new' (the filter text).
// Enter: the line of the note that holds the row's id (code.open-at).
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var node = typeof module === 'object' && module.exports;
  var kinds = node ? require('../list-kinds.js') : Tezcatl.listKinds;
  var TL = node ? require('../../task/task-list.js') : Tezcatl.taskList;
  var putDoc = kinds.putDoc;
  var readDoc = kinds.readDoc;

  kinds.task_list = (function () {
    var settingsP = null;
    // tasks/task_table.json (the columns and states), once
    function settings() {
      if (!settingsP) {
        var u = Tezcatl.config && Tezcatl.config.sibling ? Tezcatl.config.sibling('tasks/task_table.json') : null;
        settingsP = u ? fetch(u, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }) : Promise.resolve(null);
      }
      return settingsP;
    }
    function fsUrl(api, path, write) { return api.fsBase + (write ? '/fs/write' : '/fs/read') + '?path=' + encodeURIComponent(path); }
    function validList(d) { return d && Array.isArray(d.columns) && Array.isArray(d.rows); }

    function readList(api) {
      if (!api.fsBase) return Promise.resolve({ doc: null, error: 'no relay URL' });
      return readDoc(fsUrl(api, TL.PATH, false), validList);
    }

    function fill(cfg, api) {
      return Promise.all([readList(api), settings()]).then(function (x) {
        var r = x[0], s = x[1];
        if (r.error) { if (api.log) api.log('! ' + TL.PATH + ' cannot be read (' + r.error + ')'); return []; }
        if (!r.doc) { if (api.log) api.log('no task list yet ── L (task_table list) in a task_table cuts one'); return []; }
        var list = r.doc;
        return list.rows.map(function (row, i) {
          return { id: TL.idOf(list, row, s) || ('row-' + i), label: TL.label(list, row, s), sub: TL.sub(list, row, s), raw: { i: i, id: TL.idOf(list, row, s) } };
        });
      });
    }

    // read the list and its book, change both (fn(list, book, s) -> {list, book, say} | {error}), write both
    function update(api, fn) {
      function attempt() {
        return Promise.all([readList(api), settings()]).then(function (x) {
          var lr = x[0], s = x[1];
          if (lr.error || !lr.doc) return { ok: false, message: lr.error ? TL.PATH + ' cannot be read (' + lr.error + ')' : 'no task list yet' };
          return readDoc(fsUrl(api, lr.doc.book, false), validList).then(function (br) {
            if (br.error || !br.doc) return { ok: false, message: lr.doc.book + (br.error ? ' cannot be read (' + br.error + ')' : ' is gone ── cut the list again from a task_table') };
            return Promise.resolve(fn(lr.doc, br.doc, s)).then(function (c) {
              if (!c || c.error) return { ok: false, message: (c && c.error) || 'nothing changed' };
              var wb = c.book ? putDoc(fsUrl(api, lr.doc.book, true), JSON.stringify(c.book, null, 1) + '\n', br.base) : Promise.resolve({ ok: true });
              return wb.then(function (w) {
                if (!w.ok) return w;
                if (c.book && api.bus) api.bus.post('fs.changed', { op: 'write', paths: [lr.doc.book] });
                return putDoc(fsUrl(api, TL.PATH, true), JSON.stringify(c.list, null, 1) + '\n', lr.base).then(function (wl) {
                  return wl.ok ? { ok: true, message: c.say } : wl;
                });
              });
            });
          });
        });
      }
      return attempt().then(function (w) { return w && w.changed ? attempt() : w; }).then(function (w) {
        if (api.log && w) api.log(w.ok ? (w.message || '') : '! ' + w.message);
        return w;
      });
    }

    function takeId(cfgS, api, path) {
      var list = (cfgS && cfgS.list) || 'tasks';
      return fetch(api.fsBase + '/ids/take?list=' + encodeURIComponent(list) + '&n=1&path=' + encodeURIComponent(path || ''), { method: 'POST' })
        .then(function (r) { return r.json().then(function (b) { if (!r.ok || !b || !b.ids) throw new Error((b && b.error) || 'HTTP ' + r.status); return b.ids[0]; }); });
    }

    return {
      fill: fill,
      subscribe: function (cfg, api, onChange) {
        var ms = (cfg && cfg.pollMs) || 1000;
        var stop = false, t = null;
        function tick() {
          if (stop) return;
          fill(cfg, api).then(function (items) { if (!stop) onChange(items); t = setTimeout(tick, ms); }, function () { t = setTimeout(tick, ms); });
        }
        t = setTimeout(tick, ms);
        return function () { stop = true; if (t) clearTimeout(t); };
      },
      onKey: function (chord, item, cfg, api, filterText) {
        var action = cfg && cfg.keys && cfg.keys[chord];
        if (action === 'new') {
          var text = String(filterText || '').trim();
          if (!text) { if (api.log) api.log('new: type the task in the filter first'); return; }
          return update(api, function (list, book, s) {
            return takeId(s, api, list.path).then(function (id) {
              var a = TL.add(list, book, text, id, s);
              return { list: a.list, book: a.book, say: a.no + ' ' + text + ' (' + id + ') added to the list and to ' + list.source };
            });
          });
        }
        if (!item || !item.raw) return;
        var to = action === 'done' ? 'DONE' : action === 'cancel' ? 'CANCELLED' : action === 'cycle' ? null : undefined;
        if (to === undefined) return;
        return update(api, function (list, book, s) {
          var i = list.rows.findIndex(function (r) { return TL.idOf(list, r, s) === item.raw.id; });
          if (i < 0) return { error: 'the row is not in the list any more' };
          var st = to || TL.cycle(list.rows[i][list.columns.indexOf(((s && s.columns) || {}).state || 'state')], s);
          var r = TL.setState(list, book, i, st, s);
          return { list: r.list, book: r.missing ? null : r.book,
            say: item.raw.id + ': ' + st + (r.missing ? ' (in the list only: ' + list.source + ' has no row ' + item.raw.id + ')' : r.n > 1 ? ' (and ' + (r.n - 1) + ' under it, in ' + list.source + ')' : ' (in ' + list.source + ')') };
        });
      },
      remove: function (item, cfg, api) {
        return update(api, function (list, book, s) {
          var i = list.rows.findIndex(function (r) { return TL.idOf(list, r, s) === item.raw.id; });
          if (i < 0) return { error: 'the row is not in the list any more' };
          return { list: TL.drop(list, i), book: null, say: item.raw.id + ' out of the list (' + list.source + ' keeps it)' };
        });
      },
      onSelect: function (item, cfg, api) {
        if (!item || !item.raw || !item.raw.id) return;
        readList(api).then(function (r) {
          if (!r.doc) return;
          return fetch(fsUrl(api, r.doc.path, false), { cache: 'no-store' }).then(function (x) { return x.ok ? x.text() : ''; }).then(function (text) {
            var line = TL.lineOf(text, item.raw.id);
            if (Tezcatl.commands) Tezcatl.commands.invoke('code.open-at', { path: r.doc.path, line: line || 1 });
            if (api.log && !line) api.log(item.raw.id + ' is not in ' + r.doc.path + ' (put the task_table into the note: W)');
          });
        });
      },
    };
  })();
})(typeof self !== 'undefined' ? self : this);
