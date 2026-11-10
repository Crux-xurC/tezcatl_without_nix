'use strict';
// bus/messages.json is the ledger of the panel bus (D-bus-ledger): every type the
// pages post or listen to. These checks fail when a type is added to the code
// and not to the ledger, or an entry stays after the code stopped naming it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const ledger = JSON.parse(fs.readFileSync(path.join(root, 'bus/messages.json'), 'utf8'));
const entries = ledger.messages;
const names = entries.map((m) => m.name);

// the files git ignores (a person's own pages kept beside the published ones,
// .gitignore), or null outside a git checkout: the ledger covers what is published
function ignored(files) {
  try {
    const out = execFileSync('git', ['check-ignore', '--stdin'],
      { cwd: root, input: files.map((f) => path.relative(root, f)).join('\n'), encoding: 'utf8' });
    return new Set(out.split('\n').filter(Boolean));
  } catch (e) {
    // exit status 1: none of them is ignored; anything else: no git here
    return e.status === 1 ? new Set() : null;
  }
}

// the pages: lib/ (but the vendored bundles), panels/, the top-level pages
function pages() {
  const out = [];
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (path.basename(p) === 'vendor') return;
      for (const f of fs.readdirSync(p)) walk(path.join(p, f));
    } else if (/\.(js|html)$/.test(p)) out.push(p);
  };
  ['lib', 'panels', 'relay-console'].forEach((d) => walk(path.join(root, d)));
  ['main.html', 'launcher.html'].forEach((f) => out.push(path.join(root, f)));
  const skip = ignored(out);
  return skip ? out.filter((f) => !skip.has(path.relative(root, f))) : out;
}
const texts = pages().map((f) => ({ file: path.relative(root, f), text: fs.readFileSync(f, 'utf8') }));

// a type named literally where it is posted, listened to or replied with
function literalTypes() {
  const found = new Map();   // type -> first file
  const res = [
    /\b(?:bus|Bus)\s*\.\s*(?:post|on|onMine)\s*\(\s*(['"])([^'"]+)\1/g,
    /\breplyTo\(\s*\w+\s*,\s*(['"])([^'"]+)\1/g,
  ];
  for (const { file, text } of texts) {
    for (const re of res) for (const m of text.matchAll(re)) if (!found.has(m[2])) found.set(m[2], file);
  }
  return found;
}

test('the ledger is well formed: unique names, a known scope, the columns filled', () => {
  assert.ok(entries.length > 0);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(dup, [], 'duplicate entries');
  const scopes = Object.keys(ledger.scopes);
  for (const m of entries) {
    assert.ok(scopes.includes(m.scope), m.name + ': scope "' + m.scope + '" is not one of ' + scopes.join(', '));
    for (const k of ['from', 'to', 'payload', 'desc']) {
      assert.ok(typeof m[k] === 'string' && m[k].length > 0, m.name + ': no ' + k);
    }
    for (const k of Object.keys(m)) assert.ok(k in ledger.fields, m.name + ': unknown column ' + k);
  }
});

test('every type posted, listened to or replied with in the pages is in the ledger', () => {
  const missing = [...literalTypes()].filter(([t]) => !names.includes(t)).map(([t, f]) => t + ' (' + f + ')');
  assert.deepEqual(missing, []);
});

test('every type in work.json (start, end, fail, cancel) is in the ledger', () => {
  const work = JSON.parse(fs.readFileSync(path.join(root, 'work.json'), 'utf8'));
  const types = new Set();
  for (const p of work.pairs) {
    types.add(p.start);
    (p.end || []).forEach((t) => types.add(t));
    (p.fail || []).forEach((t) => types.add(t));
    if (p.cancel) types.add(p.cancel.type);
  }
  assert.deepEqual([...types].filter((t) => !names.includes(t)), []);
});

test('every entry is still named by a page or work.json (no stale entries)', () => {
  const work = fs.readFileSync(path.join(root, 'work.json'), 'utf8');
  const all = texts.map((t) => t.text).join('\n') + '\n' + work;
  const quoted = (n) => all.includes("'" + n + "'") || all.includes('"' + n + '"');
  const stale = names.filter((n) => n !== '*' && !quoted(n));
  assert.deepEqual(stale, []);
});

test('a reply named by an entry is an entry too', () => {
  const bad = [];
  for (const m of entries) {
    if (!m.reply) continue;
    for (const r of m.reply.split(/[,/]/).map((s) => s.trim().split(' ')[0])) {
      if (!names.includes(r)) bad.push(m.name + ' -> ' + r);
    }
  }
  assert.deepEqual(bad, []);
});
