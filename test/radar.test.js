'use strict';
// lib/skin/radar.js: where a panel is, made a reference; "@" in a line
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/skin/radar.js');
const R = require('../lib/skin/recv-refs.js');

const coord = (ids, more) => Object.assign({ type: 'calc_row', table: 'xipe_rows:all', ids, cols: ['state'], scope: 'cell' }, more);
const caret = (id, c, at) => ({ id, coord: c, at });

test('sound: a type and at least one row; anything else is none', () => {
  assert.deepEqual(D.sound(coord(['a1'])), coord(['a1']));
  assert.deepEqual(D.sound({ type: 't', ids: ['a', 3, ''], scope: 'row' }), { type: 't', table: '', ids: ['a'], cols: [], scope: 'row' });
  [null, {}, { type: 't', ids: [] }, { ids: ['a'] }, 'x'].forEach((v) => assert.equal(D.sound(v), null));
});

test('pick: the panel focused last that has a coordinate; states of several windows are put together', () => {
  const older = { carets: { m1: caret('b1', coord(['old']), 10) }, focusHistory: [{ id: 'b1', at: 5 }] };
  const newer = {
    carets: { m1: caret('b1', coord(['new']), 30), m2: caret('b2', coord(['two']), 20), code: { id: 'b3', at: 40 } },
    focusHistory: [{ id: 'b2', at: 6 }, { id: 'b1', at: 7 }, { id: 'b3', at: 8 }, { id: 'frame', at: 9 }],
  };
  // b3 and the frame were focused later but have no coordinate: b1, with its newest caret
  assert.deepEqual(D.pick([older, newer]), { coord: coord(['new']), at: 30, who: { id: 'b1', name: 'm1' } });
  assert.deepEqual(D.pick([newer, older]).coord.ids, ['new']);
  // a skin asks for its own table
  assert.deepEqual(D.pick([older, newer], 'b2').coord.ids, ['two']);
  assert.deepEqual(D.pick([older, newer], 'nobody').coord.ids, ['new']);
  // nobody within memory was focused: the one that moved last
  assert.deepEqual(D.pick([{ carets: newer.carets, focusHistory: [] }]).coord.ids, ['new']);
  assert.equal(D.pick([{ carets: { code: { id: 'b3', at: 1 } }, focusHistory: [] }]), null);
  assert.equal(D.pick([]), null);
});

test('refOf / line: the reference and what the receiving side says -- ids and keys, no value', () => {
  const got = D.pick([{ carets: { 'matrix:all': caret('b1', coord(['a1', 'a2'])) }, focusHistory: [] }]);
  const ref = D.refOf(got);
  assert.deepEqual(R.sound(ref), { kind: 'coord', type: 'calc_row', table: 'xipe_rows:all', ids: ['a1', 'a2'], cols: ['state'], scope: 'cell', panel: 'b1', name: 'matrix:all' });
  assert.equal(D.line(got), 'radar ── xipe_rows:all  calc_row ×2  [state]');
  assert.equal(D.line({ coord: coord(['a1'], { scope: 'row', cols: [] }), who: { id: 'b1', name: 'm' } }), 'radar ── xipe_rows:all  calc_row');
  assert.equal(R.text(ref), 'a1 a2');
  assert.equal(R.mark(ref), '@a1 a2');
});

test('"@" alone is replaced; one inside a word is not', () => {
  assert.equal(D.hasAt('eval @'), true);
  assert.equal(D.hasAt('@'), true);
  assert.equal(D.hasAt('do row/add node=@ x'), false);
  assert.equal(D.hasAt('@attr a@b.c'), false);
  assert.equal(D.insert('eval @', 'a1 a2'), 'eval a1 a2');
  assert.equal(D.insert('@ -- skin del @', '21'), '21 -- skin del 21');
  assert.equal(D.insert('keep @attr and a@b', 'X'), 'keep @attr and a@b');
  assert.equal(D.hasAt('eval @'), true);   // (the pattern keeps no place between calls)
});

// a bus where cursor panels answer cursor.query at once
function busOf(states) {
  const posted = [];
  const on = {};
  return {
    posted,
    on: (type, fn) => { on[type] = fn; return () => { delete on[type]; }; },
    post: (type, payload) => {
      posted.push([type, payload]);
      if (type === 'cursor.query') states.forEach((s) => on['cursor.state'] && on['cursor.state'](s));
    },
  };
}
const now = (fn) => fn();

test('run: the line and the reference, said as the last one (cursor.ref); none to say', async () => {
  const bus = busOf([{ carets: { m: caret('b1', coord(['a1'])) }, focusHistory: [] }]);
  const r = await D.run(bus, { setTimeout: now });
  assert.equal(r.line, 'radar ── xipe_rows:all  calc_row  [state]');
  const said = bus.posted.filter((p) => p[0] === 'cursor.ref');
  assert.equal(said.length, 1);
  assert.deepEqual(said[0][1].ref, r.ref);
  assert.match((await D.run(busOf([{ carets: {}, focusHistory: [] }]), { setTimeout: now })).error, /no panel has said where it is/);
});

test('expand: "@" from the last reference anywhere (the newest cursor.ref); none: said, the line not sent', async () => {
  const ref = { kind: 'coord', type: 'calc_row', ids: ['a9'] };
  const states = [{ ref: { ref: { kind: 'coord', type: 'calc_row', ids: ['old'] }, at: 1 } }, { ref: { ref, at: 2 } }, { ref: null }];
  assert.deepEqual(await D.expand(busOf(states), 'eval @', R.text, { setTimeout: now }), { line: 'eval a9' });
  const quiet = busOf(states);
  assert.deepEqual(await D.expand(quiet, 'help', R.text, { setTimeout: now }), { line: 'help' });
  assert.deepEqual(quiet.posted, []);
  assert.match((await D.expand(busOf([{ ref: null }]), 'eval @', R.text, { setTimeout: now })).error, /no reference yet \(radar first\)/);
  // a panel of some frame is not a text elsewhere
  assert.match((await D.expand(busOf([{ ref: { ref: { kind: 'panel', id: 'f1' }, at: 3 } }]), 'eval @', R.text, { setTimeout: now })).error, /no reference yet/);
});
