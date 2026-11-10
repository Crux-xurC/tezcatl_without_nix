// lib/core/store.js -- what tezcatl keeps between sessions (D-store): one JSON
// file per key under the relay's work place, ~work/store/<name>.json
// (~/.local/state/tezcatl/work/store/), read and written through /fs/read and
// /fs/write. It replaces localStorage, which a browser that keeps nothing
// (Poca's memory-only profile) forgets on closing.
//
// A key keeps its old localStorage name; the file is the name without
// "tezcatl:", with ":" and anything outside [\w.-] as "-"
// (tezcatl:frame:skins -> ~work/store/frame-skins.json).
//
//   Tezcatl.store.load(key)       -> Promise<value | null>  read the file now
//   Tezcatl.store.ready(keys)     -> Promise                load several at once
//   Tezcatl.store.get(key)        -> value | null           what was last loaded or set
//   Tezcatl.store.set(key, v)     -> Promise<{ok, message}>  write it (last write wins)
//   Tezcatl.store.update(key, fn) -> Promise<{ok, message, value}>
//       read, fn(current) -> the new value, write -- checked against what was
//       read (x-tezcatl-base) and made again on what is there when another
//       window wrote meanwhile. fn returning undefined writes nothing.
//
// A file that cannot be read (the relay is down, broken JSON) reads as null and
// is not written over by update. The relay's place comes from config.json
// (connections[0].url), as /fs's other users find it.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var DIR = '~work/store/';
  var TRIES = 3;

  function fileOf(key) {
    return DIR + String(key).replace(/^tezcatl:/, '').replace(/[^\w.-]/g, '-') + '.json';
  }

  function sha(text) {
    var subtle = typeof crypto !== 'undefined' && crypto.subtle;
    if (!subtle || typeof TextEncoder === 'undefined') return Promise.resolve(null);
    return subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) {
      return 'sha256:' + Array.from(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    }, function () { return null; });
  }

  // h: {fetch, base() -> Promise<"http://127.0.0.1:4100" | null>}
  function create(h) {
    var cache = Object.create(null);
    var queue = Object.create(null);   // key -> the last write's promise (one window writes a key in order)
    var baseP = null;
    function base() { return baseP || (baseP = h.base().catch(function () { return null; })); }
    function url(b, write, key) {
      return b + (write ? '/fs/write' : '/fs/read') + '?path=' + encodeURIComponent(fileOf(key));
    }

    // -> Promise<{value, text, error}>; text null: no file
    function read(key) {
      return base().then(function (b) {
        if (!b) return { value: null, text: null, error: 'no relay (config.json)' };
        return h.fetch(url(b, false, key), { cache: 'no-store' }).then(function (r) {
          if (r.status === 404) return { value: null, text: null, error: null };
          if (!r.ok) return { value: null, text: null, error: 'HTTP ' + r.status };
          return r.text().then(function (text) {
            try { return { value: JSON.parse(text), text: text, error: null }; }
            catch (e) { return { value: null, text: text, error: fileOf(key) + ' is not JSON' }; }
          });
        });
      }).catch(function (e) { return { value: null, text: null, error: String(e && e.message || e) }; });
    }

    function put(key, value, check) {
      return base().then(function (b) {
        if (!b) return { ok: false, message: 'could not save (no relay)' };
        var headers = { 'content-type': 'application/json' };
        if (check) headers['x-tezcatl-base'] = check;
        return h.fetch(url(b, true, key), { method: 'PUT', headers: headers, body: JSON.stringify(value, null, 1) + '\n' })
          .then(function (r) {
            if (r.ok) return { ok: true };
            if (r.status === 409) return { ok: false, changed: true, message: 'changed while being written' };
            return { ok: false, message: 'could not save ' + fileOf(key) + ' (HTTP ' + r.status + ')' };
          });
      }).catch(function (e) { return { ok: false, message: 'could not save (' + String(e && e.message || e) + ')' }; });
    }

    function inTurn(key, job) {
      var p = (queue[key] || Promise.resolve()).then(job, job);
      queue[key] = p;
      return p;
    }

    function load(key) {
      return read(key).then(function (got) { if (!got.error) cache[key] = got.value; return got.value; });
    }

    function update(key, fn) {
      return inTurn(key, function () {
        function attempt(n) {
          return read(key).then(function (got) {
            if (got.error) return { ok: false, message: 'could not read ' + fileOf(key) + ' (' + got.error + ') ── not written' };
            cache[key] = got.value;
            var next = fn(got.value);
            if (next === undefined) return { ok: true, value: got.value };
            return (got.text == null ? Promise.resolve('absent') : sha(got.text)).then(function (check) {
              return put(key, next, check);
            }).then(function (w) {
              if (w.changed && n + 1 < TRIES) return attempt(n + 1);
              if (w.ok) cache[key] = next;
              return { ok: w.ok, message: w.message, value: w.ok ? next : got.value };
            });
          });
        }
        return attempt(0);
      });
    }

    return {
      fileOf: fileOf,
      load: load,
      ready: function (keys) { return Promise.all(keys.map(load)); },
      get: function (key) { return key in cache ? cache[key] : null; },
      set: function (key, value) {
        cache[key] = value;
        return inTurn(key, function () { return put(key, value, null); });
      },
      update: update,
    };
  }

  function relayBase() {
    return Tezcatl.config.load().then(function (cfg) {
      var u = cfg && cfg.connections && cfg.connections[0] && cfg.connections[0].url;
      if (!u) return null;
      var x = new URL(u);
      return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host;
    });
  }

  if (typeof module === 'object' && module.exports) module.exports = { create: create, fileOf: fileOf };
  else Tezcatl.store = create({ fetch: function (u, o) { return fetch(u, o); }, base: relayBase });
})(typeof self !== 'undefined' ? self : this);
