'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeInput, parseMessage } = require('../lib/vent/protocol.js');

test('encodeInput: single printable, no modifiers', () => {
  assert.deepEqual(encodeInput([{ key: 'x', modifiers: [] }]), {
    kind: 'input',
    sequence: [{ key: 'x', modifiers: [] }],
  });
});

test('encodeInput: modifiers are copied, not shared', () => {
  const mods = ['control', 'meta'];
  const msg = encodeInput([{ key: 'x', modifiers: mods }]);
  assert.deepEqual(msg.sequence[0].modifiers, ['control', 'meta']);
  assert.notEqual(msg.sequence[0].modifiers, mods);
});

test('encodeInput: multi-event sequence keeps order', () => {
  const msg = encodeInput([
    { key: 'x', modifiers: ['control'] },
    { key: 'f', modifiers: ['control'] },
  ]);
  assert.deepEqual(msg, {
    kind: 'input',
    sequence: [
      { key: 'x', modifiers: ['control'] },
      { key: 'f', modifiers: ['control'] },
    ],
  });
});

test('encodeInput: exact shape emacs-vent-in.el parses', () => {
  assert.equal(
    JSON.stringify(encodeInput([{ key: 'x', modifiers: ['meta'] }])),
    '{"kind":"input","sequence":[{"key":"x","modifiers":["meta"]}]}',
  );
});

test('parseMessage: valid object with string kind', () => {
  assert.deepEqual(parseMessage('{"kind":"hello"}'), { kind: 'hello' });
});

test('parseMessage: context message', () => {
  assert.deepEqual(
    parseMessage('{"kind":"context","buffer-name":"a","window":"win-1","frame":"frame-1"}'),
    { kind: 'context', 'buffer-name': 'a', window: 'win-1', frame: 'frame-1' },
  );
});

test('parseMessage: malformed -> null', () => {
  assert.equal(parseMessage('not json'), null);
  assert.equal(parseMessage('{"kind":123}'), null);
  assert.equal(parseMessage('{"no":"kind"}'), null);
  assert.equal(parseMessage('[1,2,3]'), null);
  assert.equal(parseMessage('null'), null);
  assert.equal(parseMessage('"just a string"'), null);
});
