(function (root) {
  'use strict';
  const Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  // "M-x compile" / "M-x nix compile" -- a browser.backend intent (see
  // intents/browser.json) registered with Tezcatl.resolver.registerLocal.
  // Never touches Emacs: it reads the last-focused code_*.html panel (path +
  // language, via cursor.html's cross-window focusHistory, so this works
  // regardless of which skin -- or no skin at all -- either panel lives in),
  // looks up a command in compile.json, and types it into the last-focused
  // xterm.html panel as real keystrokes (bypassing xterm.js's paste/bracketed
  // -paste path, which would not reliably auto-run a multi-line paste).
  //
  // Two lines are sent in sequence, never joined: `cd <dir>` (skipped for
  // scope "file"), then the compile command itself. A disposable
  // "xterm_cutoff" mirror panel (this compile run's own view, since it) is
  // opened before the compile command is sent so its first bytes are not
  // lost -- reused in-place if the enclosing skin already has one
  // (compile.cutoff.open / compile.cutoff.opened), else a plain new tab.
  //
  // The command runs on the file on disk, so unsaved edits are saved first
  // (code.file write {req}, answered by code.saved / code.saveFailed with the
  // same req -- an earlier save's answer does not count); a save that
  // fails -- a conflict, say -- stops the run. What went wrong goes to the
  // input panel's log (the resolver's `report`), not only the console.

  const OPEN_CLAIM_TIMEOUT_MS = 200;
  const READY_TIMEOUT_MS = 6000;
  const CURSOR_TIMEOUT_MS = 1000;
  const CODE_GET_TIMEOUT_MS = 1500;
  const SAVE_TIMEOUT_MS = 10000;

  // ---- pure helpers (exported below for tests; no bus/network/DOM here) --

  function shQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  function joinAbs(rootAbs, rel) {
    const r = String(rootAbs || '').replace(/\/+$/, '');
    if (!rel) return r || '/';
    return r + '/' + String(rel).replace(/^\/+/, '');
  }

  function dirnameRel(relPath) {
    const s = String(relPath || '');
    const i = s.lastIndexOf('/');
    return i === -1 ? '' : s.slice(0, i);
  }

  function resolveArgv(entry, absPath) {
    return (entry.command || []).map(function (tok) {
      return tok === '{{path}}' ? absPath : tok;
    });
  }

  // ctx: { absRoot, relPath, rootRelDir? } -- rootRelDir only meaningful (and
  // only consulted) for scope "root": the directory (relative to absRoot)
  // where a rootMarker was actually found, from walking upward from the
  // file's own directory. Falls back to the file's own directory if absent
  // (e.g. no marker found before hitting the fs root).
  function planLines(entry, prefix, ctx) {
    const absPath = joinAbs(ctx.absRoot, ctx.relPath);
    let argv = resolveArgv(entry, absPath);
    if (prefix && prefix.length) argv = prefix.concat(argv);
    const runLine = argv.map(shQuote).join(' ');

    let cdDir = null;
    if (entry.scope === 'self') {
      cdDir = dirnameRel(ctx.relPath);
    } else if (entry.scope === 'root') {
      cdDir = ctx.rootRelDir != null ? ctx.rootRelDir : dirnameRel(ctx.relPath);
    }
    // scope "file" (or anything else unrecognised): no cd, run in place.

    const lines = [];
    if (cdDir !== null) lines.push('cd ' + shQuote(joinAbs(ctx.absRoot, cdDir)));
    lines.push(runLine);
    return lines;
  }

  // ---- wiring (bus / fetch / window.open) --------------------------------

  function postAndAwait(postFn, waitType, matchFn, timeoutMs) {
    return new Promise(function (resolve, reject) {
      let done = false;
      const timer = setTimeout(function () {
        if (done) return;
        done = true; off();
        reject(new Error('timeout waiting for "' + waitType + '"'));
      }, timeoutMs);
      var off = Tezcatl.bus.on(waitType, function (payload, meta) {
        if (done || (matchFn && !matchFn(payload, meta))) return;
        done = true; clearTimeout(timer); off();
        resolve({ payload: payload, meta: meta });
      });
      postFn();
    });
  }

  function findTargets() {
    return postAndAwait(function () { Tezcatl.bus.post('cursor.query'); },
      'cursor.state', null, CURSOR_TIMEOUT_MS)
      .then(function (r) {
        const hist = (r.payload && r.payload.focusHistory) || [];
        let code = null, xterm = null;
        for (let i = hist.length - 1; i >= 0; i--) {
          if (!code && hist[i].role === 'code') code = hist[i].id;
          if (!xterm && hist[i].role === 'xterm') xterm = hist[i].id;
          if (code && xterm) break;
        }
        return { code: code, xterm: xterm };
      }, function () { return { code: null, xterm: null }; });
  }

  function getCodeInfo(codeId) {
    return postAndAwait(
      function () { Tezcatl.bus.post('code.get', {}, { to: codeId }); },
      'code.text',
      function (payload, meta) { return !!(meta && meta.from && meta.from.id === codeId); },
      CODE_GET_TIMEOUT_MS,
    ).then(function (r) { return r.payload; });
  }

  // read on every compile.run (a person's action, rare): an edit of
  // compile.json -- or a read that failed once -- needs no reload of the
  // input panel (it was read once and kept, failure too)
  function ensureConfig() {
    return fetch(Tezcatl.config.sibling('compile.json'), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('compile.json: HTTP ' + r.status);
        return r.json();
      });
  }

  function fsBaseUrl() {
    return Tezcatl.config.load().then(function (cfg) {
      const u = (cfg && cfg.connections && cfg.connections[0] && cfg.connections[0].url) || null;
      if (!u) throw new Error('config.json: no connections[0].url');
      const x = new URL(u);
      return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host;
    });
  }

  function fetchFsDir(fsBase, relDir) {
    return fetch(fsBase + '/fs?path=' + encodeURIComponent(relDir), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('/fs: HTTP ' + r.status);
        return r.json();
      });
  }

  // -> {relDir, root, found}: found is false when no marker was met up to the FS root
  function walkUp(fsBase, relDir, markers) {
    return fetchFsDir(fsBase, relDir).then(function (doc) {
      const names = (doc.entries || []).map(function (e) { return e.name; });
      const hit = markers.some(function (m) { return names.indexOf(m) !== -1; });
      if (hit || relDir === '') return { relDir: relDir, root: doc.root, found: hit };
      return walkUp(fsBase, dirnameRel(relDir), markers);
    });
  }

  function resolveCtx(entry, relPath) {
    return fsBaseUrl().then(function (fsBase) {
      if (entry.scope !== 'root') {
        return fetchFsDir(fsBase, '').then(function (doc) {
          return { absRoot: doc.root, relPath: relPath };
        });
      }
      // no marker: the file's own directory (planLines), not the FS root
      return walkUp(fsBase, dirnameRel(relPath), entry.rootMarkers || []).then(function (w) {
        return { absRoot: w.root, relPath: relPath, rootRelDir: w.found ? w.relDir : null };
      });
    });
  }

  function openCutoff(xtermId, codeId) {
    const reqId = 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    const bus = Tezcatl.bus;
    const claimed = new Promise(function (resolve) {
      let done = false;
      const timer = setTimeout(function () { if (!done) { done = true; off(); resolve(false); } }, OPEN_CLAIM_TIMEOUT_MS);
      var off = bus.on('compile.cutoff.opened', function (payload) {
        if (done || !payload || payload.reqId !== reqId) return;
        done = true; clearTimeout(timer); off(); resolve(true);
      });
      bus.post('compile.cutoff.open', { reqId: reqId, source: xtermId, code: codeId });
    });
    return claimed.then(function (wasClaimed) {
      if (!wasClaimed) {
        root.open(
          Tezcatl.config.sibling('panels/tool/xterm_cutoff.html') +
            '?source=' + encodeURIComponent(xtermId) +
            '&code=' + encodeURIComponent(codeId) +
            '&req=' + encodeURIComponent(reqId),
          'tezcatl-cutoff-' + reqId,
        );
      }
      return postAndAwait(function () {}, 'terminal.ready',
        function (payload) { return !!(payload && payload.req === reqId); },
        READY_TIMEOUT_MS);
    });
  }

  // the code panel saves what it has (code.file write); resolves when it
  // says saved, rejects when it says it could not
  function saveFirst(codeId, name) {
    const bus = Tezcatl.bus;
    return new Promise(function (resolve, reject) {
      let done = false;
      function finish(err) {
        if (done) return;
        done = true; clearTimeout(timer); offOk(); offNg();
        if (err) reject(err); else resolve();
      }
      const timer = setTimeout(function () { finish(new Error('no answer to the save')); }, SAVE_TIMEOUT_MS);
      // our own save's answer (req), not one of a save already under way
      const req = 'cs-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      const ours = function (p) { return p && p.name === name && p.req === req; };
      const offOk = bus.on('code.saved', function (p) { if (ours(p)) finish(null); });
      const offNg = bus.on('code.saveFailed', function (p) {
        if (ours(p)) finish(new Error('could not save (' + (p.code || 'error') + ') ── see the code panel\'s head'));
      });
      bus.post('code.file', { op: 'write', arg: '', bang: false, req: req }, { to: codeId });
    });
  }

  function run(args, ctx, intent, report) {
    const bus = Tezcatl.bus;
    const say = function (kind, msg) {
      if (typeof report === 'function') {
        try { report(kind, msg); } catch (_) {}
      }
    };
    const log = function (msg) {
      try { console.warn('[compile-intent] ' + intent.id + ': ' + msg); } catch (_) {}
      say('out-fail', '✗ ' + intent.id + '  ' + msg);
    };

    ensureConfig()
      .then(function (compileCfg) {
        return findTargets().then(function (targets) {
          if (!targets.code) throw new Error('no code panel was focused recently');
          if (!targets.xterm) throw new Error('no xterm panel was focused recently');

          return getCodeInfo(targets.code).then(function (info) {
            if (!info || !info.path) throw new Error('the code panel has no file open');
            const entry = compileCfg.compilers && compileCfg.compilers[info.language];
            if (!entry) throw new Error('compile.json has no entry for the language "' + info.language + '"');

            const saved = info.dirty
              ? saveFirst(targets.code, info.name).then(function () { say('in-meta', '  saved ' + info.path + ' (it had unsaved changes)'); })
              : Promise.resolve();
            return saved.then(function () { return resolveCtx(entry, info.path); }).then(function (rctx) {
              const lines = planLines(entry, intent.browser && intent.browser.prefix, rctx);
              const cdLine = lines.length > 1 ? lines[0] : null;
              const runLine = lines[lines.length - 1];

              const sendCd = cdLine
                ? Promise.resolve().then(function () { bus.post('terminal.run', { lines: [cdLine] }, { to: targets.xterm }); })
                : Promise.resolve();

              return sendCd
                .then(function () { return openCutoff(targets.xterm, targets.code); })
                .then(function () {
                  bus.post('terminal.run', { lines: [runLine] }, { to: targets.xterm });
                  say('in-meta', '  ' + (cdLine ? cdLine + ' && ' : '') + runLine);
                });
            });
          });
        });
      })
      .catch(function (e) { log('failed: ' + (e && e.message || e)); });
  }

  if (Tezcatl.resolver && typeof Tezcatl.resolver.registerLocal === 'function') {
    Tezcatl.resolver.registerLocal('compile', run);
  }

  Tezcatl.compileIntent = {
    run: run,
    _shQuote: shQuote,
    _joinAbs: joinAbs,
    _dirnameRel: dirnameRel,
    _resolveArgv: resolveArgv,
    _planLines: planLines,
  };
  if (typeof module === 'object' && module.exports) module.exports = Tezcatl.compileIntent;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
