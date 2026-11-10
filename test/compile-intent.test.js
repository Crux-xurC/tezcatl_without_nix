'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

global.Tezcatl = global.Tezcatl || {};
const compileIntent = require('../lib/vent/compile-intent.js');

test('_shQuote: wraps in single quotes, escapes embedded single quotes', () => {
  assert.equal(compileIntent._shQuote('mix'), "'mix'");
  assert.equal(compileIntent._shQuote("a'b"), "'a'\\''b'");
  assert.equal(compileIntent._shQuote('a b'), "'a b'");
});

test('_joinAbs: joins root and a relative path, tolerating slashes on either side', () => {
  assert.equal(compileIntent._joinAbs('/home/user/proj', 'lib/foo.ex'), '/home/user/proj/lib/foo.ex');
  assert.equal(compileIntent._joinAbs('/home/user/proj/', '/lib/foo.ex'), '/home/user/proj/lib/foo.ex');
  assert.equal(compileIntent._joinAbs('/home/user/proj', ''), '/home/user/proj');
});

test('_dirnameRel: directory of a relative path, "" for a top-level file', () => {
  assert.equal(compileIntent._dirnameRel('lib/foo/bar.ex'), 'lib/foo');
  assert.equal(compileIntent._dirnameRel('bar.ex'), '');
  assert.equal(compileIntent._dirnameRel(''), '');
});

test('_resolveArgv: substitutes the exact token "{{path}}", leaves others alone', () => {
  assert.deepEqual(
    compileIntent._resolveArgv({ command: ['python3', '-m', 'py_compile', '{{path}}'] }, '/a/b/c.py'),
    ['python3', '-m', 'py_compile', '/a/b/c.py'],
  );
  assert.deepEqual(
    compileIntent._resolveArgv({ command: ['cargo', 'build'] }, '/a/b/c.rs'),
    ['cargo', 'build'],
  );
});

test('_planLines: scope "file" -- no cd line, path substituted', () => {
  const entry = { scope: 'file', command: ['python3', '-m', 'py_compile', '{{path}}'] };
  const lines = compileIntent._planLines(entry, null, { absRoot: '/root', relPath: 'a/b.py' });
  assert.deepEqual(lines, ["'python3' '-m' 'py_compile' '/root/a/b.py'"]);
});

test('_planLines: scope "self" -- cd to the file\'s own directory', () => {
  const entry = { scope: 'self', command: ['cargo', 'build'] };
  const lines = compileIntent._planLines(entry, null, { absRoot: '/root', relPath: 'crates/x/src/main.rs' });
  assert.deepEqual(lines, ["cd '/root/crates/x/src'", "'cargo' 'build'"]);
});

test('_planLines: scope "root" -- cd to the resolved rootRelDir, not the file\'s own directory', () => {
  const entry = { scope: 'root', rootMarkers: ['mix.exs'], command: ['mix', 'compile'] };
  const lines = compileIntent._planLines(entry, null,
    { absRoot: '/root', relPath: 'apps/foo/lib/foo.ex', rootRelDir: 'apps/foo' });
  assert.deepEqual(lines, ["cd '/root/apps/foo'", "'mix' 'compile'"]);
});

test('_planLines: scope "root" falls back to the file\'s own directory when no rootRelDir was found', () => {
  const entry = { scope: 'root', rootMarkers: ['mix.exs'], command: ['mix', 'compile'] };
  const lines = compileIntent._planLines(entry, null, { absRoot: '/root', relPath: 'lib/foo.ex' });
  assert.deepEqual(lines, ["cd '/root/lib'", "'mix' 'compile'"]);
});

test('_planLines: prefix (nix variant) is prepended to argv before quoting, cd is unaffected', () => {
  const entry = { scope: 'self', command: ['cargo', 'build'] };
  const lines = compileIntent._planLines(entry, ['nix', 'develop', '--command'],
    { absRoot: '/root', relPath: 'src/main.rs' });
  assert.deepEqual(lines, ["cd '/root/src'", "'nix' 'develop' '--command' 'cargo' 'build'"]);
});

test('_planLines: a path containing a space or quote is shell-safe end to end', () => {
  const entry = { scope: 'file', command: ['bash', '-n', '{{path}}'] };
  const lines = compileIntent._planLines(entry, null, { absRoot: '/root', relPath: "a b/it's.sh" });
  assert.deepEqual(lines, ["'bash' '-n' '/root/a b/it'\\''s.sh'"]);
});

// -- run(): the whole flow over a fake bus (unsaved edits are saved first) ----

function fakeWorld(opts) {
  const handlers = {};
  const sent = [];
  const emit = (type, payload, meta, ms) => setTimeout(() => {
    (handlers[type] || []).slice().forEach((h) => h(payload, meta || {}));
  }, ms || 0);
  Tezcatl.bus = {
    on(type, h) {
      (handlers[type] = handlers[type] || []).push(h);
      return () => { handlers[type] = handlers[type].filter((x) => x !== h); };
    },
    post(type, payload, o) {
      sent.push({ type, payload, to: o && o.to });
      if (type === 'cursor.query') emit('cursor.state', { focusHistory: [{ role: 'code', id: 'C' }, { role: 'xterm', id: 'X' }] });
      if (type === 'code.get') emit('code.text', { name: 'ed', path: 'p/a.sh', language: 'shell', dirty: opts.dirty }, { from: { id: 'C' } });
      if (type === 'code.file') {
        // an earlier save (:w) answers first, without our req: not ours
        if (opts.earlierSave) emit('code.saved', { name: 'ed', path: 'p/a.sh' });
        emit(opts.saveOk ? 'code.saved' : 'code.saveFailed', { name: 'ed', path: 'p/a.sh', code: 'changed', req: payload.req }, null, opts.saveDelay);
      }
      if (type === 'compile.cutoff.open') {
        emit('compile.cutoff.opened', { reqId: payload.reqId });
        emit('terminal.ready', { req: payload.reqId });
      }
      if (type === 'terminal.run' && !/^cd /.test(payload.lines[0])) opts.done();
    },
  };
  Tezcatl.config = {
    sibling: (x) => x,
    load: () => Promise.resolve({ connections: [{ url: 'ws://127.0.0.1:4100/ws' }] }),
  };
  global.fetch = (url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url === 'compile.json'
      ? { compilers: { shell: opts.entry || { scope: 'file', command: ['bash', '-n', '{{path}}'] } } }
      : { root: '/r', entries: [] }),
  });
  return sent;
}

function runOnce(dirty, saveOk, entry, more) {
  return new Promise((resolve) => {
    const reports = [];
    let sent = null;
    const done = () => resolve({ sent, reports });
    sent = fakeWorld({ dirty, saveOk, done, entry, ...(more || {}) });
    // a fresh module each time: it keeps compile.json once read
    delete require.cache[require.resolve('../lib/vent/compile-intent.js')];
    require('../lib/vent/compile-intent.js').run({}, {}, { id: 'compile.run' }, (kind, text) => {
      reports.push([kind, text]);
      if (kind === 'out-fail') done();
    });
  });
}

test('run: a clean file is compiled as it is, without a save', async () => {
  const { sent, reports } = await runOnce(false, true);
  assert.equal(sent.filter((m) => m.type === 'code.file').length, 0);
  const run = sent.find((m) => m.type === 'terminal.run');
  assert.deepEqual(run.payload.lines, ["'bash' '-n' '/r/p/a.sh'"]);
  assert.equal(run.to, 'X');
  assert.ok(!reports.some(([k]) => k === 'out-fail'));
});

test('run: unsaved edits are saved first, then compiled', async () => {
  const { sent, reports } = await runOnce(true, true);
  const types = sent.map((m) => m.type);
  assert.ok(types.indexOf('code.file') >= 0 && types.indexOf('code.file') < types.indexOf('terminal.run'));
  const cf = sent.find((m) => m.type === 'code.file').payload;
  assert.deepEqual({ ...cf, req: undefined }, { op: 'write', arg: '', bang: false, req: undefined });
  assert.match(cf.req, /^cs-/);
  assert.ok(reports.some(([k, t]) => k === 'in-meta' && /saved /.test(t)));
});

test('run: an earlier save\'s code.saved (no req) does not start the run; its own failure stops it', async () => {
  const { sent, reports } = await runOnce(true, false, null, { earlierSave: true, saveDelay: 20 });
  assert.equal(sent.filter((m) => m.type === 'terminal.run').length, 0);
  assert.ok(reports.some(([k, t]) => k === 'out-fail' && /could not save \(changed\)/.test(t)), JSON.stringify(reports));
});

test('run: a save that fails stops the run, and the log says why', async () => {
  const { sent, reports } = await runOnce(true, false);
  assert.equal(sent.filter((m) => m.type === 'terminal.run').length, 0);
  const fail = reports.find(([k]) => k === 'out-fail');
  assert.ok(fail && /could not save \(changed\)/.test(fail[1]), JSON.stringify(reports));
});

test('run: scope "root" with no marker up to the FS root runs in the file\'s own directory', async () => {
  const { sent } = await runOnce(false, true, { scope: 'root', rootMarkers: ['Makefile'], command: ['make'] });
  const lines = sent.filter((m) => m.type === 'terminal.run').map((m) => m.payload.lines[0]);
  assert.deepEqual(lines, ["cd '/r/p'", "'make'"]);   // was: cd '/r' (the FS root)
});
