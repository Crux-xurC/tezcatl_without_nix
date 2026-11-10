'use strict';
// lib/skin/frame-lines.js: a line of the frame's input form goes to the first
// of LINES that takes it; the tezcatl-commands with a `line` in
// command_map.json run as that line in the frame focused last.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.self = global;
require('../lib/skin/frame-lines.js');
const { create, NEXT } = global.Tezcatl.frameLines;

// a frame with nothing in it: every line falls through to `skin …`, which
// is F.parse / F.apply -- faked to record what ran
function frame(opts = {}) {
  const said = [];
  const ran = [];
  const registered = {};
  const notMine = () => false;
  const T = {
    radar: { hasAt: () => false },
    dockLayout: require('../lib/skin/dock-layout.js'),
    dbCommands: require('../lib/skin/db-commands.js'),
    color: { parse: () => ({ error: 'x' }) },
    openPage: opts.openPage || require('../lib/core/open-page.js'),
    commands: {
      isLoaded: () => true,
      list: () => opts.commands || [],
      register: (name, fn) => { registered[name] = fn; },
    },
  };
  const F = {
    parse: (line) => (/^skin /.test(line) ? { cmd: 'test', line } : { error: 'not a command: ' + line }),
    apply: (state, c) => { ran.push(c.line); return { state }; },
  };
  const lines = create({
    T, F, bus: {}, recv: (t) => said.push(t), refs: {}, placeOfId: () => null,
    state: () => ({}), setState: () => {}, ctx: {}, store: {}, newId: () => 'x', keep: () => {}, render: () => {},
    enter: () => {}, focusAbs: () => {}, goOn: () => true,
    code: { skinEx: { handle: () => false, sent: () => {} }, diffNow: () => false, lsp: { handle: notMine }, check: { handle: notMine }, juncture: { handle: notMine }, markdown: { handle: notMine }, image: { handle: notMine }, taskTable: { handle: notMine }, runTable: { handle: notMine }, intentLine: { handle: notMine }, logLine: { handle: notMine }, envLine: { handle: notMine }, minimum: notMine, diff: notMine },
    work: { handle: notMine }, catalogP: Promise.resolve(), mine: (c) => !(c && c.remote) || !!opts.active,
  });
  return { lines, said, ran, registered };
}

test('a line no handler takes goes to skin …, echoed', () => {
  const f = frame();
  assert.equal(f.lines.run('skin main 1,2'), true);
  assert.deepEqual(f.ran, ['skin main 1,2']);
  assert.deepEqual(f.said, ['> skin main 1,2']);
});

test('open <page> [tab|window] is lib/core/open-page.js: what it says goes to the receiving side', async () => {
  const asked = [];
  const openPage = { runLine: (line) => {
    if (!/^open\b/.test(line)) return null;
    asked.push(line);
    return Promise.resolve(line === 'open nothing' ? { ok: false, message: 'no page "nothing"' } : { ok: true, message: 'opened x in a new tab' });
  } };
  const f = frame({ openPage });
  assert.equal(await f.lines.run('open database window'), true);
  assert.equal(await f.lines.run('open nothing'), false);
  assert.deepEqual(asked, ['open database window', 'open nothing']);
  assert.deepEqual(f.said, ['> open database window', 'opened x in a new tab', '> open nothing', '! no page "nothing"']);
  assert.deepEqual(f.ran, []);
});

test('what is not a command is said, and nothing runs', () => {
  const f = frame();
  assert.equal(f.lines.run('nonsense'), false);
  assert.deepEqual(f.ran, []);
  assert.match(f.said[1], /^! not a command/);
});

test('":" alone is skin focus abs', () => {
  const f = frame();
  f.lines.run(':');
  assert.deepEqual(f.ran, ['skin focus abs']);
});

test('a command with a line runs it, {arg} filled, quiet without the echo', async () => {
  const f = frame({ commands: [
    { name: 'skin.add', line: 'skin add {panel}' },
    { name: 'skin.focus', line: 'skin focus {place}', quiet: true },
    { name: 'no.line' },
  ] });
  await f.lines.registerLines();
  assert.deepEqual(Object.keys(f.registered).sort(), ['skin.add', 'skin.focus']);
  assert.equal(f.registered['skin.add']({ panel: 'tree' }, null), true);
  assert.equal(f.registered['skin.focus']({ place: 'abs' }, null), true);
  await Promise.resolve();
  assert.deepEqual(f.ran, ['skin add tree', 'skin focus abs']);
  assert.deepEqual(f.said, ['> skin add tree']);
});

test('an arg is one word: missing or with a space is said, nothing runs', async () => {
  const f = frame({ commands: [{ name: 'skin.add', line: 'skin add {panel}' }] });
  await f.lines.registerLines();
  f.registered['skin.add']({}, null);
  f.registered['skin.add']({ panel: '1 tree' }, null);
  await Promise.resolve();
  assert.deepEqual(f.ran, []);
  assert.deepEqual(f.said, ['! skin.add needs panel (one word)', '! skin.add needs panel (one word)']);
});

test('from another window, only the frame focused last takes it', async () => {
  const idle = frame({ commands: [{ name: 'go.on', line: 'go on' }] });
  await idle.lines.registerLines();
  assert.equal(idle.registered['go.on']({}, { remote: true }), false);
  const active = frame({ commands: [{ name: 'go.on', line: 'go on' }], active: true });
  await active.lines.registerLines();
  assert.equal(active.registered['go.on']({}, { remote: true }), true);
});

test('NEXT is not false: a handler that took the line and failed stops it there', () => {
  assert.notEqual(NEXT, false);
});

test('the commands with a line in command_map.json name args they have', () => {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'command/command_map.json'), 'utf8'));
  for (const c of map.commands.filter((x) => x.line)) {
    const used = [...c.line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const a of used) assert.ok((c.args || []).includes(a), c.name + ': {' + a + '} is not one of its args');
  }
});
