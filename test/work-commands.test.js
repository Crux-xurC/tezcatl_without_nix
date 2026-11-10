'use strict';
// lib/skin/work-commands.js: the `work ...` and `who` lines of a skin's input form
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/skin/work-commands.js');
const W = require('../lib/core/work-log.js');

test('parse', () => {
  assert.equal(C.parse('skin add 1 tree'), null);
  assert.equal(C.parse('workspace'), null);
  assert.deepEqual(C.parse('work list'), { cmd: 'list' });
  assert.deepEqual(C.parse(' work  watch '), { cmd: 'watch' });
  assert.deepEqual(C.parse('work cancel 12'), { cmd: 'cancel', n: 12 });
  assert.deepEqual(C.parse('who'), { cmd: 'who' });
  assert.ok(C.parse('work').error);
  assert.ok(C.parse('work list all').error);
  assert.ok(C.parse('work cancel').error);
  assert.ok(C.parse('work cancel x').error);
  assert.ok(C.parse('work cancel 0').error);
  assert.ok(C.parse('who is there').error);
});

function fake(answers) {
  const said = [];
  const shown = [];
  const handlers = {};
  const bus = {
    on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return () => { handlers[type] = handlers[type].filter((f) => f !== fn); }; },
    post(type, payload) {
      const a = answers[type];
      if (a) Promise.resolve().then(() => (handlers[a.type] || []).slice().forEach((f) => f(Object.assign({ req: payload.req }, a.payload))));
    },
  };
  const h = C.wire({ bus, recv: (text, cls, ref) => said.push({ text, cls, ref }), show: (p) => { shown.push(p); return true; }, whoLine: W.whoLine,
    // short waits first, the giving-up ones after the answers
    setTimeout: (fn, ms) => setTimeout(fn, ms > 500 ? 40 : 1) });
  return { h, said, shown };
}

test('work list / work watch show the list panel', async () => {
  const f = fake({});
  assert.equal(await f.h.handle('work list'), true);
  assert.equal(await f.h.handle('work watch'), true);
  assert.deepEqual(f.shown, ['work', 'work_watch']);
});

test('work cancel says what the store answered; no store: said', async () => {
  let f = fake({ 'work.cancel': { type: 'work.cancelled', payload: { ok: true, message: 'asked code f1 to stop row 3 (m a)' } } });
  assert.equal(await f.h.handle('work cancel 3'), true);
  assert.match(f.said[0].text, /^work cancel ── asked code f1 to stop row 3/);
  f = fake({ 'work.cancel': { type: 'work.cancelled', payload: { ok: false, message: 'there is no row 3 (work list)' } } });
  assert.equal(await f.h.handle('work cancel 3'), false);
  assert.match(f.said[0].text, /^! work cancel ── there is no row 3/);
  f = fake({});
  assert.equal(await f.h.handle('work cancel 3'), false);
  assert.match(f.said[0].text, /the work store did not answer/);
});

test('who: the panels open, numbered, as one list reference', async () => {
  const rows = [
    { from: { id: 'a', role: 'code', name: 'f1' }, at: 0, place: { skin: 'workspace_1', place: '21', panel: 'code_editor' } },
    { from: { id: 'b', role: 'skin', name: 'workspace_1' }, at: 0, place: null },
  ];
  const f = fake({ 'work.who.end': { type: 'work.rows', payload: { rows, lost: 1 } } });
  assert.equal(await f.h.handle('who'), true);
  const lines = f.said[0].text.split('\n');
  assert.match(lines[0], /^who ── 2 open \(1 had gone without saying so\)$/);
  assert.match(lines[1], /^1 {2}code f1 {2}workspace_1 21 {2}since /);
  assert.match(lines[2], /^2 {2}skin workspace_1 {2}since /);
  assert.equal(f.said[0].ref.kind, 'list');
  assert.equal(f.said[0].ref.items.length, 2);
});
