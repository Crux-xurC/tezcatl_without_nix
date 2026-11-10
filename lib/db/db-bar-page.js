// lib/db/db-bar-page.js -- the page script of db_bar (panels/resident/db_bar.html):
// the main of the synthesis database (syntheses/database.json; D-db-session,
// D-synthesis). One line: the window's number, <account>@<host>:<port>/<database>,
// its state, and -- when it asks -- the account and a masked password field.
//
// It holds the window's WebSocket to the relay's /sql (lib/relay/sql.exs
// SqlSocket): hello asks for the number it kept (synthesis.keep {id}; none, or
// read from a saved skin -- ?kept=saved: the smallest free), and the frame keeps
// the number it is given. Opened, it asks at once for the password of the
// account the relay offers. The password goes from the field to the socket and
// nowhere else: not to the bus, the kill ring, a log or the URL; the field is
// emptied when it is sent.
//
// Its synthesis' command line (code_cmd_in) sends cmd.input: a text that is
// exactly `db login [<account>]`, `db exit` or `db cancel` is the window's own
// command (lib/db/sql.js command); anything else is one statement, sent as it
// is (never split at ";"). The answer goes to its table (matrix_table, kind
// given) with matrix.show; what the window says is also its panel.status (the
// band). Nothing reconnects by itself: with the relay gone, `db login` connects
// again from hello, asking for the same number.
//
// From another window (lib/skin/db-commands.js, any tab): db.ask / db.exit /
// db.cancel {req, id, [account]} for this number, answered with db.said {req,
// id, ok, text}; db.ask makes it ask for the password here (its band says so).
// db.changed {id, state} tells the list (db_list) that something changed.
//
// Window 1 runs the intents' statements (an intent's `sql`, lib/vent/resolver.js):
// db.run {req, intent, statement, args, load} is answered by window 1 only -- db.took
// {req} as it sends it, then db.ran {req, ok, answer | error}; logged out or
// running, db.ran at once with why. Its table shows the answer under the
// intent's name and the statement's head; its band says which intent ran.
(function () {
  'use strict';
  var T = Tezcatl;
  var bus = T.bus;
  var q = new URLSearchParams(location.search);
  var numEl = document.getElementById('num');
  var whereEl = document.getElementById('where');
  var stateEl = document.getElementById('state');
  var loginEl = document.getElementById('login');
  var accountEl = document.getElementById('account');
  var passwordEl = document.getElementById('password');
  var msgEl = document.getElementById('msg');

  T.panelFrame.init({ role: 'db-bar', name: q.get('name') || 'db_bar' });
  T.panelFrame.setFocusTarget(function () { return loginEl.hidden ? null : (accountEl.value ? passwordEl : accountEl); });

  var ws = null;
  var number = q.get('kept') === 'saved' ? null : (Number(q.get('id')) || null);
  var server = null;    // {host, port, database, account}
  var account = null;   // logged in as
  var state = 'connecting';
  var asking = null;    // the account a login waits for, when the socket is not up yet
  var seq = 0;
  var pending = {};     // req -> {head, [intent, to]} (to: the asker's bus id, for an intent's statement)

  function syn() { return T.skinPort.synthesis(window); }
  function member(panel) {
    var s = syn();
    return s ? s.members.filter(function (m) { return m.panel === panel; })[0] || null : null;
  }
  function from(meta, panel) {
    var m = member(panel);
    return !!(m && meta && meta.from && meta.from.name === m.name);
  }

  var saidState = null;
  function draw() {
    if (number && state !== saidState) { saidState = state; bus.post('db.changed', { id: number, state: state }); }
    numEl.textContent = number ? 'db ' + number : 'db ?';
    whereEl.textContent = server ? (account || '—') + '@' + server.host + ':' + server.port + '/' + server.database : '';
    stateEl.textContent = state;
    stateEl.className = state.replace(/\s+/g, '-');
    status();
  }
  // the band: what the window is waiting for comes first
  function status(text) {
    if (text != null) msgEl.textContent = text;
    var t = (number ? 'db ' + number + ' ' : '') + (loginEl.hidden ? state : '● password') + (msgEl.textContent ? ' ── ' + msgEl.textContent : '');
    bus.post('panel.status', { text: t, level: !loginEl.hidden ? 'warn' : (/^! /.test(msgEl.textContent) ? 'alert' : null) });
    document.title = !loginEl.hidden && number ? '● db ' + number + ': password' : 'db ' + (number || '?') + ' · ' + (account || state);
  }

  // -- the socket ----------------------------------------------------------------
  function connect() {
    state = 'connecting';
    draw();
    T.sql.socketUrl(T.config).then(function (u) { return T.ticket.url(u); }).then(function (u) {
      var s = new WebSocket(u);
      ws = s;
      s.onopen = function () { send({ kind: 'hello', id: number }); };
      s.onmessage = function (e) { var m = null; try { m = JSON.parse(e.data); } catch (_) {} if (m && ws === s) on(m); };
      s.onclose = function () {
        if (ws !== s) return;
        ws = null;
        account = null;
        hideLogin();
        if (state !== 'refused') { state = 'no relay'; status('! the relay is gone ── db login connects again'); }
        draw();
      };
    }).catch(function (e) { state = 'no relay'; status('! ' + (e && e.message || e)); draw(); });
  }
  function send(m) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; }

  function on(m) {
    if (m.kind === 'number') {
      number = m.id;
      server = { host: m.host, port: m.port, database: m.database, account: m.account || null };
      bus.post('synthesis.keep', { id: number });
      state = 'logged out';
      status('');
      // opened (or connected again for a login): ask now
      askLogin(asking || server.account || '');
      asking = null;
    } else if (m.kind === 'refused') {
      state = 'refused';
      status('! ' + m.error);
    } else if (m.kind === 'state') {
      state = m.state;
      if (m.state === 'waiting' && m.account) { account = m.account; hideLogin(); status(''); }
      if (m.state === 'logged out') { account = null; status(m.why ? '! ' + m.why : 'logged out'); }
    } else if (m.kind === 'login_failed') {
      status('! ' + m.error + (m.code ? ' (' + m.code + ')' : ''));
      askLogin(accountEl.value);
    } else if (m.kind === 'answer') {
      answer(m);
    } else if (m.kind === 'said') {
      var w = m.req != null && pending[m.req];
      if (w) {
        delete pending[m.req];
        if (w.intent) ran(m.req, w, false, null, m.error);
      }
      status('! ' + (w && w.intent ? w.intent + ' ── ' : '') + m.error);
    }
    draw();
  }

  // -- logging in ------------------------------------------------------------------
  function askLogin(acc) {
    accountEl.value = acc || '';
    passwordEl.value = '';
    loginEl.hidden = false;
    draw();
    // to the front of the frame: this panel takes the keyboard (the frame enters its main)
    try { if (window.parent !== window) window.parent.postMessage({ type: 'tezcatl.pane.reveal' }, location.origin); } catch (_) {}
    (acc ? passwordEl : accountEl).focus();
  }
  function hideLogin() { loginEl.hidden = true; passwordEl.value = ''; }
  function login() {
    var acc = accountEl.value.trim();
    var pw = passwordEl.value;
    passwordEl.value = '';
    if (!acc) { status('! an account first'); accountEl.focus(); return; }
    if (!send({ kind: 'login', account: acc, password: pw })) { status('! not connected ── db login'); return; }
    status('logging in as ' + acc + ' …');
  }
  [accountEl, passwordEl].forEach(function (el) {
    el.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' || ev.isComposing) return;
      ev.preventDefault();
      if (el === accountEl && accountEl.value.trim()) { passwordEl.focus(); return; }
      login();
    });
  });

  // -- statements and answers --------------------------------------------------------
  function answer(m) {
    var w = pending[m.req] || { head: '' };
    delete pending[m.req];
    var head = (w.intent ? w.intent + ' ── ' : '') + w.head;
    if (w.intent) ran(m.req, w, m.ok !== false, m, m.error);
    var g = T.sql.toGrid(m);
    var t = member('matrix_table');
    if (g.error) {
      status('! ' + head + ' ── ' + g.error + (g.code ? ' (' + g.code + ')' : ''));
      if (t && t.id) bus.post('matrix.show', { label: head, error: g.error + (g.code ? ' (' + g.code + ')' : '') }, { to: t.id });
      return;
    }
    status(head + ' ── ' + g.message);
    if (t && t.id) bus.post('matrix.show', { label: head, columns: g.columns, rows: g.rows, message: g.message }, { to: t.id });
  }

  bus.on('cmd.input', function (p, meta) {
    if (!from(meta, 'code_cmd_in')) return;
    var text = p && typeof p.text === 'string' ? p.text : '';
    if (!text.trim()) return;
    var c = T.sql.command(text);
    if (c && c.cmd === 'login') {
      if (!ws) { asking = c.account || null; connect(); return; }
      askLogin(c.account || accountEl.value || (server && server.account) || '');
      return;
    }
    if (c && c.cmd === 'exit') { if (!send({ kind: 'exit' })) status('! not connected'); return; }
    if (c && c.cmd === 'cancel') { if (!send({ kind: 'cancel' })) status('! not connected'); return; }
    if (!account) { status('! not logged in ── db login'); draw(); return; }
    var req = 'r' + (++seq);
    pending[req] = { head: T.sql.head(text) };
    if (!send({ kind: 'run', req: req, statement: text })) { delete pending[req]; status('! not connected ── db login'); }
  });

  // -- an intent's statement (window 1 only) ------------------------------------------
  function ran(req, w, ok, a, error) {
    var out = { req: req, ok: ok };
    if (ok) { out.answer = Object.assign({}, a); delete out.answer.kind; delete out.answer.req; }
    else out.error = error || 'refused';
    bus.post('db.ran', out, { to: w.to });
  }
  bus.on('db.run', function (p, meta) {
    if (number !== 1 || !p || !p.req || !meta || !meta.from) return;
    var w = { head: T.sql.head(p.statement), intent: String(p.intent || '?'), to: meta.from.id };
    if (!account) { ran(p.req, w, false, null, 'This operation requires database window 1, logged in: `database id=1` (window 1 is ' + state + ')'); return; }
    if (state === 'running') { ran(p.req, w, false, null, 'database window 1 is running a statement (db cancel 1)'); return; }
    pending[p.req] = w;
    if (!send({ kind: 'run', req: p.req, intent: w.intent, statement: p.statement, args: p.args || [], load: p.load || [] })) {
      delete pending[p.req];
      ran(p.req, w, false, null, 'database window 1 is not connected (db login 1)');
      return;
    }
    bus.post('db.took', { req: p.req }, { to: w.to });
    status(w.intent + ' ── ' + w.head + ' …');
    draw();
  });

  // -- from another window --------------------------------------------------------
  function reply(p, ok, text) { bus.post('db.said', { req: p.req, id: number, ok: ok, text: text }); }
  function forMe(p) { return !!(p && p.req && number && Number(p.id) === number); }
  bus.on('db.ask', function (p) {
    if (!forMe(p)) return;
    if (account) { reply(p, false, 'already logged in as ' + account + ' (db exit ' + number + ' first)'); return; }
    var acc = p.account || accountEl.value || (server && server.account) || '';
    if (!ws) { asking = acc || null; connect(); }
    else askLogin(acc);
    reply(p, true, 'window ' + number + ' asks for the password' + (acc ? ' of ' + acc : '') + ' in its own field ── go there (Ctrl+Tab in Poca)');
  });
  bus.on('db.exit', function (p) {
    if (!forMe(p)) return;
    if (!account) { reply(p, false, 'already logged out'); return; }
    reply(p, send({ kind: 'exit' }), 'logging out');
  });
  bus.on('db.cancel', function (p) {
    if (!forMe(p)) return;
    if (state !== 'running') { reply(p, false, 'nothing is running'); return; }
    reply(p, send({ kind: 'cancel' }), 'cancelling the running statement');
  });

  draw();
  connect();

  // for the E2E checks (never the password)
  window.dbBar = {
    number: function () { return number; },
    state: function () { return state; },
    account: function () { return account; },
    asking: function () { return !loginEl.hidden; },
    said: function () { return msgEl.textContent; },
  };
})();
