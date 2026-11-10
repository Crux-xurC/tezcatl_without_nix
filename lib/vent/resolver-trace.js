// lib/vent/resolver-trace.js -- the resolver's transcript as text (the
// code_el_intent panel shows it): a header, then one block per intent sent --
// id, args, corr, status, the result or the error, and the form itself.
// Split out of lib/vent/resolver.js.
(function (root) {
  'use strict';
  const Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  const TRACE_HEADER =
    ';;; Tezcatl extension transcript  --  code_el_intent\n' +
    ';;;\n' +
    ';;; An extension runs in these steps.\n' +
    ';;;   1. an intent id is typed in the input panel\n' +
    ';;;   2. binding_map.json -> dialects/emacs/intent_map.json give its forms\n' +
    ';;;   3. {{param}} is filled in and each form is fixed (below)\n' +
    ';;;   4. each is wrapped in the fixed M-: wrapper and sent to emacs-vent as keys\n' +
    ';;;      (one at a time, in order; only post.refresh starts from the system)\n' +
    ';;;   5. the tez:<corr> result rewrites each form\'s [status]\n' +
    ';;;\n' +
    ';;; This text is shown in the browser only. Each form is the Elisp the extension\n' +
    ';;; runs: pasted into a real Emacs M-:, it runs as it is, without Tezcatl.\n';

  function statusText(e) {
    switch (e.status) {
      case 'ok': return 'ok' + (typeof e.dt === 'number' ? ' ' + e.dt.toFixed(2) + 's' : '');
      case 'err': return 'err';
      case 'timeout': return 'timeout';
      case 'aborted': return 'aborted';
      case 'sent': return 'sent';
      case 'waiting': return 'waiting';
      default: return 'sending';
    }
  }

  function renderEntry(e) {
    const ks = Object.keys(e.args || {});
    const argstr = ks.length
      ? '  ' + ks.map(function (k) { return k + '=' + JSON.stringify(e.args[k]); }).join(' ')
      : '';
    let head = ';; [' + e.n + '] ' + e.id + argstr;
    const COL = 52;
    if (head.length < COL) head += new Array(COL - head.length + 1).join(' ');
    head += ' ' + (e.corr || '—') + '   [' + statusText(e) + ']';

    const lines = [head];
    lines.push(';;     shown as parsed (the unsent form). ' +
      (e.kind === 'keys'
        ? 'keys ' + JSON.stringify(e.keys || '') + ' sent (no answer awaited).'
        : e.kind === 'sql'
        ? 'run on database window 1 (' + ((e.load || []).length ? 'books made tables first: ' + e.load.map(function (l) { return l.book + ' as ' + l.as; }).join(', ') + '; ' : '') + 'the statement below; its ?s get ' + JSON.stringify(e.values || []) + '). Not sent to Emacs.'
        : e.kind === 'local'
        ? 'run in the browser (backend: ' + (e.backend || '?') + '). Not sent to Emacs.'
        : 'sent as the wrapped keys of step 4.'));
    if (e.refresh && e.refresh.length) {
      lines.push(';;     → refresh: ' + e.refresh.join(', '));
    }
    if (e.status === 'ok' && e.summary != null) {
      lines.push(';;     result ' + e.summary);
    }
    if ((e.status === 'err' || e.status === 'timeout') && e.errText) {
      lines.push(';;     ' + (e.status === 'timeout' ? 'timeout: ' : 'err: ') + e.errText);
    }
    if (e.kind === 'eval' && e.form) lines.push(e.form);
    if (e.kind === 'sql' && e.statement) lines.push(e.statement);
    return lines.join('\n');
  }

  function renderTrace(entries, max) {
    const shown = (entries || []).slice(-(max || 50));
    const body = shown.map(renderEntry).join('\n\n');
    return TRACE_HEADER + (body ? '\n' + body + '\n' : '\n');
  }

  Tezcatl.resolverTrace = { renderTrace: renderTrace, renderEntry: renderEntry, statusText: statusText };
  if (typeof module === 'object' && module.exports) module.exports = Tezcatl.resolverTrace;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
