(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  var known = {};
  var impls = {};
  var loaded = false;

  // A command sent over the bus carries a `req`; the window that carries it
  // out answers `command.taken {req}`. When nobody does within TAKEN_MS and
  // command_map.json gives the command a `fallback` ({"open": "<page>?x={arg}",
  // "mode": "tab"|"window"}), the invoking window does that itself -- e.g.
  // matrix.get with no table open anywhere opens a new matrix.html; in a new
  // tab, a window with mode "window", none: config.json launcher.open-mode
  // (lib/core/open-page.js, when the page has it). (Short enough that
  // window.open still counts as the key press that invoked it.)
  var TAKEN_MS = 400;

  function load() {
    if (!Tezcatl.config || !Tezcatl.config.load) {
      return Promise.reject(new Error('commands.load: lib/core/config.js not present'));
    }
    return fetch(Tezcatl.config.sibling('command/command_map.json'), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('command/command_map.json: HTTP ' + r.status);
        return r.json();
      })
      .then(function (doc) {
        var list = (doc && doc.commands) || [];
        var problems = [];
        // a duplicate within the file (one register()ed before load() is not)
        var seen = {};
        list.forEach(function (c) {
          if (!c || typeof c.name !== 'string') {
            problems.push('command with no name, skipped');
            return;
          }
          if (seen[c.name]) problems.push('duplicate command "' + c.name + '"');
          seen[c.name] = true;
          known[c.name] = { name: c.name, desc: c.desc || '', args: c.args || [],
                            fallback: c.fallback && typeof c.fallback.open === 'string' ? c.fallback : null,
                            // the line a skin runs for it ("skin add {panel}"), and whether its echo is left out
                            line: typeof c.line === 'string' ? c.line : null, quiet: !!c.quiet };
        });
        loaded = true;
        return { count: Object.keys(known).length, problems: problems };
      });
  }

  function register(name, fn) {
    if (typeof name !== 'string' || typeof fn !== 'function') return;
    impls[name] = fn;
    if (!known[name]) known[name] = { name: name, desc: '(unlisted)', args: [] };
  }

  function invoke(name, args, ctx) {
    if (impls[name]) {
      try {
        return impls[name](args || {}, ctx || null);
      } catch (e) {
        try {
          console.error('Tezcatl.commands: "' + name + '" threw', e);
        } catch (_) {}
        return false;
      }
    }
    if (Tezcatl.bus) {
      var req = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      var fb = known[name] && known[name].fallback;
      if (fb) awaitTaken(req, function () { runFallback(fb, args || {}, function (text) { said(name + ' ── no window took it: ' + text); }); });
      // ctx.onNone: told when no window took it (a panel's command with no panel open)
      else if (ctx && typeof ctx.onNone === 'function') awaitTaken(req, ctx.onNone);
      Tezcatl.bus.post('command', { name: name, args: args || {}, req: req });
      return false;
    }
    try {
      console.warn('Tezcatl.commands: no impl and no bus for "' + name + '"');
    } catch (_) {}
    return false;
  }

  // What happened beside what was asked is told: to the page
  // itself (commands.onSaid, a skin) and to the skin this page is a panel of (recv.say).
  function said(text) {
    try { if (typeof Tezcatl.commands.onSaid === 'function') Tezcatl.commands.onSaid(text); } catch (_) {}
    if (Tezcatl.bus) Tezcatl.bus.post('recv.say', { text: text });
  }

  function awaitTaken(req, otherwise) {
    var taken = false;
    var off = Tezcatl.bus.on('command.taken', function (p) { if (p && p.req === req) taken = true; });
    setTimeout(function () { off(); if (!taken) otherwise(); }, TAKEN_MS);
  }

  // "{arg}" in the page is replaced by that argument (URL-encoded; missing -> "")
  function fallbackUrl(fb, args) {
    var page = fb.open.replace(/\{(\w+)\}/g, function (_m, k) {
      return args[k] == null ? '' : encodeURIComponent(String(args[k]));
    });
    return Tezcatl.config && Tezcatl.config.sibling ? Tezcatl.config.sibling(page) : page;
  }

  function runFallback(fb, args, tell) {
    var url = fallbackUrl(fb, args);
    var op = Tezcatl.openPage;
    if (op) {
      op.loadSettings().then(function (s) { tell(op.open(url, fb.mode, s).message); });
      return;
    }
    try {
      var w = typeof root.open === 'function' ? root.open(url, '_blank') : null;
      tell(w ? 'opened ' + fb.open.replace(/\?.*$/, '') + ' in a new tab' : 'the pop-up was refused (' + fb.open.replace(/\?.*$/, '') + ')');
    } catch (e) {
      try { console.error('Tezcatl.commands: fallback failed', e); } catch (_) {}
    }
  }

  // Commands from other windows. Only one this window implements is run
  // here -- one it does not is someone else's (invoking it would post it to
  // the bus again). An implementation that returns false declined it (not
  // its turn); anything else answers command.taken.
  function listenBus() {
    if (!Tezcatl.bus) return function () {};
    return Tezcatl.bus.on('command', function (payload, meta) {
      if (!payload || typeof payload.name !== 'string' || !impls[payload.name]) return;
      // from: who invoked it ({id, name, role}) -- a panel takes what comes from its own skin
      var r = invoke(payload.name, payload.args, { remote: true, from: (meta && meta.from) || null });
      if (r !== false && payload.req) Tezcatl.bus.post('command.taken', { req: payload.req, name: payload.name });
    });
  }

  function list() {
    return Object.keys(known).map(function (n) {
      return {
        name: n,
        desc: known[n].desc,
        args: known[n].args,
        hasImpl: !!impls[n],
        fallback: known[n].fallback || null,
        line: known[n].line || null,
        quiet: !!known[n].quiet,
      };
    });
  }

  function isLoaded() {
    return loaded;
  }

  Tezcatl.commands = {
    load: load,
    register: register,
    invoke: invoke,
    listenBus: listenBus,
    list: list,
    isLoaded: isLoaded,
    _fallbackUrl: fallbackUrl,
    _TAKEN_MS: TAKEN_MS,
  };
  if (typeof module === 'object' && module.exports) module.exports = Tezcatl.commands;
})(typeof self !== 'undefined' ? self : this);
