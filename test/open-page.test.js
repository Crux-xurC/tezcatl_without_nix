'use strict';
// lib/core/open-page.js (D-open-page): a page in a new tab or window -- the
// plan (url, name, features), the settings from config.json launcher, and the
// frame's line `open <page> [tab|window]`.
const test = require('node:test');
const assert = require('node:assert/strict');
// the page's window is `self` (window.open is self.open)
global.self = global;
const op = require('../lib/core/open-page.js');

test('settings: config.json launcher, else the defaults', () => {
  assert.deepEqual(op.settings(null), { mode: 'tab', features: 'width=1200,height=800', nameTpl: 'tezcatl-{n}' });
  const s = op.settings({ launcher: { 'open-mode': 'window', 'window-features': 'popup', 'window-name': 'w-{n}' } });
  assert.deepEqual(s, { mode: 'window', features: 'popup', nameTpl: 'w-{n}' });
  // an unknown mode and empty features fall back (a window always gets features: Poca and Chromium tell them apart by those)
  assert.deepEqual(op.settings({ launcher: { 'open-mode': 'pane', 'window-features': ' ' } }), op.settings(null));
});

test('plan: name:true -> ?name=, a tab has no features', () => {
  const p = op.plan({ id: 'code', page: 'panels/resident/code.html', name: true }, 'tab', op.settings({ launcher: { 'window-name': 'x-{n}' } }));
  assert.match(p.url, /^\/panels\/resident\/code\.html\?name=x-/);
  assert.equal(p.features, '');
  assert.equal(p.mode, 'tab');
});

test('plan: a page with a query -> &name=; each plan a new name', () => {
  const it = { id: 'w_list', page: 'panels/tool/list.html?config=w_list', name: true };
  const a = op.plan(it, 'tab'), b = op.plan(it, 'tab');
  assert.match(a.url, /^\/panels\/tool\/list\.html\?config=w_list&name=/);
  assert.notEqual(a.name, b.name);
});

test('plan: name:false -> the bare page; a window carries the features; no mode -> the settings', () => {
  const s = op.settings({ launcher: { 'open-mode': 'window', 'window-features': 'width=900' } });
  const p = op.plan({ id: 'nav', page: 'panels/tool/list.html?config=nav' }, null, s);
  assert.equal(p.url, '/panels/tool/list.html?config=nav');
  assert.equal(p.mode, 'window');
  assert.equal(p.features, 'width=900');
  assert.equal(op.plan('http://127.0.0.1:4001/panels/x.html', 'tab').url, 'http://127.0.0.1:4001/panels/x.html');
  assert.equal(op.plan({ page: 'a.html' }, 'tab', s, 'fixed').name, 'fixed');
});

test('open: window.open with the plan; a refused pop-up is said', () => {
  const calls = [];
  global.open = (url, name, features) => { calls.push([url, name, features]); return calls.length <= 2 ? {} : null; };
  try {
    const ok = op.open({ page: 'panels/resident/xterm.html' }, 'window');
    assert.equal(ok.ok, true);
    assert.equal(ok.message, 'opened panels/resident/xterm.html in a new window');
    assert.deepEqual(calls[0].slice(0, 1).concat(calls[0][2]), ['/panels/resident/xterm.html', 'width=1200,height=800']);
    assert.equal(op.open('http://127.0.0.1:4001/panels/extra/color.html?color=x', 'window').message,
                 'opened panels/extra/color.html in a new window');
    const no = op.open({ page: 'panels/resident/xterm.html' }, 'tab');
    assert.equal(no.ok, false);
    assert.match(no.message, /refused \(panels\/resident\/xterm\.html, tab\)/);
    assert.equal(calls[2][2], '');
  } finally { delete global.open; }
});

test('parse: open <page> [tab|window], in any order; not open -> null', () => {
  assert.equal(op.parse('skin add code_editor'), null);
  assert.equal(op.parse('opener x'), null);
  assert.deepEqual(op.parse('open database'), { id: 'database', mode: null });
  assert.deepEqual(op.parse('open  database window'), { id: 'database', mode: 'window' });
  assert.deepEqual(op.parse('open tab matrix'), { id: 'matrix', mode: 'tab' });
  assert.match(op.parse('open').error, /^open <page> \[tab\|window\]/);
  assert.match(op.parse('open a b').error, /one page at a time: b/);
});

test('index: ids and aliases of the manifest (an alias never hides an id)', () => {
  const by = op.index({ items: [
    { id: 'code_editor', page: 'panels/resident/code_editor.html', aliases: ['codevi', 'code'] },
    { id: 'code', page: 'panels/resident/code.html' },
    { id: 'nopage' },
  ] });
  assert.equal(by.codevi.id, 'code_editor');
  assert.equal(by.code.id, 'code');
  assert.equal(by.nopage, undefined);
});
