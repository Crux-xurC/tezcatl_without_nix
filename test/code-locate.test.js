'use strict';
// lib/code/code-locate.js: the code_editor windows open now, and going to
// one -- with a fake bus whose "code_editor" answer as the real ones do.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/code/code-locate.js');

// a bus shared by the asker and some code_editor; posts are delivered on the next tick
function world(opts) {
  const o = opts || {};
  const listeners = {};
  const sent = [];
  const bus = {
    on(type, fn) { (listeners[type] = listeners[type] || new Set()).add(fn); return () => listeners[type].delete(fn); },
    post(type, payload, po) { sent.push({ type, payload, to: (po && po.to) || null }); deliver(type, payload, { id: 'asker' }, po && po.to); },
  };
  function deliver(type, payload, from, to) {
    setImmediate(() => {
      (listeners[type] || []).forEach((fn) => fn(payload, { from, to: to || null }));
      editors.forEach((e) => { if (!to || to === e.id) e.hear(type, payload); });
    });
  }
  const editors = [];
  function editor(id, name, path, dirty, focused) {
    const e = {
      id, name, path, dirty: !!dirty,
      hear(type, p) {
        if (type === 'code.query') deliver('code.here', { req: p.req, name, path, dirty: !!dirty }, { id });
        if (type === 'code.reveal') deliver('code.revealed', { req: p.req, focused: focused !== false }, { id });
      },
    };
    editors.push(e);
    return e;
  }
  const opened = [];
  const env = {
    bus,
    sibling: (r) => 'http://x/' + r,
    setTimeout: (fn) => setTimeout(fn, 20),
    open(url, name) {
      opened.push({ url, name });
      if (o.popupBlocked) return null;
      const u = new URL(url);
      // the new window reads its file and says code.opened
      setTimeout(() => (o.openFails
        ? deliver('code.openFailed', { name: u.searchParams.get('name'), path: u.searchParams.get('path'), reason: o.openFails }, { id: 'new-1' })
        : deliver('code.opened', { name: u.searchParams.get('name'), path: u.searchParams.get('path') }, { id: 'new-1' })), 5);
      return {};
    },
  };
  if (o.focusHistory) bus.on('cursor.query', () => deliver('cursor.state', { focusHistory: o.focusHistory }, { id: 'cursor' }));
  return { env, editor, sent, opened };
}

const gotos = (w) => w.sent.filter((m) => m.type === 'code.goto');

test('parseTarget: path, path:line, path:line:col (1-based); a leading / is the FS root', () => {
  assert.deepEqual(L.parseTarget('lib/a.ex'), { path: 'lib/a.ex', line: null, col: null });
  assert.deepEqual(L.parseTarget(' lib/a.ex:12 '), { path: 'lib/a.ex', line: 12, col: null });
  assert.deepEqual(L.parseTarget('/lib/a.ex:12:3'), { path: 'lib/a.ex', line: 12, col: 3 });
  assert.deepEqual(L.parseTarget('a:b/c.txt'), { path: 'a:b/c.txt', line: null, col: null });
  assert.ok(L.parseTarget('').error);
  assert.ok(L.parseTarget(':12').error);
});

test('query collects every code_editor; find picks the ones showing the path', async () => {
  const w = world();
  w.editor('e1', 'code-1', 'lib/a.ex', false);
  w.editor('e2', 'tree-code-x', 'lib/b.ex', true);
  w.editor('e3', 'code', null, false);
  const list = await L.query(w.env);
  assert.deepEqual(list.map((c) => c.id).sort(), ['e1', 'e2', 'e3']);
  assert.deepEqual(L.find(list, '/lib/b.ex').map((c) => [c.id, c.dirty]), [['e2', true]]);
  assert.deepEqual(L.find(list, 'lib/none.ex'), []);
});

test('openAt: an open file is gone to (revealed, the cursor put there), never opened again', async () => {
  const w = world();
  w.editor('e1', 'code-1', 'lib/a.ex', false);
  w.editor('e2', 'code-2', 'lib/b.ex', false);
  const r = await L.openAt(w.env, { path: 'lib/b.ex', line: 12, col: 3 });
  assert.equal(r.ok, true);
  assert.equal(r.opened, false);
  assert.equal(r.id, 'e2');
  assert.equal(w.opened.length, 0);
  assert.deepEqual(w.sent.filter((m) => m.type === 'code.reveal').map((m) => m.to), ['e2']);
  assert.deepEqual(gotos(w).map((m) => [m.to, m.payload.line, m.payload.col]), [['e2', 12, 2]]);   // col 0-based for code.goto
});

test('openAt: a window the browser keeps behind is said', async () => {
  const w = world();
  w.editor('e1', 'code-1', 'lib/a.ex', false, false);
  const r = await L.openAt(w.env, { path: 'lib/a.ex', line: null, col: null });
  assert.equal(r.focused, false);
  assert.match(r.message, /Could not bring that window forward/);
  assert.equal(gotos(w).length, 0);   // no line: the cursor stays
});

test('openAt: a file open nowhere is opened in a new code_editor, then the cursor goes there', async () => {
  const w = world();
  w.editor('e1', 'code-1', 'lib/a.ex', false);
  const r = await L.openAt(w.env, { path: 'lib/new.ex', line: 7, col: null });
  assert.equal(r.ok, true);
  assert.equal(r.opened, true);
  assert.equal(w.opened.length, 1);
  const u = new URL(w.opened[0].url);
  assert.equal(u.pathname, '/panels/resident/code_editor.html');
  assert.equal(u.searchParams.get('path'), 'lib/new.ex');
  assert.equal(u.searchParams.get('name'), r.name);
  assert.deepEqual(gotos(w).map((m) => [m.to, m.payload.line, m.payload.col]), [['new-1', 7, 0]]);
});

test('openAt: a page with its own openNew (the frame) opens there, not in a new window', async () => {
  const w = world();
  w.editor('e1', 'code-1', 'lib/a.ex', false);
  const asked = [];
  w.env.openNew = (t) => { asked.push(t); return Promise.resolve({ ok: true, opened: true, message: 'added' }); };
  const r = await L.openAt(w.env, { path: 'lib/new.ex', line: 3, col: 2 });
  assert.equal(r.message, 'added');
  assert.deepEqual(asked, [{ path: 'lib/new.ex', line: 3, col: 2 }]);
  assert.equal(w.opened.length, 0);
  // a file already open is still gone to
  const r2 = await L.openAt(w.env, { path: 'lib/a.ex', line: 1, col: null });
  assert.equal(r2.opened, false);
  assert.equal(asked.length, 1);
});

test('openAt: a blocked popup is said', async () => {
  const w = world({ popupBlocked: true });
  const r = await L.openAt(w.env, { path: 'lib/new.ex', line: null, col: null });
  assert.equal(r.ok, false);
  assert.match(r.message, /pop-up/);
});

// the commands, registered on a fake command table
function table() {
  const impls = {};
  return {
    register(name, fn) { impls[name] = fn; },
    invoke(name, args, ctx) { return impls[name](args || {}, ctx || null); },
    impls,
  };
}

test('commands: code.find says where; code.open-at takes "path:line:col"; a command sent around is declined', async () => {
  const w = world();
  w.editor('e1', 'code-1', 'lib/a.ex', true);
  const said = [];
  const c = table();
  L.register(c, w.env, { say: (t) => said.push(t) });
  assert.deepEqual(Object.keys(c.impls).sort(), ['code.find', 'code.goto', 'code.grep', 'code.list', 'code.open-at']);

  await c.invoke('code.find', { path: 'lib/a.ex' });
  assert.match(said.pop(), /open \(code-1 ●\)/);
  await c.invoke('code.find', { path: 'lib/z.ex' });
  assert.match(said.pop(), /no open code_editor has it/);

  await c.invoke('code.open-at', { path: 'lib/a.ex:4:2' });
  assert.deepEqual(gotos(w).map((m) => [m.to, m.payload.line, m.payload.col]), [['e1', 4, 1]]);

  // over the bus: another window's to run, not this one's (no double run)
  assert.equal(c.invoke('code.open-at', { path: 'lib/a.ex' }, { remote: true }), false);
  assert.equal(c.invoke('code.goto', { line: 3 }, { remote: true }), false);
});

test('commands: code.goto without a path goes to the code_editor focused last', async () => {
  const w = world({ focusHistory: [{ id: 'e2', role: 'code' }, { id: 'list-1', role: 'list' }, { id: 'e1', role: 'code' }, { id: 'xt', role: 'xterm' }] });
  w.editor('e1', 'code-1', 'lib/a.ex', false);
  w.editor('e2', 'code-2', 'lib/b.ex', false);
  const said = [];
  const c = table();
  L.register(c, w.env, { say: (t) => said.push(t) });
  await c.invoke('code.goto', { line: 9, col: 4 });
  assert.deepEqual(gotos(w).map((m) => [m.to, m.payload.line, m.payload.col]), [['e1', 9, 3]]);
  await c.invoke('code.goto', {});
  assert.match(said.pop(), /no line/);
});

test('parseGrep: a pattern (quoted when it has spaces) and an optional path', () => {
  assert.deepEqual(L.parseGrep('needle'), { pattern: 'needle', path: null });
  assert.deepEqual(L.parseGrep('needle lib/x'), { pattern: 'needle', path: 'lib/x' });
  assert.deepEqual(L.parseGrep('"two words" /lib'), { pattern: 'two words', path: 'lib' });
  assert.deepEqual(L.parseGrep('def\\s+f'), { pattern: 'def\\s+f', path: null });
  assert.ok(L.parseGrep('').error);
  assert.ok(L.parseGrep('"open').error);
  assert.equal(L.grepUrl({ sibling: (r) => 'http://x/' + r }, 'a b', 'lib'), 'http://x/panels/tool/list.html?config=locations&grep=a%20b&path=lib');
});

test('code.grep opens the list of the matches', () => {
  const opened = [];
  const said = [];
  const c = table();
  L.register(c, { bus: { on() { return () => {}; }, post() {} }, sibling: (r) => 'http://x/' + r, setTimeout, open: (u) => { opened.push(u); return {}; } }, { say: (t) => said.push(t) });
  c.invoke('code.grep', { pattern: 'needle', path: '/lib' });
  assert.deepEqual(opened, ['http://x/panels/tool/list.html?config=locations&grep=needle&path=lib']);
  c.invoke('code.grep', {});
  assert.match(said.pop(), /no pattern/);
});

test('openAt: a new code_editor that cannot open the path says why, and that is the answer (2026-10-09)', async () => {
  const w = world({ openFails: 'could not open ── is a directory' });
  const r = await L.openAt(w.env, { path: 'lib', line: null, col: null });
  assert.equal(r.ok, false);
  assert.match(r.message, /is a directory/);
});
