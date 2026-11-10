'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../lib/xipe/matrix-target.js');

// a synchronous in-memory bus: every endpoint but the sender gets each post
function hub() {
  const ends = [];
  return function endpoint() {
    const listeners = {};
    const me = {
      post(type, payload) { ends.forEach((e) => { if (e !== me) e.deliver(type, payload); }); },
      on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => { listeners[type] = listeners[type].filter((f) => f !== fn); }; },
      deliver(type, payload) { (listeners[type] || []).forEach((fn) => fn(payload)); },
    };
    ends.push(me);
    return me;
  };
}

function clock() { let t = 1000; return () => ++t; }

test('one page: it is the target', () => {
  const ep = hub();
  const a = create({ bus: ep(), kind: 'page', now: clock() });
  assert.equal(a.isMine(), true);
});

test('pages only: the one focused (or opened) last', () => {
  const ep = hub(); const now = clock();
  const a = create({ bus: ep(), kind: 'page', now, id: 'a' });
  const b = create({ bus: ep(), kind: 'page', now, id: 'b' });
  assert.deepEqual([a.isMine(), b.isMine()], [false, true]);   // b opened last
  a.claim();
  assert.deepEqual([a.isMine(), b.isMine()], [true, false]);
  assert.deepEqual(b.peers(), ['a']);   // learned through hello -> here
});

test('a skin wins over pages even when a page was focused later', () => {
  const ep = hub(); const now = clock();
  const s = create({ bus: ep(), kind: 'skin', now, id: 's' });
  const p = create({ bus: ep(), kind: 'page', now, id: 'p' });
  p.claim();
  assert.deepEqual([s.isMine(), p.isMine()], [true, false]);
  const s2 = create({ bus: ep(), kind: 'skin', now, id: 's2' });
  assert.deepEqual([s.isMine(), s2.isMine(), p.isMine()], [false, true, false]);
  s.claim();
  assert.deepEqual([s.isMine(), s2.isMine(), p.isMine()], [true, false, false]);
});

test('closing the skins hands it back to the latest page', () => {
  const ep = hub(); const now = clock();
  const p1 = create({ bus: ep(), kind: 'page', now, id: 'p1' });
  const p2 = create({ bus: ep(), kind: 'page', now, id: 'p2' });
  const s = create({ bus: ep(), kind: 'skin', now, id: 's' });
  p1.claim();
  assert.equal(p1.isMine(), false);
  s.close();
  assert.deepEqual([p1.isMine(), p2.isMine()], [true, false]);
});
