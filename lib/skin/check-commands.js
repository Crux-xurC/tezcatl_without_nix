// lib/skin/check-commands.js -- the `check ...` lines of a skin's input form:
// is the disk still what this skin's code_editor opened?
//   check update        the code_editor meant now
//   check update all    every code_editor of this skin
// Nothing watches the disk: this is asked when a person asks. Each code_editor
// compares what it opened with GET /fs/stat (code.file {op: "check"}) and
// answers code.checked; one that differs says file.changed itself, which the
// file_changes panel takes up as any other change. Here the answers become
// one line each on the receiving side, with the code_editor as its reference.
// parse / line are pure; wire(h) does them for a page.
(function (root) {
  'use strict';

  const USAGE = 'check update [all]';

  // a line -> null (not a check line) | {cmd: 'update', all} | {error}
  function parse(line) {
    const words = String(line == null ? '' : line).trim().split(/\s+/).filter(Boolean);
    if (words[0] !== 'check') return null;
    if (words[1] !== 'update' || words.length > 3 || (words.length === 3 && words[2] !== 'all')) return { error: USAGE };
    return { cmd: 'update', all: words.length === 3 };
  }

  const SAID = {
    same: 'the disk is what was opened',
    changed: 'changed on the disk',
    gone: 'gone from the disk',
    unreadable: 'cannot be compared (unreadable, or too large)',
    no_path: 'a text with no path',
  };
  // a code.checked answer (null: none came) -> {text, err}
  function line(place, a) {
    if (!a) return { text: 'the code_editor at ' + place + ' did not answer', err: true };
    const what = (a.path || '(no path)') + ' (' + place + ')';
    if (a.state === 'changed') {
      return { text: what + ': ' + SAID.changed + ' ── ' + (a.dirty ? 'it has edits here: :e! reads the disk again, :Replay applies the copy' : ':e reads it again (a file_changes panel does so by itself)'), err: true };
    }
    if (a.state === 'gone') return { text: what + ': ' + SAID.gone + ' ── its text stays here (:w! makes it again)', err: true };
    if (a.state === 'error') return { text: what + ': could not check (' + (a.message || '?') + ')', err: true };
    return { text: what + ': ' + (SAID[a.state] || a.state), err: a.state === 'unreadable' };
  }

  // h: { bus, recv(text, cls, ref), codes() -> [{id, bus, place}] (this skin's
  //      code_editor), codeNow() -> id | null, setTimeout? }
  // -> { handle(line) -> false (not a check line) | Promise<bool> }
  function wire(h) {
    const later = h.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    function err(t) { h.recv('! ' + t, 'err'); return false; }

    function ask(c) {
      return new Promise(function (resolve) {
        if (!c.bus) { resolve(null); return; }
        const req = 'chk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        let done = false;
        const off = h.bus.on('code.checked', function (p) {
          if (done || !p || p.req !== req) return;
          done = true; off();
          resolve(p);
        });
        h.bus.post('code.file', { op: 'check', arg: '', bang: false, req: req }, { to: c.bus });
        later(function () { if (!done) { done = true; off(); resolve(null); } }, 5000);
      });
    }

    function handle(text) {
      const c = parse(text);
      if (!c) return false;
      if (c.error) return Promise.resolve(err(c.error));
      const all = h.codes();
      const now = h.codeNow();
      const which = c.all ? all : all.filter(function (x) { return x.id === now; });
      // all with none: nothing to compare, not a failure (check.update-all after an intent's checkout)
      if (!which.length && c.all) { h.recv('check update ── no code_editor here: nothing to compare'); return Promise.resolve(true); }
      if (!which.length) return Promise.resolve(err('check update ── there is no code_editor here'));
      return Promise.all(which.map(ask)).then(function (answers) {
        let differ = 0;
        answers.forEach(function (a, i) {
          const l = line(which[i].place, a);
          if (a && (a.state === 'changed' || a.state === 'gone')) differ += 1;
          h.recv((l.err ? '! ' : '') + 'check update ── ' + l.text, l.err ? 'err' : null, { kind: 'panel', id: which[i].id });
        });
        if (c.all) h.recv('check update ── ' + which.length + ' code_editor, ' + differ + ' not what the disk has');
        return true;
      });
    }

    return { handle: handle };
  }

  const api = { USAGE, parse, line, wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).checkCommands = api;
})(typeof self !== 'undefined' ? self : this);
