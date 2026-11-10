// lib/core/work-page.js -- the page script of the invisible work store
// (panels/invisible/work.html), next to killring and cursor in a skin.
// It listens to everything on the bus and keeps the record of what is running
// and who is open (lib/core/work-log.js), matched against the pairs of
// work.json. It only listens and holds: nothing here starts anything, and the
// time is looked at when someone asks.
//
// One store records at a time: every window's store asks for the same lock
// (Web Locks), the one that holds it is the recorder, and when its window
// goes another takes over -- empty, and it calls the roll to learn who is
// open. So a row's number means the same in every window. (Without Web Locks
// each store records for itself.)
//
//   work.query {req, only}    -> work.rows {req, rows, since}     only: running | panels
//   work.cancel {req, n}      -> work.cancelled {req, ok, message}  (the pair's cancel, to who fired the row)
//   work.who {req}            -> the roll call begins (panel.roll -> panel.here, frame.places);
//   work.who.end {req}           who asked says when it is over (its own timer: this window may be
//                                in the background) -> work.rows {req, rows (the panels open), lost}
//   work.changed {}           said (at most every 150 ms) when the record changed
(function () {
  'use strict';
  var T = Tezcatl;
  var bus = T.bus;
  var W = T.workLog;
  var dbg = document.getElementById('dbg');
  var debug = /(?:^|[?&])debug(?:=|&|$)/.test(location.search);
  if (debug) document.body.classList.add('debug');
  // not a panel of the roster: it does not go through panel-frame
  bus.identify({ role: 'work', name: 'work' });

  var log = null;
  var since = null;
  var active = false;

  function render() {
    if (!debug || !log) return;
    dbg.textContent = (active ? 'recording since ' + W.clock(since) : 'dormant') + '\n' +
      log.list(Date.now()).map(function (r) { return W.show(r).label; }).join('\n');
  }

  // work.changed, at most every 150 ms -- said at once when none was said
  // lately (the recorder may be a background window, whose timers are slowed)
  var saidAt = 0;
  var saidTimer = null;
  function changed() {
    render();
    var now = Date.now();
    if (now - saidAt >= 150) { saidAt = now; bus.post('work.changed', {}); return; }
    if (saidTimer) return;
    saidTimer = setTimeout(function () { saidTimer = null; saidAt = Date.now(); bus.post('work.changed', {}); }, 150);
  }

  // The roll call. The store only asks and gathers; when it is over is
  // said by who asked (work.who.end), in a window a person is looking at --
  // this one may be in the background, its timers slowed to a second or more.
  var rollReq = null;
  var rollPlaces = [];
  function beginRoll(req) {
    rollReq = req;
    rollPlaces = [];
    log.roll();
    bus.post('panel.roll', { req: req });
  }
  // -> the number of panels that had gone without saying so
  function endRoll() {
    rollPlaces.forEach(function (f) {
      f.places.forEach(function (x) { if (x && x.id) log.placeOf(x.id, { skin: f.skin || null, place: x.place, panel: x.panel }); });
    });
    rollReq = null;
    rollPlaces = [];
    var lost = log.rollDone(Date.now());
    changed();
    return lost;
  }

  function start(doc) {
    var r = W.readPairs(doc);
    if (r.problems.length) { try { console.warn('tezcatl: work.json', r.problems); } catch (_) {} }
    log = W.create(r.pairs);
    since = Date.now();
    active = true;

    bus.on('*', function (payload, meta) {
      if (!meta || /^work\./.test(meta.type)) return;
      if (log.hear(meta.type, payload, meta)) changed();
    });
    bus.on('work.query', function (p) {
      var only = p && p.only;
      bus.post('work.rows', { req: p && p.req, since: since, rows: log.list(Date.now(), { only: only }) });
    });
    bus.on('panel.here', function (p, meta) { if (p && p.req === rollReq && meta && meta.from) { log.here(meta.from, null); changed(); } });
    // a frame says where its panels are: {skin, places: [{id (bus id), place, panel}]}
    bus.on('frame.places', function (p) { if (p && p.req === rollReq && Array.isArray(p.places)) rollPlaces.push(p); });
    bus.on('work.who', function (p) { if (p && p.req) beginRoll(p.req); });
    bus.on('work.who.end', function (p) {
      if (!p || p.req !== rollReq) return;
      var lost = endRoll();
      bus.post('work.rows', { req: p.req, since: since, lost: lost, rows: log.list(Date.now(), { only: 'panels' }) });
    });
    bus.on('work.cancel', function (p) {
      var c = log.cancelOf(Number(p && p.n));
      if (c.error) { bus.post('work.cancelled', { req: p && p.req, ok: false, message: c.error }); return; }
      bus.post(c.type, c.payload, { to: c.to });
      bus.post('work.cancelled', { req: p && p.req, ok: true, message: 'asked ' + (c.row.from.role || 'it') + ' ' + (c.row.from.name || '') + ' to stop row ' + c.row.n + ' (' + c.row.text + ')' });
    });
    // who is open now: this store heard none of the panel.open said before it
    // started. Nobody is lost by this one (nothing was known): it is not ended.
    rollReq = 'start' + since;
    bus.post('panel.roll', { req: rollReq });
    render();
  }

  function record() {
    return fetch(T.config.sibling('work.json'), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('work.json: HTTP ' + r.status); return r.json(); })
      .catch(function (e) { try { console.warn('tezcatl: ' + (e && e.message || e) + ' ── only the roster is kept'); } catch (_) {} return { pairs: [{ name: 'panel', start: 'panel.open', end: ['panel.close'], key: '@from', text: '{role} {name}' }] }; })
      .then(start);
  }

  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    // held until this window goes: one recorder for every window
    navigator.locks.request('tezcatl:work', function () {
      record();
      return new Promise(function () {});
    });
  } else {
    record();
  }
  render();
  // for the E2E checks
  window.workStore = { active: function () { return active; }, since: function () { return since; }, size: function () { return log ? log.size() : 0; } };
})();
