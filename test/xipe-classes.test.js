'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/xipe/xipe-classes.js');

const cards = [
  { id: 'N1', label: 'Calc.add/2', effect: 'pure', effect_source: 'user', path: 'calc.exs', line: 2, rows: 1 },
  { id: 'N2', label: 'Calc.sub/2', effect: 'pure', effect_source: 'agent', effect_reason: 'subtracts; touches nothing', path: 'calc.exs', line: 3, rows: 2 },
  { id: 'N3', label: 'Calc.mul/2', effect: 'reads', effect_source: 'changed', effect_reason: null, path: 'calc.exs', line: 4, rows: 0 },
  { id: 'N4', label: 'Calc.square/1', effect: 'unknown', effect_source: null, path: 'calc.exs', line: 5, rows: 0 },
  { id: 'N5', label: 'Gone.f/0', effect: 'pure', effect_source: 'agent', effect_reason: 'x', path: null, line: null },
];

test('only the classes waiting for a person: proposed by an agent, or a body changed since', () => {
  assert.deepEqual(C.waiting({ cards }, 'all').map((c) => c.id), ['N2', 'N3', 'N5']);
  assert.deepEqual(C.waiting({ cards }, 'source=agent').map((c) => c.id), ['N2', 'N5']);
  assert.deepEqual(C.waiting({ cards }, 'source=changed').map((c) => c.id), ['N3']);
  assert.deepEqual(C.waiting({ cards }, 'source=nonsense').map((c) => c.id), ['N2', 'N3', 'N5']);
  assert.deepEqual(C.waiting(null, 'all'), []);
});

test('a row says the class, why it waits, the agent\'s reason; g d goes to the function', () => {
  const g = C.toGrid({ cards }, (p) => 'proj/' + p, 'all');
  assert.equal(g.type, 'function');
  assert.deepEqual(g.columns.map((c) => c.key), ['function', 'class', 'why', 'reason', 'rows']);
  const [sub, mul, gone] = g.rows;
  assert.deepEqual(sub, { id: 'N2', cells: { function: 'Calc.sub/2', class: 'pure', why: 'proposed', reason: 'subtracts; touches nothing', rows: '2' }, open: { path: 'proj/calc.exs', span: { line: 3 } } });
  assert.equal(mul.cells.why, 'body changed');
  assert.equal(mul.cells.class, 'reads', 'the class approved before');
  assert.equal(mul.cells.reason, '');
  assert.equal(gone.open, undefined, 'no file, nothing to open');
  assert.equal(C.toGrid({ cards }, null, 'all').rows[0].open, undefined, 'no place resolver, nothing to open');
});

test('effect/approve takes the ids selected', () => {
  assert.deepEqual(C.approveParams(['N2', '', null, 'N3']), { ids: ['N2', 'N3'] });
  assert.deepEqual(C.approveParams(undefined), { ids: [] });
});
