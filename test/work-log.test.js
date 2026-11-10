'use strict';
// lib/core/work-log.js: the record of what is running and who is open, matched
// from the bus against the pairs of work.json
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../lib/core/work-log.js');

const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'work.json'), 'utf8'));
const { pairs, problems } = W.readPairs(doc);
const from = (id, role, name) => ({ from: { id, role, name }, ts: 1000 });

test('work.json: every pair is usable', () => {
  assert.deepEqual(problems, []);
  assert.ok(pairs.some((p) => p.name === 'panel'));
});

test('readPairs: a pair without name, start or end, or named twice, is left out and said', () => {
  const r = W.readPairs({ pairs: [{ name: 'a', start: 'x', end: ['y'] }, { name: 'b', start: 'x' }, { name: 'a', start: 'x', end: ['z'] }, null] });
  assert.deepEqual(r.pairs.map((p) => p.name), ['a']);
  assert.equal(r.problems.length, 3);
});

test('a start opens a row, the end with the same key closes it; who fired it is the sender of the start', () => {
  const log = W.create(pairs);
  assert.equal(log.hear('code.file', { op: 'write', req: 'r1' }, from('skin1', 'skin', 'workspace_1')), true);
  let rows = log.list(1500);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].n, rows[0].pair, rows[0].status, rows[0].text, rows[0].from.name, rows[0].ms], [1, 'save', 'running', 'save', 'workspace_1', 500]);
  // another save's answer is not this one's
  assert.equal(log.hear('code.saved', { req: 'other', path: 'a' }, { from: { id: 'c1' }, ts: 1200 }), false);
  assert.equal(log.hear('code.saved', { req: 'r1', path: 'a' }, { from: { id: 'c1' }, ts: 1300 }), true);
  rows = log.list(9000);
  assert.deepEqual([rows[0].status, rows[0].ms], ['done', 300]);
  // ended: a second end changes nothing
  assert.equal(log.hear('code.saved', { req: 'r1' }, { from: { id: 'c1' }, ts: 1400 }), false);
});

test('where picks the start; a fail type or failWhere ends it as failed; a start without its key is no row', () => {
  const log = W.create(pairs);
  assert.equal(log.hear('code.file', { op: 'edit', req: 'e1' }, from('s')), false);
  assert.equal(log.hear('code.file', { op: 'write' }, from('s')), false);
  log.hear('code.file', { op: 'write', req: 'w1' }, from('s'));
  log.hear('code.saveFailed', { req: 'w1', code: 'changed' }, from('c'));
  log.hear('lsp.request', { req: 'l1', method: 'textDocument/definition', path: 'lib/a.ex' }, from('c', 'code', 'f1'));
  log.hear('lsp.response', { req: 'l1', ok: false, message: 'no answer' }, from('c'));
  log.hear('matrix.load', { kind: 'xipe_rows', ref: 'Calc' }, from('m'));
  log.hear('matrix.loaded', { kind: 'xipe_rows', ref: 'Calc', ok: true }, from('t'));
  const rows = log.list(2000);
  assert.deepEqual(rows.map((r) => [r.pair, r.status, r.text]), [
    ['save', 'failed', 'save'],
    ['lsp', 'failed', 'textDocument/definition lib/a.ex'],
    ['table', 'done', 'table xipe_rows:Calc'],
  ]);
});

test('slow is worked out when the rows are read; only: running leaves the ended out', () => {
  const log = W.create(pairs);
  log.hear('lsp.request', { req: 'l1', method: 'textDocument/hover', path: 'a' }, from('c'));
  log.hear('lsp.request', { req: 'l2', method: 'textDocument/hover', path: 'a' }, from('c'));
  log.hear('lsp.response', { req: 'l2', ok: true }, from('c'));
  assert.equal(log.list(1000 + 2999)[0].slow, false);
  assert.equal(log.list(1000 + 3000)[0].slow, true);
  assert.equal(log.list(1000 + 3000)[1].slow, false);
  assert.deepEqual(log.list(5000, { only: 'running' }).map((r) => r.key), ['l1']);
});

test('cancelOf: the pair\'s cancel to who fired the row; not for a row ended, without one, or unknown', () => {
  const log = W.create(pairs);
  log.hear('lsp.request', { req: 'l1', method: 'textDocument/rename', path: 'a' }, from('code1', 'code', 'f1'));
  log.hear('code.file', { op: 'write', req: 'w1' }, from('skin1'));
  assert.deepEqual((({ to, type, payload }) => ({ to, type, payload }))(log.cancelOf(1)), { to: 'code1', type: 'lsp.cancel', payload: { req: 'l1' } });
  assert.equal(log.list(1100)[0].cancel, true);
  assert.match(log.cancelOf(2).error, /cannot be stopped from here/);
  assert.match(log.cancelOf(9).error, /there is no row 9/);
  log.hear('lsp.response', { req: 'l1', ok: true }, from('code1'));
  assert.match(log.cancelOf(1).error, /has ended already: done/);
});

test('the roster: panel.open / panel.close by the sender; the panels are not among the work rows', () => {
  const log = W.create(pairs);
  log.hear('panel.open', {}, from('a', 'code', 'f1'));
  log.hear('panel.open', {}, from('b', 'tree', null));
  // said twice (a page that init()s again): one row
  assert.equal(log.hear('panel.open', {}, from('a', 'code', 'f1')), false);
  assert.deepEqual(log.list(2000), []);
  assert.deepEqual(log.list(2000, { only: 'panels' }).map((r) => r.text), ['code f1', 'tree']);
  log.hear('panel.close', {}, from('a'));
  assert.deepEqual(log.list(2000, { only: 'panels' }).map((r) => r.key), ['b']);
});

test('a roll call: one that does not answer is lost, one never heard of is added, places are kept', () => {
  const log = W.create(pairs);
  log.hear('panel.open', {}, from('a', 'code', 'f1'));
  log.hear('panel.open', {}, from('b', 'tree', null));
  log.hear('panel.open', {}, from('s', 'skin', null));
  log.roll();
  log.here({ id: 'a', role: 'code', name: 'f1' });
  log.here({ id: 'c', role: 'list', name: 'work' });         // opened before this store listened
  log.here({ id: 's', role: 'skin', name: 'workspace_2' });   // named itself after it opened
  log.placeOf('a', { skin: 'workspace_2', place: '21', panel: 'code_editor' });
  assert.equal(log.rollDone(5000), 1);
  const open = log.list(6000, { only: 'panels' });
  assert.deepEqual(open.map((r) => r.key), ['a', 's', 'c']);
  assert.equal(open[1].text, 'skin workspace_2');
  assert.match(W.whoLine(open[0], 0), /^1 {2}code f1 {2}workspace_2 21 {2}since \d\d:\d\d:\d\d$/);
  assert.match(W.whoLine(open[2], 2), /^3 {2}list work {2}since /);
});

test('orphan: a row still waited for whose sender is not among the panels open', () => {
  const log = W.create(pairs);
  log.hear('panel.open', {}, from('code1', 'code', 'f1'));
  log.hear('lsp.request', { req: 'l1', method: 'm', path: 'a' }, from('code1', 'code', 'f1'));
  assert.equal(log.list(1100)[0].orphan, false);
  log.hear('panel.close', {}, from('code1'));
  const r = log.list(1100)[0];
  assert.equal(r.orphan, true);
  assert.match(W.show(r).sub, /its panel is gone/);
  assert.match(W.show(r).label, /^2 {2}running {2}m a$/);
});

test('the record is bounded: the oldest ended row goes first, running ones stay', () => {
  const log = W.create(pairs);
  log.hear('lsp.request', { req: 'keep', method: 'm', path: 'a' }, from('c'));
  for (let i = 0; i < W.MAX_ROWS + 20; i++) {
    log.hear('lsp.request', { req: 'r' + i, method: 'm', path: 'a' }, from('c'));
    log.hear('lsp.response', { req: 'r' + i, ok: true }, from('c'));
  }
  assert.equal(log.size(), W.MAX_ROWS);
  assert.equal(log.list(2000, { only: 'running' })[0].key, 'keep');
});

test('expireMs: a row with no end that is sure to come ends by time, as expired; a pair without it keeps running', () => {
  const log = W.create([
    { name: 'command', start: 'command', end: ['command.taken'], key: 'req', expireMs: 2000 },
    { name: 'xipe', start: 'xipe.sent', end: ['xipe.answered'], key: 'req' },
  ]);
  log.hear('command', { req: 'c1', name: 'lsp.back' }, from('a', 'code_editor', 'a'));
  log.hear('xipe.sent', { req: 'x1' }, from('b', 'xipe', 'b'));
  assert.deepEqual(log.list(2999).map((r) => r.status), ['running', 'running']);
  const rows = log.list(3000);
  assert.deepEqual(rows.map((r) => r.status), ['expired', 'running']);
  // ended when its time ran out, not when it was looked at
  assert.equal(rows[0].endAt, 3000);
  assert.equal(rows[0].ms, 2000);
  assert.deepEqual(log.list(60000, { only: 'running' }).map((r) => r.pair), ['xipe']);
  // an end that comes after all changes nothing, and it cannot be stopped any more
  assert.equal(log.hear('command.taken', { req: 'c1' }, { from: { id: 'z' }, ts: 60001 }), false);
  assert.match(log.cancelOf(1, 60002).error, /ended already: expired/);
});

test('expireMs: the next message heard ends what ran out (the record says it changed)', () => {
  const log = W.create([{ name: 'open', start: 'code.open', end: ['code.opened'], key: 'path', expireMs: 10000 }]);
  log.hear('code.open', { path: 'a.js' }, from('t', 'tree', 't'));
  assert.equal(log.hear('cursor', {}, { from: { id: 'q' }, ts: 5000 }), false);
  assert.equal(log.hear('cursor', {}, { from: { id: 'q' }, ts: 11000 }), true);
  // the same file opened again is a row of its own
  log.hear('code.open', { path: 'a.js' }, { from: { id: 't' }, ts: 12000 });
  log.hear('code.opened', { path: 'a.js' }, { from: { id: 'c' }, ts: 12100 });
  assert.deepEqual(log.list(12200).map((r) => r.status), ['expired', 'done']);
});
