// lib/xipe/matrix-bar-page.js -- the page script of matrix_bar
// (panels/resident/matrix_bar.html): the main of the synthesis matrix_set
// (syntheses/matrix_set.json, D-synthesis) -- what the matrix skin's page
// did before it was removed, as a panel: one line saying which table is
// shown, and the wiring between the synthesis' command line (code_cmd_in) and
// its table (matrix.html). The table is not updated by notifications; it is
// fetched again when asked.
//
//   code_cmd_in --cmd.input {text}--> matrix_bar
//   matrix_bar --matrix.reload / matrix.load {kind, ref, root}--> matrix
//   matrix --matrix.loaded {kind, ref, root, ok, message, rows}--> matrix_bar
//
// Its synthesis' panels come from the skin port (Tezcatl.skinPort.synthesis):
// only cmd.input of its own code_cmd_in is read, only its own matrix is asked.
// Commands (lib/xipe/matrix-commands.js): `matrix update`, `matrix get <path>`,
// `matrix pwd` (tezcatl-commands matrix.update / get / pwd, registered here as
// the matrix skin did: a target of kind skin, lib/xipe/matrix-target.js);
// `radar` makes its table's selection the last reference (lib/skin/radar.js).
// What it says is also its panel.status (the synthesis' band shows it).
(function () {
  'use strict';
  var bus = Tezcatl.bus;
  var statusEl = document.getElementById('status');
  var ownEl = document.getElementById('own');
  var M = Tezcatl.matrixCommands;

  Tezcatl.panelFrame.init({ role: 'matrix-bar', name: new URLSearchParams(location.search).get('name') || 'matrix_bar' });
  Tezcatl.commands.load().catch(function () {});
  Tezcatl.commands.listenBus();

  // the synthesis this bar is the main of (asked each time: its panels load after it)
  function syn() { return Tezcatl.skinPort.synthesis(window); }
  function member(panel) {
    var s = syn();
    return s ? s.members.filter(function (m) { return m.panel === panel; })[0] || null : null;
  }
  function from(meta, panel) {
    var m = member(panel);
    return !!(m && meta && meta.from && meta.from.name === m.name);
  }

  function say(t) {
    statusEl.textContent = t;
    var s = syn();
    if (s) ownEl.textContent = s.own;
    bus.post('panel.status', { text: t, level: /^! /.test(t) ? 'warn' : null });
  }

  // -- the table ---------------------------------------------------------------
  // what it shows, as it last said (matrix.loaded); the first table is the one
  // its definition gives the matrix pane (?kind=&ref=&root=)
  var current = null;
  var waiting = null;   // resolve of the command waiting for matrix.loaded

  function loadedText(r) {
    return r.ok ? (r.message ? r.message + ' ' : '') + r.rows + ' rows' : r.message;
  }

  bus.on('matrix.loaded', function (r, meta) {
    if (!r || !from(meta, 'matrix_table')) return;
    current = { kind: r.kind, ref: r.ref, root: r.root };
    if (waiting) { var w = waiting; waiting = null; w(r); return; }
    say((r.ok ? '' : '! ') + M.format(current) + ' ── ' + loadedText(r));
  });

  // ask the matrix pane, then wait for its matrix.loaded
  function ask(type, payload) {
    var m = member('matrix_table');
    if (!m || !m.id) return Promise.resolve({ ok: false, message: 'the table is not ready yet' });
    return new Promise(function (resolve) {
      var t = setTimeout(function () {
        if (waiting === finish) { waiting = null; resolve({ ok: false, message: 'no answer from the table' }); }
      }, 20000);
      function finish(r) { clearTimeout(t); resolve(r); }
      waiting = finish;
      bus.post(type, payload || {}, { to: m.id });
    });
  }

  function run(cmd, args) {
    switch (cmd) {
      case 'update': return ask('matrix.reload');
      case 'get': {
        var t = M.parsePath(args && args.path);
        if (t.error) return Promise.resolve({ ok: false, message: 'get: ' + t.error });
        return ask('matrix.load', t);
      }
      case 'pwd': return Promise.resolve({ ok: true, pwd: true });
    }
    return Promise.resolve({ ok: false, message: '?' });
  }

  // one after another, each answered on the bar
  var queue = Promise.resolve();
  function exec(cmd, args, label) {
    queue = queue.then(function () {
      return run(cmd, args).then(function (r) {
        if (r.pwd) { say(current ? M.format(current) : '(no table yet)'); return r; }
        say((r.ok === false ? '! ' : '') + label + ' ── ' + (r.kind ? M.format(r) + '  ' : '') + loadedText(r));
        return r;
      });
    });
    return queue;
  }

  // the commands over the bus come to the skin-kind target focused last
  var target = Tezcatl.matrixTarget.create({ bus: bus, kind: 'skin' });
  function claim() { target.claim(); }
  window.addEventListener('focus', claim);
  window.addEventListener('pagehide', function () { target.close(); });

  ['update', 'get', 'pwd'].forEach(function (cmd) {
    Tezcatl.commands.register('matrix.' + cmd, function (args, ctx) {
      if (!(ctx && ctx.local) && !target.isMine()) return false;
      var label = (ctx && ctx.line) || ('matrix ' + cmd + (cmd === 'get' ? ' ' + ((args && args.path) || '') : ''));
      return exec(cmd, args || {}, label);
    });
  });

  // its command line: one line, one command (lib/xipe/matrix-commands.js reads it)
  bus.on('cmd.input', function (p, meta) {
    if (!from(meta, 'code_cmd_in')) return;
    claim();
    var text = p && typeof p.text === 'string' ? p.text : '';
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var label = line.trim();
      // radar: where this table's selection is, as the last reference ("@" in an input of any window takes it)
      if (label === 'radar') {
        queue = queue.then(function () {
          var m = member('matrix_table');
          return Tezcatl.radar.run(bus, { prefer: m && m.id }).then(function (r) {
            say(r.error ? '! ' + r.error : r.line + '  @' + r.ref.ids.join(' '));
          });
        });
        return;
      }
      var c = M.parse(line);
      if (c.error) {
        queue = queue.then(function () { say('! ' + label + ' ── ' + c.error); });
        return;
      }
      Tezcatl.commands.invoke('matrix.' + c.cmd, c.cmd === 'get' ? { path: c.path } : {}, { local: true, line: label });
    });
  });

  setTimeout(function () { var s = syn(); if (s) ownEl.textContent = s.own; if (!s) say('! matrix_bar: not in a synthesis (skin add matrix_set)'); }, 0);

  // for the E2E checks
  window.matrixBar = {
    current: function () { return current; },
    target: function () { return target.isMine(); },
    status: function () { return statusEl.textContent; },
  };
})();
