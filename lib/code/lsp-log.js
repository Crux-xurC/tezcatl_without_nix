// lib/code/lsp-log.js -- what the lsp_log panel writes, and its jumps:
// a panel holds the LSP operations -- like emacs-vent's
// output, a read-only code_editor derivative -- and lsp.back / lsp.forward look
// up its own record; only the LSP operations are recorded: the other jumps
// have the copies and the logbook). Pure: panels/resident/lsp_log.html shows it.
//
//   entry(ev, hhmmss) -> {lines: [text], locs: [{path, line, col} | null]}
//     ev: a code_editor's lsp.event {kind, name, path, line, col, ...}:
//       jump {from, to} / refs {symbol, items} / rename {symbol, n, files} /
//       format {n} / hover {text}
//     one loc per line: where Enter on that line goes
//   history() -> {push({from, to}), back() -> loc | null, forward() -> loc | null, size()}
//     Emacs' xref markers: back goes to where the last jump left from,
//     forward to where it went; a new jump after going back drops the ones ahead

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).lspLog = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function loc(p) {
    return p && p.path ? { path: String(p.path), line: Number(p.line) || 1, col: Number(p.col) || 1 } : null;
  }
  function where(p) { return p && p.path ? p.path + ':' + (p.line || 1) + ':' + (p.col || 1) : '(no path)'; }

  function entry(ev, time) {
    const e = ev || {};
    const t = (time || '') + ' ';
    const at = loc(e);
    const lines = [];
    const locs = [];
    function add(text, l) { lines.push(text); locs.push(l || null); }
    switch (e.kind) {
      case 'jump':
        add(t + 'def    ' + where(e.from) + ' → ' + where(e.to), loc(e.to));
        break;
      case 'refs': {
        const items = Array.isArray(e.items) ? e.items : [];
        add(t + 'refs   ' + (e.symbol || '') + '  ' + items.length + ' place(s)  (' + where(e) + ')', at);
        items.forEach((it) => add('    ' + where(it) + (it.text ? '  ' + String(it.text).trim() : ''), loc(it)));
        break;
      }
      case 'rename': {
        const files = Array.isArray(e.files) ? e.files : [];
        add(t + 'rename ' + (e.symbol || '') + '  this file: ' + (e.n || 0) + ' place(s)' +
          (files.length ? ', ' + files.length + ' other file(s)' : '') + '  (' + where(e) + ')', at);
        files.forEach((f) => add('    ' + f.path + '  ' + (f.ok === false ? 'not applied: ' + (f.reason || '') : (f.n || 0) + ' place(s)'),
          f.path ? { path: f.path, line: 1, col: 1 } : null));
        break;
      }
      case 'format':
        add(t + 'format ' + where(e) + '  ' + (e.n ? e.n + ' place(s)' : 'nothing to format'), at);
        break;
      case 'hover': {
        add(t + 'hover  ' + where(e), at);
        String(e.text || '').split('\n').forEach((l) => add('    │ ' + l, at));
        break;
      }
      default:
        add(t + (e.kind || '?') + '  ' + where(e), at);
    }
    return { lines, locs };
  }

  function history() {
    let list = [];
    let pos = 0;   // list[pos - 1] is the last jump taken; back undoes it
    return {
      push(j) {
        if (!j || !loc(j.from) || !loc(j.to)) return;
        list = list.slice(0, pos);
        list.push({ from: loc(j.from), to: loc(j.to) });
        pos = list.length;
      },
      back() {
        if (pos <= 0) return null;
        pos -= 1;
        return list[pos].from;
      },
      forward() {
        if (pos >= list.length) return null;
        pos += 1;
        return list[pos - 1].to;
      },
      size() { return { jumps: list.length, at: pos }; },
    };
  }

  return { entry, history, where };
});
