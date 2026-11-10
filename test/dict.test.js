'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dict = require('../lib/list/dict.js');

test('parseLine: the word is everything before the first ":"', () => {
  assert.deepEqual(dict.parseLine('row/add: make a calc row'), { word: 'row/add', note: 'make a calc row' });
  assert.deepEqual(dict.parseLine('  eval/run :  評価: 非同期  '), { word: 'eval/run', note: '評価: 非同期' });
  assert.deepEqual(dict.parseLine('help'), { word: 'help', note: '' });
  assert.equal(dict.parseLine('   '), null);
  assert.equal(dict.parseLine(': only a note'), null);
});

test('parseYank: one entry per non-blank line', () => {
  const out = dict.parseYank('row/add: make a calc row\n\nrow/list: 一覧\r\nscan\n');
  assert.deepEqual(out.map((e) => e.word), ['row/add', 'row/list', 'scan']);
  assert.deepEqual(dict.parseYank(''), []);
  assert.deepEqual(dict.parseYank(null), []);
});

test('add: appends new words, keeps order, refreshes a note only when non-empty', () => {
  let doc = dict.add({}, 'xipe', dict.parseYank('row/add: 作る\nrow/list'));
  doc = dict.add(doc, 'xipe', dict.parseYank('row/list: 一覧\nrow/add\nscan: 走査'));
  assert.deepEqual(dict.entries(doc, 'xipe'), [
    { word: 'row/add', note: '作る' },
    { word: 'row/list', note: '一覧' },
    { word: 'scan', note: '走査' },
  ]);
  assert.deepEqual(dict.entries(doc, 'other'), []);
});

test('remove: drops one word from one list only', () => {
  let doc = dict.add({}, 'a', [{ word: 'x' }, { word: 'y' }]);
  doc = dict.add(doc, 'b', [{ word: 'x' }]);
  doc = dict.remove(doc, 'a', 'x');
  assert.deepEqual(dict.entries(doc, 'a').map((e) => e.word), ['y']);
  assert.deepEqual(dict.entries(doc, 'b').map((e) => e.word), ['x']);
});

test('normalize: tolerates junk and missing fields', () => {
  assert.deepEqual(dict.normalize(null), { lists: {} });
  assert.deepEqual(dict.normalize({ lists: { a: [null, { word: '' }, { word: 'ok', note: 3 }], b: 'x' } }),
    { lists: { a: [{ word: 'ok', note: '' }], b: [] } });
});

test('complete: prefix matches first, then substring matches', () => {
  const list = dict.parseYank('row/add\nrow/list\neval/run\ncard/get\narrow');
  assert.deepEqual(dict.complete(list, 'row').map((e) => e.word), ['row/add', 'row/list', 'arrow']);
  assert.deepEqual(dict.complete(list, '/r').map((e) => e.word), ['eval/run']);
  assert.equal(dict.complete(list, '').length, 5);
  assert.deepEqual(dict.complete(list, 'zzz'), []);
});
