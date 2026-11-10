(function (root) {
  'use strict';
  const Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  const kbd = Tezcatl.kbd;
  // the Elisp a form becomes, and the transcript's text: their own files
  const NODE = typeof module === 'object' && module.exports;
  const E = NODE ? require('./elisp.js') : Tezcatl.elisp;
  const RT = NODE ? require('./resolver-trace.js') : Tezcatl.resolverTrace;
  // an intent's result.table (D-decode-emacs): checked here, used by the decode_emacs panel
  const DT = NODE ? require('./decode-table.js') : Tezcatl.decodeTable;
  // an intent's `sql` (D-db-session): its values for the ?s, and its check
  const SQL = NODE ? require('../db/sql.js') : Tezcatl.sql;
  const buildEval = E.buildEval, wrap = E.wrap, fill = E.fill, elispLit = E.elispLit;
  function renderTrace(entries) { return RT.renderTrace(entries, TRACE_MAX); }

  const TIMEOUT_MS = 3000;
  // an intent's statement: database window 1 says it took it within this, else it is not open
  const DB_TOOK_MS = 1500;
  const NEED_DB = 'This operation requires database window 1, logged in: `database id=1`';
  // an intent with discards (D-discard-confirm) runs only when confirmed: a table key
  // pressed twice, or `intent! <id>` written by a person
  const NEED_CONFIRM = 'discards what cannot be had back: press its key twice in the table, or write intent! <id> in the frame';
  const REFRESH_DEBOUNCE_MS = 250;
  const UPLINK_POLL_MS = 2000;

  const tabId = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let seq = 0;

  let io = { send: function () { return false; }, log: function () {} };

  let bindings = null;
  let bindingsById = null;
  let intents = null;
  let dialect = 'emacs';
  const pending = {};
  const refreshInFlight = {};
  const localBackends = {};

  const lastResults = {};
  function getLastResult(id) { return lastResults[id]; }

  const TRACE_MAX = 50;
  let trace = [];
  let traceN = 0;
  let lastCorr = null;

  function pushTrace(e) {
    traceN += 1;
    e.n = traceN;
    e.t0 = e.t0 || Date.now();
    trace.push(e);
    if (trace.length > TRACE_MAX * 4) trace = trace.slice(-TRACE_MAX * 2);
    emitTrace();
    return e;
  }

  function emitTrace() {
    if (!Tezcatl.bus || typeof Tezcatl.bus.post !== 'function') return;
    Tezcatl.bus.post('resolver.trace', {
      text: renderTrace(trace),
      entries: trace.slice(-TRACE_MAX),
    });
  }

  function summarize(payload) {
    if (Array.isArray(payload)) {
      return '[' + payload.length + '] ' + short(JSON.stringify(payload));
    }
    return short(JSON.stringify(payload));
  }

  let uplinkAlive = true;
  let windowsUrl = null;


  function load() {
    return Tezcatl.config.load()
      .then(function (cfg) {
        const c0 = (cfg && cfg.connections && cfg.connections[0]) || {};
        if (typeof c0.dialect === 'string' && c0.dialect) dialect = c0.dialect;
        windowsUrl = deriveWindowsUrl(c0.url);
        return Promise.all([
          fetchJson(Tezcatl.config.sibling('command/binding_map.json')),
          // the dialect's index, then one file per extension
          fetchJson(Tezcatl.config.sibling('command/dialects/' + dialect + '/intent_map.json')).then(function (index) {
            const names = Array.isArray(index && index.extensions) ? index.extensions : [];
            return Promise.all(names.map(function (n) {
              return fetchJson(Tezcatl.config.sibling('command/dialects/' + dialect + '/extensions/' + n + '.json'))
                .catch(function (e) { return { extension: n, intents: [], error: String(e && e.message || e) }; });
            })).then(function (docs) { return mergeExtensions(index, docs); });
          }),
          // Dialect-independent intents (browser.backend only, never reach
          // Emacs) live outside dialects/ so they are available regardless of
          // which dialect is configured. Optional: a project without this
          // file just gets none.
          fetchJson(Tezcatl.config.sibling('command/intents/browser.json'))
            .catch(function () { return { intents: [] }; }),
          // the database's (sql: run on database window 1, D-db-session); optional too
          fetchJson(Tezcatl.config.sibling('command/intents/db.json'))
            .catch(function () { return { intents: [] }; }),
        ]);
      })
      .then(function (triple) {
        const merged = {
          intents: [].concat(triple[1].intents || [], triple[2].intents || [], triple[3].intents || []),
        };
        const problems = (triple[1].problems || []).concat(build(triple[0], merged));
        startUplinkPoll();
        return { dialect: dialect, bindings: Object.keys(bindingsById).length,
                 intents: Object.keys(intents).length, problems: problems,
                 uplinkTracked: !!windowsUrl };
      });
  }

  function deriveWindowsUrl(connUrl) {
    if (typeof connUrl !== 'string') return null;
    try {
      const u = new URL(connUrl);
      u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
      u.pathname = '/windows';
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (_) {
      return null;
    }
  }

  function startUplinkPoll() {
    if (!windowsUrl) return;
    const tick = function () {
      fetch(windowsUrl, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (body) {
          if (body && typeof body.uplink === 'boolean') uplinkAlive = body.uplink;
        })
        .catch(function () { })
        .then(function () { setTimeout(tick, UPLINK_POLL_MS); });
    };
    tick();
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
      return r.json();
    });
  }

  // A dialect's intents: its index (command/dialects/<dialect>/intent_map.json,
  // {dialect, extensions: [name...]}) and one file per Emacs extension
  // (extensions/<name>.json, {extension, intents}) -- where an extension's
  // Elisp forms live, added one file at a time. An intent's
  // id is <extension>.<name>. -> {intents, problems}. An index that still has
  // intents[] itself (the form before) is read as it is.
  function mergeExtensions(index, docs) {
    const out = { intents: [].concat((index && index.intents) || []), problems: [] };
    (docs || []).forEach(function (doc, i) {
      const name = (doc && doc.extension) || (index.extensions || [])[i] || '?';
      if (doc && doc.error) { out.problems.push('extension "' + name + '": ' + doc.error); return; }
      (doc && Array.isArray(doc.intents) ? doc.intents : []).forEach(function (it) {
        if (it && typeof it.id === 'string' && it.id.split('.')[0] !== name) {
          out.problems.push('intent "' + it.id + '" is in extensions/' + name + '.json -- its id should start with "' + name + '."');
        }
        out.intents.push(it);
      });
    });
    return out;
  }

  function build(bindingArr, intentDoc) {
    if (!Array.isArray(bindingArr)) throw new Error('binding_map.json: not an array');
    if (!intentDoc || !Array.isArray(intentDoc.intents)) {
      throw new Error('intent_map.json: missing intents[]');
    }
    const problems = [];

    intents = {};
    intentDoc.intents.forEach(function (it) {
      if (!it || typeof it.id !== 'string') { problems.push('intent with no id, skipped'); return; }
      if (intents[it.id]) { problems.push('duplicate intent id "' + it.id + '", later one wins'); }
      const em = it.emacs || {};
      if (em.kind === 'eval' && typeof em.form !== 'string') {
        problems.push('intent "' + it.id + '": emacs.kind "eval" needs a string emacs.form, skipped');
        return;
      }
      if (it.sql != null) {
        const why = SQL ? SQL.check(it.sql) : 'lib/db/sql.js is not loaded';
        if (why) { problems.push('intent "' + it.id + '": ' + why + ', skipped'); return; }
      }
      // emacs.later (D-intent-later): the form returns a process, answered when it ends
      if (em.later != null && (em.later !== true || em.kind !== 'eval')) {
        problems.push('intent "' + it.id + '": emacs.later is true, on an emacs.kind "eval" only, skipped');
        return;
      }
      const cmds = it.browser && it.browser.post && it.browser.post.commands;
      if (cmds != null && (!Array.isArray(cmds) || cmds.some(function (c) { return !c || typeof c.name !== 'string' || !c.name; }))) {
        problems.push('intent "' + it.id + '": browser.post.commands: a list of {name, args}, skipped');
        return;
      }
      if (it.discards != null && it.discards !== true) {
        problems.push('intent "' + it.id + '": discards is true or absent, skipped');
        return;
      }
      if (em.kind === 'keys' && typeof em.sequence !== 'string') {
        problems.push('intent "' + it.id + '": emacs.kind "keys" needs a string emacs.sequence, skipped');
        return;
      }
      // a result.table that cannot be used is dropped (the intent still runs; its answer goes to the log only)
      if (it.result && it.result.table != null) {
        const why = DT ? DT.check(it.result.table) : 'lib/vent/decode-table.js is not loaded';
        if (why) {
          problems.push('intent "' + it.id + '": ' + why + ' ── its answer is not made a table');
          it = Object.assign({}, it, { result: Object.assign({}, it.result, { table: undefined }) });
        }
      }
      // a result.book that cannot be used is dropped too (D-run-table: run from refuses the intent)
      if (it.result && it.result.book != null) {
        const why = DT ? DT.checkBook(it.result.book) : 'lib/vent/decode-table.js is not loaded';
        if (why) {
          problems.push('intent "' + it.id + '": ' + why + ' ── its answer is not made a book');
          it = Object.assign({}, it, { result: Object.assign({}, it.result, { book: undefined }) });
        }
      }
      intents[it.id] = it;
    });

    // a table key that calls an intent which discards must ask for the second press
    Object.keys(intents).forEach(function (id) {
      const t = intents[id].result && intents[id].result.table;
      const ks = (t && t.keys) || {};
      Object.keys(ks).forEach(function (k) {
        const a = ks[k] || {};
        const target = a.intent && intents[a.intent];
        if (target && target.discards && !a.confirm) problems.push('intent "' + id + '": table key ' + k + ' calls ' + a.intent + ', which discards, without a confirm');
      });
    });

    bindings = {};
    bindingsById = {};
    bindingArr.forEach(function (b) {
      if (!b || typeof b.id !== 'string') { problems.push('binding with no id, skipped'); return; }
      if (b.disabled) return;
      if (!intents[b.id]) { problems.push('binding -> unknown intent "' + b.id + '", skipped'); return; }
      if (bindingsById[b.id]) { problems.push('duplicate binding for "' + b.id + '"'); }
      bindingsById[b.id] = b;

      if (typeof b.keys !== 'string' || !b.keys.trim()) return;
      const parsed = kbd.parse(b.keys);
      if (parsed.error) { problems.push('binding "' + b.id + '" keys "' + b.keys + '": ' + parsed.error); return; }
      const ck = canonKey(parsed.events);
      if (bindings[ck]) { problems.push('two bindings share keys "' + b.keys + '"'); }
      bindings[ck] = b;
    });

    Object.keys(intents).forEach(function (id) {
      const refs = refreshIds(intents[id]);
      refs.forEach(function (rid) {
        if (rid === id) problems.push('intent "' + id + '" refreshes itself');
        const back = intents[rid] && refreshIds(intents[rid]);
        if (back && back.indexOf(id) !== -1) {
          problems.push('refresh cycle: "' + id + '" <-> "' + rid + '"');
        }
      });
    });

    return problems;
  }

  // browser.post.commands: tezcatl-commands run once the intent answered ok
  // (check.update-all after a checkout: the frame used last takes it)
  function postCommands(intent) {
    const post = intent && intent.browser && intent.browser.post;
    const list = (post && post.commands) || [];
    if (!list.length || !Tezcatl.bus || typeof Tezcatl.bus.post !== 'function') return;
    list.forEach(function (c) {
      io.log('in-meta', '… command ' + c.name);
      Tezcatl.bus.post('command', { name: c.name, args: c.args || {}, req: 'ic' + Date.now().toString(36) + '-' + (++seq) });
    });
  }

  function refreshIds(intent) {
    const post = intent && intent.browser && intent.browser.post;
    const list = (post && post.refresh) || [];
    return list.map(function (r) { return r && r.id; }).filter(Boolean);
  }


  function canonKey(events) {
    return events.map(function (e) {
      return e.modifiers.slice().sort().join(',') + '|' + e.key;
    }).join(' ');
  }

  function lookup(typedText) {
    const text = String(typedText || '').trim();
    if (!text || !bindingsById) return null;

    if (bindingsById[text]) {
      return { binding: bindingsById[text], intent: intents[text] };
    }

    const parsed = kbd.parse(text);
    if (parsed.error) return null;
    const b = bindings[canonKey(parsed.events)];
    if (!b) return null;
    return { binding: b, intent: intents[b.id] };
  }


  function attach(newIo) { io = newIo; }

  function registerLocal(name, fn) {
    if (typeof name === 'string' && typeof fn === 'function') localBackends[name] = fn;
  }

  function dispatch(intent, args, ctx, onSettle) {
    if (!intent) return false;
    if (intent.discards && !(ctx && ctx.confirmed === true)) {
      const why = intent.id + ' ' + NEED_CONFIRM;
      io.log('out-drop', '✗ ' + why);
      pushTrace({ id: intent.id, kind: 'refused', args: args || {}, corr: null, status: 'err', errText: why });
      if (!onSettle) return false;
      onSettle('err', why);
      return true;
    }
    const em = intent.emacs || {};
    const br = intent.browser || {};

    // browser.backend intents never touch Emacs -- dispatched straight to a
    // locally registered function (Tezcatl.resolver.registerLocal) instead of
    // the emacs-vent uplink. Checked before the uplinkAlive gate below: a
    // local action must keep working even while Emacs is unreachable.
    if (br.backend) {
      const fn = localBackends[br.backend];
      if (!fn) {
        io.log('out-drop', 'intent "' + intent.id + '": no local backend registered for "' + br.backend + '"');
        return false;
      }
      io.log('out-sent', '→ ' + intent.id + '  (local: ' + br.backend + ')');
      pushTrace({
        id: intent.id, kind: 'local', args: args || {}, backend: br.backend,
        corr: null, status: 'sent',
      });
      try {
        // report(kind, text): a local action that finishes later (or fails)
        // says so in the same log as this dispatch
        fn(args || {}, ctx, intent, function (kind, text) { io.log(kind, text); });
      } catch (e) {
        io.log('out-fail', '✗ ' + intent.id + '  local backend threw: ' + (e && e.message || e));
        return false;
      }
      return true;
    }

    // sql intents never touch Emacs either: database window 1 runs them (D-db-session)
    if (intent.sql) return dispatchSql(intent, args, onSettle);

    if (!uplinkAlive) {
      io.log('out-fail', '✗ ' + intent.id + '  emacs-vent uplink is down (GET /windows) -- not sent');
      return false;
    }

    if (em.kind === 'keys') {
      const r = kbd.parse(em.sequence || '');
      if (r.error) { io.log('out-drop', 'intent "' + intent.id + '": bad emacs.sequence: ' + r.error); return false; }
      const ok = io.send(Tezcatl.protocol.encodeInput(r.events));
      io.log(ok ? 'out-sent' : 'out-fail',
        (ok ? '→ ' : '✗ ') + intent.id + '  keys ' + kbd.describe(r.events) + '  (fire-and-forget)');
      pushTrace({
        id: intent.id, kind: 'keys', args: args || {}, keys: em.sequence,
        corr: null, status: ok ? 'sent' : 'err', errText: ok ? null : 'not connected',
      });
      return ok;
    }

    if (em.kind === 'eval') {
      const corr = tabId + '-' + (++seq);
      let built;
      try {
        built = buildEval(intent, args || {}, ctx, corr);
      } catch (e) {
        io.log('out-drop', 'intent "' + intent.id + '": ' + (e && e.message || e));
        return false;
      }
      const ok = io.send(Tezcatl.protocol.encodeInput(built.events));
      if (!ok) { io.log('out-fail', '✗ ' + intent.id + '  (not connected)'); return false; }
      io.log('out-sent', '→ ' + intent.id + '  M-: ' + short(built.form) + '   [' + corr + ']');
      const te = pushTrace({
        id: intent.id, kind: 'eval', args: args || {}, form: built.form,
        corr: corr, status: 'sending', refresh: refreshIds(intent),
      });
      lastCorr = corr;
      pending[corr] = {
        intent: intent,
        args: args || {},
        onSettle: onSettle,
        traceEntry: te,
        timer: setTimeout(function () { settle(corr, 'err', '"timeout"', true); }, TIMEOUT_MS),
      };
      return true;
    }

    io.log('out-drop', 'intent "' + intent.id + '": emacs.kind "' + em.kind + '" not supported in v0');
    return false;
  }


  // -- an intent's statement, on database window 1 (D-db-session) ------------------
  // db.run {req, intent, statement, args, load} to every window (load: the
  // books window 1 makes temporary tables first, sql.load); window 1's db_bar
  // answers db.took {req} at once when it sends it, then db.ran {req, ok,
  // answer | error}. No db.took within DB_TOOK_MS: window 1 is not open. The
  // answer is the relay's as it is ({columns, rows, num_rows, truncated} | {num_rows,
  // last_insert_id}), so a result.table reads it with from "rows", rows "arrays".
  let dbHeard = false;
  function hearDb() {
    if (dbHeard || !Tezcatl.bus || typeof Tezcatl.bus.on !== 'function') return;
    dbHeard = true;
    Tezcatl.bus.on('db.took', function (p) {
      const w = p && pending[p.req];
      if (!w || !w.sql) return;
      if (w.timer) clearTimeout(w.timer);
      w.timer = null;
      if (w.traceEntry) { w.traceEntry.status = 'waiting'; emitTrace(); }
    });
    Tezcatl.bus.on('db.ran', function (p) {
      const w = p && pending[p.req];
      if (!w || !w.sql) return;
      if (p.ok) settle(p.req, 'ok', JSON.stringify(p.answer == null ? null : p.answer), false);
      else settle(p.req, 'err', JSON.stringify(String(p.error || 'refused')), false);
    });
  }

  function dispatchSql(intent, args, onSettle) {
    let values, loads;
    try { values = SQL.intentArgs(intent, args || {}); loads = SQL.intentLoads(intent, args || {}); } catch (e) {
      // nothing goes to window 1; the asker hears why (not "not sent", which would point at emacs-vent)
      const why = 'intent "' + intent.id + '": ' + (e && e.message || e);
      io.log('out-drop', why);
      if (!onSettle) return false;
      onSettle('err', why);
      return true;
    }
    if (!Tezcatl.bus || typeof Tezcatl.bus.post !== 'function') {
      io.log('out-drop', 'intent "' + intent.id + '": no bus to reach database window 1');
      return false;
    }
    hearDb();
    const corr = tabId + '-' + (++seq);
    io.log('out-sent', '→ ' + intent.id + '  sql ' + short(intent.sql.statement) + '   [' + corr + ']');
    const te = pushTrace({
      id: intent.id, kind: 'sql', args: args || {}, statement: intent.sql.statement, values: values, load: loads,
      corr: corr, status: 'sending', refresh: refreshIds(intent),
    });
    pending[corr] = {
      intent: intent,
      args: args || {},
      onSettle: onSettle,
      traceEntry: te,
      sql: true,
      timer: setTimeout(function () { settle(corr, 'err', JSON.stringify(NEED_DB), false); }, DB_TOOK_MS),
    };
    Tezcatl.bus.post('db.run', { req: corr, intent: intent.id, statement: intent.sql.statement, args: values, load: loads });
    return true;
  }

  const TEZ = /^tez:(\S+) (ok|err|took) ([\s\S]*)$/;

  function onInbound(msg) {
    if (!msg || msg.kind !== 'event' || msg.type !== 'message' ||
        typeof msg.content !== 'string') return;
    const m = TEZ.exec(msg.content);
    if (!m) return;
    if (m[2] === 'took') took(m[1], m[3]);
    else settle(m[1], m[2], m[3], false);
  }

  // tez:<corr> took <pid> (D-intent-later): its process runs; no time limit from
  // now (the answer comes when it ends), the asker told once (onSettle 'took')
  function took(corr, payloadJson) {
    const p = pending[corr];
    if (!p) { io.log('in-meta', 'late tez: line [' + corr + '] took (already settled or unknown) -- ignored'); return; }
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    let pid;
    try { pid = JSON.parse(payloadJson); } catch (_) { pid = payloadJson; }
    if (p.traceEntry) { p.traceEntry.status = 'running'; emitTrace(); }
    io.log('in-meta', '… ' + p.intent.id + ' [' + corr + '] running (process ' + pid + '): answered when it ends');
    if (p.onSettle) p.onSettle('took', pid);
  }

  function settle(corr, status, payloadJson, fromTimeout) {
    const p = pending[corr];
    if (!p) {
      io.log('in-meta', 'late tez: line [' + corr + '] ' + status + ' (already settled or unknown) -- ignored');
      return;
    }
    delete pending[corr];
    if (p.timer) clearTimeout(p.timer);

    let payload;
    try { payload = JSON.parse(payloadJson); } catch (_) { payload = payloadJson; }

    const te = p.traceEntry;
    if (te) te.dt = (Date.now() - te.t0) / 1000;

    if (status === 'err') {
      if (te) {
        te.status = fromTimeout ? 'timeout' : 'err';
        te.errText = (typeof payload === 'string' ? payload : payloadJson);
        emitTrace();
      }
      io.log('out-fail', '✗ ' + p.intent.id + ' [' + corr + '] err: ' +
        (typeof payload === 'string' ? payload : payloadJson) +
        (fromTimeout ? '  (no tez: line within ' + (TIMEOUT_MS / 1000) + 's)' : ''));
      if (p.onSettle) p.onSettle('err', payload);
      return;
    }

    const shape = (p.intent.result && p.intent.result.shape) || 'none';
    io.log('in-ev', '✓ ' + p.intent.id + ' [' + corr + '] ok  ' +
      (shape === 'none' ? '(no payload)' : render(payload)));
    lastResults[p.intent.id] = payload;
    if (te) { te.status = 'ok'; te.summary = summarize(payload); emitTrace(); }
    if (p.onSettle) p.onSettle('ok', payload);
    postCommands(p.intent);
    // an answer the intent says how to make a table of: to the decode_emacs panels
    if (p.intent.result && p.intent.result.table && Tezcatl.bus && typeof Tezcatl.bus.post === 'function') {
      Tezcatl.bus.post('intent.result', { id: p.intent.id, corr: corr, args: p.args || {}, payload: payload, table: p.intent.result.table });
    }

    refreshIds(p.intent).forEach(function (rid) {
      const rit = intents[rid];
      if (!rit) { io.log('in-meta', 'refresh: unknown intent "' + rid + '"'); return; }
      const now = Date.now();
      if (refreshInFlight[rid] && now - refreshInFlight[rid] < REFRESH_DEBOUNCE_MS) return;
      refreshInFlight[rid] = now;
      io.log('in-meta', '… refresh ' + rid);
      dispatch(rit, {}, null);
    });
  }

  function render(payload) {
    if (Array.isArray(payload)) {
      return '[' + payload.length + ']  ' + short(JSON.stringify(payload));
    }
    return short(JSON.stringify(payload));
  }


  function short(s) {
    s = String(s);
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
  }

  function abort(corr) {
    io.send(Tezcatl.protocol.encodeInput([{ key: 'g', modifiers: ['control'] }]));
    const c = corr || lastCorr;
    const p = c && pending[c];
    if (!p) { io.log('in-meta', '⎋ C-g sent'); return; }
    delete pending[c];
    if (p.timer) clearTimeout(p.timer);
    if (p.traceEntry) {
      p.traceEntry.status = 'aborted';
      p.traceEntry.dt = (Date.now() - p.traceEntry.t0) / 1000;
      emitTrace();
    }
    io.log('in-meta', '⎋ C-g sent [' + c + '] -> aborted');
    if (p.onSettle) p.onSettle('err', 'aborted');
  }


  Tezcatl.resolver = {
    load: load,
    attach: attach,
    registerLocal: registerLocal,
    lookup: lookup,
    dispatch: dispatch,
    onInbound: onInbound,
    getLastResult: getLastResult,
    abort: abort,
    renderTrace: renderTrace,
    _buildEval: buildEval,
    _build: build,
    _intent: function (id) { return intents[id]; },
    _wrap: wrap,
    _fill: fill,
    _elispLit: elispLit,
    _trace: function () { return trace.slice(); },
    _mergeExtensions: mergeExtensions,
    NEED_DB: NEED_DB,
    NEED_CONFIRM: NEED_CONFIRM,
  };
  if (typeof module === 'object' && module.exports) module.exports = Tezcatl.resolver;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
