'use strict';
// lib/skin/env-commands.js: the `env ...` lines of a skin's input form (D-project-env)
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/skin/env-commands.js');

const resolve = (a) => (a === 'bad' ? { error: 'outside the FS root' } : { path: a.replace(/^\.\//, 'proj/') });

test('parse: xterm / show / reload with one path or none; another line is not ours', () => {
  assert.equal(E.parse('skin add xterm'), null);
  assert.equal(E.parse('envelope'), null);
  assert.deepEqual(E.parse('env xterm'), { cmd: 'xterm', path: null });
  assert.deepEqual(E.parse(' env  show  ./a.js ', resolve), { cmd: 'show', path: 'proj/a.js' });
  assert.deepEqual(E.parse('env reload proj', resolve), { cmd: 'reload', path: 'proj' });
  assert.equal(E.parse('env xterm bad', resolve).error, 'outside the FS root');
  assert.match(E.parse('env xterm a b').error, /one path/);
  assert.match(E.parse('env show ~work/scratch').error, /work place has no project/);
  assert.equal(E.parse('env').error, E.USAGE);
  assert.equal(E.parse('env list').error, E.USAGE);
});

test('lines: no project; a failure; what a project changes', () => {
  assert.match(E.lines({ found: false, reason: 'no marker' }, 'a.txt')[0], /a\.txt: no project \(no marker\) ── the relay's own/);
  const failed = E.lines({ found: true, ok: false, root: '/h/u/my_app/p', marker: 'flake.nix', command: ['nix', 'print-dev-env', '--json'], reason: 'exit code 1' }, 'p/x.nix');
  assert.match(failed[0], /…\/u\/my_app\/p by flake\.nix \(nix print-dev-env --json\) ── could not be read: exit code 1/);
  const ok = E.lines({ found: true, ok: true, kept: true, root: '/p', marker: '.envrc', command: ['direnv', 'export', 'json'],
    pathAdded: ['/a', '/b', '/c', '/d'], set: ['FOO'], unset: [] }, null);
  assert.equal(ok[0], 'env show ── the FS root: /p by .envrc (direnv export json) ── kept');
  assert.equal(ok[1], "PATH before the relay's: 4 (/a /b /c … (4))");
  assert.equal(ok[2], 'set: FOO');
  assert.equal(ok.length, 3);
});

function harness(over) {
  const said = [];
  const asked = [];
  const h = Object.assign({
    base: () => 'http://127.0.0.1:4100',
    recv: (t, cls, ref) => said.push({ t, cls, ref }),
    pathNow: () => 'proj/lib/a.ex',
    resolve,
    addXterm: (p) => ({ ok: true, message: 'an xterm at 21 in the project of ' + p, ref: { kind: 'panel', id: 'x1' } }),
    fetch: (u, o) => {
      asked.push({ u, method: (o && o.method) || 'GET' });
      if (/\/env\/reload/.test(u)) return Promise.resolve({ ok: true, json: () => Promise.resolve({ dropped: ['/r/proj'], root: '/r/proj' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ found: true, ok: true, kept: false, root: '/r/proj', marker: 'flake.nix', command: ['nix'], pathAdded: [], set: [], unset: [] }) });
    },
  }, over);
  return { w: E.wire(h), said, asked };
}

test('wire: env xterm takes the code_editor file when no path is given, and says where', async () => {
  const { w, said } = harness();
  assert.equal(w.handle('skin add 1 tree'), false);
  assert.equal(await w.handle('env xterm'), true);
  assert.match(said[0].t, /in the project of proj\/lib\/a\.ex/);
  assert.deepEqual(said[0].ref, { kind: 'panel', id: 'x1' });
  const none = harness({ pathNow: () => '' });
  assert.equal(await none.w.handle('env xterm'), false);
  assert.match(none.said[0].t, /^! env xterm ── no file here/);
});

test('wire: env show asks GET /env with the path; env reload POSTs, with or without one', async () => {
  const { w, said, asked } = harness();
  assert.equal(await w.handle('env show ./mix.exs'), true);
  assert.deepEqual(asked[0], { u: 'http://127.0.0.1:4100/env?path=proj%2Fmix.exs', method: 'GET' });
  assert.match(said[1].t, /proj\/mix\.exs: \/r\/proj by flake\.nix \(nix\) ── asked now/);
  assert.equal(await w.handle('env reload'), true);
  assert.deepEqual(asked[1], { u: 'http://127.0.0.1:4100/env/reload', method: 'POST' });
  assert.match(said[2].t, /every project: thrown away \(\/r\/proj\)/);
});

test('wire: the relay not known yet, or refusing, is said as an error', async () => {
  const early = harness({ base: () => null });
  assert.equal(await early.w.handle('env show'), false);
  assert.match(early.said[0].t, /^! env show ── the relay is not known yet/);
  const refused = harness({ fetch: () => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: 'x does not exist' }) }) });
  assert.equal(await refused.w.handle('env reload x'), false);
  assert.match(refused.said[0].t, /^! env reload ── x does not exist/);
});
