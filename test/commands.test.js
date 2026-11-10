'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const commands = require('../lib/core/commands.js');

test('register + invoke runs the implementation with args/ctx', () => {
  let seen = null;
  commands.register('t.echo', (args, ctx) => {
    seen = { args, ctx };
    return 'ran';
  });
  assert.equal(commands.invoke('t.echo', { a: 1 }, { c: 2 }), 'ran');
  assert.deepEqual(seen, { args: { a: 1 }, ctx: { c: 2 } });
});

test('invoke of an unknown command with no bus -> false, no throw', () => {
  assert.equal(commands.invoke('t.nope'), false);
});

test('a throwing impl is caught -> false', () => {
  commands.register('t.boom', () => {
    throw new Error('boom');
  });
  assert.equal(commands.invoke('t.boom'), false);
});

test('list() reports registered commands and impl status', () => {
  commands.register('t.listed', () => {});
  const row = commands.list().find((c) => c.name === 't.listed');
  assert.ok(row);
  assert.equal(row.hasImpl, true);
});

test('invoke passes a default empty args object when none given', () => {
  let got;
  commands.register('t.defargs', (args) => {
    got = args;
  });
  commands.invoke('t.defargs');
  assert.deepEqual(got, {});
});
