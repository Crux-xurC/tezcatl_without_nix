'use strict';
// lib/code/minimum.js: where code_vi_minimum's :m sends (D-minimum)
const test = require('node:test');
const assert = require('node:assert/strict');
const MN = require('../lib/code/minimum.js');

test('parse: :m / input / xterm / code_editor <file>; anything else is said', () => {
  assert.deepEqual(MN.parse(''), { to: 'back' });
  assert.deepEqual(MN.parse(' input '), { to: 'input' });
  assert.deepEqual(MN.parse('xterm'), { to: 'xterm' });
  assert.deepEqual(MN.parse('code_editor /notes/a.md'), { to: 'code_editor', path: 'notes/a.md' });
  assert.match(MN.parse('code_editor').error, /needs the file/);
  assert.match(MN.parse('emacs').error, /no such place to send to: emacs/);
  assert.match(MN.parse('code_editor ../x', () => ({ error: 'outside the FS root' })).error, /outside/);
});


test('parse: the old name code_vi still sends to the code_editor', () => {
  assert.deepEqual(MN.parse('code_vi notes/a.md'), { to: 'code_editor', path: 'notes/a.md' });
});
