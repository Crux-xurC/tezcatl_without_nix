// lib/skin/db-commands.js -- the database lines of a skin's input form (D-db-session):
// opening a database window, and its login, exit and cancel from outside it.
//   database [id=1] [tab|window]   a database window (the synthesis database): placed in this
//                                  frame, or a new frame in a tab / window (D-open-page).
//                                  id=1: window 1, the intents' (a second is refused by the relay)
//   db login [<n>] [<account>]     window <n> asks for the password (in its own field; it says
//                                  so on its band); no <n>: the window focused in this frame
//   db exit [<n>]                  window <n> logs out (it stays)
//   db cancel [<n>]                window <n>'s running statement is stopped
//   db list open | close           the list of the windows (db_list, at the bottom of the dock)
//                                  made larger / back to its line
// The password never comes here: a window asks for it in its own masked field.
// A window is reached over the bus wherever it is (another tab too): db.ask /
// db.exit / db.cancel {req, id, [account]}, answered by db.said {req, id, ok, text}
// (lib/db/db-bar-page.js). parse is pure; wire(h) does the lines for a page.
(function (root) {
  'use strict';

  const USAGE = 'database [id=1] [tab|window], db login [<n>] [<account>], db exit [<n>], db cancel [<n>], db list open|close';
  const ACCOUNT = /^[A-Za-z_][\w.$-]{0,79}$/;
  const MODES = ['tab', 'window'];

  function num(w) { return /^[1-9]\d{0,2}$/.test(w) ? Number(w) : null; }

  // a line -> null (not a database line) | {cmd, …} | {error}
  function parse(line) {
    const w = String(line == null ? '' : line).trim().split(/\s+/).filter(Boolean);
    if (w[0] === 'database') {
      let id = null, mode = null;
      for (const x of w.slice(1)) {
        if (x === 'id=1' && id == null) id = 1;
        else if (MODES.indexOf(x) >= 0 && !mode) mode = x;
        else return { error: 'database [id=1] [tab|window] (id=1: window 1, the intents\'; others take a number from 2 by themselves)' };
      }
      return { cmd: 'database', id, mode };
    }
    if (w[0] !== 'db') return null;
    const a = w.slice(2);
    switch (w[1]) {
      case 'login': {
        let n = null, account = null;
        if (a.length && num(a[0]) != null) n = num(a.shift());
        if (a.length === 1 && ACCOUNT.test(a[0])) account = a.shift();
        if (a.length) return { error: 'db login [<n>] [<account>] (the password is asked in window <n> itself)' };
        return { cmd: 'login', n, account };
      }
      case 'exit':
      case 'cancel':
        if (a.length === 0) return { cmd: w[1], n: null };
        if (a.length === 1 && num(a[0]) != null) return { cmd: w[1], n: num(a[0]) };
        return { error: 'db ' + w[1] + ' [<n>]' };
      case 'list':
        if (a.length === 1 && (a[0] === 'open' || a[0] === 'close')) return { cmd: 'list', open: a[0] === 'open' };
        return { error: 'db list open | close' };
      default:
        return { error: USAGE };
    }
  }

  // h: { bus, recv(text, cls, ref), focusedNumber() -> the number of the database window
  //      focused in this frame | null, addSynthesis(name, keep) -> Promise, openPage(page, mode)
  //      -> {ok, message}, listSize(open) -> {message} | {error}, waitMs? }
  // -> { handle(line) -> false (not a database line) | true | Promise<bool> }
  function wire(h) {
    const WAIT = h.waitMs || 1500;
    let seq = 0;
    function err(t) { h.recv('! ' + t, 'err'); return false; }

    // a message to window n; its answer (db.said), or none after a while
    function ask(type, n, extra) {
      const req = 'db' + Date.now().toString(36) + '-' + (++seq);
      return new Promise(function (resolve) {
        let off = null;
        const t = setTimeout(function () { if (off) off(); resolve(null); }, WAIT);
        off = h.bus.on('db.said', function (p) {
          if (!p || p.req !== req) return;
          clearTimeout(t);
          if (off) off();
          resolve(p);
        });
        h.bus.post(type, Object.assign({ req: req, id: n }, extra || {}));
      });
    }

    function run(c) {
      if (c.cmd === 'database') {
        const keep = c.id ? { id: c.id } : null;
        if (!c.mode) return h.addSynthesis('database', keep);
        const page = 'panels/skins/frame.html?synthesis=database' + (c.id ? '&keep.id=' + c.id : '');
        const r = h.openPage(page, c.mode);
        h.recv((r.ok ? '' : '! ') + 'database ── ' + r.message, r.ok ? null : 'err');
        return r.ok;
      }
      if (c.cmd === 'list') {
        const r = h.listSize(c.open);
        if (r.error) return err('db list ' + (c.open ? 'open' : 'close') + ' ── ' + r.error);
        h.recv('db list ' + (c.open ? 'open' : 'close') + ' ── ' + r.message);
        return true;
      }
      const n = c.n || h.focusedNumber();
      if (!n) return err('db ' + c.cmd + ' ── which window? db ' + c.cmd + ' <n> (or focus a database window here)');
      const type = c.cmd === 'login' ? 'db.ask' : 'db.' + c.cmd;
      return ask(type, n, c.cmd === 'login' ? { account: c.account } : null).then(function (p) {
        if (!p) return err('db ' + c.cmd + ' ' + n + ' ── no database window ' + n + ' is open (database' + (n === 1 ? ' id=1' : '') + ' opens one)');
        h.recv((p.ok ? '' : '! ') + 'db ' + c.cmd + ' ' + n + ' ── ' + p.text, p.ok ? null : 'err');
        return !!p.ok;
      });
    }

    return {
      handle: function (line) {
        const c = parse(line);
        if (!c) return false;
        if (c.error) return err(c.error);
        return run(c);
      },
    };
  }

  const api = { parse, wire, USAGE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Tezcatl = root.Tezcatl || {}).dbCommands = api;
})(typeof self !== 'undefined' ? self : this);
