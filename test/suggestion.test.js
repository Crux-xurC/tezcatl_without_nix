'use strict';
// suggestion/ (D-suggestions): the sources of the suggestion shell. These checks fail
// when a source is added without its adapter or launcher entry, and when a
// line is added to an input form (its usage, command_map.json `line`) and not
// to suggestion/line.json -- or a row there names a line the README does not.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../lib/skin/suggest.js');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const index = JSON.parse(read('suggestion/index.json'));
const lineDoc = JSON.parse(read('suggestion/line.json'));
const readme = read('command/README.md');

test('every source has its adapter, and a launcher entry suggestion_list_<id>', () => {
  const launcher = JSON.parse(read('list_kinds/panels_and_skins.json')).items;
  const ids = index.sources.map((s) => s.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'duplicate ids');
  const letters = index.sources.map((s) => s.letter);
  assert.deepEqual(letters.filter((l, i) => letters.indexOf(l) !== i), [], 'duplicate letters');
  for (const s of index.sources) {
    assert.ok(s.scripts.length, s.id + ': no scripts');
    for (const f of s.scripts) assert.ok(fs.existsSync(path.join(root, f)), s.id + ': ' + f + ' is missing');
    assert.equal(s.scripts[s.scripts.length - 1], 'lib/suggest/' + s.id + '.js');
    const e = launcher.find((x) => x.id === 'suggestion_list_' + s.id);
    assert.ok(e, 'suggestion_list_' + s.id + ' is not in the launcher');
    assert.equal(e.page, 'panels/extra/suggestion_list.html?config=' + s.id);
  }
  const adapters = fs.readdirSync(path.join(root, 'lib/suggest')).map((f) => f.replace(/\.js$/, ''));
  assert.deepEqual(adapters.sort(), ids.slice().sort(), 'lib/suggest/ and suggestion/index.json differ');
});

// the words of a row before its first argument or choice: what the README names
const literal = (line) => {
  const out = [];
  for (const w of line.split(/\s+/)) { if (S.isArg(w) || w.includes('|')) break; out.push(w); }
  return out.join(' ');
};
const lines = lineDoc.rows.map((r) => r.line);
const has = (prefix) => lines.some((l) => l === prefix || l.startsWith(prefix + ' '));

test('line.json: well formed, and every row is a line the README names', () => {
  const known = ['frame', 'tree', 'matrix', 'code_editor'];
  for (const r of lineDoc.rows) {
    assert.ok(r.line && r.desc, JSON.stringify(r));
    for (const x of r.in.split(/\s+/)) assert.ok(known.includes(x), r.line + ': in "' + x + '"');
  }
  assert.deepEqual(lines.filter((l, i) => lines.indexOf(l) !== i), [], 'duplicate lines');
  const unnamed = lines.map(literal).filter((p) => !readme.includes('`' + p));
  assert.deepEqual(unnamed, []);
});

test('line.json has every line of the input forms (their usage, command_map.json line)', () => {
  const usage = (file, re) => re.exec(read(file))[1];
  const comma = (file, re, head) => usage(file, re).split(',').map((w) => head + ' ' + w.trim().split(' ')[0]);
  const slash = (file, re, head) => usage(file, re).split('/').map((w) => head + ' ' + w.trim().replace(new RegExp('^' + head + ' '), '').split(' ')[0]);
  const want = [
    ...comma('lib/skin/frame-layout.js', /const USAGE = 'skin ([^']*)'/, 'skin'),
    ...comma('lib/skin/frame-layout.js', /const BLOCK_USAGE = 'block ([^']*)'/, 'block'),
    ...comma('lib/skin/frame-layout.js', /const THEMA_USAGE = 'thema ([^']*)'/, 'thema'),
    ...comma('lib/skin/lsp-commands.js', /const USAGE = 'lsp ([^']*)'/, 'lsp'),
    ...comma('lib/skin/work-commands.js', /const USAGE = 'work ([^']*)'/, 'work'),
    ...comma('lib/skin/env-commands.js', /const USAGE = 'env ([^']*)'/, 'env'),
    ...slash('lib/skin/tree-commands.js', /const USAGE = '([^']*)'/, 'tree'),
    ...slash('lib/xipe/matrix-commands.js', /const USAGE = '([^'(]*)/, 'matrix'),
    ...slash('lib/code/code-diff.js', /const USAGE = '([^'(]*)/, 'diff'),
  ];
  const fromMap = JSON.parse(read('command/command_map.json')).commands
    .filter((c) => c.line).map((c) => c.line.split('{')[0].trim());
  const missing = [...want, ...fromMap, 'check update', 'dock side', 'dock size', 'dock rows', 'dock cols', 'dock reset']
    .filter((p) => !has(p));
  assert.deepEqual(missing, []);
});

test('line.json read as suggestions: the first words, and ?in= narrows', () => {
  const L = require('../lib/suggest/line.js');
  const idx = S.index(L.toTable(lineDoc), { word: 'line', desc: 'desc' });
  const first = S.next(idx, '').items.map((x) => x.word);
  assert.equal(first[0], 'skin');
  assert.ok(first.includes(':w') && first.includes('tree'));
  const frame = S.next(S.index(L.toTable(lineDoc, { in: 'frame,code_editor' }), {}), '').items.map((x) => x.word);
  assert.ok(frame.includes(':w') && !frame.includes('tree') && !frame.includes('matrix'));
  assert.ok(frame.includes('radar'));
});

test('the intent and dict adapters: a table of {id, cells: {line, desc}}', () => {
  const I = require('../lib/suggest/intent.js');
  const t = I.toTable([{ id: 'a.b' }, { id: 'agenda.open', keys: 'C-c a' }, {}, null]);
  assert.deepEqual(t.rows, [{ id: 'a.b', cells: { line: 'a.b', desc: '' } },
    { id: 'agenda.open', cells: { line: 'agenda.open', desc: 'keys: C-c a' } }]);
  const real = I.toTable(JSON.parse(read('command/binding_map.json')));
  assert.ok(real.rows.length > 0);

  const D = require('../lib/suggest/dict.js');
  const dictLib = require('../lib/list/dict.js');
  const doc = { lists: { default: [{ word: 'row/add', note: 'a calc row' }], other: [{ word: 'x', note: '' }] } };
  assert.deepEqual(D.toTable(doc, null, dictLib).rows, [{ id: 'row/add', cells: { line: 'row/add', desc: 'a calc row' } }]);
  assert.deepEqual(D.toTable(doc, 'other', dictLib).rows.map((r) => r.id), ['x']);
  assert.deepEqual(D.toTable(null, null, dictLib).rows, []);
});
