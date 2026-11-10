'use strict';
// lib/skin/thema.js: the sentence and colour of a block's thema
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/skin/thema.js');

test('settings: defaults < the panel\'s block < this place; what is not sound is left out', () => {
  assert.deepEqual(H.settings(null, null), { source: 'name', side: 't', color: 'base', thickness: 24 });
  assert.deepEqual(H.settings({ source: 'file', color: 'calm', thickness: 30 }, { side: 'l' }),
    { source: 'file', side: 'l', color: 'calm', thickness: 30 });
  assert.deepEqual(H.settings({ source: 'words', side: 'x', thickness: 9999, color: ' ' }, null), H.DEFAULTS);
});

test('show: name / file (● and warn when unsaved) / status (its level picks the colour)', () => {
  const base = { label: '11', panel: 'code_editor', side: 't', color: 'base' };
  assert.deepEqual(H.show(Object.assign({ source: 'name' }, base), {}), { text: '11 code_editor', level: null, color: 'var(--th-base)' });
  assert.deepEqual(H.show(Object.assign({ source: 'file' }, base), { file: 'lib/a.js', dirty: false }).text, '11 lib/a.js');
  assert.deepEqual(H.show(Object.assign({ source: 'file' }, base), { file: 'lib/a.js', dirty: true }),
    { text: '11 lib/a.js ●', level: 'warn', color: 'var(--th-warn)' });
  assert.equal(H.show(Object.assign({ source: 'file' }, base), {}).text, '11 code_editor');
  assert.deepEqual(H.show(Object.assign({ source: 'status' }, base), { status: { text: '3 件', level: 'alert' } }),
    { text: '11 3 件', level: 'alert', color: 'var(--th-alert)' });
  // a level not of the set is not a colour; no status yet: the name
  assert.equal(H.show(Object.assign({ source: 'status' }, base), { status: { text: 'x', level: 'red' } }).level, null);
  assert.equal(H.show(Object.assign({ source: 'status' }, base), {}).text, '11 code_editor');
  // a synthesis' band: its own name, then its main's status (D-synthesis)
  const syn = { label: '21', panel: 'matrix_set_1', side: 't', color: 'base', source: 'status', synthesis: true };
  assert.equal(H.show(syn, { status: { text: 'xipe_rows:all ── 4 rows' } }).text, '21 matrix_set_1 ── xipe_rows:all ── 4 rows');
  assert.equal(H.show(syn, {}).text, '21 matrix_set_1');
  // a colour not of the palette goes as it is
  assert.equal(H.show(Object.assign({}, base, { color: '#123456' }), {}).color, '#123456');
});

test('a band at the side (r / l) has no sentence', () => {
  assert.equal(H.show({ source: 'name', side: 'r', label: '11', panel: 'tree' }, {}).text, '');
  assert.equal(H.show({ source: 'file', side: 'l', label: '11', panel: 'code_editor' }, { file: 'a', dirty: true }).level, 'warn');
});

test('a sentence of its own (thema text) in place of the source\'s; made small: the band keeps it lying across, a line has none', () => {
  const c = { source: 'file', side: 't', label: '11', panel: 'code_editor', text: '機関室' };
  assert.deepEqual(H.show(c, { file: 'a', dirty: true }), { text: '11 機関室', level: 'warn', color: 'var(--th-warn)' });
  assert.equal(H.show(Object.assign({}, c, { min: 'band', across: 'h' }), {}).text, '11 機関室');
  assert.equal(H.show(Object.assign({}, c, { min: 'band', across: 'v' }), {}).text, '');
  assert.equal(H.show(Object.assign({}, c, { min: 'line' }), {}).text, '');
  // a band at the side made small to its band lying across: the sentence again
  assert.equal(H.show(Object.assign({}, c, { side: 'l', min: 'band', across: 'h' }), {}).text, '11 機関室');
  assert.deepEqual(H.settings(null, { text: ' x ', min: 'band' }), Object.assign({}, H.DEFAULTS, { text: 'x', min: 'band' }));
  assert.deepEqual(H.settings({ text: 'x', min: 'line' }, { text: '', min: 'huge' }), Object.assign({}, H.DEFAULTS, { text: null, min: null }));
});

test('an L round a corner (tl / tr / bl / br): two edges, the sentence on its band; a style by name; names a style may colour', () => {
  assert.deepEqual(H.edges('tl'), { t: true, b: false, l: true, r: false });
  assert.deepEqual(H.edges('br'), { t: false, b: true, l: false, r: true });
  assert.deepEqual(H.edges('l'), { t: false, b: false, l: true, r: false });
  assert.deepEqual(H.edges('t'), { t: true, b: false, l: false, r: false });
  assert.equal(H.show({ source: 'name', side: 'tr', label: '11', panel: 'tree' }, {}).text, '11 tree');
  assert.equal(H.settings(null, { side: 'bl', style: 'lcars' }).style, 'lcars');
  assert.equal(H.settings({ style: 'lcars' }, { style: '../x' }).style, null);
  assert.equal(H.cssColor('orange'), 'var(--th-orange, orange)');
  assert.equal(H.cssColor('warn'), 'var(--th-warn)');
  assert.equal(H.cssColor('#ff9900'), '#ff9900');
});
