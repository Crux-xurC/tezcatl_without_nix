'use strict';
// lib/core/panel-bus.js: post(..., {echo: true}) reaches this frame's own
// listeners too (a BroadcastChannel never hands a message back to its
// sender); without echo only the other frames get it. node has
// BroadcastChannel, so a second channel stands in for another frame.
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.self = globalThis;
require('../lib/core/panel-bus.js');
const bus = globalThis.Tezcatl.bus;

test('echo: the sender\'s own listeners get it once; without echo they do not; other frames get both', async () => {
  const mine = [];
  const other = [];
  const off = bus.on('t.ping', (p, meta) => mine.push([p.n, meta.from.id === bus.self.id]));
  const ch = new BroadcastChannel(bus.CHANNEL);
  ch.onmessage = (e) => { if (e.data.type === 't.ping') other.push(e.data.payload.n); };
  try {
    bus.post('t.ping', { n: 1 });
    bus.post('t.ping', { n: 2 }, { echo: true });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(mine, [[2, true]]);
    assert.deepEqual(other, [1, 2]);
  } finally { off(); ch.close(); bus.close(); }
});
