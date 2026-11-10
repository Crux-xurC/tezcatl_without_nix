// lib/skin/run-table-commands.js -- the `run ...` lines of a skin's input form
// (D-run-table):
//   run new[!] <template> [<name>]   a run_table panel added with a book made from
//                                    the template (a name of tasks/run/, or the path
//                                    of a book saved with run save); its book
//                                    (~work/books/run/<name>.json, the name the
//                                    template's when not given) is read when there
//                                    is one of that template, `!` makes it again
//   run from[!] <intent> [<name>] [<arg>=<value> ...]
//                                    a run_table added with a book made from the
//                                    intent's answer (its result.book: the template,
//                                    and which column each item's value goes to); its
//                                    book is read when there is one of that intent,
//                                    `!` asks the intent again
//   run match <record> [<book>]      a run_match panel added: an output_log's record
//                                    (log start) set beside a book, row by row
//   run start                        the run_table meant now sends its rows (R)
//   run stop                         ... every empty status gets `stop` (S)
//   run save[!] <path>               ... its book written to <path> (a template for
//                                    run new); `!` over a file that is there
//   run insert-if <status> #<id>     a line of a run_table's row, sent to tezcatl: when
//                                    the row above it has <status>, a copy of row
//                                    #<id> goes just under it. The run_table taken is
//                                    the one of this skin sending a row now (asked:
//                                    run_table.ask -> run_table.going); none, or more
//                                    than one, is refused. What came of it is said
//                                    here (run_table.inserted): a failure as a `! `
//                                    line, so that the row's keys see it
// The panel meant: the focused one, else the first of this skin. The panel
// says what came of it itself (recv.say).
(function (root) {
  'use strict';

  const USAGE = 'run new[!] <template> [<name>] / run from[!] <intent> [<name>] [<arg>=<value> ...] / run start / run stop / run save[!] <path> / run insert-if <status> #<id> / run match <record> [<book>]';
  // the argument reader of lib/skin/intent-commands.js (loaded before this one)
  function IC() { return typeof module === 'object' && module.exports ? require('./intent-commands.js') : root.Tezcatl.intentCommands; }
  const ASK_MS = 800;

  // a line -> null (not its) | {cmd: 'new', template, name, fresh} | {cmd: 'start' | 'stop'} | {cmd: 'save', path, bang}
  //   | {cmd: 'insert-if', status, from} | {cmd: 'from', intent, name, args, fresh} | {cmd: 'match', log, book} | {error}
  // resolve(arg) -> {path} | {error} (a path from the FS root)
  function parse(line, resolve) {
    const m = /^\s*run(?:\s+([\s\S]*))?$/.exec(String(line == null ? '' : line));
    if (!m) return null;
    const rest = (m[1] || '').trim();
    let w = /^(new!?)\s+(\S+)(?:\s+(\S+))?$/.exec(rest);
    if (w) return { cmd: 'new', template: w[2], name: w[3] || null, fresh: w[1] === 'new!' };
    if (/^new!?(\s|$)/.test(rest)) return { error: 'a template, and a name if you like: ' + USAGE };
    w = /^(from!?)\s+(\S+)(?:\s+([^\s=]+)(?=\s|$))?(?:\s+([\s\S]*))?$/.exec(rest);
    if (w) {
      const a = IC().parseArgs(w[4] || '');
      if (a.error) return { error: a.error };
      return { cmd: 'from', intent: w[2], name: w[3] || null, args: a.args, fresh: w[1] === 'from!' };
    }
    if (/^from!?$/.test(rest)) return { error: 'an intent: ' + USAGE };
    w = /^match\s+(\S+)(?:\s+(\S+))?$/.exec(rest);
    if (w) {
      const r = /^~work(\/|$)/.test(w[1]) ? { path: w[1] } : resolve ? resolve(w[1]) : { path: w[1].replace(/^\/+/, '') };
      if (r.error) return { error: r.error };
      return { cmd: 'match', log: r.path, book: w[2] || null };
    }
    if (/^match$/.test(rest)) return { error: 'a record (an output_log\'s file): ' + USAGE };
    if (rest === 'start' || rest === 'stop') return { cmd: rest };
    w = /^save(!?)\s+(\S+)$/.exec(rest);
    if (w) {
      const r = resolve ? resolve(w[2]) : { path: w[2].replace(/^\/+/, '') };
      if (r.error) return { error: r.error };
      return { cmd: 'save', path: r.path, bang: w[1] === '!' };
    }
    if (/^save!?$/.test(rest)) return { error: 'where to: ' + USAGE };
    w = /^insert-if\s+(\S+)\s+#(\S+)$/.exec(rest);
    if (w) return { cmd: 'insert-if', status: w[1], from: w[2] };
    if (/^insert-if(\s|$)/.test(rest)) return { error: 'a status and the row to copy: run insert-if <status> #<id>' };
    return { error: USAGE };
  }

  // h: { bus: {post, onMine}, recv(text, cls, ref), resolve(arg), add(template, name, fresh, from) -> bool
  //      (from: {intent, args} for run from), match(log, book) -> bool,
  //      panels() -> [{id, bus, place, focused}] (this skin's run_table panels), [wait(fn, ms)] }
  function wire(h) {
    const wait = h.wait || function (fn, ms) { return setTimeout(fn, ms); };
    function err(t, ref) { h.recv('! ' + t, 'err', ref || null); return false; }
    // insert-if: every run_table of this skin is asked whether it is sending a row now
    const asking = {};
    let seq = 0;
    if (h.bus.onMine) {
      h.bus.onMine('run_table.going', function (p, meta) {
        const a = p && asking[p.req];
        if (!a || !a.answers || a.done) return;
        a.answers.push({ bus: meta && meta.from && meta.from.id, going: !!p.going, row: p.row || null, book: p.book || null });
        if (a.answers.length === a.of) a.end();
      });
      h.bus.onMine('run_table.inserted', function (p) {
        if (!p || !asking[p.req] || !asking[p.req].reply) return;
        delete asking[p.req];
        if (p.ok) h.recv('run insert-if ── ' + p.note);
        else err('run insert-if ── ' + (p.error || 'not done'));
      });
    }
    function insertIf(c) {
      const all = h.panels().filter(function (x) { return x.bus; });
      if (!all.length) return err('run insert-if ── no run_table here');
      const req = 'ri' + (++seq);
      const a = asking[req] = { of: all.length, answers: [], done: false };
      a.end = function () {
        if (a.done) return;
        a.done = true;
        delete asking[req];
        const going = a.answers.filter(function (x) { return x.going; });
        if (!going.length) { err('run insert-if ── no run_table is sending a row now (it is a line of a row)'); return; }
        if (going.length > 1) {
          err('run insert-if ── ' + going.length + ' run_tables are sending a row now (' + going.map(function (x) { return x.book + ' #' + x.row; }).join(', ') + ') ── not knowing whose, none is taken');
          return;
        }
        asking[req] = { reply: true };
        h.bus.post('run_table.do', { op: 'insert-if', req: req, status: c.status, from: c.from }, { to: going[0].bus });
      };
      all.forEach(function (x) { h.bus.post('run_table.ask', { req: req }, { to: x.bus }); });
      wait(a.end, ASK_MS);
      return true;
    }
    function run(c) {
      if (c.cmd === 'new') return h.add(c.template, c.name, c.fresh);
      if (c.cmd === 'from') return h.add(null, c.name, c.fresh, { intent: c.intent, args: c.args });
      if (c.cmd === 'insert-if') return insertIf(c);
      if (c.cmd === 'match') return h.match(c.log, c.book);
      const all = h.panels();
      const p = all.filter(function (x) { return x.focused; })[0] || all[0];
      if (!p) return err('run ' + c.cmd + ' ── there is no run_table here (run new <template> adds one)');
      if (!p.bus) return err('run ' + c.cmd + ' ── the run_table at ' + p.place + ' is still loading', { kind: 'panel', id: p.id });
      h.bus.post('run_table.do', { op: c.cmd, path: c.path || null, bang: !!c.bang }, { to: p.bus });
      return true;
    }
    function handle(line) {
      const c = parse(line, h.resolve);
      if (!c) return false;
      if (c.error) return err(c.error);
      return run(c);
    }
    return { handle: handle, run: run };
  }

  const api = { USAGE, parse, wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).runTableCommands = api;
})(typeof self !== 'undefined' ? self : this);
