'use strict';
// command/ lists every command (the entry point for
// whoever adds one). These checks fail when a command is added -- to
// command_map.json, code_editor's ex commands, a skin's input line, an intent --
// and the README is not told.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readme = read('command/README.md');
const listed = (s) => readme.includes('`' + s);   // `name` or `name args...`
const missing = (names) => names.filter((n) => !listed(n));

test('every tezcatl-command of command_map.json is in the README', () => {
  const names = JSON.parse(read('command/command_map.json')).commands.map((c) => c.name);
  assert.ok(names.length > 0);
  assert.deepEqual(missing(names), []);
});

test("every code.* of lib/skin/skin-ex.js COMMANDS is in the README", () => {
  const { COMMANDS } = require('../lib/skin/skin-ex.js');
  assert.deepEqual(missing(Object.keys(COMMANDS)), []);
});

test("every ex command of code_editor (lib/code/code-files.js OPS, lib/code/code-editor.js FILE_EX) is in the README", () => {
  const ops = /const OPS = \{([\s\S]*?)\};/.exec(read('lib/code/code-files.js'))[1];
  const opNames = [...ops.matchAll(/^\s*(?:(\w+): '[\w-]+',\s*)+$/gm)]
    .flatMap((m) => [...m[0].matchAll(/(\w+): '/g)].map((x) => x[1]));
  const fileEx = /const FILE_EX = \[([\s\S]*?)\];/.exec(read('lib/code/code-editor.js'))[1];
  const exNames = [...fileEx.matchAll(/\["(\w+)", "(\w+)"\]/g)].flatMap((m) => [m[1], m[2]]);
  assert.ok(opNames.length > 0 && exNames.length > 0);
  assert.deepEqual(missing([...new Set([...opNames, ...exNames])].map((n) => ':' + n)), []);
});

test("every input-line command of the frame, the tree skin and matrix_set is in the README", () => {
  const usage = (file, re) => re.exec(read(file))[1];
  const frame = usage('lib/skin/frame-layout.js', /const USAGE = 'skin ([^']*)'/).split(',').map((w) => 'skin ' + w.trim());
  const block = usage('lib/skin/frame-layout.js', /const BLOCK_USAGE = 'block ([^']*)'/).split(',').map((w) => 'block ' + w.trim());
  const thema = usage('lib/skin/frame-layout.js', /const THEMA_USAGE = 'thema ([^']*)'/).split(',').map((w) => 'thema ' + w.trim());
  const tree = usage('lib/skin/tree-commands.js', /const USAGE = '([^']*)'/).split('/').map((w) => 'tree ' + w.trim().replace(/^tree /, '').split(' ')[0]);
  const matrix = usage('lib/xipe/matrix-commands.js', /const USAGE = '([^'(]*)/).split('/').map((w) => 'matrix ' + w.trim().replace(/^matrix /, '').split(' ')[0]);
  assert.ok(frame.length > 0 && tree.length > 0 && matrix.length > 0);
  assert.deepEqual(missing([...frame, ...block, ...thema, ...tree, ...matrix]), []);
});

test('every intent id of command/binding_map.json is in the README', () => {
  const ids = JSON.parse(read('command/binding_map.json')).map((b) => b.id);
  assert.ok(ids.length > 0);
  assert.deepEqual(missing(ids), []);
});

test('the editor keys of DEFAULT_KEYS (every keymap) name commands that are in the README, and are listed in §2.4', async () => {
  const { DEFAULT_KEYS } = await import('../lib/code/editor-keys.js');
  const cmds = [];
  const keys = [];
  Object.keys(DEFAULT_KEYS).forEach((id) => Object.keys(DEFAULT_KEYS[id]).forEach((k) => { keys.push(k); cmds.push(DEFAULT_KEYS[id][k]); }));
  assert.ok(cmds.length > 0);
  assert.deepEqual(missing(cmds), []);
  const sec = /### 2\.4[\s\S]*?\n### /.exec(read('command/README.md'))[0];
  const vimShown = { '<C-o>': 'Ctrl-o', '<C-i>': 'Ctrl-i' };
  assert.deepEqual(keys.filter((k) => sec.indexOf('`' + (vimShown[k] || k) + '`') < 0), []);
});
