'use strict';
// lib/task/task-list.js: the task list cut from a task_table, and what its changes do to the book (D-task-list)
const test = require('node:test');
const assert = require('node:assert/strict');
const TL = require('../lib/task/task-list.js');

const BOOK = {
  name: 'tasks a', path: 'n.md',
  columns: ['id', 'state', 'pri', 'task', 'inner_id'],
  rows: [
    ['t-01', 'TODO', 'A', 'first', 'aaaa0001'],
    ['t-02', 'NEXT', '', 'second', 'aaaa0002'],
    ['t-02-01', 'NEXT', '', 'under', 'aaaa0003'],
    ['t-02-01-01', 'TODO', '', 'deeper', 'aaaa0004'],
    ['t-03', 'TODO', '', 'third', 'aaaa0005'],
  ],
};

test('cut: the rows given, in that order; a row with no id yet is refused', () => {
  const { list } = TL.cut(BOOK, [4, 1, 2]);
  assert.deepEqual([list.source, list.book, list.path], ['tasks a', '~work/books/tasks_a.json', 'n.md']);
  assert.deepEqual(list.rows.map((r) => r[0]), ['t-03', 't-02', 't-02-01']);
  const noid = Object.assign({}, BOOK, { rows: BOOK.rows.concat([['t-04', 'TODO', '', 'x', '#eigenvalue']]) });
  assert.match(TL.cut(noid, [5]).error, /1 row\(s\) have no id yet/);
});

test('label / sub / cycle: a line of the list; the states in order, round', () => {
  const { list } = TL.cut(BOOK, [0, 2]);
  assert.equal(TL.label(list, list.rows[0]), 'TODO [#A] first');
  assert.equal(TL.label(list, list.rows[1]), 'NEXT under');
  assert.equal(TL.sub(list, list.rows[1]), 't-02-01');
  assert.equal(TL.cycle('TODO'), 'NEXT');
  assert.equal(TL.cycle('CANCELLED'), 'TODO');
  assert.equal(TL.cycle('??'), 'TODO');
});

test('setState: the row of the same id in the book; DONE goes down to every row under it, hidden ones too', () => {
  const { list } = TL.cut(BOOK, [1, 2, 4]);     // t-02-01-01 is not in the list
  const r = TL.setState(list, BOOK, 0, 'DONE');
  assert.deepEqual(r.book.rows.map((x) => x[1]), ['TODO', 'DONE', 'DONE', 'DONE', 'TODO']);
  assert.deepEqual(r.list.rows.map((x) => x[1]), ['DONE', 'DONE', 'TODO']);
  assert.equal(r.n, 3);
  assert.equal(BOOK.rows[1][1], 'NEXT');
  const n = TL.setState(list, BOOK, 0, 'NEXT');
  assert.deepEqual(n.book.rows.map((x) => x[1]), ['TODO', 'NEXT', 'NEXT', 'TODO', 'TODO']);
  assert.equal(n.n, 1);
  const gone = TL.setState(list, Object.assign({}, BOOK, { rows: [] }), 0, 'DONE');
  assert.equal(gone.missing, true);
});

test('add / drop / lineOf: a new top-level task in both; a row out of the list only; the id\'s line in the note', () => {
  const { list } = TL.cut(BOOK, [0]);
  const a = TL.add(list, BOOK, 'new | one', 'bbbb0001');
  assert.equal(a.no, 't-04');
  assert.deepEqual(a.book.rows[5], ['t-04', 'TODO', '', 'new \\| one', 'bbbb0001']);
  assert.deepEqual(a.list.rows[1], ['t-04', 'TODO', '', 'new \\| one', 'bbbb0001']);
  assert.deepEqual(TL.drop(a.list, 0).rows.map((r) => r[0]), ['t-04']);
  assert.equal(TL.lineOf('a\n| t-01 | aaaa0001 |\n', 'aaaa0001'), 2);
  assert.equal(TL.lineOf('a', 'zzz'), null);
});
