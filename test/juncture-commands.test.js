'use strict';
// lib/skin/juncture-commands.js: the `juncture ...` lines of the frame (D-juncture)
const test = require('node:test');
const assert = require('node:assert/strict');
const JC = require('../lib/skin/juncture-commands.js');
const J = require('../lib/code/juncture.js');

// a bus whose code_editor answer code.juncture with `answer(payload, to)` (null: no answer)
function fakeBus(answer) {
  const subs = {};
  const sent = [];
  return {
    sent,
    on(type, fn) { (subs[type] = subs[type] || []).push(fn); return () => { subs[type] = subs[type].filter((f) => f !== fn); }; },
    post(type, payload, opts) {
      sent.push({ type, payload, to: opts && opts.to });
      if (type !== 'code.juncture') return;
      const a = answer(payload, opts && opts.to);
      if (a) Promise.resolve().then(() => (subs['code.juncture.done'] || []).slice().forEach((f) => f(Object.assign({ req: payload.req }, a))));
    },
  };
}

function rig(opts) {
  const o = opts || {};
  const said = [];
  const codes = o.codes || [{ id: 'c1', bus: 'b1', place: '11', path: 'lib/a.ex' }, { id: 'c2', bus: 'b2', place: '21', path: 'lib/b.ex' }];
  const bus = fakeBus(o.answer || ((p) => ({ ok: true, op: p.op, message: 'lib/a.ex: j1', notes: [] })));
  const w = JC.wire({
    bus, J,
    recv: (text, cls, ref) => said.push({ text, cls, ref }),
    codes: () => codes,
    codeNow: () => ('now' in o ? o.now : 'c1'),
    resolve: (arg) => ({ path: arg.replace(/^\/+/, '') }),
    open: o.open || (() => Promise.resolve({ ok: false, message: 'no' })),
    showTree: (p) => { (o.shown || []).push(p); return true; },
    setTimeout: o.setTimeout || ((fn) => setTimeout(fn, 0)),
  });
  return { w, said, bus, codes };
}

test('a line that is not a juncture line is not taken', () => {
  const { w } = rig();
  assert.equal(w.handle('check update'), false);
});

test('no path: the code_editor meant now is asked; its answer and the notes are said, with it as the reference', async () => {
  const { w, said, bus } = rig({ answer: () => ({ ok: true, message: 'lib/a.ex: j3', notes: ['juncture: dropped j1 of a.ex (20 points)'] }) });
  assert.equal(await w.handle('juncture point'), true);
  const ask = bus.sent.find((m) => m.type === 'code.juncture');
  assert.equal(ask.to, 'b1');
  assert.equal(ask.payload.op, 'point');
  assert.deepEqual(said.map((s) => s.text), ['juncture point ── lib/a.ex: j3', 'juncture: dropped j1 of a.ex (20 points)']);
  assert.deepEqual(said[0].ref, { kind: 'panel', id: 'c1' });
});

test('a path: the code_editor that has it; else one added for it', async () => {
  const r1 = rig();
  await r1.w.handle('juncture back lib/b.ex');
  assert.equal(r1.bus.sent.find((m) => m.type === 'code.juncture').to, 'b2');

  const codes = [{ id: 'c1', bus: 'b1', place: '11', path: 'lib/a.ex' }];
  let opened = null;
  const r2 = rig({
    codes,
    open: (p) => { opened = p; codes.push({ id: 'c9', bus: 'b9', place: '12', path: p }); return Promise.resolve({ ok: true, id: 'c9' }); },
  });
  assert.equal(await r2.w.handle('juncture set lib/new.ex'), true);
  assert.equal(opened, 'lib/new.ex');
  assert.equal(r2.bus.sent.find((m) => m.type === 'code.juncture').to, 'b9');
});

test('refused: no code_editor, a code_editor with no file, a bad line, a refusal of the code_editor, no answer', async () => {
  let r = rig({ now: null });
  assert.equal(await r.w.handle('juncture point'), false);
  assert.match(r.said[0].text, /^! juncture point ── there is no code_editor here/);

  r = rig({ codes: [{ id: 'c1', bus: 'b1', place: '11', path: null }] });
  assert.equal(await r.w.handle('juncture point'), false);
  assert.match(r.said[0].text, /has no file/);

  r = rig();
  assert.equal(await r.w.handle('juncture undo'), false);
  assert.match(r.said[0].text, /^! juncture set\|point/);

  r = rig({ answer: () => ({ ok: false, message: 'lib/a.ex: at the start, j0' }) });
  assert.equal(await r.w.handle('juncture back'), false);
  assert.deepEqual([r.said[0].text, r.said[0].cls], ['! juncture back ── lib/a.ex: at the start, j0', 'err']);

  r = rig({ answer: () => null });
  assert.equal(await r.w.handle('juncture forward'), false);
  assert.match(r.said[0].text, /did not answer/);
});

test('tree: the skin shows the panel -- of the code_editor meant now, or of a path (no code_editor needed)', async () => {
  const shown = [];
  const r = rig({ shown });
  assert.equal(await r.w.handle('juncture tree'), true);
  assert.equal(await r.w.handle('juncture tree lib/none.ex'), true);
  assert.deepEqual(shown, ['lib/a.ex', 'lib/none.ex']);
  assert.equal(r.bus.sent.filter((m) => m.type === 'code.juncture').length, 0);
});
