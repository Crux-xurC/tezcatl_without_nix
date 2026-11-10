// lib/list/list-kinds.js -- the list kinds of panels/tool/list.html: the whole.
// A list panel is one page (list.html?config=<name>) that reads
// list_kinds/<name>.json; its "kind" names how the items are got and what the
// keys do. Each kind is its own file, lib/list/kinds/<kind>.js; what they
// share is here. The page loads
// only the kind it shows (load); node -- the tests -- gets every kind.
//
// To add a kind: write lib/list/kinds/<kind>.js (as the others: `kinds.<kind>
// = {fill, onSelect, ...}`), add it to KINDS below, and a list_kinds/*.json
// that names it. What a kind may have: fill(cfg, api) (required), subscribe,
// order, onSelect, remove, onKey, onAction -- see list.html.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  // kind -> what it lists (the file is lib/list/kinds/<kind>.js)
  var KINDS = {
    w_list: "the relay's windows (GET /windows); Enter brings one forward, Del closes it",
    nav: "a skin's navigator of panes and windows (answers nav.list)",
    code_windows: 'the code_editor open now (code.query); Enter goes there',
    problems: "the diagnostics of the code_editor open now (code.here's diagnostics); Enter goes to the line",
    locations: 'places in files (grep results, LSP references); Enter is code.open-at',
    commands: 'the palette of tezcatl commands (command/command_map.json)',
    panels_and_skins: 'the launcher (opens a page of list_kinds/panels_and_skins.json)',
    killring: 'the kill ring picker',
    bookmarks: 'bookmarked paths',
    lsp: 'the language servers running (GET/DELETE /lsp/servers)',
    task_list: 'the task list (agenda: the rows a task_table cut, ~work/books/task_list.json; D-task-list)',
    dict: 'a dictionary (cfg.dataFile read and written through /fs; dict.entries to the skin)',
    slots: "the tree skin's slots (tree.json)",
    xipe_cards: 'Xipe Totec cards (every function, from card/list; Enter opens one in matrix.html, M-d its definition)',
    work: "what is running and what ran (the work store's record; Del stops a row that can be)",
    db_list: "the database windows (GET /sql/windows); Del logs one out (db.exit)",
    skin_list: "the skins kept by skin save (~work/store/frame-skins.json); Enter opens one in a new frame, M-r reads it into the frame"
  };

  var kinds = {};
  function hidden(name, value) { Object.defineProperty(kinds, name, { value: value, enumerable: false }); }

  // PUT a whole document through /fs/write -> {ok, message, changed}; never rejects.
  // A refused or failed write says so instead of passing for done. `base`
  // (readDoc's): what the file was when it was read -- the relay refuses the
  // write (409, changed: true) when it is not any more, so a change made
  // meanwhile (another panel, a window, a hand edit) is not written over.
  // Without one the write is last-write-wins.
  function putDoc(u, body, base) {
    var headers = { 'content-type': 'application/json' };
    if (base) headers['x-tezcatl-base'] = base;
    return fetch(u, {
      method: 'PUT',
      headers: headers,
      body: body,
    }).then(function (r) {
      if (r.ok) return { ok: true };
      if (r.status === 409) return { ok: false, changed: true, message: 'the file changed while it was being written (HTTP 409) ── not written' };
      return { ok: false, message: 'could not write (HTTP ' + r.status + ')' };
    }, function (e) {
      return { ok: false, message: 'could not write (' + String(e && e.message || e) + ')' };
    });
  }

  // "sha256:<hex>" of a text as UTF-8 (as /fs/write compares it), or null where
  // there is no crypto.subtle (the write then goes unchecked)
  function baseOf(text) {
    var subtle = typeof crypto !== 'undefined' && crypto.subtle;
    if (!subtle || typeof TextEncoder === 'undefined') return Promise.resolve(null);
    return subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) {
      return 'sha256:' + Array.from(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    }, function () { return null; });
  }

  // read, change, write -- once again from the read when the file changed
  // meanwhile (putDoc's changed): the change is made on what is there now.
  // attempt() -> Promise<{ok, changed, ...}>
  function retryChanged(attempt) {
    return attempt().then(function (w) { return w && w.changed ? attempt() : w; });
  }

  // A data file of a kind (task, dict ...) read through /fs/read, told apart:
  // missing (404 -- a new list, written from empty) from unreadable (another
  // answer, the relay away, not JSON, or `valid(doc)` false). An unreadable
  // file must never be written back: the empty list read in its place would
  // replace what is there. -> Promise<{doc, error, base}>
  // -- doc: the parsed document (null when missing or unreadable), error: why
  // it could not be read (null when it could, or is missing), base: what to
  // give putDoc ("absent" when missing)
  function readDoc(u, valid) {
    return fetch(u, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return { doc: null, error: null, base: 'absent' };
      if (!r.ok) return r.text().then(function (t) { return { doc: null, error: 'HTTP ' + r.status + ' ' + String(t || '').trim().slice(0, 200) }; });
      return r.text().then(function (t) {
        var d;
        try { d = JSON.parse(t); } catch (e) { return { doc: null, error: 'not readable as JSON (' + (e && e.message || e) + ')' }; }
        if (valid && !valid(d)) return { doc: null, error: 'not the expected shape' };
        return baseOf(t).then(function (base) { return { doc: d, error: null, base: base }; });
      });
    }, function (e) {
      return { doc: null, error: 'could not read (' + String(e && e.message || e) + ')' };
    });
  }

  // the kind's file, once -> Promise<kind>
  var SELF = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || null;
  var loading = {};
  function load(name) {
    if (kinds[name]) return Promise.resolve(kinds[name]);
    if (!Object.prototype.hasOwnProperty.call(KINDS, name)) return Promise.reject(new Error('unknown list kind "' + name + '"'));
    if (!loading[name]) {
      loading[name] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = new URL('kinds/' + name + '.js', SELF || location.href).href;
        s.onload = function () { kinds[name] ? resolve(kinds[name]) : reject(new Error('list kind "' + name + '" did not define itself')); };
        s.onerror = function () { delete loading[name]; reject(new Error('list kind "' + name + '": ' + s.src + ' could not be read')); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }

  hidden('KINDS', KINDS);
  hidden('putDoc', putDoc);
  hidden('readDoc', readDoc);
  hidden('baseOf', baseOf);
  hidden('retryChanged', retryChanged);
  hidden('load', load);
  Tezcatl.listKinds = kinds;
  if (typeof module === 'object' && module.exports) {
    module.exports = kinds;
    Object.keys(KINDS).forEach(function (name) { require('./kinds/' + name + '.js'); });
  }
})(typeof self !== 'undefined' ? self : this);
