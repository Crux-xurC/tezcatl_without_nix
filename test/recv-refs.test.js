'use strict';
// lib/skin/recv-refs.js: what a line of the receiving side points at
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/skin/recv-refs.js');

test('sound: a panel, a place in a file, a list; anything else is none', () => {
  assert.deepEqual(R.sound({ kind: 'panel', id: 'f1-2', more: 1 }), { kind: 'panel', id: 'f1-2' });
  assert.deepEqual(R.sound({ kind: 'at', path: 'lib/a.js', line: 12, col: 3 }), { kind: 'at', path: 'lib/a.js', line: 12, col: 3 });
  assert.deepEqual(R.sound({ kind: 'at', path: 'lib/a.js', col: 3 }), { kind: 'at', path: 'lib/a.js', line: null, col: null });
  assert.deepEqual(R.sound({ kind: 'list', name: 'lsp', items: ['a'] }), { kind: 'list', name: 'lsp', items: ['a'] });
  [null, 'x', {}, { kind: 'panel' }, { kind: 'at' }, { kind: 'list', name: 'lsp' }, { kind: 'nowhere', id: 'a' }]
    .forEach((v) => assert.equal(R.sound(v), null));
});

test('mark: @place of the panel now, @path:line; a list and a closed panel show nothing', () => {
  const placeOf = (id) => (id === 'f1-2' ? '21' : null);
  assert.equal(R.mark({ kind: 'panel', id: 'f1-2' }, placeOf), '@21');
  assert.equal(R.mark({ kind: 'panel', id: 'gone' }, placeOf), '');
  assert.equal(R.mark({ kind: 'at', path: 'lib/a.js', line: 12, col: 3 }), '@lib/a.js:12:3');
  assert.equal(R.mark({ kind: 'at', path: 'lib/a.js', line: null, col: null }), '@lib/a.js');
  assert.equal(R.mark({ kind: 'list', name: 'lsp', items: [] }), '');
  assert.equal(R.mark(null), '');
});

test('last: the last panel or place -- a list is not somewhere to go; lines without one do not count', () => {
  const s = R.create();
  assert.equal(s.last(), null);
  assert.equal(s.add(null), null);
  s.add({ kind: 'panel', id: 'a' });
  s.add({ kind: 'at', path: 'x.js', line: 2 });
  assert.deepEqual(s.last(), { kind: 'at', path: 'x.js', line: 2, col: null });
  s.add({ kind: 'list', name: 'lsp', items: [1, 2] });
  s.add('not one');
  assert.deepEqual(s.last(), { kind: 'at', path: 'x.js', line: 2, col: null });
});

test('item: number n of the last list of that name', () => {
  const s = R.create();
  assert.match(s.item('lsp', 1).error, /no lsp list yet/);
  s.add({ kind: 'list', name: 'lsp', items: ['k1', 'k2'] });
  s.add({ kind: 'list', name: 'other', items: ['o1'] });
  assert.deepEqual(s.item('lsp', 2), { item: 'k2' });
  assert.deepEqual(s.item('lsp', '1'), { item: 'k1' });
  assert.match(s.item('lsp', 3).error, /no 3 in the last lsp list \(1 to 2\)/);
  assert.match(s.item('lsp', 'x').error, /no x in the last lsp list/);
  s.add({ kind: 'list', name: 'lsp', items: [] });
  assert.match(s.item('lsp', 1).error, /the last lsp list is empty/);
});

test('create(max): only as many as the lines kept', () => {
  const s = R.create(2);
  s.add({ kind: 'list', name: 'lsp', items: ['old'] });
  s.add({ kind: 'panel', id: 'a' });
  s.add({ kind: 'panel', id: 'b' });
  assert.match(s.item('lsp', 1).error, /no lsp list yet/);
  assert.deepEqual(s.last(), { kind: 'panel', id: 'b' });
});

test('text: what "@" alone becomes -- the place now, path:line, the ids of a coordinate; a list or a closed panel: none', () => {
  const placeOf = (id) => (id === 'f1-2' ? '21' : null);
  assert.equal(R.text({ kind: 'panel', id: 'f1-2' }, placeOf), '21');
  assert.equal(R.text({ kind: 'panel', id: 'gone' }, placeOf), null);
  assert.equal(R.text({ kind: 'panel', id: 'f1-2' }), null);
  assert.equal(R.text({ kind: 'at', path: 'lib/a.js', line: 12 }), 'lib/a.js:12');
  assert.equal(R.text(R.sound({ kind: 'coord', type: 'calc_row', ids: ['a1', 'a2'] })), 'a1 a2');
  assert.equal(R.text({ kind: 'list', name: 'lsp', items: [] }), null);
  assert.equal(R.text(null), null);
});

test('a coordinate is somewhere to go (last), and sound keeps only what it knows', () => {
  const s = R.create();
  s.add({ kind: 'panel', id: 'a' });
  s.add({ kind: 'coord', type: 'calc_row', table: 'xipe_rows:all', ids: ['a1'], cols: ['state'], scope: 'cell', panel: 'b1', name: 'm', value: 'never' });
  assert.deepEqual(s.last(), { kind: 'coord', type: 'calc_row', table: 'xipe_rows:all', ids: ['a1'], cols: ['state'], scope: 'cell', panel: 'b1', name: 'm' });
  assert.equal(R.sound({ kind: 'coord', type: 'calc_row', ids: [] }), null);
});

test('a bus reference: a panel by its bus id (what a panel says of another); its text is its name', () => {
  const R = require('../lib/skin/recv-refs.js');
  assert.deepEqual(R.sound({ kind: 'bus', id: 'f-abc', name: 'f1', extra: 1 }), { kind: 'bus', id: 'f-abc', name: 'f1' });
  assert.deepEqual(R.sound({ kind: 'bus', id: 'f-abc' }), { kind: 'bus', id: 'f-abc', name: null });
  assert.equal(R.sound({ kind: 'bus' }), null);
  assert.equal(R.text({ kind: 'bus', id: 'f-abc', name: 'f1' }), 'f1');
  assert.equal(R.mark({ kind: 'bus', id: 'f-abc', name: null }), '@f-abc');
  const refs = R.create(10);
  refs.add({ kind: 'bus', id: 'f-abc', name: 'f1' });
  assert.equal(refs.last().kind, 'bus');
});
