'use strict';
// lib/code/code-diff.js: the `diff ...` lines and the code_diff panel's pure parts
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/code/code-diff.js');
const F = require('../lib/code/code-files.js');

test('parse: diff -n A,B and diff -f A,B; other lines are not its', () => {
  assert.equal(D.parse('skin add 1 tree'), null);
  assert.equal(D.parse('different'), null);
  assert.deepEqual(D.parse('diff -n lib/a.ex,lib/b.ex'), { cmd: 'new', a: 'lib/a.ex', b: 'lib/b.ex' });
  assert.deepEqual(D.parse('  diff  -f  ~work/scratch , /lib/a.ex '), { cmd: 'focused', a: '~work/scratch', b: 'lib/a.ex' });
  assert.match(D.parse('diff').error, /diff -n A,B/);
  assert.match(D.parse('diff -x a,b').error, /diff -n A,B/);
  assert.match(D.parse('diff -n a').error, /two paths/);
  assert.match(D.parse('diff -n a,b,c').error, /two paths/);
  assert.match(D.parse('diff -n a,').error, /two paths/);
  assert.match(D.parse('diff -n a.ex,a.ex').error, /the same file twice/);
});

test('parse: paths are resolved as the editor resolves them (./ from the current file)', () => {
  const resolve = (arg) => F.resolve('lib/code/a.js', arg);
  assert.deepEqual(D.parse('diff -n ./b.js,../x.js', resolve), { cmd: 'new', a: 'lib/code/b.js', b: 'lib/x.js' });
  assert.match(D.parse('diff -n ../../../x.js,a.js', resolve).error, /outside the FS root/);
});

test('head: the path and when it was last saved; a file that is not there says so', () => {
  assert.equal(D.head('lib/a.ex', null), 'lib/a.ex');
  assert.equal(D.head('lib/a.ex', { exists: false }), 'lib/a.ex · not on the disk');
  const d = new Date(2026, 9, 12, 19, 5, 9);
  assert.equal(D.head('lib/a.ex', { exists: true, mtime: d.getTime() / 1000 }), 'lib/a.ex · 2026-10-12 19:05:09');
  assert.equal(D.head('', null), '');
  assert.equal(D.stamp(null), '');
});

test('concerns: a change said on the bus that touches one of the two files', () => {
  assert.equal(D.concerns('code.saved', { path: 'lib/a.ex' }, 'lib/a.ex', 'lib/b.ex'), true);
  assert.equal(D.concerns('code.saved', { path: 'lib/c.ex' }, 'lib/a.ex', 'lib/b.ex'), false);
  assert.equal(D.concerns('fs.changed', { op: 'write', paths: ['~work/scratch'] }, '~work/scratch', 'lib/b.ex'), true);
  assert.equal(D.concerns('file.changed', { op: 'rename', paths: ['x', '/lib/b.ex'] }, 'lib/a.ex', 'lib/b.ex'), true);
  assert.equal(D.concerns('fs.changed', { paths: ['lib/a.ex'] }, null, null), false);
  assert.equal(D.concerns('fs.changed', null, 'a', 'b'), false);
});
