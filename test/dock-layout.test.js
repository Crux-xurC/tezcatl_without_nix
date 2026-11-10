'use strict';
// lib/skin/dock-layout.js: the frame's dock as data -- its file, the `dock …`
// commands, and what is drawn (D-dock).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../lib/skin/dock-layout.js');

const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docks/standard.json'), 'utf8'));
const std = D.readDef(file).def;

test('docks/standard.json reads, and is the built-in dock', () => {
  assert.ok(std, D.readDef(file).error);
  assert.deepEqual(std, D.readDef(D.DEFAULT).def);
});

test('every dock holds the input form and the receiving side once', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'docks')).filter((x) => x.endsWith('.json'))) {
    const def = D.readDef(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docks', f), 'utf8'))).def;
    assert.ok(def, f);
    const vals = Object.values(def.parts);
    assert.equal(vals.filter((v) => v === '@form').length, 1, f + ': one @form');
    assert.equal(vals.filter((v) => v === '@recv').length, 1, f + ': one @recv');
    for (const s of D.SIDES) {
      const shown = D.partsOf(D.resolve(def, { side: s }));
      const keys = Object.keys(def.parts).filter((k) => def.parts[k] === '@form' || def.parts[k] === '@recv');
      for (const k of keys) assert.ok(shown.includes(k), f + ': ' + k + ' on side ' + s);
    }
  }
});

test('a bad file is said: rows of different length, an unknown part, a bent area, an alias to nothing', () => {
  const base = D.clone(D.DEFAULT);
  const bad = (edit) => { const j = D.clone(base); edit(j); return D.readDef(j).error; };
  assert.match(bad((j) => { j.grid.b.areas[1] = 'map gtgt'; }), /every row needs 5 names/);
  assert.match(bad((j) => { j.grid.b.areas[0] = 'help itgt form recv nope'; }), /not a part: nope/);
  assert.match(bad((j) => { j.grid.l.areas[0] = 'recv map'; }), /not a rectangle: recv/);
  assert.match(bad((j) => { j.grid.r = 'x'; }), /not a grid of another side/);
  assert.match(bad((j) => { j.grid.b.rows = [1, 1]; }), /5 rows, 2 sizes/);
  assert.match(D.readDef({}).error, /needs "parts" and "grid"/);
});

test('resolve: the file\'s side and sizes, the right as the left', () => {
  const b = D.resolve(std, {});
  assert.equal(b.side, 'b');
  assert.equal(b.size, '14em');
  assert.deepEqual(b.rows, [3, 1, 1, 1, 1]);
  const r = D.resolve(std, { side: 'r' });
  assert.deepEqual(r.areas, D.resolve(std, { side: 'l' }).areas);
  assert.equal(r.size, '36em');
  assert.deepEqual(D.css(D.resolve(std, { side: 'l' })).cols, '1fr 2fr');
});

test('parse: the dock lines; not a dock line is null', () => {
  assert.equal(D.parse('skin main 1,2'), null);
  assert.deepEqual(D.parse('dock side l'), { cmd: 'side', side: 'l' });
  assert.deepEqual(D.parse('dock size 16em'), { cmd: 'size', size: '16em' });
  assert.deepEqual(D.parse('dock rows 1,2,1,1'), { cmd: 'rows', list: [1, 2, 1, 1] });
  assert.match(D.parse('dock rows 1, 2,1,1').error, /dock rows a,b/);
  assert.deepEqual(D.parse('dock cols 2,3,6,6,6'), { cmd: 'cols', list: [2, 3, 6, 6, 6] });
  assert.deepEqual(D.parse('dock reset'), { cmd: 'reset' });
  assert.match(D.parse('dock side top').error, /l \| b \| r/);
  assert.match(D.parse('dock size big').error, /length/);
  assert.match(D.parse('dock rows 1,0').error, /whole numbers/);
  assert.match(D.parse('dock').error, /dock side/);
});

test('apply: per side, only what was changed; rows that do not fit are refused; reset keeps the side', () => {
  let d = {};
  d = D.apply(d, D.parse('dock size 16em'), std).dock;
  d = D.apply(d, D.parse('dock side l'), std).dock;
  d = D.apply(d, D.parse('dock rows 1,1,1,1,1,1,1,1'), std).dock;
  assert.deepEqual(d, { side: 'l', size: { b: '16em' }, rows: { l: [1, 1, 1, 1, 1, 1, 1, 1] } });
  assert.equal(D.resolve(std, d).size, '36em', 'the left keeps its own size');
  assert.equal(D.resolve(std, Object.assign({}, d, { side: 'b' })).size, '16em');
  assert.match(D.apply(d, D.parse('dock cols 1,2,3'), std).error, /has 2 cols on the left, got 3/);
  const reset = D.apply(d, D.parse('dock reset'), std);
  assert.deepEqual(reset.dock, { side: 'l' });
  assert.match(reset.message, /the side stays: left/);
});

test('sanitize: what a skin keeps, the rest dropped', () => {
  assert.deepEqual(D.sanitize({ side: 'x', size: { b: 'big', l: '20em' }, rows: { b: [1, 0] }, cols: { r: [1, 2] }, other: 1 }),
    { size: { l: '20em' }, cols: { r: [1, 2] } });
  assert.deepEqual(D.sanitize(null), {});
});

test('neighbor: Shift+arrows follow the grid, on every side the same way', () => {
  const def = D.readDef(D.DEFAULT).def;
  const can = (n) => ['form', 'gtgt', 'sugg', 'itgt'].includes(n);
  for (const side of ['b', 'l', 'r']) {
    const r = D.resolve(def, { side });
    assert.equal(D.neighbor(r, 'form', 'down', can), 'sugg', side + ': form ↓ sugg');
    assert.equal(D.neighbor(r, 'sugg', 'up', can), 'form', side + ': sugg ↑ form');
    assert.equal(D.neighbor(r, 'sugg', 'left', can), 'gtgt', side + ': sugg ← gtgt');
    assert.equal(D.neighbor(r, 'gtgt', 'right', can), 'sugg', side + ': gtgt → sugg');
    assert.equal(D.neighbor(r, 'form', 'left', can), 'itgt', side + ': form ← itgt');
  }
  const b = D.resolve(def, { side: 'b' });
  assert.equal(D.neighbor(b, 'form', 'right', can), null, 'recv cannot be entered: nothing past it');
  assert.equal(D.neighbor(b, 'sugg', 'down', can), null, 'the edge');
  assert.equal(D.neighbor(b, 'gtgt', 'down', can), null, 'clock and otgt cannot, the edge after');
  assert.equal(D.neighbor(b, 'form', 'right'), 'recv', 'without can: any part');
  assert.equal(D.neighbor(b, 'nope', 'up', can), null);
  // past what cannot, further on
  const r = { areas: ['a x b'], rows: [1], cols: [1, 1, 1] };
  assert.equal(D.neighbor(r, 'a', 'right', (n) => n !== 'x'), 'b');
  assert.equal(D.neighbor({ areas: ['a . b'], rows: [1], cols: [1, 1, 1] }, 'a', 'right'), 'b');
});

test('the parts @gsel and @sugg are read', () => {
  const r = D.readDef({ parts: { g: '@gsel', s: '@sugg', f: '@form' }, grid: { b: { areas: ['g s f'] }, l: { areas: ['g', 's', 'f'] }, r: 'l' } });
  assert.ok(r.def, r.error);
  assert.ok(D.readDef({ parts: { g: '@nope' }, grid: { b: { areas: ['g'] }, l: { areas: ['g'] }, r: 'l' } }).error);
});

test('sizePart: the list of database windows made larger and back (db list open / close), on the side drawn', () => {
  const o = D.sizePart({}, std, 'dbls', true);
  assert.deepEqual(o.dock, { rows: { b: [3, 1, 1, 1, 3] } });
  assert.match(o.message, /dbls takes a third of the dock/);
  const c = D.sizePart(o.dock, std, 'dbls', false);
  assert.deepEqual(c.dock, {}, 'closed: nothing changed is kept');
  assert.deepEqual(D.sizePart({ side: 'l' }, std, 'dbls', true).dock, { side: 'l', rows: { l: [2, 4, 3, 1, 1, 1, 6, 9] } });
  assert.match(D.sizePart({}, std, 'recv', true).error, /no row of its own for recv/);
});
