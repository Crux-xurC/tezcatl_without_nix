// lib/code/code-locate.js -- "this file, this place":
// given a path (and a line and column), go to the code_editor that has it open,
// or open a new one, and put the cursor there. Made of parts that are each a
// command of their own:
//
//   query      every code_editor open now (code.query -> code.here {name, path, dirty})
//   find       the ones among them showing a path
//   reveal     bring one to the front (code.reveal -> code.revealed {focused});
//              inside a skin the skin focuses its pane (lib/core/panes.js)
//   goto       code.goto {line, col} to one
//   openNew    a new code_editor window (panels/resident/code_editor.html?path=&name=), then goto
//   openAt     query -> find -> reveal + goto, or openNew
//
// The commands (command_map.json): code.list (the list of them, list.html
// ?config=code_editor), code.find {path}, code.goto {line, col, path?},
// code.open-at {path, line, col}, and code.grep {pattern, path}
// (list.html?config=locations&grep= -- the relay's rg; Enter -> code.open-at). A path is the same file wherever it is
// open, so a file already open is gone to, never opened twice (A3's "the
// same path is the same buffer"; a second code_editor on a file gets no
// diagnostics).
//
// Lines and columns are 1-based here, as people and grep write them
// (code_editor's code.goto takes a 0-based column).
//
// `env` is {bus, open, sibling, setTimeout} -- the page's, or a test's --
// and optionally openNew(t) -> Promise<{ok, opened, message}>, a page's own
// way to open a path nobody has (the frame adds a code_editor panel).

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).codeLocate = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const QUERY_MS = 300;    // how long code.here answers are collected
  const REVEAL_MS = 600;   // code.revealed (code_editor answers after 150ms)
  const OPEN_MS = 15000;   // a new window opening its file (code.opened)
  const CURSOR_MS = 400;   // cursor.state (the focus history)

  function mkReq(p) {
    return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normPath(p) {
    return String(p == null ? '' : p).trim().replace(/^\/+/, '');
  }

  // "lib/a.ex:12:3" -> {path, line, col}; line / col are null when not given | {error}
  function parseTarget(s) {
    const m = /^(.*?)(?::(\d+))?(?::(\d+))?$/.exec(String(s == null ? '' : s).trim());
    const path = normPath(m[1]);
    if (!path) return { error: 'no path' };
    return { path: path, line: m[2] ? Number(m[2]) : null, col: m[3] ? Number(m[3]) : null };
  }

  // -> [{id, name, path, dirty}], in no particular order
  function query(env, ms) {
    const req = mkReq('q');
    const found = [];
    return new Promise(function (resolve) {
      const off = env.bus.on('code.here', function (p, meta) {
        if (!p || p.req !== req || !meta || !meta.from) return;
        // diagnostics: the problems list's; [] from a code_editor that says none
        found.push({ id: meta.from.id, name: p.name || null, path: p.path || null, dirty: !!p.dirty,
          diagnostics: Array.isArray(p.diagnostics) ? p.diagnostics : [] });
      });
      env.bus.post('code.query', { req: req });
      env.setTimeout(function () { off(); resolve(found); }, ms || QUERY_MS);
    });
  }

  function find(list, path) {
    const want = normPath(path);
    if (!want) return [];
    return (list || []).filter(function (c) { return c.path && normPath(c.path) === want; });
  }

  // -> {focused} -- false when the browser kept the window behind, or no answer
  function reveal(env, id) {
    const req = mkReq('r');
    return new Promise(function (resolve) {
      let done = false;
      const off = env.bus.on('code.revealed', function (p) {
        if (done || !p || p.req !== req) return;
        done = true; off();
        resolve({ focused: !!p.focused });
      });
      env.bus.post('code.reveal', { req: req }, { to: id });
      env.setTimeout(function () {
        if (!done) { done = true; off(); resolve({ focused: false, noAnswer: true }); }
      }, REVEAL_MS);
    });
  }

  function goto(env, id, line, col) {
    if (!line) return;
    env.bus.post('code.goto', { line: line, col: col ? col - 1 : 0 }, { to: id });
  }

  function where(t) {
    return t.path + (t.line ? ':' + t.line + (t.col ? ':' + t.col : '') : '');
  }

  // what a line about `t` points at (a skin's receiving side: lib/skin/recv-refs.js)
  function atRef(t) { return { kind: 'at', path: t.path, line: t.line || null, col: t.col || null }; }

  // a new code_editor window opening `path` (code_editor.html?path= reads it), then
  // the cursor -> {ok, opened, name, message}
  function openNew(env, t) {
    const name = mkReq('code-');
    const url = env.sibling('panels/resident/code_editor.html') + '?path=' + encodeURIComponent(t.path) + '&name=' + encodeURIComponent(name);
    return new Promise(function (resolve) {
      let done = false;
      const off = env.bus.on('code.opened', function (p, meta) {
        if (done || !p || p.name !== name || !meta || !meta.from) return;
        done = true; off(); offFail();
        goto(env, meta.from.id, t.line, t.col);
        resolve({ ok: true, opened: true, name: name, ref: atRef(t), message: 'opened ' + where(t) + ' in a new code_editor' });
      });
      // the new code_editor could not open it (a directory, not UTF-8 ...): said at once, not after OPEN_MS
      const offFail = env.bus.on('code.openFailed', function (p) {
        if (done || !p || p.name !== name) return;
        done = true; off(); offFail();
        resolve({ ok: false, opened: true, name: name, message: where(t) + ' ── ' + (p.reason || 'could not open') });
      });
      const w = env.open(url, 'tezcatl-' + name);
      if (!w) {
        done = true; off(); offFail();
        resolve({ ok: false, message: where(t) + ' ── could not open a new window (the pop-up was blocked)' });
        return;
      }
      env.setTimeout(function () {
        if (done) return;
        done = true; off(); offFail();
        resolve({ ok: false, opened: true, name: name, message: where(t) + ' ── cannot confirm the new code_editor opened it (see that window\'s head)' });
      }, OPEN_MS);
    });
  }

  // the code_editor that has t.path, at t.line / t.col; a new one when none has it
  function openAt(env, t) {
    return query(env).then(function (list) {
      const hit = find(list, t.path)[0];
      // a page may open it its own way (the frame: a code_editor panel, skin add)
      if (!hit) return env.openNew ? env.openNew(t) : openNew(env, t);
      return reveal(env, hit.id).then(function (r) {
        goto(env, hit.id, t.line, t.col);
        return {
          ok: true, opened: false, id: hit.id, name: hit.name, focused: r.focused, ref: atRef(t),
          message: where(t) + ' ── to the code_editor that has it (' + hit.name + ')' +
            (r.focused ? '' : '. Could not bring that window forward (a browser limit) ── switch to it yourself'),
        };
      });
    });
  }

  // the code_editor among `list` focused last (the cursor aggregator's history) -> id | null
  function lastFocused(env, list) {
    const ids = new Set((list || []).map(function (c) { return c.id; }));
    return new Promise(function (resolve) {
      let done = false;
      const off = env.bus.on('cursor.state', function (p) {
        if (done) return;
        done = true; off();
        const hist = (p && p.focusHistory) || [];
        for (let i = hist.length - 1; i >= 0; i--) if (ids.has(hist[i].id)) return resolve(hist[i].id);
        resolve(null);
      });
      env.bus.post('cursor.query');
      env.setTimeout(function () { if (!done) { done = true; off(); resolve(null); } }, CURSOR_MS);
    });
  }

  // the arguments of `:grep`: a pattern (in "..." when it has spaces) and
  // an optional path -> {pattern, path} | {error}
  function parseGrep(s) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return { error: 'no pattern (:grep pattern [path])' };
    let pattern;
    let rest;
    if (t.charAt(0) === '"') {
      const end = t.indexOf('"', 1);
      if (end < 0) return { error: 'unclosed "' };
      pattern = t.slice(1, end);
      rest = t.slice(end + 1).trim();
    } else {
      const m = /^(\S+)\s*(.*)$/.exec(t);
      pattern = m[1];
      rest = m[2].trim();
    }
    if (!pattern) return { error: 'an empty pattern' };
    return { pattern: pattern, path: rest ? normPath(rest) : null };
  }

  function grepUrl(env, pattern, path) {
    return env.sibling('panels/tool/list.html') + '?config=locations&grep=' + encodeURIComponent(pattern) +
      '&path=' + encodeURIComponent(path || '');
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }

  // The commands. opts: {say(text, ref), isMine(ctx)} (ref: what the line points at, when it does). isMine says whether a
  // command that came over the bus is this window's to run (default: none
  // is -- every window that registers these runs them for itself only, so a
  // command sent around is not run twice).
  function register(commands, env, opts) {
    const o = opts || {};
    const say = o.say || function () {};
    const mine = o.isMine || function (ctx) { return !(ctx && ctx.remote); };

    commands.register('code.list', function (args, ctx) {
      if (!mine(ctx)) return false;
      const w = env.open(env.sibling('panels/tool/list.html') + '?config=code_editor', mkReq('tezcatl-code-list-'));
      if (!w) say('! code.list ── could not open a new window (the pop-up was blocked)');
      return true;
    });

    commands.register('code.find', function (args, ctx) {
      if (!mine(ctx)) return false;
      const path = normPath(args && args.path);
      if (!path) { say('! code.find ── no path'); return true; }
      return query(env).then(function (list) {
        const hits = find(list, path);
        say(hits.length
          ? 'code.find ' + path + ' ── open (' + hits.map(function (h) { return h.name + (h.dirty ? ' ●' : ''); }).join(', ') + ')'
          : 'code.find ' + path + ' ── no open code_editor has it');
        return hits;
      });
    });

    commands.register('code.goto', function (args, ctx) {
      if (!mine(ctx)) return false;
      const a = args || {};
      const line = num(a.line);
      if (!line) { say('! code.goto ── no line'); return true; }
      if (a.path) return commands.invoke('code.open-at', { path: a.path, line: line, col: a.col }, ctx);
      return query(env).then(function (list) { return lastFocused(env, list); }).then(function (id) {
        if (!id) { say('! code.goto ── no code_editor to go to (pass a path too, or focus a code_editor once)'); return; }
        goto(env, id, line, num(a.col));
        say('code.goto ' + line + (num(a.col) ? ':' + num(a.col) : ''));
      });
    });

    commands.register('code.grep', function (args, ctx) {
      if (!mine(ctx)) return false;
      const a = args || {};
      const pattern = typeof a.pattern === 'string' ? a.pattern : '';
      if (!pattern) { say('! code.grep ── no pattern'); return true; }
      const w = env.open(grepUrl(env, pattern, a.path ? normPath(a.path) : ''), mkReq('tezcatl-grep-'));
      say(w ? 'grep ' + JSON.stringify(pattern) + ' in ' + (a.path ? normPath(a.path) : '/') + ' ── to the list (Enter opens)'
            : '! code.grep ── could not open a new window (the pop-up was blocked)');
      return true;
    });

    commands.register('code.open-at', function (args, ctx) {
      if (!mine(ctx)) return false;
      const a = args || {};
      const t = typeof a.path === 'string' && !a.line ? parseTarget(a.path) : { path: normPath(a.path), line: num(a.line), col: num(a.col) };
      if (t.error || !t.path) { say('! code.open-at ── ' + (t.error || 'no path')); return true; }
      return openAt(env, t).then(function (r) { say((r.ok ? '' : '! ') + r.message, r.ok ? r.ref : null); return r; });
    });
  }

  // the env of a page
  // A panel inside a skin that opens files its own way (the frame: a code_editor
  // panel, skin add -- window.tezcatlSkin.openNew) opens them there, not in a
  // new window: a code_editor's :LspDef, a cross-file :LspRename, file_changes ...
  // A window such a skin opened (the grep list, :LspRefs) opens them in that
  // skin too: its opener, or the opener's parent when a panel opened it --
  // asked at each open, as the opener may have closed since (then a new window).
  // (what the skin registered, through the skin port -- lib/core/panel-frame.js)
  function skinOf(w) {
    try {
      if (!w || w.closed) return null;
      if (w.tezcatlSkin) return w.tezcatlSkin;
      if (w.parent && w.parent !== w && w.parent.tezcatlSkin) return w.parent.tezcatlSkin;
    } catch (_) {}
    return null;
  }
  function pageEnv(root) {
    const T = root.Tezcatl || {};
    const port = T.skinPort || { of: skinOf, inSkin: function (w) { try { return !!(w.parent && w.parent !== w); } catch (_) { return false; } } };
    const skin = port.inSkin(root) ? port.of(root) : null;
    // the skin of the window that opened this one (a list a skin, or a panel of it, opened)
    function openerSkin() { try { return port.ofOpener ? port.ofOpener(root) : skinOf(root.opener); } catch (_) { return null; } }
    const env = {
      bus: T.bus,
      open: function (url, name) { return typeof root.open === 'function' ? root.open(url, name) : null; },
      sibling: function (rel) { return T.config && T.config.sibling ? T.config.sibling(rel) : rel; },
      setTimeout: function (fn, ms) { return root.setTimeout(fn, ms); },
    };
    if (skin && typeof skin.openNew === 'function') env.openNew = function (t) { return skin.openNew(t); };
    else if (openerSkin()) {
      env.openNew = function (t) {
        const s = openerSkin();
        return s && typeof s.openNew === 'function' ? s.openNew(t) : openNew(env, t);
      };
    }
    return env;
  }

  // the code_editor that has `path` open, opening it when none has (openAt, no line)
  // -> Promise<{ok, id, message}>; the id is looked up again after opening
  function ensureOpen(env, path) {
    return openAt(env, { path: path, line: null, col: null }).then(function (r) {
      if (r && r.id) return { ok: true, id: r.id, message: r.message };
      if (!r || !r.ok) return { ok: false, id: null, message: (r && r.message) || path };
      let tries = 0;
      function look() {
        return query(env).then(function (list) {
          const hit = find(list, path)[0];
          if (hit) return { ok: true, id: hit.id, message: r.message };
          tries += 1;
          if (tries >= 10) return { ok: false, id: null, message: path + ' ── cannot find the code_editor that opened it' };
          return new Promise(function (res) { env.setTimeout(res, 300); }).then(look);
        });
      }
      return look();
    });
  }

  return {
    parseTarget: parseTarget, parseGrep: parseGrep, grepUrl: grepUrl, query: query, find: find, reveal: reveal, goto: goto,
    openNew: openNew, openAt: openAt, ensureOpen: ensureOpen, lastFocused: lastFocused, register: register, pageEnv: pageEnv,
  };
});
