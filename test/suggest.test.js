'use strict';
// lib/skin/suggest.js: the next word from a source's table, and the cursor
// through the grid of candidates (D-suggestions).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/skin/suggest.js');

const table = {
  columns: [{ key: 'line' }, { key: 'desc' }],
  rows: [
    { id: 1, cells: { line: 'skin main <ratios>', desc: 'the main ratios' } },
    { id: 2, cells: { line: 'skin add <panel> [-bare]', desc: 'add a panel' } },
    { id: 3, cells: { line: 'skin add line [at]', desc: 'add a line' } },
    { id: 4, cells: { line: 'block arrange t|b|r|l', desc: 'turn the thema' } },
    { id: 5, cells: { line: 'skin axis h|v', desc: 'the main axis' } },
    { id: 6, cells: { line: 'go on', desc: 'go to the reference' } },
    { id: 7, cells: { line: '', desc: 'blank: skipped' } },
  ],
};
const idx = S.index(table, { word: 'line', desc: 'desc' });
const ws = (r) => r.items.map((x) => x.word);

test('an empty line: the first words, in the order of the source', () => {
  assert.deepEqual(ws(S.next(idx, '')), ['skin', 'block', 'go']);
});

test('the words that follow, without repeating one', () => {
  assert.deepEqual(ws(S.next(idx, 'skin ')), ['main', 'add', 'axis']);
  assert.deepEqual(ws(S.next(idx, 'skin axis ')), ['h', 'v']);
  assert.deepEqual(ws(S.next(idx, 'block arrange ')), ['t', 'b', 'r', 'l']);
});

test('the word being typed narrows by prefix', () => {
  const r = S.next(idx, 'skin a');
  assert.deepEqual(ws(r), ['add', 'axis']);
  assert.equal(r.partial, 'a');
  assert.equal(r.head, 'skin ');
  assert.deepEqual(ws(S.next(idx, 'sk')), ['skin']);
  assert.deepEqual(ws(S.next(idx, 'x')), []);
});

test('an argument is never a word: only its hint, and it matches anything typed', () => {
  const r = S.next(idx, 'skin main ');
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.hints, [{ hint: '<ratios>', desc: 'the main ratios' }]);
  const add = S.next(idx, 'skin add ');
  assert.deepEqual(ws(add), ['line']);
  assert.deepEqual(add.hints.map((h) => h.hint), ['<panel>']);
  assert.deepEqual(S.next(idx, 'skin add tree ').hints.map((h) => h.hint), ['[-bare]']);
});

test('a word that ends a line carries its desc', () => {
  assert.equal(S.next(idx, 'go ').items[0].desc, 'go to the reference');
  assert.equal(S.next(idx, '').items[0].desc, '');
});

test('anywhere (a dictionary): the words before do not narrow, the word being typed does', () => {
  const d = S.index({ rows: [{ id: 'a', cells: { word: 'row/add', note: 'a calc row' } },
    { id: 'b', cells: { word: 'row/del', note: '' } }, { id: 'c', cells: { word: 'card', note: '' } }] },
  { word: 'word', desc: 'note', anywhere: true });
  assert.deepEqual(ws(S.next(d, 'eval ')), ['row/add', 'row/del', 'card']);
  assert.deepEqual(ws(S.next(d, 'eval ro')), ['row/add', 'row/del']);
  assert.equal(S.next(d, 'x ').items[0].desc, 'a calc row');
});

test('pick replaces the word being typed and adds one blank', () => {
  assert.equal(S.pick('skin a', 'add'), 'skin add ');
  assert.equal(S.pick('skin ', 'add'), 'skin add ');
  assert.equal(S.pick('', 'skin'), 'skin ');
});

// a dock grid: 5 rows x 2 columns = 10 cells a page
const st = (i, count) => ({ i, count, rows: 5, cells: 10 });

test('j/k one, stopping at both ends', () => {
  assert.equal(S.move(st(0, 23), 'j').i, 1);
  assert.equal(S.move(st(4, 23), 'j').i, 5);       // 5 -> 6: crosses the column
  assert.equal(S.move(st(0, 23), 'k').i, 0);
  assert.equal(S.move(st(22, 23), 'j').i, 22);
  assert.equal(S.move(st(9, 23), 'ArrowDown').i, 10);   // to the next page
});

test('h/l a column, to the next page from the last column', () => {
  assert.equal(S.move(st(1, 23), 'l').i, 6);
  assert.equal(S.move(st(6, 23), 'l').i, 11);
  assert.equal(S.move(st(6, 23), 'h').i, 1);
  assert.equal(S.move(st(1, 23), 'h').i, 1);
});

test('an empty cell: the last candidate when its column has one, else stay', () => {
  // 23: the third page has 20, 21, 22 in its first column
  assert.equal(S.move(st(18, 23), 'l').i, 22);
  assert.equal(S.move(st(21, 23), 'l').i, 21);     // 26: that column is empty
  assert.equal(S.move(st(4, 7), 'l').i, 6);
});

test('^/- a page, the same cell; the last of the page when empty', () => {
  assert.equal(S.move(st(3, 23), '^').i, 13);
  assert.equal(S.move(st(13, 23), '-').i, 3);
  assert.equal(S.move(st(13, 23), '^').i, 22);
  assert.equal(S.move(st(22, 23), '^').i, 22);
  assert.equal(S.move(st(3, 23), '-').i, 3);
});

test('a select key picks that cell of the page; Enter picks the cursor', () => {
  assert.deepEqual(S.move(st(12, 23), '3'), { i: 12, pick: true });
  assert.deepEqual(S.move(st(12, 23), '0'), { i: 19, pick: true });
  assert.deepEqual(S.move(st(22, 23), '5'), { i: 22, pick: false });   // 24: no candidate there
  assert.deepEqual(S.move(st(0, 23), '0'), { i: 9, pick: true });
  assert.deepEqual(S.move(st(4, 23), 'Enter'), { i: 4, pick: true });
  assert.deepEqual(S.move(st(0, 0), 'Enter'), { i: 0, pick: false });
  assert.deepEqual(S.move(st(0, 23), 'x'), { i: 0, pick: false });
});

test('cells past the select keys get no number and are reached by the cursor only', () => {
  const s = { i: 0, count: 20, rows: 4, cells: 12, keys: '1234567890' };
  const p = S.page(s);
  assert.equal(p.cells[9].key, '0');
  assert.equal(p.cells[10].key, null);
  assert.equal(S.move(s, '0').i, 9);
});

test('page: filled top to bottom, then the next column; can it turn', () => {
  const p = S.page(st(12, 23));
  assert.equal(p.page, 1);
  assert.equal(p.first, 10);
  assert.equal(p.cells.length, 10);
  assert.deepEqual(p.cells[6], { i: 16, row: 1, col: 1, key: '7' });
  assert.equal(p.prev, true);
  assert.equal(p.next, true);
  const last = S.page(st(22, 23));
  assert.equal(last.cells.length, 3);
  assert.equal(last.next, false);
  assert.equal(S.page(st(0, 0)).cells.length, 0);
});
