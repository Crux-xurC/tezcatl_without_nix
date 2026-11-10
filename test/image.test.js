'use strict';
// lib/view/image.js and lib/skin/image-commands.js: the image panel's path and the frame's `image <path>`
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../lib/view/image.js');
const IC = require('../lib/skin/image-commands.js');

test('resolve: a picture of the pages, never outside them, never a URL', () => {
  assert.deepEqual(I.resolve('assets/tezcatlipoca.png'), { path: 'assets/tezcatlipoca.png' });
  assert.deepEqual(I.resolve('/assets/./a.JPG'), { path: 'assets/a.JPG' });
  assert.match(I.resolve('').error, /no path/);
  assert.match(I.resolve('../x.png').error, /outside the pages/);
  assert.match(I.resolve('assets/../../x.png').error, /outside the pages/);
  assert.match(I.resolve('http://example.com/a.png').error, /not a URL/);
  assert.match(I.resolve('//example.com/a.png').error, /not a URL/);
  assert.match(I.resolve('assets/notes.md').error, /not a picture/);
  assert.ok(!I.resolve(I.DEFAULT).error);
});

test('parse: only an image line', () => {
  assert.equal(I.parse('markdown a.md'), null);
  assert.equal(I.parse('imagery a.png'), null);
  assert.deepEqual(I.parse('image assets/a.png'), { path: 'assets/a.png' });
  assert.match(I.parse('image').error, /no path/);
});

function rig(panels) {
  const said = [];
  const sent = [];
  const added = [];
  const w = IC.wire({
    bus: { post: (type, payload, opts) => sent.push({ type, payload, to: opts && opts.to }) },
    I,
    recv: (text, cls, ref) => said.push({ text, cls, ref }),
    add: (p) => { added.push(p); return true; },
    panels: () => panels || [],
  });
  return { w, said, sent, added };
}

test('image <path>: to the focused image panel, else the first; none: one added', () => {
  assert.equal(rig().w.handle('diff -n a,b'), false);
  let r = rig();
  assert.equal(r.w.handle('image assets/a.png'), true);
  assert.deepEqual(r.added, ['assets/a.png']);
  r = rig([{ id: 'p1', bus: 'b1', place: '11' }, { id: 'p2', bus: 'b2', place: '12', focused: true }]);
  r.w.handle('image assets/a.png');
  assert.deepEqual(r.sent, [{ type: 'image.show', payload: { path: 'assets/a.png' }, to: 'b2' }]);
  assert.deepEqual(r.said[0].ref, { kind: 'panel', id: 'p2' });
  r = rig([{ id: 'p1', bus: null, place: '11' }]);
  assert.equal(r.w.handle('image assets/a.png'), false);
  assert.match(r.said[0].text, /still loading/);
  r = rig();
  assert.equal(r.w.handle('image ../x.png'), false);
  assert.match(r.said[0].text, /^! image ── outside the pages/);
  assert.deepEqual(r.added, []);
});
