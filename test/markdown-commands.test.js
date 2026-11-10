'use strict';
// lib/skin/markdown-commands.js: the `markdown ...` lines of the frame
const test = require('node:test');
const assert = require('node:assert/strict');
const MC = require('../lib/skin/markdown-commands.js');
const M = require('../lib/code/markdown.js');

function rig(panels) {
  const said = [];
  const sent = [];
  const added = [];
  const w = MC.wire({
    bus: { post: (type, payload, opts) => sent.push({ type, payload, to: opts && opts.to }) },
    M,
    recv: (text, cls, ref) => said.push({ text, cls, ref }),
    resolve: (arg) => ({ path: arg.replace(/^\/+/, '') }),
    add: (p) => { added.push(p); return true; },
    panels: () => panels || [],
  });
  return { w, said, sent, added };
}

test('a line that is not a markdown line is not taken', () => {
  assert.equal(rig().w.handle('diff -n a,b'), false);
});

test('markdown <path>: a panel added for it', () => {
  const r = rig();
  assert.equal(r.w.handle('markdown notes/a.md'), true);
  assert.deepEqual(r.added, ['notes/a.md']);
});

test('follow / unfollow: to the focused markdown panel, else the first', () => {
  let r = rig([{ id: 'p1', bus: 'b1', place: '12' }, { id: 'p2', bus: 'b2', place: '13', focused: true }]);
  assert.equal(r.w.handle('markdown follow'), true);
  assert.deepEqual(r.sent, [{ type: 'markdown.follow', payload: { on: true }, to: 'b2' }]);
  r = rig([{ id: 'p1', bus: 'b1', place: '12' }]);
  r.w.handle('markdown unfollow');
  assert.deepEqual(r.sent, [{ type: 'markdown.follow', payload: { on: false }, to: 'b1' }]);
});

test('refused: no markdown panel, one still loading, a bad line', () => {
  let r = rig([]);
  assert.equal(r.w.handle('markdown follow'), false);
  assert.match(r.said[0].text, /^! markdown follow ── there is no markdown panel here/);
  r = rig([{ id: 'p1', bus: null, place: '12' }]);
  assert.equal(r.w.handle('markdown follow'), false);
  assert.match(r.said[0].text, /still loading/);
  r = rig();
  assert.equal(r.w.handle('markdown'), false);
  assert.match(r.said[0].text, /markdown <path>/);
});
