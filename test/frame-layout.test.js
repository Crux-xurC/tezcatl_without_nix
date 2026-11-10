'use strict';
// lib/skin/frame-layout.js: the frame skin's state (columns of stacked panels) and
// its `skin ...` commands. Places are column
// first, then row: "23" is the 3rd panel of the 2nd column.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../lib/skin/frame-layout.js');

let n = 0;
const ctx = {
  resolve: (name) => ({ tree: 'tree', killring: 'killring', input: 'input', codevi: 'code_editor', code_editor: 'code_editor', other: 'other', bm: 'bookmarks', bookmarks: 'bookmarks' })[name] || null,
  newId: () => 'p' + (++n),
};
function run(state, ...lines) {
  let s = state;
  let r = null;
  for (const line of lines) {
    r = F.apply(s, F.parse(line), ctx);
    if (r.error) throw new Error(line + ': ' + r.error);
    s = r.state;
  }
  return { state: s, message: r && r.message };
}
const err = (state, line) => F.apply(state, F.parse(line), ctx).error;
const names = (s) => s.columns.map((c) => c.map((p) => p.panel));
const focus = (s) => F.placeKey(s.focus);

test('create: columns of equal width, as many as the type letter says; the default name is one more than the largest workspace_N', () => {
  assert.deepEqual(F.create('C'), { name: null, type: 'C', axis: 'h', ratio: [1, 1, 1], focus: null, zoom: null, columns: [[], [], []] });
  assert.equal(F.create('f').columns.length, 6);
  assert.equal(F.create('?').type, 'A');
  assert.equal(F.defaultName([]), 'workspace_1');
  assert.equal(F.defaultName(['workspace_1', 'mine', 'workspace_7', 'workspace_x']), 'workspace_8');
});

test('places: kept as "23" ("2,13" past the 9th) in a saved skin; said and typed as "2 3"', () => {
  assert.deepEqual(F.place('23'), { col: 2, row: 3 });
  assert.deepEqual(F.place('2,13'), { col: 2, row: 13 });
  assert.deepEqual(F.place('2.3'), { col: 2, row: 3 });
  assert.equal(F.place('2'), null);
  assert.equal(F.place('20'), null);
  assert.equal(F.placeKey({ col: 2, row: 13 }), '2,13');
  assert.equal(F.placeText({ col: 2, row: 13 }), '2 13');
  assert.equal(F.placeText({ col: 2, row: 3 }), '2 3');
});

test('one rule: blanks separate words, a comma joins a list (no blank in it), a place or a pair is two words', () => {
  assert.deepEqual(F.parse('skin focus 2 3'), { cmd: 'focus', to: { col: 2, row: 3 } });
  assert.deepEqual(F.parse('skin focus 1 10'), { cmd: 'focus', to: { col: 1, row: 10 } });
  for (const old of ['skin focus 23', 'skin focus 1,10', 'skin focus 2.3']) assert.match(F.parse(old).error, /skin focus <line> <nth>/, old);
  assert.deepEqual(F.parse('skin switch ver 1 2 3'), { cmd: 'switch-ver', a: 1, b: 2, col: 3 });
  assert.deepEqual(F.parse('skin switch hor 1 2'), { cmd: 'switch-hor', a: 1, b: 2 });
  for (const old of ['skin switch ver 1,2', 'skin switch ver 1,2 3', 'skin switch hor 1,2']) assert.match(F.parse(old).error, /skin switch ver a b/, old);
  assert.match(F.parse('skin main 1, 4').error, /comma-separated/);
  assert.match(F.parse('skin main 1 4').error, /comma-separated/);
  assert.match(F.parse('skin sub 1, 2').error, /comma-separated/);
  for (const old of ['skin horizon 1,4', 'skin vertical 1,2']) assert.match(F.parse(old).error, /no such command/, old);
});

test('the example C: main / add / sub with whole numbers; the saved JSON', () => {
  const { state } = run(F.create('A', 'workspace_1'),
    'skin main 1,2,1', 'skin add 2 killring', 'skin add 2 tree', 'skin add 2 input', 'skin sub 1,2,1',
    'skin add 3 code_editor', 'skin add 3 bm', 'skin focus 2 2');
  assert.deepEqual(F.toJson(state), {
    name: 'workspace_1', type: 'C', axis: 'h', ratio: [1, 2, 1], focus: '22',
    columns: [[], [['killring', 1, 1, false], ['tree', 2, 2, true], ['input', 3, 1, false]], [['code_editor', 1, 1, false], ['bookmarks', 2, 1, false]]],
  });
  const r = F.rects(state);
  const tree = r.panels.find((p) => p.panel === 'tree');
  assert.ok(Math.abs(tree.x - 0.25) < 1e-9 && Math.abs(tree.w - 0.5) < 1e-9 && Math.abs(tree.y - 0.25) < 1e-9 && Math.abs(tree.h - 0.5) < 1e-9 && tree.focused);
  assert.equal(r.columns[0].empty, true);
  // read back: same panels, fresh ids, the focus kept
  const back = F.fromJson(JSON.parse(JSON.stringify(F.toJson(state))), ctx.newId);
  assert.deepEqual(F.toJson(back), F.toJson(state));
  assert.notEqual(back.columns[1][0].id, state.columns[1][0].id);
});

test('add: the end of the column, or put in at a row (the rest move down); the new panel is focused', () => {
  let { state } = run(F.create('B'), 'skin add 1 tree', 'skin add 1 killring');
  assert.equal(focus(state), '12');
  ({ state } = run(state, 'skin add 1 1 input'));
  assert.deepEqual(names(state)[0], ['input', 'tree', 'killring']);
  assert.equal(focus(state), '11');
  assert.match(err(state, 'skin add 1 5 tree'), /up to 4\)/);
  assert.match(err(state, 'skin add 3 tree'), /there is no column 3/);
  assert.match(err(state, 'skin add 1 nosuch'), /no such panel: nosuch/);
});

test('del: by place, or by name (the focused one of that name, else the first); the focus goes to the nearest', () => {
  let { state } = run(F.create('B'), 'skin add 1 tree', 'skin add 1 killring', 'skin add 2 tree', 'skin focus 2 1');
  ({ state } = run(state, 'skin del tree'));
  assert.deepEqual(names(state), [['tree', 'killring'], []]);
  assert.equal(focus(state), '11', 'the focused tree went; the focus moved to the nearest');
  ({ state } = run(state, 'skin focus 1 2', 'skin del tree'));
  assert.deepEqual(names(state), [['killring'], []]);
  assert.equal(focus(state), '11', 'a panel above the focused one went: the focus follows it up');
  ({ state } = run(state, 'skin del 1 1'));
  assert.equal(state.focus, null);
  assert.match(err(state, 'skin del 1 1'), /there is no panel at 1 1/);
  assert.match(err(state, 'skin del tree'), /tree is not open/);
});

test('vertical and switch ver: the focused column, or the one given', () => {
  let { state } = run(F.create('B'), 'skin add 1 tree', 'skin add 1 killring', 'skin add 2 input', 'skin add 2 other', 'skin focus 1 1');
  ({ state } = run(state, 'skin sub 3,1'));
  assert.deepEqual(state.columns[0].map((p) => p.ratio), [3, 1]);
  ({ state } = run(state, 'skin sub 1,2 2'));
  assert.deepEqual(state.columns[1].map((p) => p.ratio), [1, 2]);
  assert.match(err(state, 'skin sub 1,1,1'), /column 1 has 2 panel\(s\)/);
  // switch ver: places keep their heights; the focus follows its panel
  ({ state } = run(state, 'skin switch ver 1 2'));
  assert.deepEqual(state.columns[0].map((p) => [p.panel, p.ratio]), [['killring', 3], ['tree', 1]]);
  assert.equal(focus(state), '12');
  ({ state } = run(state, 'skin switch ver 1 2 2'));
  assert.deepEqual(names(state)[1], ['other', 'input']);
  assert.match(err(F.create('A'), 'skin sub 1'), /which column\?/);
  assert.match(err(state, 'skin switch ver 1 3'), /has no places 1 and 3/);
});

test('switch hor: whole columns change places, each place keeps its width; the focus follows', () => {
  let { state } = run(F.create('A'), 'skin main 1,3', 'skin add 1 tree', 'skin add 2 input', 'skin add 2 other', 'skin focus 2 2');
  ({ state } = run(state, 'skin switch hor 1 2'));
  assert.deepEqual(names(state), [['input', 'other'], ['tree']]);
  assert.deepEqual(state.ratio, [1, 3]);
  assert.equal(focus(state), '12');
  assert.match(err(state, 'skin switch hor 1 3'), /there are no columns 1 and 3/);
  assert.deepEqual(F.parse('skin switch hor 1 2'), { cmd: 'switch-hor', a: 1, b: 2 });
});

test('horizon: a column with panels is never dropped; the type follows the count', () => {
  let { state } = run(F.create('C'), 'skin add 3 tree');
  assert.match(err(state, 'skin main 1,1'), /column 3 still has panels/);
  ({ state } = run(state, 'skin main 1,1,2,1'));
  assert.equal(state.type, 'D');
  assert.deepEqual(names(state), [[], [], ['tree'], []]);
  // past A to D: as many lines as MAX_LINES, the type still the letter of the count
  assert.deepEqual(F.parse('skin main 1,1,1,1,1').widths, [1, 1, 1, 1, 1]);
  assert.equal(run(state, 'skin main 1,1,1,1,1').state.type, 'E');
  assert.match(F.parse('skin main ' + Array(F.MAX_LINES + 1).fill(1).join(',')).error, new RegExp('at most ' + F.MAX_LINES));
  assert.match(F.parse('skin main 1/3,1/3').error, /integers/);
  assert.deepEqual(F.parse('skin main 1,2,1'), { cmd: 'main', widths: [1, 2, 1] });
});

test('focus: a place, or x / x - / y / y -; the nearest panel when the place is empty', () => {
  // c1: 4 panels, c2: empty, c3: 3 panels, c4: 4 panels
  const { state } = run(F.create('D'),
    'skin add 1 tree', 'skin add 1 tree', 'skin add 1 tree', 'skin add 1 tree',
    'skin add 3 input', 'skin add 3 input', 'skin add 3 input',
    'skin add 4 other', 'skin add 4 other', 'skin add 4 other', 'skin add 4 other');
  const go = (from, line) => focus(run(run(state, 'skin focus ' + from[0] + ' ' + from[1]).state, line).state);
  assert.equal(go('11', 'skin focus x'), '31', 'right skips the empty c2');
  assert.equal(go('44', 'skin focus x -'), '33', '[44] -> c3 has 3: [33]');
  assert.equal(go('31', 'skin focus x -'), '11');
  assert.equal(go('11', 'skin focus y'), '12');
  assert.equal(go('32', 'skin focus y -'), '31');
  assert.match(err(run(state, 'skin focus 4 1').state, 'skin focus x'), /there is no panel to the right/);
  assert.match(err(run(state, 'skin focus 1 1').state, 'skin focus y -'), /there is no panel above/);
  assert.match(err(run(state, 'skin focus 1 4').state, 'skin focus y'), /there is no panel below/);
  assert.equal(go('11', 'skin focus 3 4'), '33', 'the place is empty: the last one in that column');
  assert.equal(go('11', 'skin focus 2 2'), '12', 'an empty column: the nearest column that has one');
  // nothing focused: x / y start from the first panel
  assert.equal(focus(run({ ...state, focus: null }, 'skin focus x').state), '11');
  assert.match(err(F.create('B'), 'skin focus 1 1'), /there is no panel to focus/);
});

test('name / save / read; lines that are not skin commands say what there is', () => {
  const { state } = run(F.create('A'), 'skin name 日々');
  assert.equal(state.name, '日々');
  assert.equal(run(state, 'skin save other').state.name, 'other');
  assert.deepEqual(F.parse('skin save'), { cmd: 'save', name: null });
  assert.deepEqual(F.parse('skin read 日々'), { cmd: 'read', name: '日々' });
  assert.match(F.parse('set 1.1 tree').error, /start with skin, block or thema/);
  assert.match(F.parse('skin frob').error, /no such command: skin frob/);
  assert.match(F.parse('skin add').error, /skin add <panel>/);
});

test('fromJson: what was read back is made sound', () => {
  assert.equal(F.fromJson(null), null);
  assert.equal(F.fromJson({ columns: [] }), null);
  const s = F.fromJson({ name: 'x', ratio: [0, 'a'], focus: '29', columns: [[['tree', 1, 0, true], [42], 'x'], []] }, () => 'id');
  assert.deepEqual(s, { name: 'x', type: 'B', axis: 'h', ratio: [1, 1], focus: null, zoom: null, columns: [[{ id: 'id', panel: 'tree', ratio: 1, block: {} }], []] });
});

// -- two axes, lines, equal, zoom ------------------------------

test('main / sub: the ratios of the lines, of the panels in a line (sub: the focused line, or the one given)', () => {
  const a = run(F.create('A'), 'skin main 1,2', 'skin add 2 tree', 'skin add 2 input', 'skin sub 3,1 2').state;
  assert.deepEqual(a.columns[1].map((p) => p.ratio), [3, 1]);
  assert.deepEqual(F.parse('skin sub 1,2'), { cmd: 'sub', heights: [1, 2], col: null });
});

test('skin add line: one more line of size 1, at the end or put in; up to MAX_LINES; the focus follows its panel', () => {
  let { state, message } = run(F.create('A'), 'skin add 1 tree', 'skin add line');
  assert.equal(state.type, 'B');
  assert.deepEqual(state.ratio, [1, 1]);
  assert.match(message, /added column 2/);
  ({ state } = run(state, 'skin main 2,3', 'skin add line 1'));
  assert.deepEqual(state.ratio, [1, 2, 3]);
  assert.deepEqual(names(state), [[], ['tree'], []]);
  assert.equal(focus(state), '21');
  ({ state } = run(state, 'skin add line'));
  assert.equal(run(state, 'skin add line').state.type, 'E');
  assert.match(err(run(F.create('A'), 'skin main ' + Array(F.MAX_LINES).fill(1).join(',')).state, 'skin add line'), new RegExp('at most ' + F.MAX_LINES));
  assert.match(err(F.create('B'), 'skin add line 4'), /up to column 3/);
  assert.match(F.parse('skin add line x').error, /skin add line \[position\]/);
});

test('skin del line: an empty line taken away (the last by default); one with panels, or the only one, stays', () => {
  let { state, message } = run(F.create('C'), 'skin main 1,2,3', 'skin add 3 tree', 'skin focus 3 1', 'skin del line 1');
  assert.match(message, /took column 1 away/);
  assert.deepEqual(state.ratio, [2, 3]);
  assert.equal(state.type, 'B');
  assert.deepEqual(names(state), [[], ['tree']]);
  assert.equal(focus(state), '21');
  assert.match(err(state, 'skin del line'), /column 2 still has panels/);
  assert.match(err(state, 'skin del line 3'), /there is no column 3/);
  ({ state } = run(state, 'skin del line 1'));
  assert.equal(state.type, 'A');
  assert.match(err(state, 'skin del line 1'), /the only column stays/);
  assert.deepEqual(F.parse('skin del line'), { cmd: 'del-line', at: null });
  assert.match(F.parse('skin del line x').error, /skin del line \[position\]/);
  assert.match(err(run(F.create('A'), 'skin axis v', 'skin add line').state, 'skin del line 3'), /there is no row 3/);
});

test('skin axis v: lines are rows, the panels left to right; the places stay and the drawing turns over', () => {
  let { state, message } = run(F.create('A'), 'skin main 1,3', 'skin add 1 tree', 'skin add 1 input', 'skin add 2 code_editor', 'skin axis v');
  assert.match(message, /transposed/);
  assert.equal(state.axis, 'v');
  const r = F.rects(state);
  const at = (n) => r.panels.find((p) => p.panel === n);
  // line 1 is the top row (1/4 high), its two panels side by side
  assert.deepEqual([at('tree').x, at('tree').y, at('tree').w, at('tree').h], [0, 0, 0.5, 0.25]);
  assert.deepEqual([at('input').x, at('input').y], [0.5, 0]);
  assert.deepEqual([at('code_editor').x, at('code_editor').y, at('code_editor').w, at('code_editor').h], [0, 0.25, 1, 0.75]);
  assert.deepEqual([r.columns[1].x, r.columns[1].y, r.columns[1].w, r.columns[1].h], [0, 0.25, 1, 0.75]);
  // Shift+hjkl: right / left go along a row, down / up cross the rows
  ({ state } = run(state, 'skin focus 1 1', 'skin focus x'));
  assert.equal(focus(state), '12');
  ({ state } = run(state, 'skin focus y'));
  assert.equal(focus(state), '21');
  // crossing lines lands on the same order there (as on "h")
  ({ state } = run(state, 'skin focus y -'));
  assert.equal(focus(state), '11');
  // the messages call a line a row
  assert.match(err(state, 'skin add 5 tree'), /there is no row 5 \(2 row\(s\)/);
  // saved and read back with the axis; one saved before (no axis) is "h"
  assert.equal(F.toJson(state).axis, 'v');
  assert.equal(F.fromJson(F.toJson(state), ctx.newId).axis, 'v');
  assert.equal(F.fromJson({ columns: [[]] }).axis, 'h');
  assert.match(F.parse('skin axis x').error, /skin axis h/);
});

test('skin equal: -m the lines, -s the panels of the focused line, neither: both', () => {
  const base = run(F.create('A'), 'skin main 1,3,2', 'skin add 2 tree', 'skin add 2 input', 'skin add 2 other', 'skin sub 1,5,2').state;
  let { state } = run(base, 'skin equal -m');
  assert.deepEqual(state.ratio, [1, 1, 1]);
  assert.deepEqual(state.columns[1].map((p) => p.ratio), [1, 5, 2]);
  ({ state } = run(base, 'skin equal -s'));
  assert.deepEqual(state.ratio, [1, 3, 2]);
  assert.deepEqual(state.columns[1].map((p) => p.ratio), [1, 1, 1]);
  ({ state } = run(base, 'skin equal'));
  assert.deepEqual([state.ratio, state.columns[1].map((p) => p.ratio)], [[1, 1, 1], [1, 1, 1]]);
  assert.match(err(F.create('B'), 'skin equal -s'), /which column\?/);
  assert.match(F.parse('skin equal -x').error, /skin equal \[-m \| -s\]/);
});

test('skin zoom: n (10) times the largest of the others, as sizes; skin unzoom gives back what was before', () => {
  const base = run(F.create('A'), 'skin main 1,1,1', 'skin add 1 tree', 'skin add 2 input', 'skin add 2 other', 'skin add 3 code_editor', 'skin focus 2 2').state;
  let { state, message } = run(base, 'skin zoom -m');
  assert.deepEqual(state.ratio, [1, 10, 1]);
  assert.deepEqual(state.columns[1].map((p) => p.ratio), [1, 1]);
  assert.match(message, /skin unzoom/);
  // zoomed again (another line, another n): counted from the sizes before the first zoom
  ({ state } = run(state, 'skin focus 3 1', 'skin zoom -m 3'));
  assert.deepEqual(state.ratio, [1, 1, 3]);
  ({ state } = run(state, 'skin unzoom'));
  assert.deepEqual(state.ratio, [1, 1, 1]);
  assert.equal(state.zoom, null);
  assert.match(err(state, 'skin unzoom'), /nothing to take back/);
  // -s: the panel in its line; neither: both
  ({ state } = run(base, 'skin zoom -s 4'));
  assert.deepEqual([state.ratio, state.columns[1].map((p) => p.ratio)], [[1, 1, 1], [1, 4]]);
  ({ state } = run(base, 'skin zoom'));
  assert.deepEqual([state.ratio, state.columns[1].map((p) => p.ratio)], [[1, 10, 1], [1, 10]]);
  // -s in another line first gives the line zoomed before back
  ({ state } = run(state, 'skin focus 2 1', 'skin zoom -s'));
  assert.deepEqual(state.columns[1].map((p) => p.ratio), [10, 1]);
  ({ state } = run(base, 'skin sub 2,1 2', 'skin zoom -s', 'skin focus 1 1', 'skin focus 2 1', 'skin unzoom -s'));
  assert.deepEqual(state.columns[1].map((p) => p.ratio), [2, 1]);
  // kept with the skin (skin save / a reload of the window) until unzoom
  const z = run(base, 'skin zoom').state;
  assert.deepEqual(F.fromJson(F.toJson(z), ctx.newId).zoom, z.zoom);
  // a change of sizes or places forgets it
  assert.equal(run(z, 'skin equal -m').state.zoom, null);
  assert.equal(run(z, 'skin add 1 bm').state.zoom, null);
  // nothing to zoom: one line with one panel; no focus
  assert.match(err(run(F.create('A'), 'skin add 1 tree').state, 'skin zoom'), /nothing to enlarge against/);
  assert.match(err(F.create('B'), 'skin zoom'), /focus one first/);
  assert.match(F.parse('skin zoom 1').error, /2 or more/);
  assert.deepEqual(F.parse('skin zoom -s 5'), { cmd: 'zoom', n: 5, m: false, s: true });
});

// -- blocks ------------------------------------------------

test('skin add puts a block (the default) or a bare panel (-bare); saved as a 5th item only when not as it is', () => {
  let { state, message } = run(F.create('A'), 'skin add 1 tree', 'skin add 1 input -bare');
  assert.deepEqual(state.columns[0].map((p) => p.block), [{}, null]);
  assert.match(message, /a bare panel/);
  assert.deepEqual(F.toJson(state).columns[0].map((e) => e.length === 5 ? e[4] : 'none'), ['none', false]);
  assert.deepEqual(F.parse('skin add 1 2 tree -bare'), { cmd: 'add', col: 1, row: 2, panel: 'tree', bare: true });
  assert.deepEqual(F.rects(state).panels.map((p) => p.block), [{}, null]);
  // a skin saved before blocks: every panel a block as it is
  const old = F.fromJson({ columns: [[['tree', 1, 1, true]]] }, ctx.newId);
  assert.deepEqual(old.columns[0][0].block, {});
});

test('block arrange: where the focused block\'s thema is; refused on a bare panel; kept with the skin', () => {
  let { state, message } = run(F.create('A'), 'skin add 1 tree', 'block arrange l');
  assert.deepEqual(state.columns[0][0].block, { side: 'l' });
  assert.match(message, /the thema of 1 1 is at the left/);
  ({ state } = run(state, 'block arrange bottom'));
  assert.deepEqual(state.columns[0][0].block, { side: 'b' });
  const back = F.fromJson(JSON.parse(JSON.stringify(F.toJson(state))), ctx.newId);
  assert.deepEqual(back.columns[0][0].block, { side: 'b' });
  assert.deepEqual(F.fromJson({ columns: [[['tree', 1, 1, true, { side: 'x', color: 'red', min: 'tiny', thickness: 1, source: 'q', text: ' ' }]]] }).columns[0][0].block, { color: 'red' });
  assert.deepEqual(F.fromJson({ columns: [[['tree', 1, 1, true, { color: 'url(x)' }]]] }).columns[0][0].block, {});
  assert.match(err(run(F.create('A'), 'skin add 1 tree -bare').state, 'block arrange t'), /a bare panel/);
  assert.match(err(F.create('A'), 'block arrange t'), /no panel is focused/);
  assert.match(F.parse('block arrange x').error, /t\|b\|r\|l/);
});

test('block new: a block for a panel (source name | file | status, top unless given) -- for the page to keep', () => {
  const r = F.apply(F.create('A'), F.parse('block new codevi file'), ctx);
  assert.deepEqual(r.def, { panel: 'code_editor', source: 'file', side: 't' });
  assert.deepEqual(F.apply(F.create('A'), F.parse('block new tree status r'), ctx).def, { panel: 'tree', source: 'status', side: 'r' });
  assert.match(err(F.create('A'), 'block new nosuch name'), /no such panel: nosuch/);
  assert.match(F.parse('block new tree words').error, /name\|file\|status/);
  assert.match(F.parse('block zap').error, /no such command: block zap/);
});

test('block min / min line: the focused block along the sub axis to its band or a line; the others share the rest; unmin', () => {
  const base = run(F.create('A'), 'skin add 1 tree', 'skin add 1 input', 'skin add 1 code_editor', 'skin focus 1 2').state;
  const h = (st, opts) => F.rects(st, opts).panels.map((p) => +(p.h * 600).toFixed(1));
  let { state, message } = run(base, 'block min');
  assert.deepEqual(state.columns[0][1].block, { min: 'band' });
  assert.match(message, /shrunk to its band.*block unmin/);
  // 600px along the sub axis: the band 24, the other two half of 576 each
  assert.deepEqual(h(state, { subPx: 600 }), [288, 24, 288]);
  // the page says how thick the band is
  assert.deepEqual(h(state, { subPx: 600, fixedPx: () => 40 }), [280, 40, 280]);
  ({ state } = run(state, 'block min line'));
  assert.deepEqual(h(state, { subPx: 600 }), [298, 4, 298]);
  // axis v: along the width
  const v = run(state, 'skin axis v').state;
  assert.deepEqual(F.rects(v, { subPx: 600 }).panels.map((p) => +(p.w * 600).toFixed(1)), [298, 4, 298]);
  // kept with the skin; unmin
  assert.deepEqual(F.fromJson(F.toJson(state), ctx.newId).columns[0][1].block, { min: 'line' });
  ({ state, message } = run(state, 'block unmin'));
  assert.deepEqual(state.columns[0][1].block, {});
  assert.match(err(state, 'block unmin'), /is not shrunk/);
  assert.match(err(run(F.create('A'), 'skin add 1 tree -bare').state, 'block min'), /a bare panel/);
  assert.match(F.parse('block min x').error, /block min line/);
});

test('thema color / thickness / source / text / reset: this place\'s band, kept with the skin', () => {
  let { state, message } = run(F.create('A'), 'skin add 1 tree', 'block arrange b', 'thema color alert', 'thema thickness 40',
    'thema source status', 'thema text 主 機関 室');
  assert.deepEqual(state.columns[0][0].block, { side: 'b', color: 'alert', thickness: 40, source: 'status', text: '主 機関 室' });
  assert.match(message, /text = 主 機関 室/);
  ({ state } = run(state, 'thema color #ff9f1c', 'thema color rgb(10, 20, 30)'));
  assert.equal(state.columns[0][0].block.color, 'rgb(10,20,30)');
  ({ state, message } = run(state, 'thema text'));
  assert.equal(state.columns[0][0].block.text, undefined);
  assert.match(message, /text removed/);
  assert.deepEqual(F.fromJson(F.toJson(state), ctx.newId).columns[0][0].block, state.columns[0][0].block);
  ({ state } = run(state, 'block min', 'thema reset'));
  assert.deepEqual(state.columns[0][0].block, { side: 'b', min: 'band' });
  assert.match(F.parse('thema color url(x)').error, /thema color/);
  assert.match(F.parse('thema thickness 2').error, /4 to 200/);
  assert.match(F.parse('thema source words').error, /name\|file\|status/);
  assert.match(F.parse('thema zap').error, /no such command: thema zap/);
  assert.match(err(run(F.create('A'), 'skin add 1 tree -bare').state, 'thema color red'), /a bare panel/);
});

test('block arrange round a corner (tl / tr / bl / br); thema style; colour names a style may give', () => {
  let { state, message } = run(F.create('A'), 'skin add 1 tree', 'block arrange tl');
  assert.deepEqual(state.columns[0][0].block, { side: 'tl' });
  assert.match(message, /the top and left/);
  ({ state } = run(state, 'thema style lcars', 'thema color orange', 'thema color gray-blue'));
  assert.deepEqual(state.columns[0][0].block, { side: 'tl', style: 'lcars', color: 'gray-blue' });
  assert.deepEqual(F.fromJson(F.toJson(state), ctx.newId).columns[0][0].block, state.columns[0][0].block);
  ({ state } = run(state, 'thema style'));
  assert.equal(state.columns[0][0].block.style, undefined);
  assert.match(F.parse('thema style ../x').error, /thema style/);
  assert.deepEqual(F.apply(F.create('A'), F.parse('block new tree name br'), ctx).def, { panel: 'tree', source: 'name', side: 'br' });
  assert.deepEqual(F.fromJson({ columns: [[['tree', 1, 1, true, { style: '../x' }]]] }).columns[0][0].block, {});
});

test('skin add <panel>: where its block says ("at"), else the focused line, else the 1st; block place', () => {
  const places = { code_editor: 2, tree: 9 };
  const c2 = Object.assign({}, ctx, { placeOf: (n) => places[n] });
  const run2 = (st, ...lines) => lines.reduce((s0, l) => { const r = F.apply(s0, F.parse(l), c2); if (r.error) throw new Error(l + ': ' + r.error); return r.state; }, st);
  let state = run2(F.create('C'), 'skin add codevi');
  assert.deepEqual(names(state), [[], ['code_editor'], []]);
  // no place of its own: the focused line (2), then with none focused the 1st
  state = run2(state, 'skin add input');
  assert.deepEqual(names(state), [[], ['code_editor', 'input'], []]);
  assert.deepEqual(names(run2(F.create('B'), 'skin add input')), [['input'], []]);
  // a place past the lines: the last one, and said so
  const r = F.apply(F.create('B'), F.parse('skin add tree -bare'), c2);
  assert.deepEqual(names(r.state), [[], ['tree']]);
  assert.equal(r.state.columns[1][0].block, null);
  assert.match(r.message, /there is no column 9, so in column 2/);
  assert.deepEqual(F.parse('skin add tree -bare'), { cmd: 'add', col: null, row: null, panel: 'tree', bare: true });
  assert.match(err(F.create('A'), 'skin add nosuch'), /no such panel: nosuch/);
  // block place: for the page to keep
  assert.deepEqual(F.apply(F.create('A'), F.parse('block place codevi 3'), ctx).place, { panel: 'code_editor', at: 3 });
  assert.match(F.parse('block place tree x').error, /block place <panel> <line>/);
  assert.match(err(F.create('A'), 'block place nosuch 1'), /no such panel: nosuch/);
});

test('skin focus abs: the map in the dock -- the page goes there; the state stays', () => {
  const { state } = run(F.create('B'), 'skin add 1 tree', 'skin add 2 input', 'skin focus 1 1');
  const c = F.parse('skin focus abs');
  assert.deepEqual(c, { cmd: 'focus-abs' });
  const r = F.apply(state, c, ctx);
  assert.equal(r.error, undefined);
  assert.deepEqual(F.toJson(r.state), F.toJson(state));
  assert.match(F.parse('skin focus nowhere').error, /skin focus abs/);
});

test('go on: the receiving side\'s -- the page goes; the state stays', () => {
  const { state } = run(F.create('B'), 'skin add 1 tree');
  const c = F.parse('go on');
  assert.deepEqual(c, { cmd: 'go-on' });
  assert.deepEqual(F.toJson(F.apply(state, c, ctx).state), F.toJson(state));
  assert.match(F.parse('go').error, /go on/);
  assert.match(F.parse('go on now').error, /go on/);
  assert.match(F.parse('nothing').error, /or go on/);
});

test('isEditor: the frame file editor is one list (D-code-editor)', () => {
  assert.equal(F.isEditor('code_editor'), true);
  assert.equal(F.isEditor('code_vi_minimum'), false);
  assert.equal(F.isEditor('code'), false);
  assert.deepEqual(F.EDITORS, ['code_editor']);
});

test('fromJson: a skin saved with the old name code_vi reads back as code_editor', () => {
  const s = F.fromJson({ columns: [[['tree', 1, 1, false]], [['code_vi', 1, 1, true]]], focus: '21' }, ctx.newId);
  assert.deepEqual(s.columns.map((c) => c.map((p) => p.panel)), [['tree'], ['code_editor']]);
  assert.equal(F.isEditor(F.at(s, s.focus).panel), true);
});
