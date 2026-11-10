'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lead = require('../lib/core/lead.js');

const ev = (key, ...modifiers) => ({ key, modifiers });
const events = (text, table) => {
  const r = lead.parse(text, table);
  assert.ok(!r.error, 'unexpected error: ' + r.error);
  return r.events;
};
const describe = (text, table) => lead.describe(events(text, table));

test('plain chars pass through, space included', () => {
  assert.deepEqual(events('ls x'), [ev('l'), ev('s'), ev(' '), ev('x')]);
});

test(';cd is C-d (the shell example from the decision)', () => {
  assert.equal(describe('ls ;cd x'), 'l s SPC C-d SPC x');
});

test('modifiers stack and are put in canonical order', () => {
  assert.deepEqual(events(';a;cx'), [ev('x', 'control', 'meta')]);
  assert.deepEqual(events(';a;c;s;f5'), [ev('f5', 'control', 'meta', 'shift')]);
  assert.deepEqual(events(';wx'), [ev('x', 'super')]);
});

test('modifier applies to the next key only', () => {
  assert.deepEqual(events(';cxy'), [ev('x', 'control'), ev('y')]);
});

test('named keys', () => {
  assert.equal(describe(';h;j;k;l'), '<left> <down> <up> <right>');
  assert.equal(describe(';e;q;t;b;d'), '<return> <escape> <tab> <backspace> <delete>');
  assert.equal(describe(';c;h'), 'C-<left>');
  assert.equal(describe(';s;t'), 'S-<tab>');
});

test('function keys come from the fn row', () => {
  assert.equal(describe(';f1;f0;f-;f='), '<f1> <f10> <f11> <f12>');
  assert.equal(describe(';c;f5'), 'C-<f5>');
  const { table } = lead.configure({ fnRow: '1234567890-^' });
  assert.equal(describe(';f^', table), '<f12>');
});

test(';; is a plain lead char, also under a modifier', () => {
  assert.deepEqual(events('a;;b'), [ev('a'), ev(';'), ev('b')]);
  assert.deepEqual(events(';c;;'), [ev(';', 'control')]);
});

test('shifted chars are written as themselves; ;s on a char is an error', () => {
  assert.deepEqual(events(';cY'), [ev('Y', 'control')]);
  assert.match(lead.parse(';sa').error, /shifted char/);
});

test('non-ASCII passes plain, but takes no modifier', () => {
  assert.deepEqual(events('あ'), [ev('あ')]);
  assert.deepEqual(events('😀'), [ev('😀')]);
  assert.match(lead.parse(';cあ').error, /ASCII only/);
});

test('errors: unknown, reserved, repeated, dangling, bad fn', () => {
  assert.match(lead.parse('a;z').error, /means nothing/);
  assert.equal(lead.parse('a;z').at, 1);
  assert.match(lead.parse(';C').error, /reserved/);
  assert.match(lead.parse(';c;cx').error, /repeated/);
  assert.match(lead.parse('x;').error, /after the lead/);
  assert.match(lead.parse(';c').error, /needs a key/);
  assert.match(lead.parse(';f').error, /function key/);
  assert.match(lead.parse(';fx').error, /not a function key/);
});

test('a line that stops half-way is incomplete; a wrong one is not', () => {
  for (const t of ['x;', ';c', ';a;c', ';f', ';c;f']) assert.equal(lead.parse(t).incomplete, true, t);
  for (const t of [';z', ';C', ';c;cx', ';fx', ';sa']) assert.equal(lead.parse(t).incomplete, undefined, t);
  assert.equal(lead.parse('ab;c').at, 2);
});

test('a shortcut inside a line is an error, not a key', () => {
  const r = lead.parse('ab;:');
  assert.match(r.error, /cannot be sent/);
  assert.equal(r.at, 2);
});

test('spans point back at the source', () => {
  const r = lead.parse('l;cd;f5');
  assert.deepEqual(r.spans, [[0, 1], [1, 4], [4, 7]]);
});

test('reader: lights per keystroke (;cY;e -> control, Y, return)', () => {
  const r = lead.reader();
  const lights = Array.from(';cY;e').map((ch) => r.feed(ch).lights);
  assert.deepEqual(lights, [[], ['control'], ['Y'], [], ['return']]);
});

test('reader: ;;;;; lights two ";" and is left waiting', () => {
  const r = lead.reader();
  const lit = Array.from(';;;;;').flatMap((ch) => r.feed(ch).lights);
  assert.deepEqual(lit, [';', ';']);
  assert.equal(r.state().waiting, true);
  assert.equal(r.end(), 'line ends after the lead');
  assert.equal(r.state().waiting, false);
});

test('reader: a shortcut fires as a binding', () => {
  const r = lead.reader();
  r.feed(';');
  assert.deepEqual(r.feed(':'), { lights: [], binding: 'skin.focus abs' });
});

test('reader: state shows waiting / modifiers / fn', () => {
  const r = lead.reader();
  r.feed(';'); r.feed('a'); r.feed(';'); r.feed('c'); r.feed(';'); r.feed('f');
  assert.deepEqual(r.state(), { waiting: false, fn: true, modifiers: ['control', 'meta'] });
});

test('reader: starts over after an error', () => {
  const r = lead.reader();
  r.feed(';'); r.feed('c');
  assert.ok(r.feed('あ').error);
  assert.deepEqual(r.feed('x').event, ev('x'));
});

test('configure: defaults', () => {
  const { table, errors } = lead.configure();
  assert.deepEqual(errors, []);
  assert.equal(table.lead, ';');
  assert.equal(table.fnRow, '1234567890-=');
  assert.deepEqual(table.bindings, { ':': 'skin.focus abs', i: 'dock.target', g: 'dock.suggest', o: 'dock.recv' });
});

test('configure: bindings lay over defaults, "" unbinds', () => {
  const { table, errors } = lead.configure({ bindings: { g: 'dock guess', ':': '', o: 'dock other', r: 'dock r' } });
  assert.deepEqual(errors, []);
  assert.deepEqual(table.bindings, { i: 'dock.target', g: 'dock guess', o: 'dock other', r: 'dock r' });
});

test('configure: protected chars cannot be bound', () => {
  for (const ch of [';', 'c', 'a', 's', 'w', 'f', 'h', 'j', 'k', 'l', 'e', 'q', 't', 'b', 'd', 'X']) {
    const { table, errors } = lead.configure({ bindings: { [ch]: 'x' } });
    assert.equal(errors.length, 1, ch);
    assert.equal(table.bindings[ch], undefined, ch);
  }
});

test('configure: bad lead and fn row fall back to defaults', () => {
  for (const l of ['a', '1', ';;', '', 'あ', 5]) {
    const { table, errors } = lead.configure({ lead: l });
    assert.equal(errors.length, 1, String(l));
    assert.equal(table.lead, ';');
  }
  for (const r of ['123', '1234567890-1', 5]) {
    const { table, errors } = lead.configure({ fnRow: r });
    assert.equal(errors.length, 1, String(r));
    assert.equal(table.fnRow, '1234567890-=');
  }
});

test('configure: another lead char works everywhere', () => {
  const { table } = lead.configure({ lead: '|' });
  assert.equal(describe('a;b|cx||', table), 'a ; b C-x |');
  assert.equal(lead.escape('a|b', table), 'a||b');
});

test('configure: a lead moved onto a bound char drops that binding', () => {
  const { table } = lead.configure({ lead: ':' });
  assert.deepEqual(table.bindings, { i: 'dock.target', g: 'dock.suggest', o: 'dock.recv' });
});

test('escape: pasted text reads back as the same chars', () => {
  const pasted = 'ls; echo "a\tb"\nok';
  const escaped = lead.escape(pasted);
  assert.equal(escaped, 'ls;; echo "a;tb";eok');
  assert.equal(describe(escaped), 'l s ; SPC e c h o SPC " a <tab> b " <return> o k');
  assert.equal(lead.escape('a\r\nb\u0007'), 'a;eb');
});
