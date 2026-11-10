'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encode } = require('../lib/term/keys.js');
const lead = require('../lib/core/lead.js');

const bytes = (text, opts) => {
  const r = lead.parse(text);
  assert.ok(!r.error, r.error);
  const e = encode(r.events, opts);
  assert.ok(!e.error, e.error);
  return e.bytes;
};

test('plain chars and Return', () => {
  assert.equal(bytes('ls -l;e'), 'ls -l\r');
  assert.equal(bytes('あ'), 'あ');
});

test('ctrl: letters, and the chars that have a code', () => {
  assert.equal(bytes(';cc'), '\x03');
  assert.equal(bytes(';cx;cs'), '\x18\x13');
  assert.equal(bytes(';cX'), '\x18');
  assert.equal(bytes(';c '), '\x00');
  assert.equal(bytes(';c['), '\x1b');
  assert.equal(bytes(';c?'), '\x7f');
  assert.match(encode([{ key: '.', modifiers: ['control'] }]).error, /no control code/);
});

test('meta is an ESC before the key', () => {
  assert.equal(bytes(';ax'), '\x1bx');
  assert.equal(bytes(';a;cx'), '\x1b\x18');
  assert.equal(bytes(';a;b'), '\x1b\x7f');
});

test('named keys', () => {
  assert.equal(bytes(';t;b;q;d'), '\t\x7f\x1b\x1b[3~');
  assert.equal(bytes(';s;t'), '\x1b[Z');
  assert.equal(bytes(';c;b'), '\x08');
});

test('arrows: normal and application cursor mode, and with modifiers', () => {
  assert.equal(bytes(';h;j;k;l'), '\x1b[D\x1b[B\x1b[A\x1b[C');
  assert.equal(bytes(';h;k', { appCursor: true }), '\x1bOD\x1bOA');
  assert.equal(bytes(';c;h'), '\x1b[1;5D');
  assert.equal(bytes(';s;l'), '\x1b[1;2C');
  assert.equal(bytes(';a;c;k', { appCursor: true }), '\x1b[1;7A');
});

test('function keys', () => {
  assert.equal(bytes(';f1;f4'), '\x1bOP\x1bOS');
  assert.equal(bytes(';f5;f0;f-;f='), '\x1b[15~\x1b[21~\x1b[23~\x1b[24~');
  assert.equal(bytes(';c;f5'), '\x1b[15;5~');
  assert.equal(bytes(';s;f1'), '\x1b[1;2P');
  assert.equal(bytes(';c;d'), '\x1b[3;5~');
});

test('what a terminal cannot take is an error, and nothing is sent', () => {
  assert.match(encode(lead.parse('a;wx').events).error, /no Super/);
  assert.match(encode([{ key: 'a', modifiers: ['shift'] }]).error, /shift/);
});
