'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const kinds = require('../lib/list/list-kinds.js');
// a fetch answer: json() and text() (kinds.readDoc reads the text)
const res = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o) });

test('panels_and_skins.fill: maps manifest items, marks skins', () => {
  const cfg = {
    items: [
      { id: 'input', class: 'panel', page: 'panels/resident/input.html', name: true, desc: 'send UI' },
      { id: 'skin', class: 'skin', page: 'panels/skins/basic.html', name: false, desc: 'stub skin' },
    ],
  };
  const out = kinds.panels_and_skins.fill(cfg);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'input');
  assert.equal(out[0].label, 'input');
  assert.equal(out[0].sub, 'send UI');
  assert.equal(out[0].raw.page, 'panels/resident/input.html');
  assert.equal(out[1].label, 'skin  (skin)');
});

test('panels_and_skins.fill: tolerates a missing/empty items array', () => {
  assert.deepEqual(kinds.panels_and_skins.fill({}), []);
  assert.deepEqual(kinds.panels_and_skins.fill({ items: null }), []);
  assert.deepEqual(kinds.panels_and_skins.fill(undefined), []);
});

test('panels_and_skins.onSelect: opens (default mode) + mirrors via launcher.fill', () => {
  const posted = [];
  const logged = [];
  const api = { bus: { post: (t, p) => posted.push([t, p]) }, log: (s) => logged.push(s) };
  kinds.panels_and_skins.onSelect(
    { id: 'code', raw: { id: 'code', page: 'panels/resident/code.html', name: true } },
    {}, api);
  assert.deepEqual(posted, [['launcher.fill', { id: 'code' }]]);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /code {2}\(tab\)$/);
});

test('panels_and_skins.onKey: chord -> that mode; unknown chord -> no-op', () => {
  const posted = [];
  const api = { bus: { post: (t, p) => posted.push([t, p]) }, log: () => {} };
  const item = { raw: { id: 'xterm', page: 'panels/resident/xterm.html', name: false } };
  kinds.panels_and_skins.onKey('M-w', item, { keys: { 'M-t': 'tab', 'M-w': 'window' } }, api);
  assert.deepEqual(posted, [['launcher.fill', { id: 'xterm' }]]);
  posted.length = 0;
  kinds.panels_and_skins.onKey('M-x', item, { keys: { 'M-t': 'tab', 'M-w': 'window' } }, api);
  assert.deepEqual(posted, []);
});

function fakeBus() {
  const listeners = {};
  const posted = [];
  return {
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => {}; },
    post(type, payload, opts) {
      posted.push([type, payload, opts]);
      (listeners[type] || []).forEach((fn) => fn(payload, {}));
    },
    posted,
  };
}
const KR_KEYS = { keys: { p: 'keep', P: 'pop' } };

test('killring.fill: maps ring entries (whitespace-collapsed label, raw kept)', async () => {
  const api = { bus: fakeBus(), log() {} };
  const p = kinds.killring.fill({}, api);
  api.bus.post('killring.list', {
    items: [
      { id: 'k1', text: '  hello   world\n', source: 'code' },
      { id: 'k2', text: 'x'.repeat(200) },
    ],
  });
  const items = await p;
  assert.equal(items.length, 2);
  assert.equal(items[0].label, 'hello world');
  assert.equal(items[0].raw.id, 'k1');
  assert.ok(items[0].sub.includes('<code>'));
  assert.ok(items[1].label.endsWith('…'));
});

test('killring.fill: resolves [] if no killring.list arrives (timeout)', async () => {
  const api = { bus: fakeBus(), log() {} };
  assert.deepEqual(await kinds.killring.fill({}, api), []);
});

test('killring onKey P: origin=code -> killring.yank(to frame) + remove + done', () => {
  const api = { bus: fakeBus(), log() {} };
  kinds.killring.fill({}, api);
  api.bus.post('killring.origin', { id: 'frame-7', kind: 'code' });
  const item = { raw: { id: 'k1', text: 'line one\n' } };
  kinds.killring.onKey('P', item, KR_KEYS, api);

  const yank = api.bus.posted.find((x) => x[0] === 'killring.yank');
  assert.ok(yank, 'posts killring.yank');
  assert.deepEqual(yank[1], { text: 'line one\n', pop: true });
  assert.deepEqual(yank[2], { to: 'frame-7' });
  assert.ok(api.bus.posted.some((x) => x[0] === 'killring.remove'), 'pop removes');
  assert.ok(api.bus.posted.some((x) => x[0] === 'killring.done'), 'always done');
});

test('killring onKey p: origin=xterm -> no killring.yank, no remove, still done', () => {
  const api = { bus: fakeBus(), log() {} };
  kinds.killring.fill({}, api);
  api.bus.post('killring.origin', { id: 'frame-x', kind: 'xterm' });
  kinds.killring.onKey('p', { raw: { id: 'k9', text: 'ls -la' } }, KR_KEYS, api);
  assert.ok(!api.bus.posted.some((x) => x[0] === 'killring.yank'));
  assert.ok(!api.bus.posted.some((x) => x[0] === 'killring.remove'));
  assert.ok(api.bus.posted.some((x) => x[0] === 'killring.done'));
});

test('killring.remove: posts killring.remove with the id', () => {
  const api = { bus: fakeBus(), log() {} };
  kinds.killring.remove({ raw: { id: 'k3' } }, {}, api);
  assert.deepEqual(api.bus.posted[0], ['killring.remove', { id: 'k3' }, undefined]);
});


test('bookmarks._route: dir -> bookmark.goto, file -> code.open, junk -> null', () => {
  assert.deepEqual(kinds.bookmarks._route({ raw: { path: 'a/b', dir: true } }),
    { type: 'bookmark.goto', payload: { path: 'a/b' } });
  assert.deepEqual(kinds.bookmarks._route({ raw: { path: 'a/x.el', dir: false } }),
    { type: 'code.open', payload: { path: 'a/x.el' } });
  assert.equal(kinds.bookmarks._route({ raw: {} }), null);
  assert.equal(kinds.bookmarks._route(null), null);
});

test('bookmarks.order: dirs first, then by label', () => {
  const items = [
    { dir: false, label: '  z.el' }, { dir: true, label: '▸ b' },
    { dir: false, label: '  a.el' }, { dir: true, label: '▸ a' },
  ];
  const out = kinds.bookmarks.order(items);
  assert.deepEqual(out.map((i) => i.label), ['▸ a', '▸ b', '  a.el', '  z.el']);
});

test('bookmarks.onSelect: posts the routed message + bookmark.done', () => {
  const api = { bus: fakeBus(), log() {} };
  kinds.bookmarks.onSelect({ raw: { path: 'lib', dir: true } }, {}, api);
  assert.deepEqual(api.bus.posted[0], ['bookmark.goto', { path: 'lib' }, undefined]);
  assert.ok(api.bus.posted.some((x) => x[0] === 'bookmark.done'));
});

test('bookmarks.subscribe: re-fills on bookmark.changed (read again from the store)', async () => {
  const api = { bus: fakeBus(), log() {} };
  let calls = 0;
  kinds.bookmarks.subscribe({}, api, () => { calls += 1; });
  api.bus.post('bookmark.changed', {});
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls, 1);
});


test('killring onKey p: origin=xterm -> insert to that frame (+ done)', () => {
  const api = { bus: fakeBus(), log() {} };
  kinds.killring.fill({}, api);
  api.bus.post('killring.origin', { id: 'frame-x', kind: 'xterm' });
  kinds.killring.onKey('p', { raw: { id: 'k9', text: 'ls -la' } }, KR_KEYS, api);
  assert.deepEqual(
    api.bus.posted.find((x) => x[0] === 'insert'),
    ['insert', { text: 'ls -la' }, { to: 'frame-x' }],
  );
  assert.ok(!api.bus.posted.some((x) => x[0] === 'killring.yank'));
  assert.ok(api.bus.posted.some((x) => x[0] === 'killring.done'));
});

test('lsp.fill: no relay url -> []', async () => {
  assert.deepEqual(await kinds.lsp.fill({}, { windowsUrl: null }), []);
});

test('lsp.fill: GET /lsp/servers rows -> {id,label,sub}', async () => {
  const real = global.fetch;
  global.fetch = async (url) => {
    assert.match(url, /\/lsp\/servers$/);
    return {
      ok: true,
      json: async () => ({
        servers: [{
          key: 'KEY', root: '/a/b/c/proj', serverId: 'javascript',
          status: 'ready', consumers: 2, docs: 1, pid: 42,
        }],
      }),
    };
  };
  try {
    const items = await kinds.lsp.fill({}, { windowsUrl: 'http://127.0.0.1:4100/windows' });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'KEY');
    assert.match(items[0].label, /javascript/);
    assert.match(items[0].sub, /ready/);
    assert.match(items[0].sub, /2 panes/);
    assert.match(items[0].sub, /1 doc\b/);
    assert.match(items[0].sub, /pid 42/);
  } finally { global.fetch = real; }
});

// task_list (D-task-list): an in-memory /fs -- the list and its book -- and the id list
function taskEnv(files) {
  const real = global.fetch;
  const puts = [];
  const sha = async (t) => 'sha256:' + Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('hex');
  global.fetch = async (url, opts) => {
    const u = new URL(url);
    const path = u.searchParams.get('path');
    if (u.pathname === '/ids/take') return { ok: true, status: 200, json: async () => ({ ok: true, ids: ['newid001'] }) };
    if (opts && opts.method === 'PUT') {
      const have = files[path];
      const base = opts.headers['x-tezcatl-base'];
      if (base && (have == null ? base !== 'absent' : base !== await sha(have))) return { ok: false, status: 409, text: async () => '' };
      files[path] = opts.body;
      puts.push(path);
      return res({ ok: true });
    }
    if (files[path] == null) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => files[path] };
  };
  return { puts, restore: () => { global.fetch = real; } };
}
const TL_BOOK = { name: 'a', path: 'n.md', columns: ['id', 'state', 'pri', 'task', 'inner_id'],
  rows: [['t-01', 'TODO', 'A', 'one', 'aaaa0001'], ['t-02', 'TODO', '', 'two', 'aaaa0002'], ['t-02-01', 'TODO', '', 'under', 'aaaa0003']] };
const TL_LIST = { source: 'a', book: '~work/books/a.json', path: 'n.md', columns: TL_BOOK.columns, rows: [TL_BOOK.rows[1], TL_BOOK.rows[0]] };
const TL_CFG = { keys: { t: 'cycle', d: 'done', x: 'cancel', 'M-n': 'new' } };
function tlFiles() { return { '~work/books/task_list.json': JSON.stringify(TL_LIST), '~work/books/a.json': JSON.stringify(TL_BOOK) }; }

test('task_list.fill: the list in its order, a line each: state [#pri] task, no', async () => {
  const env = taskEnv(tlFiles());
  try {
    const items = await kinds.task_list.fill(TL_CFG, { fsBase: 'http://x' });
    assert.deepEqual(items.map((i) => [i.id, i.label, i.sub]), [['aaaa0002', 'TODO two', 't-02'], ['aaaa0001', 'TODO [#A] one', 't-01']]);
  } finally { env.restore(); }
  const none = taskEnv({});
  const logs = [];
  try {
    assert.deepEqual(await kinds.task_list.fill(TL_CFG, { fsBase: 'http://x', log: (m) => logs.push(m) }), []);
    assert.match(logs[0], /no task list yet/);
  } finally { none.restore(); }
});

test('task_list d: DONE in the list and in the book, every row under it too; t cycles; x cancels', async () => {
  const files = tlFiles();
  const posted = [];
  const env = taskEnv(files);
  const api = { fsBase: 'http://x', log() {}, bus: { post: (t, p) => posted.push([t, p]) } };
  try {
    await kinds.task_list.onKey('d', { raw: { id: 'aaaa0002' } }, TL_CFG, api);
    assert.deepEqual(JSON.parse(files['~work/books/a.json']).rows.map((r) => r[1]), ['TODO', 'DONE', 'DONE']);
    assert.deepEqual(JSON.parse(files['~work/books/task_list.json']).rows.map((r) => r[1]), ['DONE', 'TODO']);
    assert.deepEqual(posted[0], ['fs.changed', { op: 'write', paths: ['~work/books/a.json'] }]);
    await kinds.task_list.onKey('t', { raw: { id: 'aaaa0001' } }, TL_CFG, api);
    assert.equal(JSON.parse(files['~work/books/a.json']).rows[0][1], 'NEXT');
    await kinds.task_list.onKey('x', { raw: { id: 'aaaa0001' } }, TL_CFG, api);
    assert.equal(JSON.parse(files['~work/books/task_list.json']).rows[1][1], 'CANCELLED');
  } finally { env.restore(); }
});

test('task_list M-n: a new top-level task with an id, in both; Del: out of the list only', async () => {
  const files = tlFiles();
  const env = taskEnv(files);
  const api = { fsBase: 'http://x', log() {} };
  try {
    await kinds.task_list.onKey('M-n', null, TL_CFG, api, ' 資料を作る ');
    assert.deepEqual(JSON.parse(files['~work/books/a.json']).rows[3], ['t-03', 'TODO', '', '資料を作る', 'newid001']);
    assert.equal(JSON.parse(files['~work/books/task_list.json']).rows[2][4], 'newid001');
    await kinds.task_list.remove({ raw: { id: 'aaaa0001' } }, TL_CFG, api);
    assert.deepEqual(JSON.parse(files['~work/books/task_list.json']).rows.map((r) => r[4]), ['aaaa0002', 'newid001']);
    assert.equal(JSON.parse(files['~work/books/a.json']).rows.length, 4);
  } finally { env.restore(); }
});

test('task_list: a book that cannot be read is never written; the list stays as it was', async () => {
  const files = tlFiles();
  files['~work/books/a.json'] = '{ broken';
  const env = taskEnv(files);
  const logs = [];
  try {
    const w = await kinds.task_list.onKey('d', { raw: { id: 'aaaa0002' } }, TL_CFG, { fsBase: 'http://x', log: (m) => logs.push(m) });
    assert.equal(w.ok, false);
    assert.deepEqual(env.puts, []);
    assert.match(logs.pop(), /cannot be read/);
  } finally { env.restore(); }
});

test('xipe_cards: card/list\'s cards become items -- label, place · effect · rows, the address as the ref, where to open', () => {
  const place = (p) => 'proj/' + p;
  const items = kinds.xipe_cards._toItems([
    { id: 'n1', label: 'Calc.add/2', module: 'Calc', name: 'add', anykey: 2, effect: 'pure', visibility: 'public', path: 'lib/calc.ex', line: 4, rows: 1 },
    { id: 'n2', label: 'Calc.helper/1', module: 'Calc', name: 'helper', anykey: 1, effect: null, visibility: 'private', path: 'lib/calc.ex', line: null, rows: 0 },
    { id: 'n3', label: 'Main.go', module: 'Main', name: 'go', anykey: null, path: null, line: null, rows: 2 },
  ], place);
  assert.deepEqual(items.map((i) => [i.id, i.label, i.sub]), [
    ['n1', 'Calc.add/2', 'lib/calc.ex:4 · pure · 1 row'],
    ['n2', 'Calc.helper/1', 'lib/calc.ex · unknown · 0 rows · private'],
    ['n3', 'Main.go', '(no file) · unknown · 2 rows'],
  ]);
  assert.equal(items[0].raw.ref, 'module=Calc&name=add&arity=2');
  assert.equal(items[2].raw.ref, 'module=Main&name=go');
  assert.equal(items[0].raw.kind, 'xipe');
  assert.deepEqual(items[0].raw.open, { path: 'proj/lib/calc.ex', line: 4 });
  assert.deepEqual(items[1].raw.open, { path: 'proj/lib/calc.ex', line: 1 });
  assert.equal(items[2].raw.open, null);
  // no way to place a path (the project is outside the FS root): nothing to open
  assert.equal(kinds.xipe_cards._toItems([{ id: 'n1', name: 'f', path: 'a.ex', line: 1 }], () => null)[0].raw.open, null);
  assert.deepEqual(kinds.xipe_cards._toItems(null), []);
});

test('xipe_cards.onKey: the key bound to "define" opens the definition, or says there is none', () => {
  const logs = [];
  const cfg = { keys: { 'M-d': 'define' } };
  kinds.xipe_cards.onKey('M-d', { label: 'Main.go', raw: { open: null } }, cfg, { log: (s) => logs.push(s) });
  assert.match(logs[0], /Main\.go has no place to open/);
  // a key bound to something else is not this kind's
  kinds.xipe_cards.onKey('x', { label: 'A', raw: { open: null } }, { keys: { x: 'other' } }, { log: (s) => logs.push(s) });
  assert.equal(logs.length, 1);
});

test('xipe_cards.onSelect: no ref on the item -> logs, never posts', () => {
  const api = { bus: fakeBus(), log() {} };
  kinds.xipe_cards.onSelect({ raw: {} }, {}, api);
  assert.deepEqual(api.bus.posted, []);
});

test('xipe_cards.onSelect: posts matrix.table.open with {reqId, kind, ref}; kind defaults to "xipe"', () => {
  const api = { bus: fakeBus(), log() {} };
  kinds.xipe_cards.onSelect({ raw: { ref: 'abc123' } }, {}, api);
  assert.equal(api.bus.posted.length, 1);
  const [type, payload] = api.bus.posted[0];
  assert.equal(type, 'matrix.table.open');
  assert.equal(payload.kind, 'xipe');
  assert.equal(payload.ref, 'abc123');
  assert.ok(payload.reqId);
});

test('xipe_cards._openMatrix: claimed within the window -> no popup-blocked log', async () => {
  const api = { bus: fakeBus(), log() {} };
  const logs = [];
  api.log = (s) => logs.push(s);
  api.bus.on('matrix.table.open', (payload) => {
    api.bus.post('matrix.table.opened', { reqId: payload.reqId });
  });
  kinds.xipe_cards._openMatrix('xipe', 'abc123', api);
  await new Promise((r) => setTimeout(r, 260));
  assert.deepEqual(logs, []);
});

test('xipe_cards._openMatrix: unclaimed -> falls through to root.open (blocked in this env, logs it)', async () => {
  const api = { bus: fakeBus(), log() {} };
  const logs = [];
  api.log = (s) => logs.push(s);
  kinds.xipe_cards._openMatrix('xipe', 'abc123', api);
  await new Promise((r) => setTimeout(r, 260));
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^popup blocked: abc123$/);
});

test('lsp.remove: DELETE /lsp/servers/:key', async () => {
  const real = global.fetch;
  let seen = null;
  global.fetch = async (url, opts) => {
    seen = { url, method: opts && opts.method };
    return res({ stopped: true });
  };
  const log = [];
  try {
    await kinds.lsp.remove(
      { raw: { key: 'KEY', serverId: 'javascript' } },
      {},
      { windowsUrl: 'http://x/windows', log: (s) => log.push(s) },
    );
    assert.equal(seen.method, 'DELETE');
    assert.match(seen.url, /\/lsp\/servers\/KEY$/);
    assert.match(log.join(''), /stopped javascript/);
  } finally { global.fetch = real; }
});

// ---- dict (generic dictionary) ----------------------------------------------

function fakeDictEnv(initialDoc, killItems) {
  const files = new Map();
  if (initialDoc) files.set('dict.json', JSON.stringify(initialDoc));
  const posts = [];
  const listeners = {};
  const bus = {
    post(type, payload) {
      posts.push({ type, payload });
      if (type === 'killring.query') (listeners['killring.list'] || []).slice().forEach((fn) => fn({ items: killItems || [] }));
    },
    on(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
      return () => { listeners[type] = listeners[type].filter((f) => f !== fn); };
    },
  };
  const logs = [];
  const prevFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const u = new URL(url);
    const path = u.searchParams.get('path');
    if (u.pathname === '/fs/write') { files.set(path, opts.body); return res({}); }
    if (!files.has(path)) return { ok: false, status: 404, json: async () => ({}), text: async () => 'no such file' };
    return { ok: true, status: 200, json: async () => JSON.parse(files.get(path)), text: async () => files.get(path) };
  };
  const api = { bus, fsBase: 'http://127.0.0.1:4100', log: (s) => logs.push(s), params: new URLSearchParams('list=xipe') };
  return { files, posts, logs, api, restore: () => { global.fetch = prevFetch; } };
}

const dictCfg = { kind: 'dict', dataFile: 'dict.json', list: 'default', keys: { p: 'store', 'M-a': 'add' } };

test('dict: ?list= picks the list, fill publishes dict.entries for the skin', async () => {
  const env = fakeDictEnv({ lists: { xipe: [{ word: 'row/add', note: '作る' }], default: [{ word: 'zzz' }] } });
  try {
    const items = await kinds.dict.fill(dictCfg, env.api);
    assert.deepEqual(items.map((i) => [i.label, i.sub]), [['row/add', '作る']]);
    const pub = env.posts.filter((p) => p.type === 'dict.entries').pop();
    assert.deepEqual(pub.payload, { list: 'xipe', entries: [{ word: 'row/add', note: '作る' }] });
    assert.equal(kinds.dict._listName(dictCfg, { params: new URLSearchParams('') }), 'default');
  } finally { env.restore(); }
});

test('dict: p stores the newest kill-ring entry, one word per line (before the first ":")', async () => {
  const env = fakeDictEnv(null, [
    { id: 'k2', text: 'row/add: make a calc row\nrow/list: 一覧\n\nhelp' },
    { id: 'k1', text: 'older: ignored' },
  ]);
  try {
    await kinds.dict.onKey('p', null, dictCfg, env.api, '');
    const doc = JSON.parse(env.files.get('dict.json'));
    assert.deepEqual(doc.lists.xipe, [
      { word: 'row/add', note: 'make a calc row' },
      { word: 'row/list', note: '一覧' },
      { word: 'help', note: '' },
    ]);
    assert.match(env.logs.pop(), /stored 3 in xipe/);
  } finally { env.restore(); }
});

test('dict: p with an empty kill ring writes nothing and says so', async () => {
  const env = fakeDictEnv(null, []);
  try {
    await kinds.dict.onKey('p', null, dictCfg, env.api, '');
    assert.equal(env.files.has('dict.json'), false);
    assert.match(env.logs.pop(), /the kill ring is empty/);
  } finally { env.restore(); }
});

test('dict: a adds the filter text; Del removes; Enter posts dict.pick', async () => {
  const env = fakeDictEnv({ lists: { xipe: [{ word: 'scan', note: '' }] } });
  try {
    await kinds.dict.onKey('M-a', null, dictCfg, env.api, 'eval/run: 評価する');
    let doc = JSON.parse(env.files.get('dict.json'));
    assert.deepEqual(doc.lists.xipe.map((e) => e.word), ['scan', 'eval/run']);
    await kinds.dict.remove(kinds.dict._toItem({ word: 'scan', note: '' }), dictCfg, env.api);
    doc = JSON.parse(env.files.get('dict.json'));
    assert.deepEqual(doc.lists.xipe.map((e) => e.word), ['eval/run']);
    kinds.dict.onSelect(kinds.dict._toItem({ word: 'eval/run', note: '' }), dictCfg, env.api);
    assert.deepEqual(env.posts.pop(), { type: 'dict.pick', payload: { list: 'xipe', word: 'eval/run' } });
  } finally { env.restore(); }
});

test('dict: a refused write says so instead of reporting the entries as stored', async () => {
  const env = fakeDictEnv({ lists: { xipe: [{ word: 'scan', note: '' }] } });
  const ok = global.fetch;
  global.fetch = async (url, opts) => (opts && opts.method === 'PUT') ? { ok: false, status: 403 } : ok(url, opts);
  try {
    await kinds.dict.onKey('M-a', null, dictCfg, env.api, 'eval/run: 評価する');
    assert.match(env.logs.pop(), /could not write \(HTTP 403\)/);
    assert.ok(!env.logs.some((l) => /stored/.test(l)));
    const r = await kinds.dict.remove(kinds.dict._toItem({ word: 'scan', note: '' }), dictCfg, env.api);
    assert.equal(r.ok, false);
    assert.match(env.logs.pop(), /HTTP 403/);
  } finally { env.restore(); }
});

// -- slots (the tree skin's projects; read-only) -------------------------------

const slotsCfg = { kind: 'slots', dataFile: 'tree.json' };

function fakeSlotsEnv(text, status, params) {
  const posts = [];
  const logs = [];
  const writes = [];
  const file = { text, status: status || 200 };
  const prevFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const u = new URL(url);
    assert.equal(u.searchParams.get('path'), 'tree.json');
    if (opts && opts.method) { writes.push(opts.body); file.text = opts.body; file.status = 200; return { ok: true, status: 200, json: async () => ({}) }; }
    return { ok: file.status === 200, status: file.status, text: async () => file.text };
  };
  const api = {
    bus: { post: (type, payload) => posts.push({ type, payload }), on: () => () => {} },
    fsBase: 'http://127.0.0.1:4100', log: (s) => logs.push(s), params: new URLSearchParams(params || ''),
  };
  return { posts, logs, writes, file, api, restore: () => { global.fetch = prevFetch; } };
}

test('slots._parse: sorted by order (file order on ties); bad entries counted, not kept', () => {
  const r = kinds.slots._parse(JSON.stringify({ slots: [
    { order: 3, tag: 'c', path: 'x/c' },
    { order: 1, tag: 'a', path: 'x/a' },
    { order: 'two', path: 'bad' },
    { order: 3, path: 'x/c2' },
    { order: 2, tag: 'b' },
  ] }));
  assert.deepEqual(r.slots.map((s) => [s.order, s.tag, s.path]), [[1, 'a', 'x/a'], [3, 'c', 'x/c'], [3, '', 'x/c2']]);
  assert.match(r.error, /2 slot\(s\)/);
  assert.match(kinds.slots._parse('{ "slots": [').error, /not readable as JSON/);
  assert.match(kinds.slots._parse('{"roots": []}').error, /"slots"/);
});

test('slots.fill: items "order  tag" with the path below; never writes', async () => {
  const env = fakeSlotsEnv(JSON.stringify({ slots: [{ order: 2, tag: '', path: 'b' }, { order: 1, tag: 'tz', path: 'tezcatl' }] }));
  try {
    const items = await kinds.slots.fill(slotsCfg, env.api);
    assert.deepEqual(items.map((i) => [i.label, i.sub]), [['1  tz', 'tezcatl'], ['2  ·', 'b']]);
    assert.deepEqual(env.writes, []);
  } finally { env.restore(); }
});

test('slots.fill: a missing file is an empty list, said in the foot', async () => {
  const env = fakeSlotsEnv('', 404);
  try {
    assert.deepEqual(await kinds.slots.fill(slotsCfg, env.api), []);
    assert.match(env.logs[0], /tree\.json does not exist yet/);
  } finally { env.restore(); }
});

test('slots.onSelect: tree.root {path, tag, tree=?tree}', () => {
  const env = fakeSlotsEnv('', 200, 'tree=tree-x1');
  try {
    kinds.slots.onSelect(kinds.slots._toItem({ order: 1, tag: 'tz', path: 'tezcatl' }), slotsCfg, env.api);
    assert.deepEqual(env.posts, [{ type: 'tree.root', payload: { path: 'tezcatl', tag: 'tz', tree: 'tree-x1' } }]);
  } finally { env.restore(); }
});

test('slots._tidy: sorted by order, numbered 1..n (gaps and ties gone)', () => {
  assert.deepEqual(kinds.slots._tidy([
    { order: 7, tag: 'c', path: 'c', at: 0 }, { order: 2, tag: 'a', path: 'a', at: 1 }, { order: 7, tag: 'd', path: 'd', at: 2 },
  ]), [{ order: 1, tag: 'a', path: 'a' }, { order: 2, tag: 'c', path: 'c' }, { order: 3, tag: 'd', path: 'd' }]);
});

test('slots._apply: add / del / order / tag / update, and what is refused', () => {
  const base = [{ order: 1, tag: 'a', path: 'a' }, { order: 2, tag: '', path: 'b' }, { order: 3, tag: '', path: 'c' }];
  const A = kinds.slots._apply;
  assert.deepEqual(A(base, 'add', { path: '/x/y/' }).slots.map((s) => [s.order, s.path]), [[1, 'a'], [2, 'b'], [3, 'c'], [4, 'x/y']]);
  assert.deepEqual(A(base, 'add', { path: '' }).slots[3].path, '');
  assert.deepEqual(kinds.slots._tidy(A(base, 'del', { n: '2' }).slots).map((s) => [s.order, s.path]), [[1, 'a'], [2, 'c']]);
  assert.deepEqual(kinds.slots._tidy(A(base, 'order', { a: 1, b: 3 }).slots).map((s) => s.path), ['c', 'b', 'a']);
  assert.equal(A(base, 'tag', { n: 2, tag: 'bee' }).slots[1].tag, 'bee');
  assert.deepEqual(A(base, 'update', {}).slots, base);
  assert.match(A(base, 'del', { n: 9 }).error, /no slot 9/);
  assert.match(A(base, 'order', { a: 1, b: 'x' }).error, /no slot x/);
  assert.match(A(base, 'add', {}).error, /no path/);
  assert.match(A(base, 'frob', {}).error, /frob/);
});

test('slots._act: writes the tidied file; update renumbers a hand-edited one; no write when nothing changes', async () => {
  const env = fakeSlotsEnv(JSON.stringify({ slots: [{ order: 5, tag: 'b', path: 'b' }, { order: 2, tag: 'a', path: 'a' }] }));
  try {
    let r = await kinds.slots._act(slotsCfg, env.api, 'update', {});
    assert.equal(r.ok, true);
    assert.deepEqual(JSON.parse(env.file.text).slots, [{ order: 1, tag: 'a', path: 'a' }, { order: 2, tag: 'b', path: 'b' }]);
    assert.equal(env.writes.length, 1);
    r = await kinds.slots._act(slotsCfg, env.api, 'update', {});
    assert.equal(env.writes.length, 1, 'already tidy: not written again');
    r = await kinds.slots._act(slotsCfg, env.api, 'add', { path: 'c', tag: 'cee' });
    assert.deepEqual(r.items.map((i) => [i.label, i.sub]), [['1  a', 'a'], ['2  b', 'b'], ['3  cee', 'c']]);
    assert.match(r.message, /added c as 3/);
  } finally { env.restore(); }
});

test('slots._act: a file that cannot be read is never written (says so); a missing one is created', async () => {
  const env = fakeSlotsEnv('{ "slots": [ broken');
  try {
    const r = await kinds.slots._act(slotsCfg, env.api, 'add', { path: 'x' });
    assert.equal(r.ok, false);
    assert.match(r.message, /could not read the list.*not written/);
    assert.deepEqual(env.writes, []);
  } finally { env.restore(); }
  const bad = fakeSlotsEnv(JSON.stringify({ slots: [{ order: 1, path: 'a' }, { order: 'x' }] }));
  try {
    assert.equal((await kinds.slots._act(slotsCfg, bad.api, 'del', { n: 1 })).ok, false, 'an unreadable slot would be lost: refused');
    assert.deepEqual(bad.writes, []);
  } finally { bad.restore(); }
  const none = fakeSlotsEnv('', 404);
  try {
    const r = await kinds.slots._act(slotsCfg, none.api, 'add', { path: 'proj', tag: 'p' });
    assert.equal(r.ok, true);
    assert.deepEqual(JSON.parse(none.file.text), { slots: [{ order: 1, tag: 'p', path: 'proj' }] });
  } finally { none.restore(); }
});

test('slots keys: M-k/M-j move the selected slot and keep it selected; Del deletes it', async () => {
  const env = fakeSlotsEnv(JSON.stringify({ slots: [{ order: 1, tag: '', path: 'a' }, { order: 2, tag: '', path: 'b' }] }));
  const cfg = Object.assign({ keys: { 'M-k': 'up', 'M-j': 'down', 'M-a': 'add', 'M-t': 'tag' } }, slotsCfg);
  try {
    const b = kinds.slots._toItem({ order: 2, tag: '', path: 'b' });
    const r = await kinds.slots.onKey('M-k', b, cfg, env.api, '');
    assert.deepEqual(r.items.map((i) => i.sub), ['b', 'a']);
    assert.equal(r.select, b.id);
    await kinds.slots.onKey('M-t', kinds.slots._toItem({ order: 1, tag: '', path: 'b' }), cfg, env.api, ' bee ');
    assert.equal(JSON.parse(env.file.text).slots[0].tag, 'bee');
    await kinds.slots.remove(kinds.slots._toItem({ order: 2, tag: '', path: 'a' }), cfg, env.api);
    assert.deepEqual(JSON.parse(env.file.text).slots.map((s) => s.path), ['b']);
  } finally { env.restore(); }
});

test('problems: diagnostics of every open code_editor, errors first, then by file and line', () => {
  const rows = kinds.problems._rows([
    { id: 'b1', name: 'c1', path: 'src/b.js', diagnostics: [
      { line: 9, col: 1, severity: 'warning', message: 'unused x', source: 'ts' },
      { line: 3, col: 5, severity: 'error', message: 'Expression expected.\nmore', source: 'ts' },
    ] },
    { id: 'b2', name: 'c2', path: 'src/a.js', diagnostics: [{ line: 7, col: 2, severity: 'error', message: 'bad' }] },
    { id: 'b3', name: 'c3', path: 'src/clean.js', diagnostics: [] },
    { id: 'b4', name: 'c4', path: null },
  ]);
  assert.deepEqual(rows.map((r) => r.label), [
    'E src/a.js:7:2  bad',
    'E src/b.js:3:5  Expression expected.',
    'W src/b.js:9:1  unused x',
  ]);
  assert.deepEqual(rows[1].raw, { code: 'b1', name: 'c1', path: 'src/b.js', line: 3, col: 5, severity: 'error' });
  assert.equal(rows[1].sub, 'ts · c1');
  assert.deepEqual(kinds.problems._rows(null), []);
});

// a data file that cannot be read is never written over
test('dict: a dict.json that is not JSON is shown as empty but never written (adds refused, said)', async () => {
  const env = fakeDictEnv(null, [{ id: 'k1', text: 'w: n' }]);
  env.files.set('dict.json', '{ "lists": { "xipe": [ broken');
  try {
    const items = await kinds.dict.fill(dictCfg, env.api);
    assert.deepEqual(items, []);
    assert.match(env.logs.join('\n'), /dict\.json cannot be read/);
    await kinds.dict.onKey('p', null, dictCfg, env.api, '');
    assert.equal(env.files.get('dict.json'), '{ "lists": { "xipe": [ broken');
    assert.match(env.logs.pop(), /cannot be read, so it is not written/);
  } finally { env.restore(); }
});

test('data files are written against what was read: x-tezcatl-base, and once again on a 409 (2026-10-15)', async () => {
  const real = global.fetch;
  // the file on disk: a second word arrives between the first read and the write
  let disk = JSON.stringify({ lists: { default: [{ word: 'a' }] } });
  const sha = async (t) => 'sha256:' + Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('hex');
  let puts = 0;
  global.fetch = async (url, opts) => {
    if (!opts || opts.method !== 'PUT') return { ok: true, status: 200, text: async () => disk };
    puts += 1;
    if (puts === 1) disk = JSON.stringify({ lists: { default: [{ word: 'a' }, { word: 'b' }] } });
    if (opts.headers['x-tezcatl-base'] !== await sha(disk)) return { ok: false, status: 409, text: async () => '{"code":"changed"}' };
    disk = opts.body;
    return res({ ok: true });
  };
  try {
    const w = await kinds.dict._updateDoc({}, { fsBase: 'http://x' }, (doc) => require('../lib/list/dict.js').add(doc, 'default', [{ word: 'c' }]));
    assert.equal(w.ok, true);
    assert.equal(puts, 2);
    assert.deepEqual(JSON.parse(disk).lists.default.map((e) => e.word), ['a', 'b', 'c']);
  } finally { global.fetch = real; }
});

test('a missing data file is written as new ("absent"): one made meanwhile is not written over', async () => {
  const real = global.fetch;
  let base = null;
  global.fetch = async (url, opts) => {
    if (!opts || opts.method !== 'PUT') return { ok: false, status: 404, text: async () => '' };
    base = opts.headers['x-tezcatl-base'];
    return res({ ok: true });
  };
  try {
    await kinds.dict._updateDoc({}, { fsBase: 'http://x' }, (doc) => require('../lib/list/dict.js').add(doc, 'default', [{ word: 'x' }]));
    assert.equal(base, 'absent');
  } finally { global.fetch = real; }
});

test('skin_list: a saved skin as a row ── lines (empty ones), axis, ratios, panels; old names marked; by name', () => {
  const k = kinds.skin_list;
  const items = k._toItems({
    workspace_4: { name: 'workspace_4', axis: 'h', ratio: [1, 4], columns: [[['tree', 1, 1, false]], [['code_vi', 1, 1, true]]] },
    agenda: { name: 'agenda', ratio: [1, 1, 1, 1], columns: [[['task_table', 1, 1, true]], [], [], []] },
  });
  assert.deepEqual(items.map((i) => i.id), ['agenda', 'workspace_4']);
  assert.equal(items[0].sub, '4 lines (3 empty) · axis h · 1:1:1:1 · task_table | (empty) | (empty) | (empty)');
  assert.match(items[1].sub, /^2 lines · axis h · 1:4 · tree \| code_vi {2}⚠ old name: code_vi → code_editor/);
  assert.deepEqual(items[1].raw.summary.renamed, ['code_vi']);
  assert.deepEqual(k._toItems(null), []);
  assert.equal(k._toItem('x', null).sub, '0 lines · axis h · - · ');
});

test('skin_list.onKey: M-r reads the skin through skin.read; a name with a blank is not sent', () => {
  const k = kinds.skin_list;
  const calls = [];
  const logs = [];
  const api = { log: (s) => logs.push(s), commands: { invoke: (n, a) => calls.push([n, a]) } };
  const cfg = { keys: { 'M-r': 'read' } };
  k.onKey('M-r', { raw: { name: 'workspace_4' } }, cfg, api);
  k.onKey('M-r', { raw: { name: 'my skin' } }, cfg, api);
  k.onKey('M-x', { raw: { name: 'workspace_4' } }, cfg, api);
  assert.deepEqual(calls, [['skin.read', { name: 'workspace_4' }]]);
  assert.match(logs[1], /has a blank/);
});
