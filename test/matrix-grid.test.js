'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mx = require('../lib/xipe/matrix-grid.js');

function k(key) { return { key: key, modifiers: [] }; }

function fakeBus() {
  const posted = [];
  return { post(type, payload) { posted.push([type, payload]); }, posted };
}

function sampleColumns() {
  return [
    { key: 'arg0', label: 'arg0', render: 'text' },
    { key: 'result', label: 'result', render: 'ref' },
    { key: 'state', label: 'state', render: 'state' },
  ];
}

function sampleRows() {
  return [
    { id: 'r1', cells: { arg0: '1', result: 'a', state: 'ok' }, open: { path: 'lib/x.ex', span: { line: 3 } } },
    { id: 'r2', cells: { arg0: '2', result: 'b', state: 'ok' } },
    { id: 'r3', cells: { arg0: '10', result: 'c', state: 'eval_error' } },
  ];
}

function grid(extra) {
  return mx.create(Object.assign({ columns: sampleColumns(), rows: sampleRows() }, extra));
}

// ---- filter expressions ----------------------------------------------

test('parseFilterExpr: empty matches everything', () => {
  const p = mx.parseFilterExpr('');
  assert.equal(p('anything'), true);
  assert.equal(p(''), true);
});

test('parseFilterExpr: no operator -> case-insensitive substring', () => {
  const p = mx.parseFilterExpr('Err');
  assert.equal(p('eval_error'), true);
  assert.equal(p('ok'), false);
});

test('parseFilterExpr: numeric operators compare as numbers', () => {
  assert.equal(mx.parseFilterExpr('>5')('10'), true);
  assert.equal(mx.parseFilterExpr('>5')('2'), false);
  assert.equal(mx.parseFilterExpr('<=2')('2'), true);
  assert.equal(mx.parseFilterExpr('!=2')('3'), true);
});

test('parseFilterExpr: non-numeric rhs falls back to string compare', () => {
  assert.equal(mx.parseFilterExpr('=ok')('ok'), true);
  assert.equal(mx.parseFilterExpr('=ok')('eval_error'), false);
});

// ---- CSV ---------------------------------------------------------------

test('toCSVField: quotes commas/quotes/newlines, passes plain text through', () => {
  assert.equal(mx.toCSVField('plain'), 'plain');
  assert.equal(mx.toCSVField('a,b'), '"a,b"');
  assert.equal(mx.toCSVField('a"b'), '"a""b"');
  assert.equal(mx.toCSVField('a\nb'), '"a\nb"');
  assert.equal(mx.toCSVField(null), '');
});

test('rowsToCSV: header + rows, in column order', () => {
  const csv = mx.rowsToCSV(sampleColumns(), sampleRows());
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'arg0,result,state');
  assert.equal(lines[1], '1,a,ok');
  assert.equal(lines.length, 4);
});

test('grid.toCSV: reflects current sort/filter, not raw insertion order', () => {
  const g = grid();
  g.toggleSort('arg0'); // ascending by arg0 (numeric: 1, 2, 10)
  const csv = g.toCSV();
  assert.deepEqual(csv.split('\r\n').slice(1).map((l) => l.split(',')[0]), ['1', '2', '10']);
});

// ---- cursor movement / gutter clamp ------------------------------------

test('grid starts at rowIndex 0, col -1 (gutter)', () => {
  const g = grid();
  assert.deepEqual(g.getState().cursor, { rowIndex: 0, col: -1 });
});

test('h/l clamp at the gutter and the last column, do not wrap', () => {
  const g = grid();
  g.handleKey(k('h'));
  assert.equal(g.getState().cursor.col, -1);
  g.handleKey(k('l')); g.handleKey(k('l')); g.handleKey(k('l')); g.handleKey(k('l'));
  assert.equal(g.getState().cursor.col, 2); // 3 columns, last index 2
});

test('j/k clamp at first/last row', () => {
  const g = grid();
  g.handleKey(k('k'));
  assert.equal(g.getState().cursor.rowIndex, 0);
  g.handleKey(k('j')); g.handleKey(k('j')); g.handleKey(k('j')); g.handleKey(k('j'));
  assert.equal(g.getState().cursor.rowIndex, 2); // 3 rows, last index 2
});

test('arrow-key aliases move the same as hjkl', () => {
  const g = grid();
  g.handleKey(k('right'));
  assert.equal(g.getState().cursor.col, 0);
  g.handleKey(k('down'));
  assert.equal(g.getState().cursor.rowIndex, 1);
});

test('handleKey with modifiers is ignored (returns false, no movement)', () => {
  const g = grid();
  const consumed = g.handleKey({ key: 'l', modifiers: ['control'] });
  assert.equal(consumed, false);
  assert.equal(g.getState().cursor.col, -1);
});

// ---- visual selection ---------------------------------------------------

test('normal-mode selection is the single cursor cell (scope cell once past the gutter)', () => {
  const g = grid();
  g.handleKey(k('l')); g.handleKey(k('l')); // col 1 ("result")
  const sel = g._computeSelection();
  assert.equal(sel.scope, 'cell');
  assert.deepEqual(sel.rowIds, ['r1']);
  assert.deepEqual(sel.colKeys, ['result']);
});

test('cursor on the gutter -> scope "row", all columns', () => {
  const g = grid();
  const sel = g._computeSelection();
  assert.equal(sel.scope, 'row');
  assert.deepEqual(sel.colKeys, ['arg0', 'result', 'state']);
});

test('visual mode extends a rectangle between anchor and cursor', () => {
  const g = grid();
  g.handleKey(k('l')); // col 0
  g.handleKey(k('v')); // enter visual, anchor = (row0, col0)
  g.handleKey(k('j')); // row1
  g.handleKey(k('l')); // col1
  const sel = g._computeSelection();
  assert.equal(sel.scope, 'cell');
  assert.deepEqual(sel.rowIds, ['r1', 'r2']);
  assert.deepEqual(sel.colKeys, ['arg0', 'result']);
  assert.equal(g.getState().mode, 'visual');
});

test('visual selection touching the gutter promotes the whole span to scope "row"', () => {
  const g = grid();
  g.handleKey(k('v')); // anchor at gutter (col -1)
  g.handleKey(k('j'));
  g.handleKey(k('l')); // cursor now in a data column, but anchor was gutter
  const sel = g._computeSelection();
  assert.equal(sel.scope, 'row');
  assert.deepEqual(sel.colKeys, ['arg0', 'result', 'state']);
});

test('v again while already in visual mode returns to normal (toggle)', () => {
  const g = grid();
  g.handleKey(k('v'));
  assert.equal(g.getState().mode, 'visual');
  g.handleKey(k('v'));
  assert.equal(g.getState().mode, 'normal');
});

test('Escape exits visual mode and cancels a pending chord', () => {
  const g = grid();
  g.handleKey(k('v'));
  g.handleKey(k('c'));
  g.handleKey(k('escape'));
  const st = g.getState();
  assert.equal(st.mode, 'normal');
  assert.equal(st.pendingChord, null);
});

// ---- yank ---------------------------------------------------------------

test('y on a single cell yanks the bare value (not array-wrapped)', () => {
  const bus = fakeBus();
  const g = grid({ bus: bus });
  g.handleKey(k('l')); g.handleKey(k('l')); // col "result" -> "a"
  g.handleKey(k('y'));
  assert.equal(bus.posted.length, 1);
  const [type, payload] = bus.posted[0];
  assert.equal(type, 'killring.add');
  assert.equal(payload.source, 'matrix');
  assert.equal(JSON.parse(payload.text), 'a');
});

test('y over a visual range yanks a nested array and returns to normal', () => {
  const bus = fakeBus();
  const g = grid({ bus: bus });
  g.handleKey(k('l'));
  g.handleKey(k('v'));
  g.handleKey(k('j'));
  g.handleKey(k('y'));
  const payload = JSON.parse(bus.posted[0][1].text);
  assert.deepEqual(payload, [['1'], ['2']]);
  assert.equal(g.getState().mode, 'normal');
});

test('y on the gutter (whole row) yanks every column', () => {
  const bus = fakeBus();
  const g = grid({ bus: bus });
  g.handleKey(k('y'));
  const payload = JSON.parse(bus.posted[0][1].text);
  assert.deepEqual(payload, [['1', 'a', 'ok']]);
});

// ---- color ---------------------------------------------------------------

test('c then b sets the color and calls onColorChange', () => {
  const calls = [];
  const g = grid({ onColorChange: (id, key, val) => calls.push([id, key, val]) });
  g.handleKey(k('l')); g.handleKey(k('l')); // "result" cell of r1
  g.handleKey(k('c'));
  assert.equal(g.getState().pendingChord, 'c');
  g.handleKey(k('b'));
  assert.equal(g.getState().pendingChord, null);
  assert.deepEqual(g.getState().colors, { r1: { result: 'b' } });
  assert.deepEqual(calls, [['r1', 'result', 'b']]);
});

test('c then w clears a previously-set color instead of storing "white"', () => {
  const g = grid();
  g.handleKey(k('l')); g.handleKey(k('l'));
  g.handleKey(k('c')); g.handleKey(k('b'));
  assert.deepEqual(g.getState().colors, { r1: { result: 'b' } });
  g.handleKey(k('c')); g.handleKey(k('w'));
  assert.deepEqual(g.getState().colors, {});
});

test('c then an unrelated key cancels the chord without side effects', () => {
  const g = grid();
  g.handleKey(k('c'));
  const consumed = g.handleKey(k('x'));
  assert.equal(consumed, false);
  assert.equal(g.getState().pendingChord, null);
  assert.deepEqual(g.getState().colors, {});
});

test('coloring the gutter (whole row) colors every column of that row', () => {
  const g = grid();
  g.handleKey(k('c')); g.handleKey(k('r'));
  assert.deepEqual(g.getState().colors, { r1: { arg0: 'r', result: 'r', state: 'r' } });
});

// ---- open-location -------------------------------------------------------

test('g then d posts code.open with the row\'s path/span', () => {
  const bus = fakeBus();
  const g = grid({ bus: bus });
  g.handleKey(k('g')); g.handleKey(k('d'));
  assert.deepEqual(bus.posted, [['code.open', { path: 'lib/x.ex', span: { line: 3 } }]]);
});

test('g then d is a no-op when the row has no open location', () => {
  const bus = fakeBus();
  const g = grid({ bus: bus });
  g.handleKey(k('j')); // r2, no `open`
  g.handleKey(k('g')); g.handleKey(k('d'));
  assert.deepEqual(bus.posted, []);
});

// ---- the coordinate (what `radar` makes a reference of) -------------------

test('coord: row ids and column keys of the selection -- no value; the gutter is the whole row', () => {
  const g = grid();
  assert.deepEqual(g.coord(), { ids: ['r1'], cols: [], scope: 'row' });
  g.handleKey(k('l')); g.handleKey(k('l'));
  const one = g.coord();
  assert.equal(one.scope, 'cell');
  assert.deepEqual(one.ids, ['r1']);
  assert.equal(one.cols.length, 1);
  g.handleKey(k('v')); g.handleKey(k('j'));
  assert.deepEqual(g.coord().ids, ['r1', 'r2']);
  assert.ok(!JSON.stringify(g.coord()).includes('"a"'));
});

test('a key the table does not know does nothing (no matrix.action: what to do with a selection is typed)', () => {
  const bus = fakeBus();
  const g = grid({ bus: bus });
  g.handleKey(k('l'));
  assert.equal(g.handleKey(k('e')), false);
  ['h', 'j', 'k', 'l', 'v', 'c', 'g', '/', 'escape'].forEach((key) => g.handleKey(k(key)));
  assert.deepEqual(bus.posted, []);
});

test('onDrawn: told after each drawing (the page says the coordinate then)', () => {
  let n = 0;
  const g = grid({ onDrawn: () => { n += 1; } });
  g.render();
  g.handleKey(k('j'));
  g.render();
  assert.equal(n, 2);
});

// ---- sort / filter (mouse-triggered, no key involved) ---------------------

test('toggleSort cycles asc -> desc -> none', () => {
  const g = grid();
  g.toggleSort('arg0');
  assert.deepEqual(g.getState().order, ['r1', 'r2', 'r3']); // 1, 2, 10 ascending
  g.toggleSort('arg0');
  assert.deepEqual(g.getState().order, ['r3', 'r2', 'r1']); // descending
  g.toggleSort('arg0');
  assert.equal(g.getState().sort.key, null);
});

test('commitFilter narrows the display order; cancelFilter leaves filters untouched', () => {
  const g = grid();
  g.commitFilter('state', 'error');
  assert.deepEqual(g.getState().order, ['r3']);
  g.cancelFilter();
  assert.deepEqual(g.getState().order, ['r3']); // cancel only clears the prompt, not an applied filter
  assert.equal(g.getState().filterPrompt, null);
  g.commitFilter('state', '');
  assert.deepEqual(g.getState().order, ['r1', 'r2', 'r3']);
});

test('"/" opens a filter prompt for the column under the cursor, not the gutter', () => {
  const g = grid();
  g.handleKey(k('/'));
  assert.equal(g.getState().filterPrompt, null); // cursor was on the gutter
  g.handleKey(k('l'));
  g.handleKey(k('/'));
  assert.equal(g.getState().filterPrompt, 'arg0');
});

// ---- patch / remove -------------------------------------------------------

test('patchRow adds a new row; removeRow drops it and its colors', () => {
  const g = grid();
  g.patchRow('r4', { arg0: '4', result: 'd', state: 'ok' });
  assert.ok(g.getState().order.includes('r4'));
  g.handleKey(k('c')); // color r1's gutter row first, to prove removal cleans it up elsewhere
  g.handleKey(k('b'));
  g.removeRow('r1');
  assert.ok(!g.getState().order.includes('r1'));
  assert.equal(g.getState().colors.r1, undefined);
});

test('getState().colors is a defensive copy', () => {
  const g = grid();
  g.handleKey(k('c')); g.handleKey(k('b'));
  const snap = g.getState().colors;
  snap.r1.result = 'tampered';
  assert.equal(g.getState().colors.r1.arg0, 'b');
});

test('cursorValue: the full value of the cursor cell, null on the gutter', () => {
  const g = mx.create({
    columns: sampleColumns(),
    rows: [{ id: 'm', cells: { arg0: '[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]', result: 'x', state: 'ok' } }],
  });
  assert.equal(g.cursorValue(), null);
  g.handleKey(k('l'));
  assert.deepEqual(g.cursorValue(), { column: 'arg0', value: '[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]' });
  g.handleKey(k('l'));
  assert.deepEqual(g.cursorValue(), { column: 'result', value: 'x' });
});
