'use strict';
// output_target/ holds the sources of the receiving side: index.json
// (order, letters) and one <id>.json each, whose scripts are its way
// (lib/recv/<id>.js). The page reads the index, not the directory; these
// checks keep the two in step.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'output_target');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -5));

test('every source in the directory is in index.json, and the other way', () => {
  const ids = index.sources.map((t) => t.id);
  assert.deepEqual(files.filter((f) => !ids.includes(f)), [], 'in output_target/ but not in index.json');
  assert.deepEqual(ids.filter((i) => !files.includes(i)), [], 'in index.json but no output_target/<id>.json');
});

test('letters: one lowercase letter each, none twice', () => {
  const letters = index.sources.map((t) => t.letter);
  for (const l of letters) assert.match(l, /^[a-z]$/);
  assert.equal(new Set(letters).size, letters.length);
});

test("each source's scripts exist, and the last registers Tezcatl.recvSources[<id>]", () => {
  for (const id of files) {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8'));
    assert.ok(Array.isArray(cfg.scripts) && cfg.scripts.length, id + ': scripts');
    for (const s of cfg.scripts) assert.ok(fs.existsSync(path.join(root, s)), id + ': ' + s);
    const way = fs.readFileSync(path.join(root, cfg.scripts[cfg.scripts.length - 1]), 'utf8');
    assert.ok(way.includes("['" + id + "']") || way.includes('.' + id + ' ='), id + ': registers itself');
  }
});
