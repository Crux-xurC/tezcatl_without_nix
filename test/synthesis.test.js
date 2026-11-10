'use strict';
// lib/skin/synthesis.js and the synthesis in lib/skin/frame-layout.js (D-synthesis):
// a definition read and checked, its panels laid out, a synthesis placed, saved,
// read again and closed as one panel; the shipped definitions are sound and no
// synthesis has a name a panel or an alias has.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../lib/skin/synthesis.js');
const F = require('../lib/skin/frame-layout.js');

const root = path.join(__dirname, '..');
const panels = { matrix_table: 'matrix_table', table: 'matrix_table', code_cmd_in: 'code_cmd_in', matrix_bar: 'matrix_bar', tree: 'tree' };
const resolve = (n) => panels[n] || null;
const good = () => ({
  name: 'mx',
  axis: 'h',
  ratio: [1],
  columns: [[['matrix_bar', 1, 1, false, { px: 24 }], ['matrix_table', 2, 6, false, { query: { kind: 'demo', ref: 'x' } }], ['code_cmd_in', 3, 1]]],
  main: 'matrix_bar',
  move: { table: 'table', line: 'code_cmd_in' },
});

test('check: a sound definition -> its panels by k, the main and the moves by k', () => {
  const r = S.check(good(), 'mx', resolve);
  assert.equal(r.error, undefined);
  assert.equal(r.def.name, 'mx');
  assert.deepEqual(r.def.panels.map((p) => [p.k, p.panel, p.col, p.row, p.ratio, p.px]),
    [[0, 'matrix_bar', 1, 1, 1, 24], [1, 'matrix_table', 1, 2, 6, null], [2, 'code_cmd_in', 1, 3, 1, null]]);
  assert.deepEqual(r.def.panels[1].query, { kind: 'demo', ref: 'x' });
  assert.equal(r.def.main, 0);
  assert.deepEqual(r.def.move, { table: 1, line: 2 });
});

test('check: what is refused, each said', () => {
  const bad = (change) => { const j = good(); change(j); return S.check(j, 'mx', resolve).error; };
  assert.match(S.check(null, 'mx', resolve).error, /not a JSON object/);
  assert.match(bad((j) => { j.name = 'other'; }), /file's name/);
  assert.match(bad((j) => { j.columns = []; }), /1 to 26 lines/);
  assert.match(bad((j) => { j.columns[0].push(['nope', 4, 1]); }), /no panel "nope"/);
  assert.match(bad((j) => { j.columns[0][1][4] = { query: { kind: 1 } }; }), /query/);
  assert.match(bad((j) => { j.columns[0][0][4] = { px: 2 }; }), /px/);
  assert.match(bad((j) => { j.main = 'tree'; }), /does not hold/);
  assert.match(bad((j) => { j.columns[0].push(['matrix_bar', 4, 1]); }), /holds twice/);
  assert.match(bad((j) => { j.move = { main: 'code_cmd_in' }; }), /"main" is there already/);
  assert.match(bad((j) => { j.move = { Up: 'code_cmd_in' }; }), /not a word/);
  assert.match(bad((j) => { j.move = { x: 'tree' }; }), /not a panel it holds once/);
});

test('layout: a px panel keeps its length, the others share the rest by ratio', () => {
  const { def } = S.check(good(), 'mx', resolve);
  const boxes = S.layout(def)(600);
  assert.equal(boxes.length, 3);
  assert.ok(Math.abs(boxes[0].h - 24 / 600) < 1e-9);
  assert.ok(Math.abs(boxes[1].h - (1 - 24 / 600) * 6 / 7) < 1e-9);
  assert.ok(Math.abs(boxes[2].y + boxes[2].h - 1) < 1e-9);
  assert.ok(boxes.every((b) => b.x === 0 && b.w === 1));
});

let n = 0;
const ctx = {
  resolve: (name) => ({ tree: 'tree', code_editor: 'code_editor' })[name] || null,
  synthesis: (name) => (name === 'mx' ? S.check(good(), 'mx', resolve).def : null),
  newId: () => 'p' + (++n),
};
function run(state, ...lines) {
  let s = state;
  for (const line of lines) {
    const r = F.apply(s, F.parse(line), ctx);
    if (r.error) throw new Error(line + ': ' + r.error);
    s = r.state;
  }
  return s;
}

test('the frame: skin add <synthesis> places one panel with its own name; the next takes the smallest free number', () => {
  let s = run(F.create('B', 'w'), 'skin add 1 tree', 'skin add 1 mx', 'skin add 2 mx');
  const syn = s.columns.flat().filter((p) => p.syn).map((p) => p.syn.own);
  assert.deepEqual(syn, ['mx_1', 'mx_2']);
  assert.equal(F.nameOf(F.at(s, s.focus)), 'mx_2');
  s = run(s, 'skin del mx_1', 'skin add 2 mx');
  assert.deepEqual(s.columns.flat().filter((p) => p.syn).map((p) => p.syn.own), ['mx_2', 'mx_1']);
  const r = F.apply(s, F.parse('skin add nope'), ctx);
  assert.match(r.error, /no such panel: nope \(nor a synthesis/);
  assert.match(F.apply(s, F.parse('skin add mx -bare'), ctx).error, /always wears its band/);
});

test('the frame: saved with its own name and what its main kept; read again from a saved skin it says so', () => {
  let s = run(F.create('A', 'w'), 'skin add 1 mx', 'thema color warn');
  F.at(s, s.focus).syn.keep = { id: '3' };
  const j = F.toJson(s);
  assert.deepEqual(j.columns[0][0], ['mx', 1, 1, true, { color: 'warn', synthesis: 'mx_1', keep: { id: '3' } }]);
  const back = F.fromJson(j, ctx.newId);
  assert.deepEqual(back.columns[0][0].syn, { own: 'mx_1', keep: { id: '3' }, saved: false });
  assert.deepEqual(back.columns[0][0].block, { color: 'warn' });
  assert.equal(F.fromJson(j, ctx.newId, true).columns[0][0].syn.saved, true);
  assert.deepEqual(F.toJson(back), j);
});

test('keepOf: a few plain values only', () => {
  assert.deepEqual(F.keepOf({ id: 2, ok: true, x: { a: 1 }, 'bad key': 'v' }), { id: '2', ok: 'true' });
  assert.equal(F.keepOf(null), null);
  assert.equal(F.keepOf([1]), null);
});

test('the shipped syntheses are sound, and none has the name of a panel, a skin or an alias (skin add is never ambiguous)', () => {
  const items = JSON.parse(fs.readFileSync(path.join(root, 'list_kinds/panels_and_skins.json'), 'utf8')).items;
  const catalog = {};
  items.filter((it) => it.class === 'panel').forEach((it) => { catalog[it.id] = it.id; (it.aliases || []).forEach((a) => { catalog[a] = it.id; }); });
  const taken = new Set(items.flatMap((it) => [it.id, ...(it.aliases || [])]));
  const files = fs.readdirSync(path.join(root, 'syntheses')).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0);
  for (const f of files) {
    const name = f.replace(/\.json$/, '');
    assert.ok(!taken.has(name), name + ' is also a name in list_kinds/panels_and_skins.json');
    const r = S.check(JSON.parse(fs.readFileSync(path.join(root, 'syntheses', f), 'utf8')), name, (x) => catalog[x] || null);
    assert.equal(r.error, undefined, f + ': ' + r.error);
  }
});

test('the frame: a synthesis placed with what its main starts with (database id=1)', () => {
  const r = F.apply(F.create('A', 'w'), Object.assign(F.parse('skin add mx'), { keep: { id: 1 } }), ctx);
  assert.deepEqual(F.at(r.state, r.state.focus).syn, { own: 'mx_1', keep: { id: '1' }, saved: false });
});
