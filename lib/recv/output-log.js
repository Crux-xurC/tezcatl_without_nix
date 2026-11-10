// lib/recv/output-log.js -- the output_log's record (D-run-table, stage 4), the
// pure parts: one line a thing said, as text a person reads in a code_editor --
//   12:00:01.234 tezcatl │ ! no such command: skin nonsense
//   12:00:01.240 xterm:f-abc │ make: *** [all] Error 2
//   12:00:01.300 emacs-vent │ [null] magit.refresh
//   12:00:01.310 run │ a #1 send t skin nonsense
// src: tezcatl (the frame's own lines), xterm:<panel id>, emacs-vent, and run --
// what a run_table says of its rows (run.mark): `send <input> <line>`,
// `sent <dest> <key>`, `not-sent <why>`, `status <status> <note>`.
// A line of text with a newline in it is kept on one line (\n written out).
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).outputLog = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SEP = ' │ ';
  const LINE_RE = /^(\d\d:\d\d:\d\d\.\d{3}) (\S+) │ (.*)$/;
  const MARK_RE = /^(\S+) #(\S+) (send|sent|not-sent|status)(?: (.*))?$/;

  function pad(n, w) { return String(n).padStart(w, '0'); }
  function clock(d) {
    return pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2) + '.' + pad(d.getMilliseconds(), 3);
  }
  function oneLine(text) { return String(text == null ? '' : text).replace(/\r?\n/g, '\\n').replace(/\r/g, ''); }

  // a line of the record
  function format(date, src, text) { return clock(date) + ' ' + src + SEP + oneLine(text) + '\n'; }

  // what a run_table says of a row (run.mark) -> the text of its `run` line
  function markText(m) {
    const head = m.book + ' #' + m.id + ' ' + m.what;
    if (m.what === 'send') return head + ' ' + (m.input || '-') + ' ' + oneLine(m.line);
    if (m.what === 'sent') return head + ' ' + (m.dest || '-') + ' ' + (m.key || '-');
    if (m.what === 'not-sent') return head + ' ' + oneLine(m.error || '');
    return head + ' ' + (m.status || '') + (m.note ? ' ' + oneLine(m.note) : '');
  }

  // the default path of `log start`: ~work/logs/<date>_<time>.log
  function defaultPath(d) {
    return '~work/logs/' + d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2) + '_' +
      pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + pad(d.getSeconds(), 2) + '.log';
  }

  // a record -> [{n, time, src, text}] (n: its line number, 1 first); lines not of the form are left out
  function parse(text) {
    const out = [];
    String(text == null ? '' : text).split('\n').forEach((l, i) => {
      const m = LINE_RE.exec(l);
      if (m) out.push({ n: i + 1, time: m[1], src: m[2], text: m[3] });
    });
    return out;
  }
  // a `run` line -> {book, id, what, rest} | null
  function mark(entry) {
    if (!entry || entry.src !== 'run') return null;
    const m = MARK_RE.exec(entry.text);
    return m ? { book: m[1], id: m[2], what: m[3], rest: m[4] || '' } : null;
  }

  return { SEP, format, markText, defaultPath, parse, mark, oneLine, clock };
});
