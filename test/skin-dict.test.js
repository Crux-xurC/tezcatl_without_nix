'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const skinDict = require('../lib/skin/skin-dict.js');

// a bus that delivers synchronously with {from} meta, and records posts
function fakeBus() {
  const listeners = {};
  const posts = [];
  return {
    posts,
    on(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
      return () => { listeners[type] = listeners[type].filter((f) => f !== fn); };
    },
    post(type, payload, opts) { posts.push({ type, payload, to: (opts && opts.to) || null }); },
    emit(type, payload, from) { (listeners[type] || []).slice().forEach((fn) => fn(payload, { from, type })); },
  };
}

const IN = { id: 'b-in', name: 'xipe-in', role: 'code' };
const OUT = { id: 'b-out', name: 'xipe-out', role: 'code' };
const DICT = { id: 'b-dict', name: 'xipe-dict', role: 'list' };

test('forwards only its own dict pane, only to its own editors', () => {
  const bus = fakeBus();
  skinDict.wire(bus, { dict: 'xipe-dict', editors: ['xipe-in'] });
  assert.equal(bus.posts[0].type, 'dict.query');
  bus.emit('code.ready', {}, IN);
  bus.emit('code.ready', {}, OUT);                       // not one of ours
  bus.emit('dict.entries', { entries: [{ word: 'row/add' }] }, DICT);
  bus.emit('dict.entries', { entries: [{ word: 'nope' }] }, { id: 'x', name: 'other-dict' });
  const words = bus.posts.filter((p) => p.type === 'dict.words');
  assert.deepEqual(words.map((p) => [p.to, p.payload.entries.map((e) => e.word)]),
    [['b-in', []], ['b-in', ['row/add']]]);
});

test('an editor that (re)appears gets the current entries', () => {
  const bus = fakeBus();
  skinDict.wire(bus, { dict: 'xipe-dict', editors: ['xipe-in'] });
  bus.emit('dict.entries', { entries: [{ word: 'scan' }] }, DICT);
  bus.emit('code.ready', {}, { ...IN, id: 'b-in-2' });
  const last = bus.posts.filter((p) => p.type === 'dict.words').pop();
  assert.deepEqual([last.to, last.payload.entries], ['b-in-2', [{ word: 'scan' }]]);
});

test('dict.pick inserts into the last focused editor of the skin', () => {
  const bus = fakeBus();
  skinDict.wire(bus, { dict: 'xipe-dict', editors: ['xipe-in', 'xipe-in2'] });
  bus.emit('code.ready', {}, IN);
  bus.emit('code.ready', {}, { id: 'b-in2', name: 'xipe-in2' });
  bus.emit('dict.pick', { word: 'row/add' }, DICT);      // nothing focused yet -> first
  bus.emit('focus.changed', { id: 'b-in2', name: 'xipe-in2' });
  bus.emit('dict.pick', { word: 'eval/run' }, DICT);
  bus.emit('dict.pick', { word: 'x' }, { id: 'y', name: 'other-dict' });
  const ins = bus.posts.filter((p) => p.type === 'insert');
  assert.deepEqual(ins.map((p) => [p.to, p.payload.text]), [['b-in', 'row/add'], ['b-in2', 'eval/run']]);
});
