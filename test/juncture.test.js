'use strict';
// lib/code/juncture.js: the `juncture ...` lines and the tree's pure parts (D-juncture)
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../lib/code/juncture.js');
const F = require('../lib/code/code-files.js');

test('parse: juncture <sub> [path]; other lines are not its', () => {
  assert.equal(J.parse('skin add 1 tree'), null);
  assert.equal(J.parse('junctures'), null);
  for (const sub of ['set', 'point', 'back', 'forward', 'tree']) {
    assert.deepEqual(J.parse('juncture ' + sub), { cmd: sub, path: null });
  }
  assert.deepEqual(J.parse('  juncture  tree  /lib/a.ex '), { cmd: 'tree', path: 'lib/a.ex' });
  assert.match(J.parse('juncture').error, /juncture set\|point/);
  assert.match(J.parse('juncture undo').error, /juncture set\|point/);
  assert.match(J.parse('juncture back a.ex b.ex').error, /one path at most/);
  assert.match(J.parse('juncture set ~work/scratch').error, /work place/);
});

test('parse: a path is resolved as the editor resolves it (./ from the current file)', () => {
  const resolve = (arg) => F.resolve('lib/code/a.js', arg);
  assert.deepEqual(J.parse('juncture point ./b.js', resolve), { cmd: 'point', path: 'lib/code/b.js' });
  assert.match(J.parse('juncture point ../../../x.js', resolve).error, /outside the FS root/);
});

test('limits: code.json "juncture" within 1-100, the defaults otherwise', () => {
  assert.deepEqual(J.limits(undefined), { files: 10, slots: 20 });
  assert.deepEqual(J.limits({ files: 3, slots: 50 }), { files: 3, slots: 50 });
  assert.deepEqual(J.limits({ files: 0, slots: 101 }), { files: 10, slots: 20 });
  assert.deepEqual(J.limits({ files: '5', slots: 2.5 }), { files: 10, slots: 20 });
});

// j0 - j1 - j2
//         \- j3   (current j3; j1's way: j3)
const T = {
  path: 'lib/a.ex',
  current: 'j3',
  nodes: {
    j0: { parent: null, lastChild: 'j1', at: new Date(2026, 9, 17, 10, 2, 0).getTime(), ancestor: true },
    j1: { parent: 'j0', lastChild: 'j3', at: new Date(2026, 9, 17, 10, 15, 0).getTime(), ancestor: false },
    j2: { parent: 'j1', lastChild: null, at: new Date(2026, 9, 17, 10, 20, 0).getTime(), ancestor: false },
    j3: { parent: 'j1', lastChild: null, at: new Date(2026, 9, 17, 10, 31, 5).getTime(), ancestor: false },
  },
};
const at = (cur) => Object.assign({}, T, { current: cur });

test('backOf / forwardOf: the parent; the child taken last; nothing past the ends', () => {
  assert.equal(J.backOf(T), 'j1');
  assert.equal(J.backOf(at('j0')), null);
  assert.equal(J.forwardOf(at('j1')), 'j3');
  assert.equal(J.forwardOf(at('j0')), 'j1');
  assert.equal(J.forwardOf(T), null);
  assert.equal(J.backOf(null), null);
  assert.equal(J.forwardOf({ current: 'jx', nodes: {} }), null);
});

test('draw: as the tree command draws, children oldest first, the start and the current point marked', () => {
  assert.deepEqual(J.draw(T).map((r) => r.text), [
    'lib/a.ex',
    '└── j0  10:02:00  start',
    '    └── j1  10:15:00',
    '        ├── j2  10:20:00',
    '        └── j3  10:31:05  ← current',
  ]);
  assert.deepEqual(J.draw(T).map((r) => r.id), [null, 'j0', 'j1', 'j2', 'j3']);
  // j10 after j9 (by number, not as text)
  const wide = { path: 'x', current: 'j0', nodes: { j0: { parent: null, at: 0, ancestor: true }, j10: { parent: 'j0', at: 0 }, j9: { parent: 'j0', at: 0 } } };
  assert.deepEqual(J.draw(wide).map((r) => r.id), [null, 'j0', 'j9', 'j10']);
  assert.deepEqual(J.draw(null), []);
});

test('dropped: what the relay pushed out, a line each', () => {
  assert.deepEqual(J.dropped('lib/a.ex', { ok: true, dropped: [], dropped_points: [] }), []);
  assert.deepEqual(J.dropped('lib/a.ex', { dropped: ['lib/old.ex'] }, { files: 10 }), ['juncture: dropped the tree of lib/old.ex (10 files)']);
  assert.deepEqual(J.dropped('lib/a.ex', { dropped_points: ['j1', 'j2'] }, { slots: 20 }), ['juncture: dropped j1, j2 of a.ex (20 points)']);
});
