// lib/skin/lsp-commands.js -- the `lsp ...` lines of a skin's input form: the
// language servers the relay runs, seen and stopped without opening the lsp
// panel, and the wait for their answers.
//   lsp list                    the servers running, numbered, on the receiving side
//   lsp stop <name | number>    stop one (the number: of the last lsp list -- lib/skin/recv-refs.js)
//   lsp timeout <ms> [max ms]   how long this skin's code_editor wait for an answer, from now
//                               (code.configure {lsp}; not kept -- code.json lsp.timeoutMs is)
//   lsp restart                 stop the server of the code_editor meant now and :Reconnect it
// parse / lines / pick are pure; wire(h) does them for a page.
(function (root) {
  'use strict';

  const USAGE = 'lsp list, stop, timeout, restart';

  function posInt(w) { return /^[1-9]\d*$/.test(String(w)) ? Number(w) : null; }

  // a line -> null (not an lsp line) | {cmd, ...} | {error}
  function parse(line) {
    const words = String(line == null ? '' : line).trim().split(/\s+/).filter(Boolean);
    if (words[0] !== 'lsp') return null;
    const a = words.slice(2);
    switch (words[1]) {
      case 'list':
      case 'restart':
        return a.length ? { error: 'lsp ' + words[1] + ' takes nothing' } : { cmd: words[1] };
      case 'stop': {
        if (a.length !== 1) return { error: 'lsp stop <name or number> (the number: of the last lsp list)' };
        return posInt(a[0]) ? { cmd: 'stop', n: posInt(a[0]) } : { cmd: 'stop', name: a[0] };
      }
      case 'timeout': {
        const ms = posInt(a[0]);
        const max = a.length === 2 ? posInt(a[1]) : null;
        if (!ms || a.length > 2 || (a.length === 2 && !max)) return { error: 'lsp timeout <ms> [max ms] (e.g. lsp timeout 10000 120000)' };
        if (max && max < ms) return { error: 'lsp timeout: the max (' + max + ') is under the wait (' + ms + ')' };
        return { cmd: 'timeout', ms: ms, max: max };
      }
    }
    return { error: USAGE };
  }

  function shortRoot(p) {
    if (typeof p !== 'string') return '';
    const parts = p.split('/').filter(Boolean);
    return parts.length <= 3 ? p : '…/' + parts.slice(-3).join('/');
  }
  function name(s) { return s.serverId + ' ' + shortRoot(s.root); }
  // the servers of GET /lsp/servers -> one numbered line each
  function lines(servers) {
    return (servers || []).map(function (s, i) {
      return (i + 1) + '  ' + s.serverId + '  ' + shortRoot(s.root) + '  ' + s.status +
        ' · ' + s.consumers + ' pane' + (s.consumers === 1 ? '' : 's') +
        ' · ' + s.docs + ' doc' + (s.docs === 1 ? '' : 's') + (s.pid ? ' · pid ' + s.pid : '');
    });
  }
  // the one called `nm` -> {server} | {error}
  function pick(servers, nm) {
    const hits = (servers || []).filter(function (s) { return s.serverId === nm; });
    if (!hits.length) return { error: 'no language server called ' + nm + ' is running (lsp list)' };
    if (hits.length > 1) return { error: hits.length + ' servers are called ' + nm + ' ── lsp list, then lsp stop <number>' };
    return { server: hits[0] };
  }
  function sec(ms) { return (ms / 1000) + ' s'; }

  // h: { bus, base() -> the relay's http base | null, recv(text, cls, ref),
  //      item(n) -> {item} | {error} (the last lsp list's), codes() -> [{id, bus, place}]
  //      (this skin's code_editor), codeNow() -> id | null, fetch?, setTimeout? }
  // -> { handle(line) -> false (not an lsp line) | Promise<bool>, configure(busId) }
  function wire(h) {
    const doFetch = h.fetch || function (u, o) { return fetch(u, o); };
    const later = h.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    let waits = null;   // the last lsp timeout: also given to a code_editor added later
    function err(t) { h.recv('! ' + t, 'err'); return false; }

    function url() { const b = h.base(); return b ? b + '/lsp/servers' : null; }
    function servers() {
      const u = url();
      if (!u) return Promise.reject(new Error('the relay is not known yet'));
      return doFetch(u, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (b) { return b && Array.isArray(b.servers) ? b.servers : []; });
    }
    // -> true (stopped) | false (it was not running)
    function stop(s) {
      return doFetch(url() + '/' + encodeURIComponent(s.key), { method: 'DELETE', headers: { 'content-type': 'application/json' } })
        .then(function (r) {
          if (r.status === 404) return false;
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return true;
        });
    }
    function lost(n, other) { return n > 0 ? ' ── ' + n + (other ? ' other' : '') + ' pane' + (n === 1 ? ' was' : 's were') + ' on it: :Reconnect connects again' : ''; }

    function configure(busId) {
      if (!waits || !busId) return;
      h.bus.post('code.configure', { lsp: waits.max ? { timeoutMs: waits.ms, maxTimeoutMs: waits.max } : { timeoutMs: waits.ms } }, { to: busId });
    }

    // the server the code_editor `id` is attached to (code.query -> its code.here) -> {key, serverId} | null
    function serverOf(id) {
      return new Promise(function (resolve) {
        const req = 'lsp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        let done = false;
        const off = h.bus.on('code.here', function (p, meta) {
          if (done || !p || p.req !== req || !meta || !meta.from || meta.from.name !== id) return;
          done = true; off();
          resolve(p.lsp && p.lsp.key ? p.lsp : null);
        });
        h.bus.post('code.query', { req: req });
        later(function () { if (!done) { done = true; off(); resolve(null); } }, 600);
      });
    }

    function run(c) {
      if (c.cmd === 'list') {
        return servers().then(function (list) {
          h.recv(['lsp list ── ' + (list.length ? list.length + ' running (lsp stop <number>)' : 'none running')].concat(lines(list)).join('\n'),
            null, { kind: 'list', name: 'lsp', items: list });
          return true;
        });
      }
      if (c.cmd === 'stop') {
        const got = c.n ? Promise.resolve(h.item(c.n)) : servers().then(function (list) { return pick(list, c.name); });
        return got.then(function (g) {
          const s = g.item || g.server;
          if (!s) return err('lsp stop ── ' + g.error);
          return stop(s).then(function (was) {
            if (!was) return err('lsp stop ── ' + name(s) + ' is not running any more (lsp list)');
            h.recv('lsp stop ── stopped ' + name(s) + lost(s.consumers));
            return true;
          });
        });
      }
      if (c.cmd === 'timeout') {
        waits = { ms: c.ms, max: c.max };
        const cs = h.codes();
        cs.forEach(function (x) { configure(x.bus); });
        h.recv('lsp timeout ── ' + sec(c.ms) + (c.max ? ' (asked again up to ' + sec(c.max) + ')' : '') + ' for the ' + cs.length +
          ' code_editor here and those added (this window, until it is closed; code.json lsp.timeoutMs is what is kept)');
        return Promise.resolve(true);
      }
      // restart
      const id = h.codeNow();
      const me = id && h.codes().filter(function (x) { return x.id === id; })[0];
      if (!me || !me.bus) return Promise.resolve(err('lsp restart ── there is no code_editor here'));
      const again = function (said) {
        h.bus.post('code.file', { op: 'reconnect', arg: '', bang: false }, { to: me.bus });
        h.recv('lsp restart ── ' + said + '; :Reconnect to the code_editor at ' + me.place + ' (the result is in its head)', null, { kind: 'panel', id: id });
        return true;
      };
      return serverOf(id).then(function (sv) {
        if (!sv) return again('the code_editor is not attached to a language server (nothing to stop)');
        return servers().then(function (list) {
          const s = list.filter(function (x) { return x.key === sv.key; })[0];
          if (!s) return again(sv.serverId + ' is not running any more');
          return stop(s).then(function () { return again('stopped ' + name(s) + lost(s.consumers - 1, true)); });
        });
      });
    }

    function handle(line) {
      const c = parse(line);
      if (!c) return false;
      if (c.error) return Promise.resolve(err(c.error));
      return run(c).catch(function (e) { return err('lsp ' + c.cmd + ' ── ' + ((e && e.message) || e)); });
    }

    return { handle: handle, configure: configure };
  }

  const api = { USAGE, parse, lines, pick, wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).lspCommands = api;
})(typeof self !== 'undefined' ? self : this);
