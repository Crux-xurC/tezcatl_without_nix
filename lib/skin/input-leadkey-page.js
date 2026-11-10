// lib/skin/input-leadkey-page.js -- the lead-key input form as a panel
// (panels/extra/input_leadkey.html; D-lead-key). The form itself -- the two
// lines, reading what is typed, the virtual keyboard, shortcuts, sending -- is
// lib/skin/lead-form.js (the frame's input form is the same one).
//
// Here: Enter sends, to the input_target among the panels of the same skin, else
// the one in the frame's dock; Up / Down walk the lines sent; the leave key
// (Esc Esc, panel-frame.js) goes back to the frame.
(function () {
  'use strict';
  var T = window.Tezcatl;
  var params = new URLSearchParams(location.search);
  T.panelFrame.init({ role: 'input_leadkey', name: params.get('name') || 'input_leadkey' });

  var formEl = document.getElementById('form');

  function target() {
    var sib = T.skinPort.siblings(window) || [];
    var t = sib.find(function (x) { return x.role === 'input_target'; });
    if (t) return t.id;
    var port = T.skinPort.of(window);
    return port && typeof port.dockTarget === 'function' ? port.dockTarget() : null;
  }

  var form = T.leadForm.mount({
    form: formEl,
    sends: document.getElementById('sends'),
    mark: document.getElementById('mark'),
    note: document.getElementById('note'),
  }, { target: target });

  var history = [];
  var hpos = 0;
  formEl.addEventListener('keydown', function (e) {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      var text = formEl.value;
      if (form.submit()) {
        if (history[history.length - 1] !== text) history.push(text);
        hpos = history.length;
      }
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (e.key === 'ArrowUp' && hpos > 0) hpos -= 1;
      if (e.key === 'ArrowDown' && hpos < history.length) hpos += 1;
      formEl.value = history[hpos] || '';
      form.sync();
      form.render();
    }
  });

  formEl.focus();
})();
