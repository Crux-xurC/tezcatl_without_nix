'use strict';
// lib/recv/term-text.js: a terminal's output as lines of plain text (the
// receiving side's xterm source).
const test = require('node:test');
const assert = require('node:assert/strict');
const TT = require('../lib/recv/term-text.js');

test('lines, without colours or titles', () => {
  const t = TT.create();
  t.write('\x1b]0;bash: ~\x07[crux@x ~]$ ls\r\n\x1b[01;34mlib\x1b[0m  test\r\n');
  assert.deepEqual(t.lines(), ['[crux@x ~]$ ls', 'lib  test']);
});

test('\\r writes over the line: a progress bar shows its last state', () => {
  const t = TT.create();
  t.write('10%\r50%\r100%\n');
  assert.deepEqual(t.lines(), ['100%']);
  t.write('abcdef\rXY');
  assert.deepEqual(t.lines(), ['100%', 'XYcdef']);
});

test('backspace, tab, other control chars', () => {
  const t = TT.create();
  t.write('ab\bC\x07\n\tx\n');
  assert.deepEqual(t.lines(), ['aC', '        x']);
});

test('a sequence cut between two writes waits for the rest', () => {
  const t = TT.create();
  t.write('red: \x1b[3');
  t.write('1mR\x1b[0m\n');
  t.write('title \x1b]0;ti');
  t.write('tle\x07done\n');
  assert.deepEqual(t.lines(), ['red: R', 'title done']);
});

test('only the last lines are kept', () => {
  const t = TT.create(3);
  t.write('1\n2\n3\n4\n5');
  assert.deepEqual(t.lines(), ['3', '4', '5']);
});
