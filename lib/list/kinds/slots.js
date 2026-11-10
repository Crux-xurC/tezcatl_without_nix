// lib/list/kinds/slots.js -- the list kind "slots": the tree skin's slots (tree.json).
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  // Tree slots -- the tree skin's projects (treemacs's workspace): a JSON doc
  // {"slots": [{"order": <int>, "tag": <str>, "path": <FS-root relative>}]} in
  // cfg.dataFile, read and written through /fs like "task"/"dict". Shown by
  // `order`; Enter opens the slot as the tree's root -- tree.root {path, tag,
  // tree}, `tree` being ?tree= (the skin names its own tree pane) when given.
  //
  // Edits are this kind's operations (onAction, also reached by keys):
  //   add {path, tag?} / del {n} / order {a, b} (swap) / tag {n, tag} /
  //   update {} (re-read and tidy)
  // Every write reads the file, applies the operation, then sorts by order
  // and numbers the slots 1..n again before writing -- so the file is always
  // tidy, and update has nothing more to do than that. A file that cannot be
  // read (bad JSON, an unreadable slot) is never written: the list says so,
  // and the skin's `tree edit` opens it in code_editor to fix by hand.
  kinds.slots = (function () {
    // text -> {slots, error}; a slot needs a numeric order and a string path
    function parse(text) {
      var doc;
      try { doc = JSON.parse(text); } catch (e) { return { slots: [], error: 'not readable as JSON (' + (e && e.message || e) + ')' }; }
      var list = doc && Array.isArray(doc.slots) ? doc.slots : null;
      if (!list) return { slots: [], error: 'no "slots" array' };
      var bad = 0;
      var slots = [];
      list.forEach(function (x, i) {
        if (!x || typeof x.order !== 'number' || typeof x.path !== 'string') { bad += 1; return; }
        slots.push({ order: x.order, tag: typeof x.tag === 'string' ? x.tag : '', path: x.path, at: i });
      });
      slots.sort(function (a, b) { return a.order - b.order || a.at - b.at; });
      return { slots: slots, error: bad ? bad + ' slot(s) cannot be read (order is a number, path a string)' : null };
    }

    // sorted by order (file order on ties) and numbered 1..n
    function tidy(slots) {
      return slots.slice()
        .map(function (x, i) { return { order: x.order, tag: x.tag || '', path: x.path, at: x.at == null ? i : x.at }; })
        .sort(function (a, b) { return a.order - b.order || a.at - b.at; })
        .map(function (x, i) { return { order: i + 1, tag: x.tag, path: x.path }; });
    }

    function stringify(slots) {
      return JSON.stringify({ slots: tidy(slots) }, null, 2) + '\n';
    }

    function find(slots, n) {
      for (var i = 0; i < slots.length; i++) if (slots[i].order === n) return slots[i];
      return null;
    }

    function num(v) { var n = Number(v); return Number.isInteger(n) ? n : null; }

    // (slots, action, args) -> {slots, message} | {error}; pure
    function apply(slots, action, args) {
      args = args || {};
      slots = tidy(slots);
      var x, y;
      if (action === 'add') {
        if (typeof args.path !== 'string') return { error: 'add: no path' };
        var path = args.path.replace(/^\/+/, '').replace(/\/+$/, '');
        slots.push({ order: slots.length + 1, tag: typeof args.tag === 'string' ? args.tag : '', path: path });
        return { slots: slots, message: 'added ' + (path || '/') + ' as ' + (slots.length) };
      }
      if (action === 'del') {
        x = find(slots, num(args.n));
        if (!x) return { error: 'del: there is no slot ' + args.n };
        return { slots: slots.filter(function (s) { return s !== x; }), message: 'removed slot ' + args.n + ' (' + (x.path || '/') + ')' };
      }
      if (action === 'order') {
        x = find(slots, num(args.a)); y = find(slots, num(args.b));
        if (!x || !y) return { error: 'order: there is no slot ' + (!x ? args.a : args.b) };
        var t = x.order; x.order = y.order; y.order = t;
        return { slots: slots, message: 'swapped slots ' + args.a + ' and ' + args.b };
      }
      if (action === 'tag') {
        x = find(slots, num(args.n));
        if (!x) return { error: 'tag: there is no slot ' + args.n };
        x.tag = typeof args.tag === 'string' ? args.tag : '';
        return { slots: slots, message: 'slot ' + args.n + ' is tagged "' + x.tag + '"' };
      }
      if (action === 'update') return { slots: slots, message: 'read again' };
      return { error: 'no such action: ' + action };
    }

    // id by path: the item keeps its id when its order changes (selection follows a move)
    function toItem(x) {
      return { id: 'p:' + x.path, label: x.order + '  ' + (x.tag || '·'), sub: x.path || '/', raw: x };
    }

    function dataFile(cfg) { return (cfg && cfg.dataFile) || 'tree.json'; }

    function url(cfg, api, write) {
      return api.fsBase + (write ? '/fs/write' : '/fs/read') + '?path=' + encodeURIComponent(dataFile(cfg));
    }

    // -> {slots, error, text, missing}
    function load(cfg, api) {
      if (!api.fsBase) return Promise.resolve({ slots: [], error: null, text: null, missing: true });
      return fetch(url(cfg, api, false), { cache: 'no-store' }).then(function (r) {
        if (r.status === 404) return { slots: [], error: null, text: null, missing: true };
        if (!r.ok) return { slots: [], error: 'HTTP ' + r.status, text: null };
        return r.text().then(function (text) { var p = parse(text); p.text = text; return p; });
      }, function (e) { return { slots: [], error: String(e && e.message || e), text: null }; });
    }

    function unreadable(cfg, res) {
      return 'could not read the list (' + dataFile(cfg) + ': ' + res.error + ')';
    }

    // the foot says what is wrong, and goes back to the hint once it is not
    function report(cfg, api, res) {
      var msg = res.error ? unreadable(cfg, res) : res.missing ? dataFile(cfg) + ' does not exist yet (tree add makes it)' : null;
      if (api.log && (msg || api.slotsMsg)) api.log(msg || (cfg && cfg.hint) || '');
      api.slotsMsg = msg;
      var name = api.params && typeof api.params.get === 'function' ? api.params.get('name') : null;
      if (api.bus) api.bus.post('slots.state', { list: name, error: res.error ? unreadable(cfg, res) : null });
    }

    // the one write path: read, refuse if unreadable, apply, tidy, write if
    // changed -- checked against what was read (kinds.putDoc), and made again on
    // what is there when the file changed meanwhile
    function act(cfg, api, action, args) {
      return kinds.retryChanged(function () {
        return load(cfg, api).then(function (res) {
          if (res.error) return { ok: false, message: unreadable(cfg, res) + ' ── not written (fix it with tree edit, then tree update)' };
          var out = apply(res.slots, action, args);
          if (out.error) return { ok: false, message: out.error };
          var text = stringify(out.slots);
          var items = tidy(out.slots).map(toItem);
          if (text === res.text) return { ok: true, message: out.message, items: items };
          return (res.missing ? Promise.resolve('absent') : kinds.baseOf(res.text)).then(function (base) {
            return kinds.putDoc(url(cfg, api, true), text, base);
          }).then(function (w) {
            return w.ok ? { ok: true, message: out.message, items: items } : w;
          });
        });
      });
    }

    return {
      fill: function (cfg, api) {
        return load(cfg, api).then(function (res) { report(cfg, api, res); return res.slots.map(toItem); });
      },
      subscribe: function (cfg, api, onChange) {
        var ms = (cfg && cfg.pollMs) || 2000;
        var stop = false;
        var t = null;
        var last = null;
        function tick() {
          if (stop) return;
          load(cfg, api).then(function (res) {
            if (stop) return;
            var key = JSON.stringify([res.slots, res.error, res.missing]);
            if (key !== last) { last = key; report(cfg, api, res); onChange(res.slots.map(toItem)); }
            t = setTimeout(tick, ms);
          }, function () { t = setTimeout(tick, ms); });
        }
        tick();
        return function () { stop = true; if (t) clearTimeout(t); };
      },
      // from outside (list.html's list.action -- the tree skin's commands)
      onAction: function (action, args, item, cfg, api) { return act(cfg, api, action, args); },
      // keys when the list is used on its own: add / tag take the filter text
      onKey: function (chord, item, cfg, api, filterText) {
        var action = cfg && cfg.keys && cfg.keys[chord];
        var x = item && item.raw;
        if (action === 'add') return act(cfg, api, 'add', { path: String(filterText || '').trim() });
        if (!x) return Promise.resolve({ ok: false, message: 'select a slot' });
        if (action === 'tag') return act(cfg, api, 'tag', { n: x.order, tag: String(filterText || '').trim() });
        if (action === 'up' || action === 'down') {
          var other = x.order + (action === 'up' ? -1 : 1);
          return act(cfg, api, 'order', { a: x.order, b: other }).then(function (r) {
            if (r && r.ok) r.select = toItem(x).id;
            return r;
          });
        }
        return Promise.resolve();
      },
      remove: function (item, cfg, api) {
        return act(cfg, api, 'del', { n: item && item.raw && item.raw.order }).then(function (r) {
          if (r && !r.ok && api.log) api.log(r.message);
          return r;
        });
      },
      onSelect: function (item, cfg, api) {
        var x = item && item.raw;
        if (!x) return;
        var tree = api.params && typeof api.params.get === 'function' ? api.params.get('tree') : null;
        api.bus.post('tree.root', { path: x.path, tag: x.tag, tree: tree || undefined });
      },
      _parse: parse,
      _tidy: tidy,
      _apply: apply,
      _act: act,
      _toItem: toItem,
    };
  })();
})(typeof self !== 'undefined' ? self : this);
