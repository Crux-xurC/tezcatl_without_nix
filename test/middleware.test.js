'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../lib/vent/middleware.js');

test('identity: returns the events unchanged', () => {
  const events = [{ key: 'x', modifiers: ['meta'] }];
  assert.equal(run(events, null), events);
});

test('identity: empty sequence', () => {
  assert.deepEqual(run([], null), []);
});

test('identity: ignores currentContext', () => {
  const events = [{ key: 'f', modifiers: ['control'] }];
  const ctx = { kind: 'context', 'buffer-name': 'x', window: 'win-1', frame: 'frame-1' };
  assert.deepEqual(run(events, ctx), events);
});
