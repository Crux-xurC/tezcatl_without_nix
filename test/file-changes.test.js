'use strict';
// lib/code/file-changes.js: a change said on the bus x the code_editor open now ->
// which to read again, what to tell.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/code/file-changes.js');

// the bus id of a code_editor is the id code.here answers carry (eds below)
const meta = (name) => ({ from: { id: ({ saver: 'e1' })[name] || 'b-' + name, name } });
const eds = [
  { id: 'e1', name: 'saver', path: 'fr/a.txt', dirty: false },
  { id: 'e2', name: 'clean', path: '/fr/a.txt', dirty: false },
  { id: 'e3', name: 'edited', path: 'fr/a.txt', dirty: true },
  { id: 'e4', name: 'other', path: 'fr/b.txt', dirty: false },
  { id: 'e5', name: 'nopath', path: null, dirty: false },
];

test('fromMessage: code.saved, fs.changed and file.changed; the maker is `by`', () => {
  assert.deepEqual(C.fromMessage('code.saved', { name: 'saver', path: 'fr/a.txt' }, meta('saver')),
    { op: 'write', paths: ['fr/a.txt'], by: 'saver', byId: 'e1', source: 'code_editor' });
  assert.deepEqual(C.fromMessage('fs.changed', { op: 'rename', paths: ['a', '/b'] }, meta('x')),
    { op: 'rename', paths: ['a', 'b'], by: 'x', byId: 'b-x', source: 'code_editor' });
  assert.deepEqual(C.fromMessage('file.changed', { op: 'write', paths: ['a'], source: 'git' }, meta('term')),
    { op: 'write', paths: ['a'], by: null, byId: null, source: 'git' });
  assert.equal(C.fromMessage('fs.changed', { op: 'rename', paths: ['a'] }), null);
  assert.equal(C.fromMessage('code.saved', {}), null);
  assert.equal(C.fromMessage('code.dirty', { name: 'x' }), null);
});

test('a write: clean code_editor on the path are read again, edited ones told; the maker and other paths left alone', () => {
  const r = C.plan(C.fromMessage('code.saved', { name: 'saver', path: 'fr/a.txt' }, meta('saver')), eds);
  assert.deepEqual(r.reload, [{ id: 'e2', name: 'clean', path: 'fr/a.txt' }]);
  assert.equal(r.notices.length, 1);
  assert.equal(r.notices[0].id, 'e3');
  assert.match(r.notices[0].text, /this code_editor has edits: :e! reads it again, :Replay/);
});

test('a write from outside (file.changed): every code_editor on the path, the maker unknown', () => {
  const r = C.plan(C.fromMessage('file.changed', { paths: ['fr/a.txt'], source: 'git' }), eds);
  assert.deepEqual(r.reload.map((x) => x.id), ['e1', 'e2']);
  assert.match(r.notices[0].text, /\(git\)/);
});

test('delete and rename are told, never read again', () => {
  const d = C.plan(C.fromMessage('fs.changed', { op: 'delete', paths: ['fr/a.txt'] }, meta('saver')), eds);
  assert.deepEqual(d.reload, []);
  assert.deepEqual(d.notices.map((n) => [n.id, n.op]), [['e2', 'delete'], ['e3', 'delete']]);
  const m = C.plan(C.fromMessage('fs.changed', { op: 'rename', paths: ['fr/a.txt', 'fr/z.txt'] }, meta('saver')), eds);
  assert.deepEqual(m.notices.map((n) => [n.id, n.to]), [['e2', 'fr/z.txt'], ['e3', 'fr/z.txt']]);
  assert.match(m.notices[0].text, /was moved to fr\/z\.txt.*:e fr\/z\.txt/);
});

test('key: the same change said twice is one', () => {
  const a = C.fromMessage('code.saved', { name: 'saver', path: 'n.txt' }, meta('saver'));
  const b = C.fromMessage('fs.changed', { op: 'write', paths: ['n.txt'] }, meta('saver'));
  assert.equal(C.key(a), C.key(b));
});

test('code.closed: a notice only when closed with unsaved edits (with or without a copy)', () => {
  assert.equal(C.closedNotice({ name: 'f1', path: 'a.txt', dirty: false }), null);
  const n = C.closedNotice({ name: 'f1', path: '/fc/a.txt', dirty: true, copy: true });
  assert.equal(n.path, 'fc/a.txt');
  assert.equal(n.copy, true);
  assert.match(n.text, /the code_editor panel of fc\/a\.txt was closed unsaved \(f1\) ── Enter opens it; :Replay/);
  assert.match(C.closedNotice({ name: 'f1', path: 'a.txt', dirty: true, copy: false }).text, /there is no copy/);
  const np = C.closedNotice({ name: 'f2', path: null, dirty: true });
  assert.equal(np.path, null);
  assert.match(np.text, /a text with no path.*there is no copy/);
});

test('closedFromSlots: the slots marked unsaved_closed, the newest first', () => {
  const r = C.closedFromSlots([
    { path: 'a.txt', unsaved_closed: 100 },
    { path: 'b.txt', unsaved_closed: null },
    { path: 'c.txt', unsaved_closed: 300 },
    { path: 'd.txt' },
  ]);
  assert.deepEqual(r.map((x) => x.path), ['c.txt', 'a.txt']);
  assert.match(r[0].text, /c\.txt was closed unsaved/);
  assert.deepEqual(C.closedFromSlots(null), []);
});

test('leftNotices: one notice per path a rename was refused over, with how to tidy up', () => {
  const r = C.leftNotices({ paths: ['/a.txt', '', 'b/c.ex'], why: 'rename' });
  assert.deepEqual(r.map((n) => n.path), ['a.txt', 'b/c.ex']);
  assert.ok(r.every((n) => n.copy === true));
  assert.match(r[0].text, /a rename reaching this file/);
  assert.match(r[0].text, /d drops the copy/);
  assert.deepEqual(C.leftNotices(null), []);
});

test('the maker is told apart by its bus id: another code_editor with the same name is read again (2026-10-09)', () => {
  const twins = [
    { id: 'w1', name: 'code', path: 'fr/a.txt', dirty: false },
    { id: 'w2', name: 'code', path: 'fr/a.txt', dirty: false },
  ];
  const r = C.plan(C.fromMessage('code.saved', { name: 'code', path: 'fr/a.txt' }, { from: { id: 'w1', name: 'code' } }), twins);
  assert.deepEqual(r.reload.map((x) => x.id), ['w2']);
});

test('plan with reload off (code.json fileChanges.reload false): a clean code_editor is told, not read again', () => {
  const C = require('../lib/code/file-changes.js');
  const change = C.fromMessage('file.changed', { op: 'write', paths: ['a.ex'], source: 'check update' }, null);
  const editors = [{ id: 'x', name: 'f1', path: 'a.ex', dirty: false }];
  assert.equal(C.plan(change, editors).reload.length, 1);
  const off = C.plan(change, editors, { reload: false });
  assert.equal(off.reload.length, 0);
  assert.match(off.notices[0].text, /a\.ex changed on the disk \(check update\) ── :e reads it again/);
});
