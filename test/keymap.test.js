'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../lib/core/keymap.js');

function ev(o) {
  return Object.assign(
    { key: '', ctrlKey: false, altKey: false, metaKey: false,
      shiftKey: false, isComposing: false },
    o,
  );
}

test('plain printable', () => {
  assert.deepEqual(normalize(ev({ key: 'x' })), { key: 'x', modifiers: [] });
});

test('M-x  (alt -> meta)', () => {
  assert.deepEqual(normalize(ev({ key: 'x', altKey: true })),
    { key: 'x', modifiers: ['meta'] });
});

test('C-x  (ctrl -> control)', () => {
  assert.deepEqual(normalize(ev({ key: 'x', ctrlKey: true })),
    { key: 'x', modifiers: ['control'] });
});

test('C-M-x  (canonical order control, meta)', () => {
  assert.deepEqual(normalize(ev({ key: 'x', ctrlKey: true, altKey: true })),
    { key: 'x', modifiers: ['control', 'meta'] });
});

test('metaKey -> super', () => {
  assert.deepEqual(normalize(ev({ key: 'x', metaKey: true })),
    { key: 'x', modifiers: ['super'] });
});

test('all modifiers, canonical order', () => {
  assert.deepEqual(
    normalize(ev({ key: 'x', ctrlKey: true, altKey: true, metaKey: true, shiftKey: true })),
    { key: 'x', modifiers: ['control', 'meta', 'super'] });
});

test('shift folding: printable keeps char, drops shift', () => {
  assert.deepEqual(normalize(ev({ key: 'X', shiftKey: true })),
    { key: 'X', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: '!', shiftKey: true })),
    { key: '!', modifiers: [] });
});

test('M-X  (shift+alt+x -> char X, meta only)', () => {
  assert.deepEqual(normalize(ev({ key: 'X', altKey: true, shiftKey: true })),
    { key: 'X', modifiers: ['meta'] });
});

test('shift kept for non-printable keys', () => {
  assert.deepEqual(normalize(ev({ key: 'F5', shiftKey: true })),
    { key: 'f5', modifiers: ['shift'] });
});

test('special keys map to Emacs names', () => {
  assert.deepEqual(normalize(ev({ key: 'Enter' })), { key: 'return', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'Escape' })), { key: 'escape', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'Tab' })), { key: 'tab', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'Backspace' })), { key: 'backspace', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'Delete' })), { key: 'delete', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'ArrowUp' })), { key: 'up', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'ArrowDown' })), { key: 'down', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'ArrowLeft' })), { key: 'left', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'ArrowRight' })), { key: 'right', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'Home' })), { key: 'home', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'End' })), { key: 'end', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'PageUp' })), { key: 'prior', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'PageDown' })), { key: 'next', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: 'F12' })), { key: 'f12', modifiers: [] });
});

test('C-ArrowUp', () => {
  assert.deepEqual(normalize(ev({ key: 'ArrowUp', ctrlKey: true })),
    { key: 'up', modifiers: ['control'] });
});

test('space is a printable single char', () => {
  assert.deepEqual(normalize(ev({ key: ' ' })), { key: ' ', modifiers: [] });
  assert.deepEqual(normalize(ev({ key: ' ', ctrlKey: true })),
    { key: ' ', modifiers: ['control'] });
});

test('lone modifier presses are dropped', () => {
  for (const k of ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'Fn']) {
    assert.equal(normalize(ev({ key: k })), null, k);
  }
});

test('IME composing keydown is dropped', () => {
  assert.equal(normalize(ev({ key: 'a', isComposing: true })), null);
});

test('unknown non-printable keys are dropped', () => {
  for (const k of ['Insert', 'F13', 'ContextMenu', 'Pause', 'PrintScreen',
    'Dead', 'Compose', 'ZenkakuHankaku', 'Henkan', 'Muhenkan', 'KanaMode',
    'Unidentified', '']) {
    assert.equal(normalize(ev({ key: k })), null, k);
  }
});

test('C0 control char as key is dropped', () => {
  assert.equal(normalize(ev({ key: '' })), null);
  assert.equal(normalize(ev({ key: '\r' })), null);
});
