'use strict';
// lib/skin/lsp-commands.js: the `lsp ...` lines of a skin's input form
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/skin/lsp-commands.js');
const R = require('../lib/skin/recv-refs.js');

const S = [
  { key: 'k1', root: '/home/u/proj/app', serverId: 'typescript', status: 'running', consumers: 2, docs: 3, pid: 41 },
  { key: 'k2', root: '/p', serverId: 'nil', status: 'running', consumers: 1, docs: 1, pid: null },
];

test('parse: list / stop / timeout / restart; another line is not ours', () => {
  assert.equal(L.parse('skin add 1 tree'), null);
  assert.equal(L.parse(':LspDef'), null);
  assert.deepEqual(L.parse('lsp list'), { cmd: 'list' });
  assert.deepEqual(L.parse(' lsp  restart '), { cmd: 'restart' });
  assert.match(L.parse('lsp list all').error, /takes nothing/);
  assert.deepEqual(L.parse('lsp stop 2'), { cmd: 'stop', n: 2 });
  assert.deepEqual(L.parse('lsp stop typescript'), { cmd: 'stop', name: 'typescript' });
  assert.match(L.parse('lsp stop').error, /name or number/);
  assert.deepEqual(L.parse('lsp timeout 10000'), { cmd: 'timeout', ms: 10000, max: null });
  assert.deepEqual(L.parse('lsp timeout 10000 120000'), { cmd: 'timeout', ms: 10000, max: 120000 });
  ['lsp timeout', 'lsp timeout 0', 'lsp timeout fast', 'lsp timeout 10 x', 'lsp timeout 1 2 3'].forEach((l) => assert.match(L.parse(l).error, /lsp timeout <ms>/));
  assert.match(L.parse('lsp timeout 5000 1000').error, /under the wait/);
  assert.equal(L.parse('lsp').error, L.USAGE);
  assert.equal(L.parse('lsp nothing').error, L.USAGE);
});

test('lines: one numbered line a server; pick: by name, one only', () => {
  assert.deepEqual(L.lines(S), [
    '1  typescript  …/u/proj/app  running · 2 panes · 3 docs · pid 41',
    '2  nil  /p  running · 1 pane · 1 doc',
  ]);
  assert.deepEqual(L.lines([]), []);
  assert.equal(L.pick(S, 'nil').server, S[1]);
  assert.match(L.pick(S, 'ocaml').error, /no language server called ocaml/);
  assert.match(L.pick(S.concat([Object.assign({}, S[1], { key: 'k3', root: '/q' })]), 'nil').error, /2 servers are called nil/);
});

// a page: the relay (fetch), the bus and two code_editor
function page(over) {
  const said = [];
  const posts = [];
  const refs = R.create();
  const calls = [];
  let list = S.slice();
  const here = {};
  const h = Object.assign({
    bus: {
      on: (type, fn) => { here[type] = fn; return () => { delete here[type]; }; },
      post: (type, payload, opts) => {
        posts.push([type, payload, opts && opts.to]);
        if (type === 'code.query' && here['code.here']) here['code.here']({ req: payload.req, lsp: over && over.lsp === null ? null : { key: 'k1', serverId: 'typescript' } }, { from: { name: 'c1' } });
      },
    },
    base: () => 'http://relay',
    recv: (text, cls, ref) => { said.push(text); refs.add(ref); },
    item: (n) => refs.item('lsp', n),
    codes: () => [{ id: 'c1', bus: 'b1', place: '21' }, { id: 'c2', bus: 'b2', place: '22' }],
    codeNow: () => 'c1',
    setTimeout: () => 0,
    fetch: (u, o) => {
      calls.push([(o && o.method) || 'GET', u]);
      if (o && o.method === 'DELETE') {
        const key = decodeURIComponent(u.split('/').pop());
        const was = list.some((s) => s.key === key);
        list = list.filter((s) => s.key !== key);
        return Promise.resolve({ ok: was, status: was ? 200 : 404, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ servers: list }) });
    },
  }, over || {});
  return { w: L.wire(h), said, posts, calls, refs };
}

test('lsp list, then lsp stop <number>: the number is the list\'s, not read from its text', async () => {
  const p = page();
  assert.equal(p.w.handle('skin focus 2 1'), false);
  assert.equal(await p.w.handle('lsp stop 1'), false);
  assert.match(p.said.pop(), /^! lsp stop ── no lsp list yet/);
  assert.equal(await p.w.handle('lsp list'), true);
  assert.equal(p.said.pop(), 'lsp list ── 2 running (lsp stop <number>)\n' + L.lines(S).join('\n'));
  assert.equal(await p.w.handle('lsp stop 2'), true);
  assert.equal(p.said.pop(), 'lsp stop ── stopped nil /p ── 1 pane was on it: :Reconnect connects again');
  assert.deepEqual(p.calls.pop(), ['DELETE', 'http://relay/lsp/servers/k2']);
  assert.equal(await p.w.handle('lsp stop 2'), false);
  assert.match(p.said.pop(), /nil \/p is not running any more/);
  assert.equal(await p.w.handle('lsp stop 3'), false);
  assert.match(p.said.pop(), /no 3 in the last lsp list/);
});

test('lsp stop <name>; none running', async () => {
  const p = page();
  assert.equal(await p.w.handle('lsp stop typescript'), true);
  assert.match(p.said.pop(), /stopped typescript …\/u\/proj\/app ── 2 panes were on it/);
  assert.equal(await p.w.handle('lsp stop typescript'), false);
  assert.match(p.said.pop(), /no language server called typescript/);
  await p.w.handle('lsp stop nil');
  await p.w.handle('lsp list');
  assert.equal(p.said.pop(), 'lsp list ── none running');
  assert.equal(await p.w.handle('lsp stop 1'), false);
  assert.match(p.said.pop(), /the last lsp list is empty/);
});

test('lsp timeout: code.configure to each code_editor here, and to one added later', async () => {
  const p = page();
  p.w.configure('b9');
  assert.deepEqual(p.posts, []);
  assert.equal(await p.w.handle('lsp timeout 10000'), true);
  assert.deepEqual(p.posts, [['code.configure', { lsp: { timeoutMs: 10000 } }, 'b1'], ['code.configure', { lsp: { timeoutMs: 10000 } }, 'b2']]);
  assert.match(p.said.pop(), /^lsp timeout ── 10 s for the 2 code_editor here/);
  await p.w.handle('lsp timeout 5000 60000');
  assert.match(p.said.pop(), /5 s \(asked again up to 60 s\)/);
  p.w.configure('b3');
  assert.deepEqual(p.posts.pop(), ['code.configure', { lsp: { timeoutMs: 5000, maxTimeoutMs: 60000 } }, 'b3']);
});

test('lsp restart: the server of the code_editor meant now is stopped, then :Reconnect to it', async () => {
  const p = page();
  assert.equal(await p.w.handle('lsp restart'), true);
  assert.deepEqual(p.calls.filter((c) => c[0] === 'DELETE'), [['DELETE', 'http://relay/lsp/servers/k1']]);
  assert.deepEqual(p.posts.pop(), ['code.file', { op: 'reconnect', arg: '', bang: false }, 'b1']);
  assert.equal(p.said.pop(), 'lsp restart ── stopped typescript …/u/proj/app ── 1 other pane was on it: :Reconnect connects again; :Reconnect to the code_editor at 21 (the result is in its head)');
  assert.deepEqual(p.refs.last(), { kind: 'panel', id: 'c1' });
  // it is gone now: only the :Reconnect
  assert.equal(await p.w.handle('lsp restart'), true);
  assert.match(p.said.pop(), /typescript is not running any more; :Reconnect to the code_editor at 21/);
});

test('lsp restart: not attached -> only :Reconnect; no code_editor -> said; the relay down -> said', async () => {
  const p = page({ lsp: null });
  assert.equal(await p.w.handle('lsp restart'), true);
  assert.match(p.said.pop(), /not attached to a language server \(nothing to stop\); :Reconnect to the code_editor at 21/);
  assert.deepEqual(p.calls, []);
  const q = page({ codeNow: () => null });
  assert.equal(await q.w.handle('lsp restart'), false);
  assert.match(q.said.pop(), /there is no code_editor here/);
  const r = page({ fetch: () => Promise.reject(new Error('Failed to fetch')) });
  assert.equal(await r.w.handle('lsp list'), false);
  assert.equal(r.said.pop(), '! lsp list ── Failed to fetch');
});
