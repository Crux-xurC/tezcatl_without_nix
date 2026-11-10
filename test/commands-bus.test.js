'use strict';
// lib/core/commands.js over the bus: req / command.taken / command_map.json's
// fallback, and listenBus running only what this window implements. The
// module reads Tezcatl.bus / Tezcatl.config / open from its root, so the root
// here is globalThis (this file runs in its own process under node --test).
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.self = globalThis;
const commands = require('../lib/core/commands.js');
const T = globalThis.Tezcatl;

function fakeBus() {
  const listeners = {};
  const sent = [];
  return {
    sent,
    post(type, payload) { sent.push({ type, payload }); },
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => { listeners[type] = listeners[type].filter((f) => f !== fn); }; },
    deliver(type, payload, meta) { (listeners[type] || []).forEach((fn) => fn(payload, meta)); },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let opened = [];
globalThis.open = (url, target) => { opened.push({ url, target }); };
T.config = { sibling: (rel) => 'http://x/' + rel, load: async () => ({}) };

async function loadMap(map) {
  globalThis.fetch = async () => ({ ok: true, json: async () => map });
  await commands.load();
}

test('fallbackUrl: {arg} replaced, URL-encoded, missing -> empty, from the tezcatl root', () => {
  const fb = { open: 'panels/resident/matrix.html?path={path}&x={x}' };
  assert.equal(commands._fallbackUrl(fb, { path: 'xipe:module=Calc&name=add' }),
    'http://x/panels/resident/matrix.html?path=xipe%3Amodule%3DCalc%26name%3Dadd&x=');
});

test('a command nobody takes runs its fallback; one taken does not', async () => {
  await loadMap({ commands: [
    { name: 't.get', args: ['path'], fallback: { open: 'panels/resident/matrix.html?path={path}' } },
    { name: 't.plain' },
  ] });
  const bus = fakeBus();
  T.bus = bus;
  opened = [];

  commands.invoke('t.get', { path: 'a:b' });
  const sent = bus.sent.at(-1);
  assert.equal(sent.type, 'command');
  assert.equal(sent.payload.name, 't.get');
  assert.ok(sent.payload.req);
  await wait(commands._TAKEN_MS + 100);
  assert.deepEqual(opened, [{ url: 'http://x/panels/resident/matrix.html?path=a%3Ab', target: '_blank' }]);

  opened = [];
  commands.invoke('t.get', { path: 'c' });
  bus.deliver('command.taken', { req: bus.sent.at(-1).payload.req });
  await wait(commands._TAKEN_MS + 100);
  assert.deepEqual(opened, [], 'taken -> no fallback');

  commands.invoke('t.plain');
  await wait(commands._TAKEN_MS + 100);
  assert.deepEqual(opened, [], 'no fallback declared -> nothing opens');
});

test('listenBus: runs only what this window implements, answers taken unless declined', () => {
  const bus = fakeBus();
  T.bus = bus;
  const off = commands.listenBus();
  let ran = [];
  commands.register('t.mine', (args, ctx) => { ran.push(ctx); return true; });
  commands.register('t.decline', () => false);

  bus.deliver('command', { name: 't.mine', args: {}, req: 'r1' });
  assert.deepEqual(ran, [{ remote: true, from: null }]);
  // who invoked it rides along (a panel takes what comes from its own skin)
  bus.deliver('command', { name: 't.mine', args: {}, req: 'r0' }, { from: { id: 'b-skin', name: 'frame-skin' } });
  assert.deepEqual(ran[1], { remote: true, from: { id: 'b-skin', name: 'frame-skin' } });
  bus.sent.length = 0;
  bus.deliver('command', { name: 't.mine', args: {}, req: 'r1' });
  assert.deepEqual(bus.sent, [{ type: 'command.taken', payload: { req: 'r1', name: 't.mine' } }]);

  bus.sent.length = 0;
  bus.deliver('command', { name: 't.decline', args: {}, req: 'r2' });
  assert.deepEqual(bus.sent, [], 'declined -> no taken');

  bus.deliver('command', { name: 't.someone-elses', args: {}, req: 'r3' });
  assert.deepEqual(bus.sent, [], 'not implemented here -> not posted to the bus again');
  off();
});

test('load(): a command register()ed before the map is read is not a duplicate; one twice in the file is', async () => {
  commands.register('t.early', () => true);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ commands: [{ name: 't.early', desc: 'from the file' }, { name: 't.twice' }, { name: 't.twice' }] }) });
  const r = await commands.load();
  assert.deepEqual(r.problems, ['duplicate command "t.twice"']);
  assert.equal(commands.list().find((c) => c.name === 't.early').desc, 'from the file');
});

test('ctx.onNone: told when no window takes a command (no fallback); not when one does', async () => {
  const bus = fakeBus();
  T.bus = bus;
  await loadMap({ commands: [{ name: 'lsp.back' }] });
  let none = 0;
  commands.invoke('lsp.back', {}, { onNone: () => { none += 1; } });
  await wait(commands._TAKEN_MS + 100);
  assert.equal(none, 1);
  commands.invoke('lsp.back', {}, { onNone: () => { none += 1; } });
  const req = bus.sent[bus.sent.length - 1].payload.req;
  bus.deliver('command.taken', { req, name: 'lsp.back' });
  await wait(commands._TAKEN_MS + 100);
  assert.equal(none, 1);
});
