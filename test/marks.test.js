'use strict';
// lib/code/marks.js: a mark replaced with ids from a list (D-id-pool)
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../lib/code/marks.js');

test('parseArgs / parseWrite: <mark> <list>; :w alone is a plain save; :w <path> is not', () => {
  assert.deepEqual(K.parseArgs('#eigenvalue 8degit-list'), { mark: '#eigenvalue', list: '8degit-list' });
  assert.match(K.parseArgs('#eigenvalue').error, /a mark and a list/);
  assert.match(K.parseArgs('#e Upper').error, /a-z 0-9/);
  assert.deepEqual(K.parseWrite(''), { replace: null });
  assert.deepEqual(K.parseWrite(' replace  #e  ids '), { replace: { mark: '#e', list: 'ids' } });
  assert.match(K.parseWrite('lib/a.ex').error, /there is no :w <path>/);
  assert.match(K.parseWrite('replace #e').error, /a mark and a list/);
});

test('find: where no letter, digit or _ follows; inside a word before it is fine', () => {
  const t = '| #eigenvalue | x |\nTable: taskmatrix_#eigenvalue\n#eigenvalues #eigenvalue_x #eigenvalue.';
  const at = K.find(t, '#eigenvalue');
  assert.deepEqual(at.map((i) => t.slice(i - 1, i + 12)), [' #eigenvalue ', '_#eigenvalue\n', ' #eigenvalue.']);
  assert.deepEqual(K.find('a.b a+b', 'a.b'), [0]);
  assert.deepEqual(K.find('x', ''), []);
});

test('changes: the i-th mark gets the i-th id; fewer ids, fewer changes', () => {
  const t = '#m a #m b #m';
  assert.deepEqual(K.changes(t, '#m', ['id1', 'id2', 'id3']), [
    { from: 0, to: 2, insert: 'id1' }, { from: 5, to: 7, insert: 'id2' }, { from: 10, to: 12, insert: 'id3' }]);
  assert.equal(K.changes(t, '#m', ['id1']).length, 1);
});
