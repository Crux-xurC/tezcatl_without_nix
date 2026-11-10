'use strict';
// lib/skin/check-commands.js: the `check update [all]` line of a skin's input form
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/skin/check-commands.js');

test('parse: check update, check update all; other lines are not its', () => {
  assert.equal(C.parse('skin add 1 tree'), null);
  assert.equal(C.parse('checkout'), null);
  assert.deepEqual(C.parse('check update'), { cmd: 'update', all: false });
  assert.deepEqual(C.parse('  check   update  all '), { cmd: 'update', all: true });
  assert.ok(C.parse('check').error);
  assert.ok(C.parse('check update everything').error);
  assert.ok(C.parse('check update all now').error);
});

test('line: what a code_editor answered, with what to do when the disk differs', () => {
  assert.deepEqual(C.line('21', { path: 'a.ex', state: 'same' }), { text: 'a.ex (21): the disk is what was opened', err: false });
  assert.match(C.line('21', { path: 'a.ex', state: 'changed', dirty: false }).text, /changed on the disk ── :e reads it again/);
  assert.match(C.line('21', { path: 'a.ex', state: 'changed', dirty: true }).text, /:e! reads the disk again/);
  assert.equal(C.line('21', { path: 'a.ex', state: 'changed' }).err, true);
  assert.match(C.line('21', { path: 'a.ex', state: 'gone' }).text, /gone from the disk/);
  assert.match(C.line('21', { path: null, state: 'no_path' }).text, /\(no path\) \(21\): a text with no path/);
  assert.match(C.line('21', null).text, /did not answer/);
});

function fake(codes, now, answers) {
  const said = [];
  const handlers = {};
  const posted = [];
  const bus = {
    on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return () => { handlers[type] = handlers[type].filter((f) => f !== fn); }; },
    post(type, payload, opts) {
      posted.push({ type, payload, to: opts && opts.to });
      const a = answers[opts && opts.to];
      if (type === 'code.file' && a) Promise.resolve().then(() => (handlers['code.checked'] || []).slice().forEach((f) => f(Object.assign({ req: payload.req }, a))));
    },
  };
  const h = C.wire({ bus, recv: (text, cls, ref) => said.push({ text, cls, ref }), codes: () => codes, codeNow: () => now, setTimeout: (fn) => { Promise.resolve().then(() => Promise.resolve()).then(fn); } });
  return { h, said, posted };
}

test('check update asks the code_editor meant now; its line carries the panel as reference', async () => {
  const codes = [{ id: 'f1', bus: 'b1', place: '11' }, { id: 'f2', bus: 'b2', place: '21' }];
  const f = fake(codes, 'f2', { b2: { path: 'lib/a.ex', state: 'changed', dirty: false } });
  assert.equal(await f.h.handle('check update'), true);
  assert.deepEqual(f.posted.map((p) => [p.type, p.payload.op, p.to]), [['code.file', 'check', 'b2']]);
  assert.equal(f.said.length, 1);
  assert.match(f.said[0].text, /^! check update ── lib\/a\.ex \(21\): changed on the disk/);
  assert.deepEqual(f.said[0].ref, { kind: 'panel', id: 'f2' });
});

test('check update all asks every code_editor and counts the ones that differ; one that does not answer is said', async () => {
  const codes = [{ id: 'f1', bus: 'b1', place: '11' }, { id: 'f2', bus: 'b2', place: '21' }, { id: 'f3', bus: 'b3', place: '22' }];
  const f = fake(codes, 'f1', { b1: { path: 'a.ex', state: 'same' }, b2: { path: 'b.ex', state: 'gone' } });
  assert.equal(await f.h.handle('check update all'), true);
  assert.equal(f.said.length, 4);
  assert.match(f.said[0].text, /^check update ── a\.ex \(11\): the disk is what was opened/);
  assert.match(f.said[1].text, /b\.ex \(21\): gone from the disk/);
  assert.match(f.said[2].text, /the code_editor at 22 did not answer/);
  assert.match(f.said[3].text, /3 code_editor, 1 not what the disk has/);
});

test('no code_editor: said, nothing asked; a line that is not check is left alone', async () => {
  const f = fake([], null, {});
  assert.equal(f.h.handle('skin add 1 tree'), false);
  assert.equal(await f.h.handle('check update'), false);
  assert.match(f.said[0].text, /there is no code_editor here/);
  assert.equal(f.posted.length, 0);
  // all with none is no failure (an intent's check.update-all after a checkout)
  assert.equal(await f.h.handle('check update all'), true);
  assert.match(f.said[1].text, /^check update ── no code_editor here: nothing to compare$/);
  assert.equal(f.posted.length, 0);
});
