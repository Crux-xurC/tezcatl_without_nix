'use strict';
// lib/skin/how-to-use.js: the How_to_use panel says what the lead-key table
// and command_map.json say, so a key bound again is never explained wrong.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lead = require('../lib/core/lead.js');
const H = require('../lib/skin/how-to-use.js');

const commands = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'command/command_map.json'), 'utf8')).commands;
const rows = (secs, title) => (secs.find((s) => s.title.startsWith(title)) || { rows: [] }).rows;

test('the default table: every fixed key, the F row, ";;", the shortcuts with their command', () => {
  const secs = H.sections(lead.configure().table, commands, lead);
  const keys = rows(secs, 'keys').map((r) => r.key);
  for (const k of [';c', ';a', ';s', ';w', ';h', ';j', ';k', ';l', ';e', ';q', ';t', ';b', ';d', ';;']) assert.ok(keys.includes(k), k);
  assert.ok(keys.includes(';f1…;f='));
  const sc = rows(secs, 'shortcuts');
  assert.deepEqual(sc.map((r) => r.key), [';:', ';g', ';i', ';o']);
  assert.match(sc[0].text, /^skin\.focus abs ── frame: focus abs/);
  assert.match(sc[1].text, /^dock\.suggest ── frame: to the source of the suggestions/);
  assert.match(sc[2].text, /^dock\.target ── frame: to the input_target of the dock/);
  assert.match(sc[3].text, /^dock\.recv ── frame: to the output_target of the dock/);
});

test('a lead and bindings from config.json are what is said', () => {
  const t = lead.configure({ lead: '\\', bindings: { i: '', g: 'go.on' } }).table;
  const secs = H.sections(t, commands, lead);
  assert.ok(rows(secs, 'keys').some((r) => r.key === '\\c'));
  assert.equal(rows(secs, 'keys').find((r) => r.key === '\\\\').text, 'a plain "\\"');
  assert.deepEqual(rows(secs, 'shortcuts').map((r) => r.key), ['\\:', '\\g', '\\o']);
});

test('the lines are the commands with a line in command_map.json', () => {
  const ls = rows(H.sections(lead.configure().table, commands, lead), 'lines').map((r) => r.key);
  assert.deepEqual(ls, commands.filter((c) => c.line).map((c) => c.line));
});

test('short: a description up to its first " -- " or "("', () => {
  assert.equal(H.short('frame: add <panel> (as skin add)'), 'frame: add <panel>');
  assert.equal(H.short('go there -- detail'), 'go there');
});
