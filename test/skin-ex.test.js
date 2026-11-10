'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const skinEx = require('../lib/skin/skin-ex.js');
const codeFiles = require('../lib/code/code-files.js');

// a bus that delivers synchronously with {from} meta, and records posts
function fakeBus() {
  const listeners = {};
  const posts = [];
  return {
    posts,
    on(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
      return () => { listeners[type] = listeners[type].filter((f) => f !== fn); };
    },
    post(type, payload, opts) { posts.push({ type, payload, to: (opts && opts.to) || null }); },
    emit(type, payload, from) { (listeners[type] || []).slice().forEach((fn) => fn(payload, { from, type })); },
  };
}

const C21 = { id: 'b-21', name: '21', role: 'code' };
const C22 = { id: 'b-22', name: '22', role: 'code' };

// the frame's way: code() is the code_editor meant now, focusCmd the input form
function frameLike() {
  const bus = fakeBus();
  let now = '21';
  const w = skinEx.wire({
    bus, files: codeFiles, say() {},
    code: () => now,
    isCode: (meta) => !!(meta && meta.from && /^2\d$/.test(meta.from.name)),
    focusPane: () => true,
    focusCmd() {},
  });
  bus.emit('code.ready', {}, C21);
  bus.emit('code.ready', {}, C22);
  return { bus, w, focus(n) { now = n; } };
}
const fileTo = (bus) => bus.posts.filter((p) => p.type === 'code.file').map((p) => p.to);

test(':# then a ":" line: to the code_editor that :# came from', () => {
  const f = frameLike();
  f.bus.emit('cmd.focus', { text: '' }, C21);
  f.focus('22');
  assert.equal(f.w.handle(':w'), true);
  assert.deepEqual(fileTo(f.bus), ['b-21']);
});

test(':# then a skin line, then ":w": to the code_editor meant now, not the one :# came from (2026-10-09)', () => {
  const f = frameLike();
  f.bus.emit('cmd.focus', { text: '' }, C21);
  assert.equal(f.w.handle('skin focus 2 2'), false);   // not a ":" line: the frame runs it
  f.focus('22');
  assert.equal(f.w.handle(':w'), true);
  assert.deepEqual(fileTo(f.bus), ['b-22']);
});

test('inputLineEx: a code_editor that turned the ":" lines off is never sent one (D-code-editor)', () => {
  const bus = fakeBus();
  const said = [];
  const w = skinEx.wire({ bus, files: codeFiles, say: (t) => said.push(t), code: () => '21', focusPane: () => true, focusCmd() {} });
  bus.emit('code.ready', { name: '21', inputLineEx: false }, C21);
  assert.equal(w.handle(':w'), true);
  assert.equal(w.handle(':12'), true);
  assert.deepEqual(bus.posts.filter((p) => p.type === 'code.file' || p.type === 'code.goto'), []);
  assert.match(said[0], /^! :w ── this code_editor takes no ":" lines \(inputLineEx/);
  assert.match(w.refused(':Diff'), /takes no ":" lines/);
  // a line not starting with ":" is still the skin's own
  assert.equal(w.handle('tree add'), false);
  // turned on again (code.input-line-ex): sent as before
  bus.emit('code.input-line-ex', { name: '21', on: true }, C21);
  assert.equal(w.refused(':w'), null);
  w.handle(':w');
  assert.deepEqual(fileTo(bus), ['b-21']);
});

test('inputLineEx: an editor that never said (older pages, code.ready without it) takes ":" lines', () => {
  const { bus, w } = frameLike();
  assert.equal(w.refused(':w'), null);
  w.handle(':w');
  assert.deepEqual(fileTo(bus), ['b-21']);
});
