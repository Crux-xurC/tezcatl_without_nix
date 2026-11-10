'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, describe } = require('../lib/core/kbd.js');

const ev = (key, ...modifiers) => ({ key, modifiers });

test('single printable char', () => {
  assert.deepEqual(parse('x'), { events: [ev('x')] });
});

test('C-x C-f -> two control events', () => {
  assert.deepEqual(parse('C-x C-f'), {
    events: [ev('x', 'control'), ev('f', 'control')],
  });
});

test('M-x', () => {
  assert.deepEqual(parse('M-x'), { events: [ev('x', 'meta')] });
});

test('C-M-x -> canonical modifier order control, meta', () => {
  assert.deepEqual(parse('C-M-x'), { events: [ev('x', 'control', 'meta')] });
  assert.deepEqual(parse('M-C-x'), { events: [ev('x', 'control', 'meta')] });
});

test('all four modifiers', () => {
  assert.deepEqual(parse('s-S-M-C-a'), {
    events: [ev('a', 'control', 'meta', 'shift', 'super')],
  });
});

test('RET / SPC / TAB / ESC / DEL aliases', () => {
  assert.deepEqual(parse('RET SPC TAB ESC DEL'), {
    events: [ev('return'), ev(' '), ev('tab'), ev('escape'), ev('backspace')],
  });
});

test('<f5> and C-<up>', () => {
  assert.deepEqual(parse('<f5>'), { events: [ev('f5')] });
  assert.deepEqual(parse('C-<up>'), { events: [ev('up', 'control')] });
});

test('multi-char bare token expands to one event per character', () => {
  assert.deepEqual(parse('/tmp/x'), {
    events: [ev('/'), ev('t'), ev('m'), ev('p'), ev('/'), ev('x')],
  });
});

test('full acceptance line: C-x C-f /tmp/x RET', () => {
  assert.deepEqual(parse('C-x C-f /tmp/x RET'), {
    events: [
      ev('x', 'control'), ev('f', 'control'),
      ev('/'), ev('t'), ev('m'), ev('p'), ev('/'), ev('x'),
      ev('return'),
    ],
  });
});

test('C-[ is control + [ (how ESC reaches Emacs)', () => {
  assert.deepEqual(parse('C-['), { events: [ev('[', 'control')] });
});

test('C-- is control + minus', () => {
  assert.deepEqual(parse('C--'), { events: [ev('-', 'control')] });
});

test('faithful passthrough: S-a is shift+a, not "A"', () => {
  assert.deepEqual(parse('S-a'), { events: [ev('a', 'shift')] });
});

test('whitespace: extra spaces and tabs collapse', () => {
  assert.deepEqual(parse('  C-x   C-f  '), {
    events: [ev('x', 'control'), ev('f', 'control')],
  });
});

test('errors', () => {
  assert.ok(parse('').error);
  assert.ok(parse('   ').error);
  assert.ok(parse('<f13>').error);
  assert.ok(parse('<bogus>').error);
  assert.ok(parse('M-').error);
  assert.ok(parse('C-M-').error);
  assert.ok(parse('C-foo').error);
  assert.ok(parse('C-C-x').error);
});

test('describe round-trips a parsed sequence', () => {
  const r = parse('C-x C-f SPC <return>');
  assert.equal(describe(r.events), 'C-x C-f SPC <return>');
});
