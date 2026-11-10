'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const xr = require('../lib/xipe/xipe-rows.js');

const M = '[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]';

test('sentence: one phrase per calc row from the structured fields', () => {
  assert.equal(xr.sentence({ label: 'Calc.add/2', args: ['1', '2'], value: '5', state: 'ok' }), 'Calc.add/2 (1, 2) → 5');
  assert.equal(xr.sentence({ label: 'Calc.wide_list/0', args: [], value: '[1]', state: 'ok' }), 'Calc.wide_list/0 () → [1]');
  assert.equal(xr.sentence({ label: 'Calc.average/1', args: ['[]'], value: null, state: 'eval_error' }), 'Calc.average/1 ([]) → (error)');
  assert.equal(xr.sentence({ label: 'Calc.add/2', args: ['1', '2'], value: null, state: 'ok' }), 'Calc.add/2 (1, 2) → (not evaluated)');
});

test("sentence: Xipe Totec's summary / args_summary replace the raw text when given", () => {
  const r = { label: 'Mat.mul/2', args: [M, M], args_summary: ['list 4×4', null], value: M, summary: 'list 4×4', state: 'ok' };
  assert.equal(xr.sentence(r), 'Mat.mul/2 (list 4×4, ' + M + ') → list 4×4');
});

test('params: call_ids narrows, anything else lists all', () => {
  assert.deepEqual(xr.params('call_ids=a,b'), { call_ids: ['a', 'b'] });
  assert.deepEqual(xr.params('all'), {});
  assert.deepEqual(xr.params(''), {});
});

test('toGrid: sentence/state/compare/eval_count, plus error only when some row has one', () => {
  const g = xr.toGrid({ rows: [
    { id: 'c1', label: 'Calc.add/2', args: ['1', '2'], value: '5', state: 'ok', compare: 'same', eval_count: 4, error: null },
  ] });
  assert.deepEqual(g.columns.map((c) => c.key), ['sentence', 'node', 'state', 'compare', 'eval_count']);
  assert.deepEqual(g.rows[0], { id: 'c1', cells: { sentence: 'Calc.add/2 (1, 2) → 5', node: '', state: 'ok', compare: 'same', eval_count: '4' } });
  const g2 = xr.toGrid({ rows: [
    { id: 'c1', label: 'A.f/0', args: [], value: '1', state: 'ok' },
    { id: 'c2', label: 'A.g/0', args: [], value: null, state: 'eval_error', error: '{:badarith, []}' },
  ] });
  assert.equal(g2.columns[5].key, 'error');
  assert.equal(g2.rows[1].cells.error, '{:badarith, []}');
  assert.equal(g2.rows[0].cells.error, '');
  // the type of its rows: the adapter's word, said with a selection's coordinate (`radar`)
  assert.deepEqual(xr.toGrid(null), { type: 'calc_row', columns: xr.toGrid({ rows: [] }).columns, rows: [] });
});

test('toGrid: a row carries where its function is defined (open), put under the FS root by place', () => {
  const rows = [
    { id: 'c1', label: 'Calc.add/2', args: [], value: '1', state: 'ok', path: 'lib/calc.ex', line: 4 },
    { id: 'c2', label: 'Calc.sub/2', args: [], value: '1', state: 'ok', path: 'lib/calc.ex', line: null },
    { id: 'c3', label: null, args: [], value: '1', state: 'ok', linked: false, path: null, line: null },
  ];
  const g = xr.toGrid({ rows }, (p) => 'proj/' + p);
  assert.deepEqual(g.rows[0].open, { path: 'proj/lib/calc.ex', span: { line: 4 } });
  assert.deepEqual(g.rows[1].open, { path: 'proj/lib/calc.ex', span: null });
  assert.equal(g.rows[2].open, undefined);
  // a path a code_editor cannot reach, or no place given at all: no open
  assert.equal(xr.toGrid({ rows }, () => null).rows[0].open, undefined);
  assert.equal(xr.toGrid({ rows }).rows[0].open, undefined);
});

test('toGrid: node column from row/list `linked` -- a row whose function a rescan removed is "gone"', () => {
  const g = xr.toGrid({ rows: [
    { id: 'c1', label: 'Calc.add/2', args: ['1', '2'], value: '3', state: 'ok', linked: true },
    { id: 'c2', label: null, args: ['6', '7'], value: '42', state: 'ok', linked: false },
  ] });
  assert.equal(g.columns.find((c) => c.key === 'node').render, 'state');
  assert.deepEqual(g.rows.map((r) => r.cells.node), ['ok', 'gone']);
  assert.equal(g.rows[1].cells.sentence, '? (6, 7) → 42');
});

test('toGrid: a ⟦call id⟧ argument shows the referenced row by label (unknown ids stay as-is)', () => {
  const g = xr.toGrid({ rows: [
    { id: '01AAAAADD1', label: 'Calc.add/2', args: ['1', '2'], value: '5', state: 'ok' },
    { id: '01BBBBSQR2', label: 'Calc.square/1', args: ['⟦01AAAAADD1⟧'], value: '25', state: 'ok' },
    { id: '01CCCCZZZ3', label: 'Calc.neg/1', args: ['⟦01NOTHERE0⟧'], value: null, state: 'ok' },
  ] });
  assert.equal(g.rows[1].cells.sentence, 'Calc.square/1 (⟦Calc.add/2#ADD1⟧) → 25');
  assert.equal(g.rows[2].cells.sentence, 'Calc.neg/1 (⟦01NOTHERE0⟧) → (not evaluated)');
});
