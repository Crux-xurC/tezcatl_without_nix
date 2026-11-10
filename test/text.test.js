'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encode } = require('../lib/core/text.js');
const protocol = require('../lib/vent/protocol.js');

const ev = (key) => ({ key, modifiers: [] });

test('plain ASCII: one event per character', () => {
  assert.deepEqual(encode('abc'), { events: [ev('a'), ev('b'), ev('c')], dropped: 0 });
});

test('space is a normal one-character key', () => {
  assert.deepEqual(encode('a b'), { events: [ev('a'), ev(' '), ev('b')], dropped: 0 });
});

test('newline -> return, tab -> tab', () => {
  assert.deepEqual(encode('a\n\tb'), {
    events: [ev('a'), ev('return'), ev('tab'), ev('b')],
    dropped: 0,
  });
});

test('CRLF and lone CR normalize to a single return', () => {
  assert.deepEqual(encode('a\r\nb\rc'), {
    events: [ev('a'), ev('return'), ev('b'), ev('return'), ev('c')],
    dropped: 0,
  });
});

test('other C0 controls and DEL are dropped and counted', () => {
  const r = encode('a\x00b\x1bc\x7fd');
  assert.deepEqual(r.events, [ev('a'), ev('b'), ev('c'), ev('d')]);
  assert.equal(r.dropped, 3);
});

test('an M-: expression body with spaces survives intact', () => {
  const r = encode('(message "hi there")');
  assert.equal(r.error, undefined);
  assert.equal(r.events.map((e) => e.key).join(''), '(message "hi there")');
  assert.equal(r.dropped, 0);
});

test('non-BMP character -> a single event whose key is the astral string', () => {
  const r = encode('a\u{1F600}b');
  assert.deepEqual(r.events, [ev('a'), ev('\u{1F600}'), ev('b')]);
  assert.equal(r.events[1].key.length, 2);
  assert.equal(r.dropped, 0);
});

test('lone surrogate is dropped, not emitted as a broken key', () => {
  const r = encode('a\uD800b');
  assert.deepEqual(r.events, [ev('a'), ev('b')]);
  assert.equal(r.dropped, 1);
});

test('empty / nullish input -> {error:"empty"}', () => {
  assert.ok(encode('').error);
  assert.ok(encode(undefined).error);
  assert.ok(encode(null).error);
});

test('input that is only control chars -> no events, all dropped', () => {
  const r = encode('\x00\x01\x02');
  assert.deepEqual(r.events, []);
  assert.equal(r.dropped, 3);
});

test('feeds protocol.encodeInput unchanged', () => {
  const r = encode('M-x');
  assert.deepEqual(protocol.encodeInput(r.events), {
    kind: 'input',
    sequence: [ev('M'), ev('-'), ev('x')],
  });
});
