'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pf = require('../lib/core/panel-frame.js');

test('_chord: bare key', () => {
  assert.deepEqual(pf._chord('Escape'), { key: 'escape', mods: [] });
  assert.deepEqual(pf._chord(';'), { key: ';', mods: [] });
});

test('_chord: modifiers, order-normalized', () => {
  assert.deepEqual(pf._chord('C-x'), { key: 'x', mods: ['control'] });
  assert.deepEqual(pf._chord('M-C-x'), {
    key: 'x',
    mods: ['control', 'meta'],
  });
  assert.deepEqual(pf._chord('C-M-S-s-x').mods, [
    'control',
    'meta',
    'shift',
    'super',
  ]);
});

test('_chord: Emacs-ish aliases', () => {
  assert.equal(pf._chord('return').key, 'enter');
  assert.equal(pf._chord('esc').key, 'escape');
  assert.equal(pf._chord('spc').key, ' ');
});

test('_evChord: reads the *Key flags off a KeyboardEvent-shaped object', () => {
  assert.deepEqual(pf._evChord({ key: 'Escape' }), {
    key: 'escape',
    mods: [],
  });
  assert.deepEqual(
    pf._evChord({ key: 'x', ctrlKey: true, altKey: true }),
    { key: 'x', mods: ['control', 'meta'] },
  );
  assert.deepEqual(pf._evChord({ key: 'F', shiftKey: true, metaKey: true }), {
    key: 'f',
    mods: ['shift', 'super'],
  });
});

test('_sameChord', () => {
  assert.ok(pf._sameChord(pf._chord('C-x'), { key: 'x', mods: ['control'] }));
  assert.ok(!pf._sameChord(pf._chord('C-x'), { key: 'x', mods: [] }));
  assert.ok(!pf._sameChord(pf._chord('C-x'), { key: 'y', mods: ['control'] }));
});

test('_matchTail: single-chord sequence', () => {
  const seq = [pf._chord('C-;')];
  assert.ok(
    pf._matchTail([{ key: ';', mods: ['control'], at: 100 }], seq, 400),
  );
  assert.ok(!pf._matchTail([{ key: ';', mods: [], at: 100 }], seq, 400));
  assert.ok(!pf._matchTail([], seq, 400));
});

test('_matchTail: double-tap within the window', () => {
  const seq = [pf._chord('Escape'), pf._chord('Escape')];
  const hist = [
    { key: 'escape', mods: [], at: 1000 },
    { key: 'escape', mods: [], at: 1300 },
  ];
  assert.ok(pf._matchTail(hist, seq, 400));
});

test('_matchTail: double-tap too slow -> no match', () => {
  const seq = [pf._chord('Escape'), pf._chord('Escape')];
  const hist = [
    { key: 'escape', mods: [], at: 1000 },
    { key: 'escape', mods: [], at: 1500 },
  ];
  assert.ok(!pf._matchTail(hist, seq, 400));
});

test('_matchTail: only the tail has to match (earlier keys ignored)', () => {
  const seq = [pf._chord('Escape'), pf._chord('Escape')];
  const hist = [
    { key: 'a', mods: [], at: 900 },
    { key: 'escape', mods: [], at: 1000 },
    { key: 'escape', mods: [], at: 1100 },
  ];
  assert.ok(pf._matchTail(hist, seq, 400));
});

test('_matchTail: heterogeneous sequence (A then B)', () => {
  const seq = [pf._chord('C-x'), pf._chord('o')];
  const ok = [
    { key: 'x', mods: ['control'], at: 10 },
    { key: 'o', mods: [], at: 60 },
  ];
  const wrongOrder = [
    { key: 'o', mods: [], at: 10 },
    { key: 'x', mods: ['control'], at: 60 },
  ];
  assert.ok(pf._matchTail(ok, seq, 400));
  assert.ok(!pf._matchTail(wrongOrder, seq, 400));
});

test('default leave sequence is double Escape', () => {
  assert.deepEqual(pf._leaveSequence(), [
    { key: 'escape', mods: [] },
    { key: 'escape', mods: [] },
  ]);
});

test('default killring sequence is Escape then y', () => {
  assert.deepEqual(pf._seqChords('killring'), [
    { key: 'escape', mods: [] },
    { key: 'y', mods: [] },
  ]);
});

test('_applyConfig overrides leave and killring chord lists', () => {
  pf._applyConfig({ ui: { keys: { leave: ['C-g'], killring: ['M-y'] } } });
  assert.deepEqual(pf._leaveSequence(), [{ key: 'g', mods: ['control'] }]);
  assert.deepEqual(pf._seqChords('killring'), [{ key: 'y', mods: ['meta'] }]);
  pf._applyConfig({ ui: { keys: { leave: ['Escape', 'Escape'], killring: ['Escape', 'y'] } } });
});

// -- the skin port: the one place a panel looks at its skin --
function fakeWin(self, extra) {
  const w = Object.assign({ Tezcatl: self ? { bus: { self } } : undefined, frames: [] }, extra || {});
  w.parent = w;
  return w;
}

test('skinPort: alone in a window -- not in a skin, no siblings', () => {
  const P = pf.skinPort;
  const w = fakeWin({ id: 'p1', role: 'code', name: 'a' });
  assert.equal(P.inSkin(w), false);
  assert.equal(P.id(w), null);
  assert.equal(P.siblings(w), null);
  assert.equal(P.hasRole(w, 'code'), false);
  assert.equal(P.of(w), null);
});

test('skinPort: a panel of a skin -- the skin\'s bus id, the siblings from its iframes', () => {
  const P = pf.skinPort;
  const skin = fakeWin({ id: 's1', role: 'skin', name: 'workspace_1' });
  const a = fakeWin({ id: 'p1', role: 'code', name: 'a' });
  const b = fakeWin({ id: 'p2', role: 'lsp_log', name: 'b' });
  const blank = fakeWin(null);   // an iframe that is not a panel
  [a, b, blank].forEach((w) => { w.parent = skin; });
  skin.frames = [a, b, blank];
  assert.equal(P.inSkin(a), true);
  assert.equal(P.id(a), 's1');
  assert.deepEqual(P.siblings(a), [{ id: 'p1', role: 'code', name: 'a' }, { id: 'p2', role: 'lsp_log', name: 'b' }]);
  assert.equal(P.hasRole(a, 'lsp_log'), true);
  assert.equal(P.hasRole(a, 'tree'), false);
  assert.equal(P.of(a), null);
});

test('skinPort: what a skin registered is what its panels (and the windows it opened) get', () => {
  const P = pf.skinPort;
  const skin = fakeWin({ id: 's1', role: 'skin', name: 'w' });
  const a = fakeWin({ id: 'p1', role: 'code', name: 'a' });
  a.parent = skin;
  skin.frames = [a];
  const port = P.register(skin, { openNew: () => 'opened', panels: () => [{ id: 'p1', role: 'code', name: 'a', place: '11' }] });
  assert.equal(P.of(a), port);
  assert.equal(P.of(skin), port);
  assert.equal(P.of(a).openNew(), 'opened');
  // the skin's own list is what siblings gives
  assert.deepEqual(P.siblings(a), [{ id: 'p1', role: 'code', name: 'a', place: '11' }]);
  // a window the panel opened (a list): its opener's skin
  const list = fakeWin({ id: 'l1', role: 'list', name: null }, { opener: a });
  assert.equal(P.ofOpener(list), port);
  assert.equal(P.ofOpener(fakeWin({ id: 'x' }, { opener: { closed: true, tezcatlSkin: port } })), null);
  // registering again adds to it
  P.register(skin, { more: 1 });
  assert.equal(P.of(a).more, 1);
  assert.equal(typeof P.of(a).openNew, 'function');
});
