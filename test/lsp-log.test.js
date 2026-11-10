'use strict';
// lib/code/lsp-log.js: the lsp_log panel's record and its jumps
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/code/lsp-log.js');

test('entry: a jump is one line going to where it went', () => {
  const e = L.entry({ kind: 'jump', from: { path: 'a.js', line: 6, col: 13 }, to: { path: 'b.js', line: 1, col: 17 } }, '12:00:01');
  assert.deepEqual(e.lines, ['12:00:01 def    a.js:6:13 → b.js:1:17']);
  assert.deepEqual(e.locs, [{ path: 'b.js', line: 1, col: 17 }]);
});

test('entry: refs list each place under the head; rename its files; hover its text; format', () => {
  const r = L.entry({ kind: 'refs', path: 'a.js', line: 2, col: 3, symbol: 'helper',
    items: [{ path: 'a.js', line: 1, col: 10, text: ' import { helper }' }, { path: 'b.js', line: 1, col: 17 }] }, 't');
  assert.deepEqual(r.lines, ['t refs   helper  2 place(s)  (a.js:2:3)', '    a.js:1:10  import { helper }', '    b.js:1:17']);
  assert.deepEqual(r.locs.map((x) => x && x.path + ':' + x.line), ['a.js:2', 'a.js:1', 'b.js:1']);

  const n = L.entry({ kind: 'rename', path: 'b.js', line: 1, col: 17, symbol: 'helper2', n: 1,
    files: [{ path: 'a.js', n: 3, ok: true }, { path: 'c.js', ok: false, reason: 'unsaved edits' }] }, 't');
  assert.deepEqual(n.lines, ['t rename helper2  this file: 1 place(s), 2 other file(s)  (b.js:1:17)', '    a.js  3 place(s)', '    c.js  not applied: unsaved edits']);

  const h = L.entry({ kind: 'hover', path: 'a.js', line: 6, col: 13, text: '```ts\nfunction helper(x: any): any\n```' }, 't');
  assert.equal(h.lines[0], 't hover  a.js:6:13');
  assert.equal(h.lines[2], '    │ function helper(x: any): any');
  assert.ok(h.locs.every((x) => x && x.line === 6));

  assert.deepEqual(L.entry({ kind: 'format', path: 'c.js', line: 1, col: 1, n: 0 }, 't').lines, ['t format c.js:1:1  nothing to format']);
});

test('history: back to where the jump left from, forward to where it went; a new jump drops the ones ahead', () => {
  const h = L.history();
  assert.equal(h.back(), null);
  const p = (path, line) => ({ path, line, col: 1 });
  h.push({ from: p('a', 1), to: p('b', 2) });
  h.push({ from: p('b', 2), to: p('c', 3) });
  assert.deepEqual(h.back(), p('b', 2));
  assert.deepEqual(h.back(), p('a', 1));
  assert.equal(h.back(), null);
  assert.deepEqual(h.forward(), p('b', 2));
  // a new jump here drops b -> c
  h.push({ from: p('b', 2), to: p('d', 4) });
  assert.equal(h.forward(), null);
  assert.deepEqual(h.back(), p('b', 2));
  assert.deepEqual(h.forward(), p('d', 4));
  assert.deepEqual(h.size(), { jumps: 2, at: 2 });
  h.push({ from: null, to: p('x', 1) });
  assert.deepEqual(h.size(), { jumps: 2, at: 2 });
});
