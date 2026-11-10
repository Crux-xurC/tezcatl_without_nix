(function (root) {
  'use strict';
  const Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  // agenda.open (intents/browser.json) -- a browser.backend intent that only
  // opens/focuses the Agenda list (panels/tool/list.html?config=agenda). Everything
  // past that point (toggling a task's state, adding a new one) is the
  // panel's own keyboard handling (kind "task_list", lib/list/kinds/task_list.js), never a
  // separate intent -- you act on a task you can see, the same way real
  // org-agenda has no "change the state of some task I'm not looking at"
  // command either.
  //
  // A named window, not the compile.cutoff.open broadcast/reuse dance: unlike
  // xterm_cutoff (one disposable view per compile run), Agenda is a single
  // persistent singleton, so window.open's own "reopen a window with the same
  // name focuses it" behaviour is already exactly what is wanted.

  function run() {
    const url = Tezcatl.config.sibling('panels/tool/list.html') + '?config=agenda';
    const w = root.open(url, 'tezcatl-agenda');
    if (w) { try { w.focus(); } catch (_) {} }
  }

  if (Tezcatl.resolver && typeof Tezcatl.resolver.registerLocal === 'function') {
    Tezcatl.resolver.registerLocal('agenda', run);
  }

  Tezcatl.agendaIntent = { run: run };
  if (typeof module === 'object' && module.exports) module.exports = Tezcatl.agendaIntent;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
