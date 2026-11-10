'use strict';
// lib/target/frame.js and lib/recv/frame.js: another frame as a destination and a source (D-bridge)
const test = require('node:test');
const assert = require('node:assert/strict');
const FT = require('../lib/target/frame.js');
const FR = require('../lib/recv/frame.js');

// a bus that keeps what is posted and lets a test say messages
function fakeBus() {
  const posted = [];
  const on = {};
  const add = (type, fn) => { (on[type] = on[type] || []).push(fn); return () => {}; };
  return {
    posted,
    post: (type, payload, opts) => posted.push({ type, payload, to: opts && opts.to }),
    on: add,
    onMine: add,
    say: (type, payload, from) => (on[type] || []).forEach((fn) => fn(payload, { from: { id: from } })),
  };
}

test('lineOf: chars only, the returns at the end dropped', () => {
  const k = (key, modifiers = []) => ({ key, modifiers });
  assert.deepEqual(FT.lineOf([k('s'), k('k'), k('i'), k('n'), k('return')]), { text: 'skin' });
  assert.match(FT.lineOf([k('return')]).error, /empty line/);
  assert.match(FT.lineOf([k('x', ['control'])]).error, /a line of chars/);
  assert.match(FT.lineOf([k('up')]).error, /a line of chars/);
});

test('roster: the frames that answered, never this one; one silent past GONE drops out', () => {
  const bus = fakeBus();
  let t = 0;
  let moved = 0;
  const r = FT.roster({ bus, self: 'me', now: () => t, poll: false });
  r.start(() => { moved += 1; });
  assert.deepEqual(bus.posted.map((m) => m.type), ['frame.ask']);
  bus.say('frame.here', { name: 'work' }, 'f1');
  bus.say('frame.here', { name: 'main' }, 'me');
  bus.say('frame.here', {}, 'f2');
  assert.deepEqual(r.list(), [{ id: 'f2', name: '(unnamed)' }, { id: 'f1', name: 'work' }]);
  assert.equal(moved, 2);
  t = 5000;
  bus.say('frame.here', { name: 'work' }, 'f1');
  t = 9000;
  r.ask();
  assert.deepEqual(r.list(), [{ id: 'f1', name: 'work' }]);
  assert.ok(!r.has('f2'));
});

test('recv: the lines of a frame of the roster, one record each, kept to the last 200', () => {
  const bus = fakeBus();
  const s = FR.create({ bus, self: 'me', roster: (o) => FT.roster(Object.assign({ poll: false }, o)) });
  s.start(() => {});
  bus.say('frame.here', { name: 'work' }, 'f1');
  bus.say('recv.out', { text: '> skin add tree', cls: 'sent' }, 'f1');
  bus.say('recv.out', { text: 'a\nb' }, 'f1');
  bus.say('recv.out', { text: 'not a frame of the roster' }, 'x9');
  assert.deepEqual(s.lines('f1'), [{ text: '> skin add tree', cls: 'sent' }, { text: 'a', cls: '' }, { text: 'b', cls: '' }]);
  assert.deepEqual(s.lines('x9'), []);
  assert.deepEqual(s.candidates(), [{ key: 'f1', label: 'frame work', state: 'open', detail: 'b' }]);
  for (let i = 0; i < 250; i++) bus.say('recv.out', { text: String(i) }, 'f1');
  assert.equal(s.lines('f1').length, 200);
  assert.equal(s.lines('f1')[199].text, '249');
});
