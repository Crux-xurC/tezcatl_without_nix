// lib/core/store.js -- the kept JSON files under ~work/store, through a fake /fs.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { create, fileOf } = require('../lib/core/store.js');

function sha(t) { return 'sha256:' + crypto.createHash('sha256').update(t, 'utf8').digest('hex'); }

// a fake relay: files by path; PUT checks x-tezcatl-base as /fs/write does
function fakeFs(files = {}) {
  const log = [];
  const fetch = async (u, o = {}) => {
    const url = new URL(u);
    const path = url.searchParams.get('path');
    log.push([o.method || 'GET', url.pathname, path]);
    if (url.pathname === '/fs/read') {
      if (!(path in files)) return { ok: false, status: 404 };
      if (files[path] === Symbol.for('broken')) return { ok: false, status: 500 };
      return { ok: true, status: 200, text: async () => files[path] };
    }
    const b = o.headers['x-tezcatl-base'];
    if (b) {
      const now = path in files ? sha(files[path]) : 'absent';
      if (b !== now) return { ok: false, status: 409 };
    }
    files[path] = o.body;
    return { ok: true, status: 200 };
  };
  return { files, log, fetch };
}

function storeOn(fs) { return create({ fetch: fs.fetch, base: async () => 'http://127.0.0.1:4100' }); }

test('fileOf: the key without tezcatl:, : and the rest as -', () => {
  assert.equal(fileOf('tezcatl:frame:skins'), '~work/store/frame-skins.json');
  assert.equal(fileOf('tezcatl:panes:a b/c'), '~work/store/panes-a-b-c.json');
});

test('load / get: a missing file is null; a read file is kept', async () => {
  const fs = fakeFs({ '~work/store/bookmarks.json': '[{"path":"a"}]' });
  const st = storeOn(fs);
  assert.equal(st.get('tezcatl:bookmarks'), null);
  assert.deepEqual(await st.load('tezcatl:bookmarks'), [{ path: 'a' }]);
  assert.deepEqual(st.get('tezcatl:bookmarks'), [{ path: 'a' }]);
  assert.equal(await st.load('tezcatl:killring'), null);
});

test('set writes the JSON; get sees it at once', async () => {
  const fs = fakeFs();
  const st = storeOn(fs);
  const w = st.set('tezcatl:killring', [{ text: 'x' }]);
  assert.deepEqual(st.get('tezcatl:killring'), [{ text: 'x' }]);
  assert.equal((await w).ok, true);
  assert.deepEqual(JSON.parse(fs.files['~work/store/killring.json']), [{ text: 'x' }]);
});

test('update: read, change, write -- made again when another window wrote meanwhile', async () => {
  const fs = fakeFs({ '~work/store/frame-skins.json': '{"a":1}' });
  let once = true;
  const other = fs.fetch;
  fs.fetch = async (u, o = {}) => {
    if (o.method === 'PUT' && once) { once = false; fs.files['~work/store/frame-skins.json'] = '{"a":1,"b":2}'; }
    return other(u, o);
  };
  const st2 = create({ fetch: (u, o) => fs.fetch(u, o), base: async () => 'http://127.0.0.1:4100' });
  const w = await st2.update('tezcatl:frame:skins', (m) => Object.assign({}, m, { c: 3 }));
  assert.equal(w.ok, true);
  assert.deepEqual(JSON.parse(fs.files['~work/store/frame-skins.json']), { a: 1, b: 2, c: 3 });
  assert.deepEqual(st2.get('tezcatl:frame:skins'), { a: 1, b: 2, c: 3 });
});

test('update: a new file is written against "absent"; undefined writes nothing', async () => {
  const fs = fakeFs();
  const st = storeOn(fs);
  assert.equal((await st.update('tezcatl:matrix:colors', () => ({ r: { k: 'b' } }))).ok, true);
  assert.deepEqual(JSON.parse(fs.files['~work/store/matrix-colors.json']), { r: { k: 'b' } });
  const n = fs.log.length;
  assert.equal((await st.update('tezcatl:matrix:colors', () => undefined)).ok, true);
  assert.equal(fs.log.filter((l) => l[0] === 'PUT').length, fs.log.slice(0, n).filter((l) => l[0] === 'PUT').length);
});

test('update: an unreadable file is not written over', async () => {
  const fs = fakeFs({ '~work/store/bookmarks.json': 'not json' });
  const st = storeOn(fs);
  const w = await st.update('tezcatl:bookmarks', () => []);
  assert.equal(w.ok, false);
  assert.match(w.message, /not written/);
  assert.equal(fs.files['~work/store/bookmarks.json'], 'not json');
});

test('no relay: reads are null, writes say so', async () => {
  const st = create({ fetch: async () => { throw new Error('no'); }, base: async () => null });
  assert.equal(await st.load('tezcatl:bookmarks'), null);
  assert.equal((await st.set('tezcatl:bookmarks', [])).ok, false);
});
