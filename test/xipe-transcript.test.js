'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const tr = require('../lib/xipe/xipe-transcript.js');

test('sent: every line prefixed with "> "', () => {
  assert.deepEqual(tr.sent('row/list\nhelp'), ['> row/list', '> help']);
});

test('reply: dialogue.text as-is, else result JSON, else (ok); envelope never shown', () => {
  assert.deepEqual(tr.reply({ result: { x: 1 }, dialogue: { hold: true, via_repl: false, text: 'row/add: 作る\nscan: 走査' } }),
    ['row/add: 作る', 'scan: 走査']);
  assert.deepEqual(tr.reply({ result: { rows: [] }, dialogue: { text: null } }), ['{', '  "rows": []', '}']);
  assert.deepEqual(tr.reply({ result: {}, dialogue: { text: '' } }), ['(ok)']);
  const shown = tr.reply({ id: 'xs-1', result: { a: 1 }, dialogue: { hold: false, via_repl: true, text: null } }).join('\n');
  assert.doesNotMatch(shown, /xs-1|hold|via_repl/);
});

test('reply: an error shows code and message, plus any dialogue text', () => {
  assert.deepEqual(tr.reply({ error: { code: 'not_implemented', message: 'input' } }), ['! not_implemented: input']);
  assert.deepEqual(tr.reply({ error: { message: 'bad' }, dialogue: { text: 'try help' } }), ['! bad', 'try help']);
});

test('notify: one line, long params cut', () => {
  assert.deepEqual(tr.notify({ method: 'notify/passCompleted', params: { ok: true } }), ['· notify/passCompleted {"ok":true}']);
  const long = tr.notify({ method: 'notify/rowChanged', params: { s: 'x'.repeat(500) } })[0];
  assert.ok(long.length < 260 && long.endsWith('…'));
});

test('info and append (bounded)', () => {
  assert.deepEqual(tr.info({ kind: 'initialized', project: { id: '001', root: '/p' } }), ['# connected: project 001  /p']);
  assert.deepEqual(tr.info({ kind: 'error', reason: 'no Xipe Totec project configured' }), ['# error: no Xipe Totec project configured']);
  assert.deepEqual(tr.append(['a', 'b'], ['c', 'd'], 3), ['b', 'c', 'd']);
});
