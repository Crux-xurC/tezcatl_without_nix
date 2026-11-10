// lib/skin/work-commands.js -- the `work ...` and `who` lines of a skin's
// input form: the record of what is running and who is open (the work store,
// lib/core/work-page.js).
//   work list           the record, in a list panel (`work`) -- added here, or focused when it is here
//   work watch          only what is still waited for (`work_watch`)
//   work cancel <n>     stop row n (the pair's cancel, sent to who fired it)
//   who                 the panels open, after a roll call, numbered on the receiving side
// parse is pure; wire(h) does them for a page.
(function (root) {
  'use strict';

  const USAGE = 'work list, watch, cancel <number>';

  // a line -> null (not one of these) | {cmd, ...} | {error}
  function parse(line) {
    const words = String(line == null ? '' : line).trim().split(/\s+/).filter(Boolean);
    if (words[0] === 'who') return words.length === 1 ? { cmd: 'who' } : { error: 'who takes nothing' };
    if (words[0] !== 'work') return null;
    const a = words.slice(2);
    if (words[1] === 'list' || words[1] === 'watch') return a.length ? { error: 'work ' + words[1] + ' takes nothing' } : { cmd: words[1] };
    if (words[1] === 'cancel') {
      return a.length === 1 && /^[1-9]\d*$/.test(a[0]) ? { cmd: 'cancel', n: Number(a[0]) } : { error: 'work cancel <number> (the number of the row in work list)' };
    }
    return { error: USAGE };
  }

  // h: { bus, recv(text, cls, ref), show(panel) -> bool | Promise<bool> (add or focus that panel here),
  //      whoLine(row, i) (lib/core/work-log.js), setTimeout? }
  // -> { handle(line) -> false (not one of these) | Promise<bool> }
  function wire(h) {
    const later = h.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    function err(t) { h.recv('! ' + t, 'err'); return false; }
    function ask(type, payload, answer, ms) {
      return new Promise(function (resolve) {
        const req = 'wk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        let done = false;
        const off = h.bus.on(answer, function (p) {
          if (done || !p || p.req !== req) return;
          done = true; off();
          resolve(p);
        });
        h.bus.post(type, Object.assign({ req: req }, payload || {}));
        later(function () { if (!done) { done = true; off(); resolve(null); } }, ms);
      });
    }
    const NONE = 'the work store did not answer';
    const ROLL_MS = 300;   // how long the panels have to answer the roll call
    function who() {
      return new Promise(function (resolve) {
        const req = 'who' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        let done = false;
        const off = h.bus.on('work.rows', function (p) {
          if (done || !p || p.req !== req) return;
          done = true; off();
          resolve(p);
        });
        h.bus.post('work.who', { req: req });
        later(function () { h.bus.post('work.who.end', { req: req }); }, ROLL_MS);
        later(function () { if (!done) { done = true; off(); resolve(null); } }, ROLL_MS + 800);
      });
    }

    function handle(line) {
      const c = parse(line);
      if (!c) return false;
      if (c.error) return Promise.resolve(err(c.error));
      if (c.cmd === 'list' || c.cmd === 'watch') return Promise.resolve(h.show(c.cmd === 'list' ? 'work' : 'work_watch'));
      if (c.cmd === 'cancel') {
        return ask('work.cancel', { n: c.n }, 'work.cancelled', 800).then(function (p) {
          if (!p) return err('work cancel ── ' + NONE);
          if (!p.ok) return err('work cancel ── ' + p.message);
          h.recv('work cancel ── ' + p.message);
          return true;
        });
      }
      // who: the store calls the roll; when it is over is said from here (this
      // window is the one in front -- the store's may be in the background)
      return who().then(function (p) {
        if (!p) return err('who ── ' + NONE);
        const rows = p.rows || [];
        h.recv(['who ── ' + rows.length + ' open' + (p.lost ? ' (' + p.lost + ' had gone without saying so)' : '')]
          .concat(rows.map(h.whoLine)).join('\n'), null, { kind: 'list', name: 'who', items: rows });
        return true;
      });
    }

    return { handle: handle };
  }

  const api = { USAGE, parse, wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).workCommands = api;
})(typeof self !== 'undefined' ? self : this);
