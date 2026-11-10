// lib/skin/env-commands.js -- the `env ...` lines of a skin's input form: the
// projects' environments the relay asks for (D-project-env, lib/relay/project_env.exs).
// Language servers get theirs by themselves; a terminal only when asked here.
//   env xterm [<path>]    a new xterm in the project around the path (none: the file of the
//                         code_editor meant now): its root as the directory, its environment
//   env show [<path>]     which project, by which marker, and what it changes (asked if not kept)
//   env reload [<path>]   throw away what is kept of that path's project (none: of every one);
//                         running language servers keep theirs till `lsp restart`
// parse / lines are pure; wire(h) does them for a page.
(function (root) {
  'use strict';

  const USAGE = 'env xterm, show, reload';

  // a line -> null (not an env line) | {cmd, path: string | null} | {error}
  function parse(line, resolve) {
    const words = String(line == null ? '' : line).trim().split(/\s+/).filter(Boolean);
    if (words[0] !== 'env') return null;
    if (['xterm', 'show', 'reload'].indexOf(words[1]) < 0) return { error: USAGE };
    if (words.length > 3) return { error: 'env ' + words[1] + ' [<path>] (one path, without blanks)' };
    if (!words[2]) return { cmd: words[1], path: null };
    if (/^~work(\/|$)/.test(words[2])) return { error: 'env ── the work place has no project (a path from the FS root)' };
    const r = resolve ? resolve(words[2]) : { path: words[2].replace(/^\/+/, '') };
    if (r.error) return { error: r.error };
    return { cmd: words[1], path: r.path };
  }

  function shortRoot(p) {
    if (typeof p !== 'string') return '';
    const parts = p.split('/').filter(Boolean);
    return parts.length <= 3 ? p : '…/' + parts.slice(-3).join('/');
  }
  function names(list, n) {
    return list.length <= n ? list.join(' ') : list.slice(0, n).join(' ') + ' … (' + list.length + ')';
  }
  // GET /env's answer -> the lines said
  function lines(b, path) {
    const where = path || 'the FS root';
    if (!b.found) return ['env show ── ' + where + ': no project (' + b.reason + ') ── the relay\'s own environment'];
    const head = 'env show ── ' + where + ': ' + shortRoot(b.root) + ' by ' + b.marker + ' (' + (b.command || []).join(' ') + ')';
    if (!b.ok) return [head + ' ── could not be read: ' + b.reason + ' ── the relay\'s own is used (env reload, then again)'];
    const out = [head + (b.kept ? ' ── kept' : ' ── asked now')];
    out.push('PATH before the relay\'s: ' + (b.pathAdded.length ? b.pathAdded.length + ' (' + names(b.pathAdded, 3) + ')' : 'nothing'));
    if (b.set.length) out.push('set: ' + names(b.set, 12));
    if (b.unset.length) out.push('unset: ' + names(b.unset, 12));
    return out;
  }

  // h: { base() -> the relay's http base | null, recv(text, cls, ref), pathNow() -> the file of
  //      the code_editor meant now | '', addXterm(path) -> {ok, message, ref} | {error}, fetch? }
  // -> { handle(line) -> false (not an env line) | Promise<bool> }
  function wire(h) {
    const doFetch = h.fetch || function (u, o) { return fetch(u, o); };
    function err(t) { h.recv('! ' + t, 'err'); return false; }
    function url(route, path) {
      const b = h.base();
      if (!b) throw new Error('the relay is not known yet');
      return b + route + (path ? '?path=' + encodeURIComponent(path) : '');
    }
    function answer(r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) throw new Error(b.error || ('HTTP ' + r.status));
        return b;
      });
    }

    function run(c) {
      if (c.cmd === 'xterm') {
        const path = c.path || h.pathNow();
        if (!path) return Promise.resolve(err('env xterm ── no file here to take the project from: env xterm <path>'));
        const a = h.addXterm(path);
        if (a.error) return Promise.resolve(err('env xterm ── ' + a.error));
        h.recv('env xterm ── ' + a.message + ' (its head says which environment)', null, a.ref);
        return Promise.resolve(true);
      }
      if (c.cmd === 'show') {
        const path = c.path || h.pathNow();
        const u = url('/env', path);
        h.recv('env show ── asking for ' + (path || 'the FS root') + ' …');
        return doFetch(u, { cache: 'no-store' }).then(answer).then(function (b) {
          const ls = lines(b, path);
          h.recv(ls.join('\n'), b.found && !b.ok ? 'err' : null);
          return true;
        });
      }
      // reload
      return doFetch(url('/env/reload', c.path), { method: 'POST', headers: { 'content-type': 'application/json' } })
        .then(answer).then(function (b) {
          const gone = b.dropped || [];
          const what = c.path ? (b.root ? shortRoot(b.root) : c.path + ' (' + (b.reason || 'no project') + ')') : 'every project';
          h.recv('env reload ── ' + what + ': ' + (gone.length ? 'thrown away (' + gone.map(shortRoot).join(', ') + ')' : 'nothing was kept') +
            ' ── asked again when next needed; running language servers keep theirs (lsp restart)');
          return true;
        });
    }

    function handle(line) {
      const c = parse(line, h.resolve);
      if (!c) return false;
      if (c.error) return Promise.resolve(err(c.error));
      try {
        return run(c).catch(function (e) { return err('env ' + c.cmd + ' ── ' + ((e && e.message) || e)); });
      } catch (e) {
        return Promise.resolve(err('env ' + c.cmd + ' ── ' + ((e && e.message) || e)));
      }
    }

    return { handle: handle };
  }

  const api = { USAGE, parse, lines, wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).envCommands = api;
})(typeof self !== 'undefined' ? self : this);
