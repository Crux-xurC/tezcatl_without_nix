'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const xipeClient = require('../lib/xipe/xipe-client.js');

// A stand-in for the /xipe relay: every socket shares one hub, and -- like
// XipeConn -- every response is broadcast to every attached socket, not just
// the one that sent the request. Each request is answered on a later tick,
// in reverse order of arrival, so concurrent calls interleave.
function installFakeRelay() {
  const sockets = new Set();
  const queue = [];
  let scheduled = false;

  function broadcast(frame) {
    const data = JSON.stringify(frame);
    for (const s of sockets) if (s.onmessage) s.onmessage({ data });
  }

  function flush() {
    scheduled = false;
    while (queue.length) broadcast(queue.pop());
  }

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      sockets.add(this);
      setImmediate(() => this.onopen && this.onopen());
    }
    send(text) {
      const o = JSON.parse(text);
      if (o.kind === 'attach') {
        setImmediate(() => this.onmessage && this.onmessage({ data: JSON.stringify({ kind: 'attached', name: o.root }) }));
        return;
      }
      if (o.method === 'initialize') queue.push({ jsonrpc: '2.0', id: o.id, result: { capabilities: {} } });
      else if (o.method === 'bad/method') queue.push({ jsonrpc: '2.0', id: o.id, error: { message: 'unknown method' } });
      else queue.push({ jsonrpc: '2.0', id: o.id, result: { echoed: o.method, params: o.params } });
      if (!scheduled) {
        scheduled = true;
        setImmediate(flush);
      }
    }
    close() {
      sockets.delete(this);
    }
  }

  const prev = global.WebSocket;
  global.WebSocket = FakeWebSocket;
  return () => { global.WebSocket = prev; };
}

const config = { load: () => Promise.resolve({ connections: [{ url: 'ws://127.0.0.1:4100/' }] }) };

test('concurrent requests each resolve with their own result despite the broadcast', async () => {
  const restore = installFakeRelay();
  try {
    const [a, b, c] = await Promise.all([
      xipeClient.request(config, '.', 'node/resolve', { name: 'add' }),
      xipeClient.request(config, '.', 'row/list', {}),
      xipeClient.request(config, '.', 'card/get', { id: 'x' })
    ]);
    assert.deepEqual(a, { echoed: 'node/resolve', params: { name: 'add' } });
    assert.deepEqual(b, { echoed: 'row/list', params: {} });
    assert.deepEqual(c, { echoed: 'card/get', params: { id: 'x' } });
  } finally {
    restore();
  }
});

test("another consumer's error response does not fail this request", async () => {
  const restore = installFakeRelay();
  try {
    const [ok, bad] = await Promise.allSettled([
      xipeClient.request(config, '.', 'row/list', {}),
      xipeClient.request(config, '.', 'bad/method', {})
    ]);
    assert.equal(ok.status, 'fulfilled');
    assert.deepEqual(ok.value, { echoed: 'row/list', params: {} });
    assert.equal(bad.status, 'rejected');
    assert.match(bad.reason.message, /unknown method/);
  } finally {
    restore();
  }
});
