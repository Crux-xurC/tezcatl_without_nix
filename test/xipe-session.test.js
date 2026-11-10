'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const xipeSession = require('../lib/xipe/xipe-session.js');

// A fake /xipe relay + Xipe Totec server behind it. Like XipeConn, every
// response is broadcast to every attached socket. `input` echoes its text in
// dialogue.text; `bad` answers with an error.
function fakeRelay() {
  const sockets = new Set();
  function broadcast(o) { const d = JSON.stringify(o); for (const s of sockets) setImmediate(() => s.onmessage && s.onmessage({ data: d })); }
  class FakeWS {
    constructor(url) { this.url = url; sockets.add(this); setImmediate(() => this.onopen && this.onopen()); }
    send(text) {
      const o = JSON.parse(text);
      if (o.kind === 'attach') { setImmediate(() => this.onmessage({ data: JSON.stringify({ kind: 'attached', name: o.root }) })); return; }
      if (o.method === 'initialize') broadcast({ jsonrpc: '2.0', id: o.id, result: { capabilities: {}, project: { id: '001', root: '/p' } } });
      else if (o.method === 'bad') broadcast({ jsonrpc: '2.0', id: o.id, error: { code: 'x', message: 'nope' } });
      else broadcast({ jsonrpc: '2.0', id: o.id, result: {}, from: null, dialogue: { hold: false, via_repl: false, text: 'got ' + o.params.text } });
    }
    close() { sockets.delete(this); setImmediate(() => this.onclose && this.onclose()); }
  }
  return { FakeWS, broadcast, sockets };
}

function collect() {
  const ev = { state: [], reply: [], notify: [], info: [] };
  const on = {};
  Object.keys(ev).forEach((k) => { on[k] = (x) => ev[k].push(x); });
  return { ev, on };
}

const until = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 5)); }
  return false;
};

test('attach -> initialize -> ready; input queued before ready is sent after', async () => {
  const relay = fakeRelay();
  const { ev, on } = collect();
  const s = xipeSession.create({ url: 'ws://x/xipe', root: '.', on, WebSocket: relay.FakeWS, reconnectMs: 0 });
  s.input('help');                                   // before ready
  assert.ok(await until(() => ev.reply.length === 1));
  assert.deepEqual(ev.state, ['connecting', 'open']);
  assert.deepEqual(ev.info[0], { kind: 'initialized', project: { id: '001', root: '/p' } });
  assert.equal(ev.reply[0].method, 'input');
  assert.equal(ev.reply[0].dialogue.text, 'got help');
  s.close();
});

test("two sessions on one relay never take each other's replies (errors included)", async () => {
  const relay = fakeRelay();
  const a = collect();
  const b = collect();
  const sa = xipeSession.create({ url: 'ws://x/xipe', on: a.on, WebSocket: relay.FakeWS, reconnectMs: 0 });
  const sb = xipeSession.create({ url: 'ws://x/xipe', on: b.on, WebSocket: relay.FakeWS, reconnectMs: 0 });
  assert.ok(await until(() => sa.isReady() && sb.isReady()));
  sa.input('from a');
  sb.send('bad', {});
  assert.ok(await until(() => a.ev.reply.length === 1 && b.ev.reply.length === 1));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(a.ev.reply.length, 1);
  assert.equal(a.ev.reply[0].dialogue.text, 'got from a');
  assert.equal(a.ev.reply[0].error, null);
  assert.equal(b.ev.reply.length, 1);
  assert.deepEqual(b.ev.reply[0].error, { code: 'x', message: 'nope' });
  sa.close(); sb.close();
});

test('notify/* reaches every session; relay error/exit envelopes surface as info', async () => {
  const relay = fakeRelay();
  const { ev, on } = collect();
  const s = xipeSession.create({ url: 'ws://x/xipe', on, WebSocket: relay.FakeWS, reconnectMs: 0 });
  assert.ok(await until(() => s.isReady()));
  relay.broadcast({ jsonrpc: '2.0', method: 'notify/rowChanged', params: { id: 'r1', columns: ['result'] } });
  relay.broadcast({ kind: 'exit', reason: 'gone' });
  assert.ok(await until(() => ev.notify.length === 1 && ev.info.length === 2));
  assert.deepEqual(ev.notify[0], { method: 'notify/rowChanged', params: { id: 'r1', columns: ['result'] } });
  assert.deepEqual(ev.info[1], { kind: 'exit', reason: 'gone' });
  s.close();
});

test('reconnects after the socket drops (unless closed by the user)', async () => {
  const relay = fakeRelay();
  const { ev, on } = collect();
  const s = xipeSession.create({ url: 'ws://x/xipe', on, WebSocket: relay.FakeWS, reconnectMs: 10 });
  assert.ok(await until(() => s.isReady()));
  [...relay.sockets][0].close();                     // server side drop
  assert.ok(await until(() => ev.state.filter((x) => x === 'open').length === 2));
  s.close();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(ev.state[ev.state.length - 1], 'closed');
  assert.equal(relay.sockets.size, 0);
});

test('attached again on an open socket (upstream restarted): re-initialize, hold sends until then', async () => {
  const relay = fakeRelay();
  const { ev, on } = collect();
  const s = xipeSession.create({ url: 'ws://x/xipe', on, WebSocket: relay.FakeWS, reconnectMs: 0 });
  assert.ok(await until(() => s.isReady()));
  const ws = [...relay.sockets][0];
  const sent = [];
  const realSend = ws.send.bind(ws);
  let holdInit = true;                               // the new upstream's initialize answers late
  ws.send = (text) => {
    const o = JSON.parse(text);
    sent.push(o);
    if (o.method === 'initialize' && holdInit) return;
    if (o.method === 'input' && o.params.text === 'lost') return;   // went with the old upstream
    realSend(text);
  };

  const lostId = s.input('lost');
  ws.onmessage({ data: JSON.stringify({ kind: 'attached', name: '.' }) });
  assert.equal(s.isReady(), false);
  s.input('after');                                  // queued, not sent before initialize
  assert.deepEqual(sent.map((o) => o.method), ['input', 'initialize']);

  holdInit = false;
  realSend(JSON.stringify(sent[1]));                 // the new upstream answers initialize
  assert.ok(await until(() => ev.reply.length === 1));
  assert.equal(ev.reply[0].dialogue.text, 'got after');
  assert.deepEqual(ev.state, ['connecting', 'open', 'connecting', 'open']);
  assert.deepEqual(ev.info.map((i) => i.kind), ['initialized', 'reattached', 'initialized']);
  assert.match(ev.info[1].reason, /1 request\(s\)/);
  // which ones: whoever waits for an answer is told it will not come
  assert.deepEqual(ev.info[1].ids, [lostId]);
  s.close();
});

test('relayXipeUrl:connections[0].url with /xipe as the path', () => {
  assert.equal(xipeSession.relayXipeUrl({ connections: [{ url: 'ws://127.0.0.1:4100/?a=1' }] }), 'ws://127.0.0.1:4100/xipe');
  assert.throws(() => xipeSession.relayXipeUrl({}), /connections\[0\]\.url/);
});
