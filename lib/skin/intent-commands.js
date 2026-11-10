// lib/skin/intent-commands.js -- the `intent ...` line of a skin's input form
// (D-run-table, stage 3): an intent run from a line -- a run_table's row can
// call one with its variables in.
//   intent <id> [<name>=<value> ...]   run the intent with these arguments
//                                      (intent.run -> intent.ran, through the
//                                      input panel: it runs the intents)
//   intent! <id> ...                   the same for an intent that discards
//                                      (D-discard-confirm): a person wrote the !
//   table <id> [<name>=<value> ...]    the same, its answer (result.table) in a
//                                      decode_emacs of its own: the one the
//                                      frame added for that intent, else a new
//                                      one (D-decode-emacs)
// A value is up to the next blank, or a JSON string ("a b.js"). What came of it
// is said: `intent ── <id> ok <the answer, short>`, or a `! ` line -- so that a
// run_table's keys see a failure.
(function (root) {
  'use strict';

  const USAGE = 'intent <id> [<name>=<value> ...] (a value with a blank: name="a b")';
  const TABLE_USAGE = 'table <intent> [<name>=<value> ...] (a value with a blank: name="a b")';
  const ANSWER_MS = 6000;
  const SHORT = 160;

  // "a=1 b=\"x y\"" -> {args} | {error}
  function parseArgs(text) {
    const args = {};
    let s = String(text == null ? '' : text).trim();
    while (s) {
      const m = /^([A-Za-z_][A-Za-z0-9_-]*)=/.exec(s);
      if (!m) return { error: 'an argument is <name>=<value>, not "' + s.split(/\s+/)[0] + '"' };
      s = s.slice(m[0].length);
      let v;
      if (s.charAt(0) === '"') {
        const q = /^"(?:[^"\\]|\\.)*"/.exec(s);
        if (!q) return { error: 'the value of ' + m[1] + ' is not a closed "string"' };
        try { v = JSON.parse(q[0]); } catch (_) { return { error: 'the value of ' + m[1] + ' is not a JSON string' }; }
        s = s.slice(q[0].length);
        if (s && !/^\s/.test(s)) return { error: 'a blank after the value of ' + m[1] };
      } else {
        const w = /^\S*/.exec(s)[0];
        v = w;
        s = s.slice(w.length);
      }
      args[m[1]] = v;
      s = s.trim();
    }
    return { args };
  }

  // a line -> null (not its) | {id, args, table, confirmed} | {error}
  function parse(line) {
    const m = /^\s*(intent!|intent|table)(?:\s+([\s\S]*))?$/.exec(String(line == null ? '' : line));
    if (!m) return null;
    const table = m[1] === 'table';
    const confirmed = m[1] === 'intent!';
    const rest = (m[2] || '').trim();
    const w = /^(\S+)(?:\s+([\s\S]*))?$/.exec(rest);
    if (!w || w[1].indexOf('=') >= 0) return { error: table ? TABLE_USAGE : USAGE };
    const a = parseArgs(w[2] || '');
    if (a.error) return { error: a.error };
    return { id: w[1], args: a.args, table: table, confirmed: confirmed };
  }

  function short(v) {
    if (v == null) return '';
    const t = typeof v === 'string' ? v : JSON.stringify(v);
    return t.length > SHORT ? t.slice(0, SHORT) + '…' : t;
  }

  // h: { bus: {post, on}, recv(text, cls), [wait(fn, ms)],
  //      [table(id, args) -> true | false: shown in a decode_emacs of the frame] }
  function wire(h) {
    const wait = h.wait || function (fn, ms) { return setTimeout(fn, ms); };
    let seq = 0;
    const asking = {};
    h.bus.on('intent.ran', function (p) {
      const a = p && asking[p.req];
      if (!a) return;
      delete asking[p.req];
      if (p.ok) h.recv('intent ── ' + a.id + ' ok' + (p.payload != null ? ' ' + short(p.payload) : ''));
      else h.recv('! intent ── ' + a.id + ': ' + (p.error || 'failed'), 'err');
    });
    // a later intent's process started (D-intent-later): answered when it ends, no time limit
    h.bus.on('intent.took', function (p) {
      const a = p && asking[p.req];
      if (!a || a.running) return;
      a.running = true;
      h.recv('intent ── ' + a.id + ' running (answered when it ends)');
    });
    function handle(line) {
      const c = parse(line);
      if (!c) return false;
      if (c.error) { h.recv('! ' + c.error, 'err'); return false; }
      if (c.table) {
        if (!h.table) { h.recv('! table ── only in a frame', 'err'); return false; }
        return h.table(c.id, c.args);
      }
      const req = 'it-' + Date.now().toString(36) + '-' + (++seq);
      asking[req] = { id: c.id };
      const run = { req: req, id: c.id, args: c.args };
      if (c.confirmed) run.confirmed = true;
      h.bus.post('intent.run', run);
      wait(function () {
        if (!asking[req] || asking[req].running) return;
        delete asking[req];
        h.recv('! intent ── no answer for ' + c.id + ' ── is an input panel open (it runs the intents)?', 'err');
      }, ANSWER_MS);
      return true;
    }
    return { handle: handle };
  }

  const api = { USAGE, TABLE_USAGE, parseArgs, parse, wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).intentCommands = api;
})(typeof self !== 'undefined' ? self : this);
