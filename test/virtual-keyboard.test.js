'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vk = require('../lib/core/virtual-keyboard.js');
const lead = require('../lib/core/lead.js');

const ids = () => vk.render().flat().filter((s) => s.id).map((s) => s.id);
const colOf = (id) => {
  for (const segs of vk.render()) {
    let col = 0;
    for (const s of segs) {
      if (s.id === id) return col;
      col += s.text.length;
    }
  }
  return -1;
};

test('87 keys, each id once', () => {
  const all = ids();
  assert.equal(all.length, 87);
  assert.equal(new Set(all).size, 87);
});

test('columns line up across rows', () => {
  assert.equal(colOf('`'), 0);
  assert.equal(colOf('tab'), 0);
  assert.equal(colOf('ins'), colOf('del'));
  assert.equal(colOf('prtsc'), colOf('ins'));
  assert.equal(colOf('up'), colOf('down'));
  assert.equal(colOf('home'), colOf('down'));
  assert.equal(vk.columns(), 91);
});

test('every light lead.js can give lands on a key', () => {
  const all = new Set(ids());
  const lights = ['control', 'meta', 'shift', 'super', 'left', 'down', 'up', 'right',
    'return', 'escape', 'tab', 'backspace', 'delete', ' ', 'f1', 'f12'];
  for (const ch of '`1234567890-=[]\\;\',./~!@#$%^&*()_+{}|:"<>?') lights.push(ch);
  for (let c = 97; c <= 122; c++) lights.push(String.fromCharCode(c), String.fromCharCode(c - 32));
  for (const l of lights) {
    const es = vk.entries(l);
    assert.ok(es.length, 'no key for ' + JSON.stringify(l));
    for (const e of es) for (const id of e) assert.ok(all.has(id), id);
  }
});

test('entries: shifted chars are shift then the key; modifiers light both sides', () => {
  assert.deepEqual(vk.entries('Y'), [['lshift', 'rshift'], ['y']]);
  assert.deepEqual(vk.entries(':'), [['lshift', 'rshift'], [';']]);
  assert.deepEqual(vk.entries('control'), [['lctrl', 'rctrl']]);
  assert.deepEqual(vk.entries('return'), [['enter']]);
  assert.deepEqual(vk.entries('あ'), []);
});

test('slots: ;cY;e -> ctrl, shift, y, enter (newest first)', () => {
  const s = vk.slots();
  const r = lead.reader();
  for (const ch of ';cY;e') for (const l of r.feed(ch).lights) for (const e of vk.entries(l)) s.push(e);
  assert.deepEqual(s.list(), [['enter'], ['y'], ['lshift', 'rshift'], ['lctrl', 'rctrl']]);
  assert.equal(s.shade('enter'), 0);
  assert.equal(s.shade('rctrl'), 3);
  assert.equal(s.shade('q'), -1);
});

test('slots: the newest of a repeated key wins; five at most', () => {
  const s = vk.slots();
  for (const id of ['a', 'b', 'a', 'c', 'd', 'e']) s.push([id]);
  assert.equal(s.list().length, 5);
  assert.equal(s.shade('a'), 3);
  assert.equal(s.shade('e'), 0);
});

test('slots: ticks push them out until empty', () => {
  const s = vk.slots();
  s.push(['a']);
  assert.equal(s.empty(), false);
  for (let i = 0; i < 4; i++) s.tick();
  assert.equal(s.shade('a'), 4);
  s.tick();
  assert.equal(s.shade('a'), -1);
  assert.equal(s.empty(), true);
});
