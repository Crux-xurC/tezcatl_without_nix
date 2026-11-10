// lib/skin/log-commands.js -- the `log ...` lines of a skin's input form
// (D-run-table, stage 4): an output_log (a hidden panel of this frame,
// lib/recv/output-log-page.js) writing down what the output says.
//   log start[!] [<path>]   start one (the path from the FS root or ~work; none:
//                           ~work/logs/<date>_<time>.log); `!` over a file there
//   log stop                write the last and take it away
//   log                     whether one is writing, and where
// One at a time in a frame.
(function (root) {
  'use strict';

  const USAGE = 'log start[!] [<path>] / log stop / log';
  const STOP_MS = 5000;

  // a line -> null | {cmd: 'start', path, bang} | {cmd: 'stop' | 'state'} | {error}
  function parse(line, resolve) {
    const m = /^\s*log(?:\s+([\s\S]*))?$/.exec(String(line == null ? '' : line));
    if (!m) return null;
    const rest = (m[1] || '').trim();
    if (!rest) return { cmd: 'state' };
    if (rest === 'stop') return { cmd: 'stop' };
    const w = /^start(!?)(?:\s+(\S+))?$/.exec(rest);
    if (!w) return { error: USAGE };
    if (!w[2]) return { cmd: 'start', path: null, bang: w[1] === '!' };
    const r = /^~work(\/|$)/.test(w[2]) ? { path: w[2] } : resolve ? resolve(w[2]) : { path: w[2].replace(/^\/+/, '') };
    if (r.error) return { error: r.error };
    return { cmd: 'start', path: r.path, bang: w[1] === '!' };
  }

  // h: { bus: {post, on}, recv(text, cls), resolve(arg), mount(query) -> el | null,
  //      unmount(el), busOf(el) -> bus id | null, [wait(fn, ms)] }
  function wire(h) {
    const wait = h.wait || function (fn, ms) { return setTimeout(fn, ms); };
    let cur = null;   // {el, path, since, stopping}
    function err(t) { h.recv('! log ── ' + t, 'err'); return false; }
    h.bus.on('log.started', function (p, meta) {
      if (!cur || !p || !meta || !meta.from || meta.from.id !== h.busOf(cur.el)) return;
      cur.path = p.path;
      if (p.ok) h.recv('log ── writing to ' + p.path);
      else { const el = cur.el; cur = null; h.unmount(el); err('not started: ' + (p.error || '?')); }
    });
    h.bus.on('log.stopped', function (p, meta) {
      if (!cur || !cur.stopping || !p || !meta || !meta.from || meta.from.id !== h.busOf(cur.el)) return;
      const el = cur.el;
      cur = null;
      h.unmount(el);
      if (p.ok) h.recv('log ── written to ' + p.path + ' (' + p.lines + ' lines) and stopped');
      else err(p.path + ': ' + (p.error || 'not written'));
    });
    function handle(line) {
      const c = parse(line, h.resolve);
      if (!c) return false;
      if (c.error) return err(c.error);
      if (c.cmd === 'state') { h.recv(cur ? 'log ── writing to ' + (cur.path || '…') : 'log ── not writing (log start [<path>])'); return true; }
      if (c.cmd === 'start') {
        if (cur) return err('writing to ' + (cur.path || '…') + ' already ── log stop first');
        const q = {};
        if (c.path) q.path = c.path;
        if (c.bang) q.bang = '1';
        const el = h.mount(q);
        if (!el) return err('cannot add the output_log here');
        cur = { el: el, path: c.path, stopping: false };
        return true;
      }
      if (!cur) return err('not writing');
      const id = h.busOf(cur.el);
      if (!id) return err('the output_log is still loading');
      cur.stopping = true;
      h.bus.post('log.stop', {}, { to: id });
      const was = cur;
      wait(function () {
        if (cur !== was) return;
        cur = null;
        h.unmount(was.el);
        err('the output_log did not answer ── taken away (what it wrote before stays)');
      }, STOP_MS);
      return true;
    }
    return { handle: handle };
  }

  const api = { USAGE, parse, wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).logCommands = api;
})(typeof self !== 'undefined' ? self : this);
