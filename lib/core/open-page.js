// lib/core/open-page.js -- opening a page of Tezcatl in a new tab or a new window (D-open-page).
//
// The one place that does it: the launcher (main.html, its startup windows and the
// pages list), the frame's `open <id> [tab|window]`, and a command's fallback.
// How is config.json `launcher`: open-mode (tab | window, the default when none is
// said), window-features, window-name ("{n}" a new number each time).
//
// A tab and a window differ only in the features given to window.open: none is a
// tab, some is a window. That is the Web's own rule, and Poca's (a window Poca opens
// keeps who opened it, so the relay still answers it); the size asked is a hint.
// Pages are those of list_kinds/panels_and_skins.json (an id or an alias).
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  var DEFAULTS = { mode: 'tab', features: 'width=1200,height=800', nameTpl: 'tezcatl-{n}' };
  var MODES = ['tab', 'window'];
  var seq = 0;
  var tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // config.json (whole) -> {mode, features, nameTpl}
  function settings(cfg) {
    var l = (cfg && cfg.launcher) || {};
    return {
      mode: MODES.indexOf(l['open-mode']) >= 0 ? l['open-mode'] : DEFAULTS.mode,
      features: typeof l['window-features'] === 'string' && l['window-features'].trim()
        ? l['window-features'] : DEFAULTS.features,
      nameTpl: typeof l['window-name'] === 'string' && l['window-name'] ? l['window-name'] : DEFAULTS.nameTpl,
    };
  }

  function uniqueName(s) {
    seq += 1;
    return String(s.nameTpl).replace('{n}', tag + '-' + seq);
  }

  // item ({page, name?}) or a page path -> {url, name, features, mode}.
  // An item with name: true is told its window name (?name=), as the launcher did.
  function plan(target, mode, s, name) {
    s = s || DEFAULTS;
    mode = MODES.indexOf(mode) >= 0 ? mode : (s.mode || DEFAULTS.mode);
    var it = typeof target === 'string' ? { page: target } : (target || {});
    var page = String(it.page || '');
    if (page && page.charAt(0) !== '/' && !/^[a-z]+:/i.test(page)) page = '/' + page;
    var n = name || uniqueName(s);
    var url = page + (it.name ? (page.indexOf('?') === -1 ? '?' : '&') + 'name=' + encodeURIComponent(n) : '');
    return { url: url, name: n, features: mode === 'window' ? (s.features || DEFAULTS.features) : '', mode: mode };
  }

  // -> {ok, plan, message}; message says what happened, or that the pop-up was refused
  function open(target, mode, s, name) {
    var p = plan(target, mode, s, name);
    var w = null;
    try { w = typeof root.open === 'function' ? root.open(p.url, p.name, p.features) : null; } catch (_) {}
    // the page, from the root of the pages (a fallback's url is absolute)
    var what = p.url.replace(/^[a-z]+:\/\/[^/]*/i, '').replace(/^\//, '').replace(/[?#].*$/, '');
    return {
      ok: !!w, plan: p,
      message: w ? 'opened ' + what + ' in a new ' + p.mode
                 : 'the pop-up was refused (' + what + ', ' + p.mode + ') -- allow pop-ups for this origin',
    };
  }

  // "open <id> [tab|window]" (the words after open, in any order) -> {id, mode|null} | {error}
  var USAGE = 'open <page> [tab|window]';
  function parse(line) {
    var words = String(line || '').trim().split(/\s+/);
    if (words[0] !== 'open') return null;
    var id = null, mode = null, bad = [];
    words.slice(1).forEach(function (w) {
      if (MODES.indexOf(w) >= 0 && !mode) mode = w;
      else if (!id) id = w;
      else bad.push(w);
    });
    if (!id) return { error: USAGE + ' (a page of the launcher)' };
    if (bad.length) return { error: 'one page at a time: ' + bad.join(' ') + ' (' + USAGE + ')' };
    return { id: id, mode: mode };
  }

  // manifest (panels_and_skins.json) -> {id or alias -> item}
  function index(doc) {
    var by = {};
    ((doc && doc.items) || []).forEach(function (it) {
      if (!it || !it.id || !it.page) return;
      by[it.id] = it;
      (it.aliases || []).forEach(function (a) { if (!by[a]) by[a] = it; });
    });
    return by;
  }

  // -- reading config.json and the manifest (browser) --------------------------
  var settingsP = null, indexP = null;
  function loadSettings() {
    if (!settingsP) {
      settingsP = Tezcatl.config && Tezcatl.config.load
        ? Tezcatl.config.load().then(settings, function () { return settings(null); })
        : Promise.resolve(settings(null));
    }
    return settingsP;
  }
  function loadIndex() {
    if (!indexP) {
      indexP = Tezcatl.config.panels().then(index);
      indexP.catch(function () { indexP = null; });
    }
    return indexP;
  }

  // The line `open <id> [tab|window]` -> Promise {ok, message} | null (not this line).
  // Settings and the manifest are read before the line is typed (preload), so
  // window.open is still within the key press that sent it.
  function runLine(line) {
    var c = parse(line);
    if (!c) return null;
    if (c.error) return Promise.resolve({ ok: false, message: c.error });
    return Promise.all([loadSettings(), loadIndex()]).then(function (r) {
      var it = r[1][c.id];
      if (!it) return { ok: false, message: 'no page "' + c.id + '" in the launcher (list_kinds/panels_and_skins.json)' };
      return open(it, c.mode, r[0]);
    }, function (e) { return { ok: false, message: String(e && e.message || e) }; });
  }
  function preload() { loadSettings(); if (Tezcatl.config && typeof fetch === 'function') loadIndex().catch(function () {}); }

  Tezcatl.openPage = {
    settings: settings, plan: plan, open: open, parse: parse, index: index,
    loadSettings: loadSettings, loadIndex: loadIndex, runLine: runLine, preload: preload,
    USAGE: USAGE, DEFAULTS: DEFAULTS,
  };
  if (typeof module === 'object' && module.exports) module.exports = Tezcatl.openPage;
})(typeof self !== 'undefined' ? self : this);
