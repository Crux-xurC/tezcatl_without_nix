'use strict';
// lib/view/color.js: the colour panel's pure part
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/view/color.js');

test('parse: a colour (spaces in rgb() kept tidy), or a JSON and a name; what is not one is refused', () => {
  assert.deepEqual(C.parse('#FF9900'), { color: '#FF9900' });
  assert.deepEqual(C.parse(' rgb(1,2, 3) '), { color: 'rgb(1, 2, 3)' });
  assert.deepEqual(C.parse('orange'), { color: 'orange' });
  assert.deepEqual(C.parse('local/thema/lcars.json orange'), { json: 'local/thema/lcars.json', name: 'orange' });
  assert.deepEqual(C.parse('/x/p.json tan'), { json: 'x/p.json', name: 'tan' });
  assert.match(C.parse('').error, /color <colour>/);
  assert.match(C.parse('p.json').error, /no name/);
  assert.match(C.parse('red;background:url(x)').error, /not a colour/);
});

test('pick: the colour <name> of {"name": "colour"}; a missing name says which there are', () => {
  const doc = { orange: '#FF9900', tan: ' #FFCC88 ', n: 3 };
  assert.deepEqual(C.pick(doc, 'orange'), { color: '#FF9900' });
  assert.deepEqual(C.pick(doc, 'tan'), { color: '#FFCC88' });
  assert.match(C.pick(doc, 'blue', 'p.json').error, /p\.json has no blue \(orange, tan\)/);
  assert.match(C.pick(doc, 'n').error, /is not a colour string/);
  assert.match(C.pick([1], 'a').error, /is not of the form/);
});

test('ink: black on a light colour, white on a dark one', () => {
  assert.equal(C.ink('rgb(255, 153, 0)'), '#000');
  assert.equal(C.ink('rgb(0, 0, 128)'), '#fff');
  assert.equal(C.ink('rgba(255, 255, 255, 1)'), '#000');
  assert.equal(C.ink('nonsense'), '#000');
});
