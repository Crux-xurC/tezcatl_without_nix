'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, words } = require('../lib/skin/tree-commands.js');

test('words: spaces split, quotes keep them', () => {
  assert.deepEqual(words(' tree add "my dir/x"  \'a b\' c '), ['tree', 'add', 'my dir/x', 'a b', 'c']);
});

test('parse: each command, with or without the leading tree', () => {
  assert.deepEqual(parse('tree add proj/x'), { cmd: 'add', path: 'proj/x' });
  assert.deepEqual(parse('add'), { cmd: 'add', path: null });
  assert.deepEqual(parse('tree del 2'), { cmd: 'del', n: 2 });
  assert.deepEqual(parse('tree order 1 3'), { cmd: 'order', a: 1, b: 3 });
  assert.deepEqual(parse('tree tag 2 web front'), { cmd: 'tag', n: 2, tag: 'web front' });
  assert.deepEqual(parse('tree tag 2'), { cmd: 'tag', n: 2, tag: '' });
  assert.deepEqual(parse('tree update'), { cmd: 'update' });
  assert.deepEqual(parse('tree edit'), { cmd: 'edit', path: null });
  assert.deepEqual(parse('tree edit "a b.txt"'), { cmd: 'edit', path: 'a b.txt' });
});

test('parse: what is refused, saying how to write it', () => {
  assert.match(parse('tree del').error, /one number/);
  assert.match(parse('tree del x').error, /one number/);
  assert.match(parse('tree order 1').error, /two numbers/);
  assert.match(parse('tree tag x y').error, /a number and text/);
  assert.match(parse('tree add a b').error, /one path/);
  assert.match(parse('tree update now').error, /takes no arguments/);
  assert.match(parse('tree set').error, /no such command: set/);
  assert.match(parse('tree').error, /no command/);
});
