'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cl = require('../lib/code/code-languages.js');

test('resolve: bare extension, with and without dot', () => {
  assert.equal(cl.resolve('rs'), 'rust');
  assert.equal(cl.resolve('.rs'), 'rust');
  assert.equal(cl.resolve('RS'), 'rust');
});

test('resolve: full path -> basename -> extension', () => {
  assert.equal(cl.resolve('lib/core/ws.js'), 'javascript');
  assert.equal(cl.resolve('/home/user/my_app/tezcatl/config.json'), 'json');
  assert.equal(cl.resolve('a\\b\\c.css'), 'css');
});

test('resolve: js family all map to javascript', () => {
  for (const e of ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts']) {
    assert.equal(cl.resolve('x.' + e), 'javascript', e);
  }
});

test('resolve: language name / alias passed directly', () => {
  assert.equal(cl.resolve('javascript'), 'javascript');
  assert.equal(cl.resolve('shell-script'), 'shell');
  assert.equal(cl.resolve('c++'), 'cpp');
  assert.equal(cl.resolve('YAML'), 'yaml');
});

test('resolve: special filenames with no useful extension', () => {
  assert.equal(cl.resolve('Dockerfile'), 'dockerfile');
  assert.equal(cl.resolve('project/Containerfile'), 'dockerfile');
  assert.equal(cl.resolve('Gemfile'), 'ruby');
  assert.equal(cl.resolve('.bashrc'), 'shell');
  assert.equal(cl.resolve('Cargo.lock'), 'toml');
});

test('resolve: legacy-mode ids', () => {
  assert.equal(cl.resolve('build.sh'), 'shell');
  assert.equal(cl.resolve('init.lua'), 'lua');
  assert.equal(cl.resolve('pyproject.toml'), 'toml');
  assert.equal(cl.resolve('a.patch'), 'diff');
  assert.equal(cl.resolve('foo.rb'), 'ruby');
  assert.equal(cl.resolve('bar.erl'), 'erlang');
});

test('resolve: elixir / nix / ocaml / haskell (grammar in the bundle since 2026-10-06, and an LSP id)', () => {
  // Real ids: languageExtension() highlights them and the editor attaches a
  // language server (lsp.json).
  assert.equal(cl.resolve('main.exs'), 'elixir');
  assert.equal(cl.resolve('lib/foo.ex'), 'elixir');
  assert.equal(cl.resolve('page.heex'), 'elixir');
  assert.equal(cl.resolve('mix.exs'), 'elixir');
  assert.equal(cl.resolve('elixir'), 'elixir');
  assert.equal(cl.resolve('flake.nix'), 'nix');
  assert.equal(cl.resolve('nix'), 'nix');
  assert.equal(cl.resolve('lib/parser.ml'), 'ocaml');
  assert.equal(cl.resolve('dune-project'), 'ocaml');
  assert.equal(cl.resolve('ocaml'), 'ocaml');
  assert.equal(cl.resolve('src/Geo/Shape.hs'), 'haskell');
  assert.equal(cl.resolve('Notes.lhs'), 'haskell');
  assert.equal(cl.resolve('haskell'), 'haskell');
  assert.ok(cl.list().includes('haskell'));
});

test('resolve: unknown / junk / non-string -> null', () => {
  assert.equal(cl.resolve('file.wat'), null);
  assert.equal(cl.resolve('README'), null);
  assert.equal(cl.resolve(''), null);
  assert.equal(cl.resolve('   '), null);
  assert.equal(cl.resolve(null), null);
  assert.equal(cl.resolve(undefined), null);
  assert.equal(cl.resolve(42), null);
});

test('list: every id resolves to itself and is non-empty', () => {
  const ids = cl.list();
  assert.ok(Array.isArray(ids) && ids.length >= 15);
  for (const id of ids) {
    assert.equal(cl.resolve(id), id, id + ' should resolve to itself');
  }
  ids.push('bogus');
  assert.ok(!cl.list().includes('bogus'));
});

// code.json `languages`: the user's table, added over the
// built-in one. configure() replaces the whole user table each time.
test('configure: a new language by extension / filename / name, with its grammar plugin', () => {
  try {
    assert.equal(cl.resolve('main.go'), null);
    const problems = cl.configure({
      go: { extensions: ['.go'], filenames: ['go.mod'], names: ['golang'], grammar: 'languages/go.js' },
    });
    assert.deepEqual(problems, []);
    assert.equal(cl.resolve('cmd/main.go'), 'go');
    assert.equal(cl.resolve('MAIN.GO'), 'go');
    assert.equal(cl.resolve('go.mod'), 'go');
    assert.equal(cl.resolve('golang'), 'go');
    assert.equal(cl.resolve('go'), 'go');
    assert.equal(cl.grammar('go'), 'languages/go.js');
    assert.ok(cl.list().includes('go'));
  } finally { cl.configure(null); }
  assert.equal(cl.resolve('main.go'), null);
  assert.ok(!cl.list().includes('go'));
});

test('configure: user entries win over built-in ones; an id without grammar is LSP-only', () => {
  try {
    cl.configure({ markdown: { extensions: ['txt'] }, elixir: { grammar: 'my/elixir.js' }, zig: { extensions: ['zig'] } });
    assert.equal(cl.resolve('notes.txt'), 'markdown');
    assert.equal(cl.grammar('elixir'), 'my/elixir.js');
    assert.equal(cl.resolve('a.zig'), 'zig');
    assert.equal(cl.grammar('zig'), null);
  } finally { cl.configure(null); }
  assert.equal(cl.resolve('notes.txt'), null);
  assert.equal(cl.grammar('elixir'), 'languages/elixir.js');   // shipped plugin
  assert.equal(cl.grammar('javascript'), null);                // in the bundle
});

test('configure: bad entries are reported and skipped', () => {
  try {
    const problems = cl.configure({ ok: { extensions: ['ok1'] }, bad: 3, list: [], g: { grammar: 5 } });
    assert.equal(problems.length, 3);
    assert.equal(cl.resolve('a.ok1'), 'ok');
    assert.ok(!cl.list().includes('bad'));
    assert.deepEqual(cl.configure([1]), ['languages: expected an object of { <id>: {...} }']);
  } finally { cl.configure(null); }
});
