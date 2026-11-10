'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../lib/core/keymap.js');
const { run } = require('../lib/vent/middleware.js');
const { encodeInput } = require('../lib/vent/protocol.js');

function ev(o) {
  return Object.assign(
    { key: '', ctrlKey: false, altKey: false, metaKey: false,
      shiftKey: false, isComposing: false },
    o,
  );
}

function wire(keyEvent) {
  const norm = normalize(keyEvent);
  if (!norm) return null;
  return JSON.stringify(encodeInput(run([norm], null)));
}

test('M-x', () => {
  assert.equal(wire(ev({ key: 'x', altKey: true })),
    '{"kind":"input","sequence":[{"key":"x","modifiers":["meta"]}]}');
});

test('C-x then C-f  (two independent keystrokes -> two messages)', () => {
  assert.equal(wire(ev({ key: 'x', ctrlKey: true })),
    '{"kind":"input","sequence":[{"key":"x","modifiers":["control"]}]}');
  assert.equal(wire(ev({ key: 'f', ctrlKey: true })),
    '{"kind":"input","sequence":[{"key":"f","modifiers":["control"]}]}');
});

test('C-[ sends ESC-family to Emacs (bare Escape is the capture toggle)', () => {
  assert.equal(wire(ev({ key: '[', ctrlKey: true })),
    '{"kind":"input","sequence":[{"key":"[","modifiers":["control"]}]}');
});

test('RET', () => {
  assert.equal(wire(ev({ key: 'Enter' })),
    '{"kind":"input","sequence":[{"key":"return","modifiers":[]}]}');
});

test('self-insert of a capital letter', () => {
  assert.equal(wire(ev({ key: 'A', shiftKey: true })),
    '{"kind":"input","sequence":[{"key":"A","modifiers":[]}]}');
});

test('dropped keys yield no message', () => {
  assert.equal(wire(ev({ key: 'Shift', shiftKey: true })), null);
  assert.equal(wire(ev({ key: 'Insert' })), null);
  assert.equal(wire(ev({ key: 'a', isComposing: true })), null);
});
