'use strict';
// lib/xipe/xipe-place.js: a Xipe Totec path (from the project's root) as a path from the FS root
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/xipe/xipe-place.js');

test('toFs: the project under the FS root -> the path from the FS root', () => {
  assert.equal(P.toFs('/home/t/my_app', '/home/t/my_app/calc', 'lib/calc.ex'), 'calc/lib/calc.ex');
  assert.equal(P.toFs('/home/t/my_app/', '/home/t/my_app/calc/', 'calc.exs'), 'calc/calc.exs');
  // the project is the FS root itself
  assert.equal(P.toFs('/home/t/my_app', '/home/t/my_app', 'a/b.ml'), 'a/b.ml');
  assert.equal(P.toFs('/', '/srv/p', 'x.hs'), 'srv/p/x.hs');
  assert.equal(P.toFs('/home/t/my_app', '/home/t/my_app/calc', './lib/../lib/calc.ex'), 'calc/lib/calc.ex');
});

test('toFs: outside the FS root, or something missing -> null (never a guess)', () => {
  assert.equal(P.toFs('/home/t/my_app', '/home/t/other', 'lib/calc.ex'), null);
  // a name that only starts the same is another directory
  assert.equal(P.toFs('/home/t/my_app', '/home/t/my_app2', 'a.ex'), null);
  assert.equal(P.toFs('/home/t/my_app/calc', '/home/t/my_app', 'a.ex'), null);
  assert.equal(P.toFs('/home/t/my_app', '/home/t/my_app/calc', '../../../etc/passwd'), null);
  assert.equal(P.toFs('/home/t/my_app', '/home/t/my_app/calc', '/abs.ex'), null);
  assert.equal(P.toFs(null, '/p', 'a.ex'), null);
  assert.equal(P.toFs('/r', null, 'a.ex'), null);
  assert.equal(P.toFs('/r', '/r/p', ''), null);
  assert.equal(P.toFs('relative', '/r/p', 'a.ex'), null);
});

test('resolver: says once why no path can be opened', () => {
  const ok = P.resolver('/r', '/r/p');
  assert.equal(ok.why, null);
  assert.equal(ok.place('lib/a.ex'), 'p/lib/a.ex');
  const out = P.resolver('/r', '/elsewhere/p');
  assert.match(out.why, /the project \(\/elsewhere\/p\) is outside the FS root \(\/r\)/);
  assert.equal(out.place('lib/a.ex'), null);
  assert.match(P.resolver('/r', null).why, /did not say where its project is/);
  assert.match(P.resolver(null, '/r/p').why, /did not say where the FS root is/);
});

test('fsRoot: GET /fs of the relay named in config.json; any failure is null', async () => {
  const config = { load: async () => ({ connections: [{ url: 'ws://127.0.0.1:4100/' }] }) };
  let asked = null;
  const ok = await P.fsRoot(config, async (url) => { asked = url; return { ok: true, json: async () => ({ root: '/home/t/my_app', entries: [] }) }; });
  assert.equal(ok, '/home/t/my_app');
  assert.equal(asked, 'http://127.0.0.1:4100/fs?path=');
  assert.equal(await P.fsRoot(config, async () => ({ ok: false })), null);
  assert.equal(await P.fsRoot(config, async () => { throw new Error('down'); }), null);
  assert.equal(await P.fsRoot({ load: async () => ({}) }, async () => ({ ok: true, json: async () => ({ root: '/x' }) })), null);
});
