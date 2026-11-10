'use strict';
// lib/vent/decode-table.js: an intent's JSON answer made a table (D-decode-emacs)
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/vent/decode-table.js');

const SPEC = {
  from: 'files', rows: 'objects',
  columns: [{ key: 'section' }, { key: 'path', label: 'file' }],
  link: 'path',
  keys: { s: { intent: 'magit.stage-file', params: { file: 'path' } }, d: { diff: { intent: 'magit.file-at', params: { file: 'path' }, against: 'path' } } },
  refresh: 'magit.changed-files',
};

test('check: a table spec, said wrong when it is', () => {
  assert.equal(D.check(SPEC), null);
  assert.match(D.check({ rows: 'list', columns: [{ key: 'a' }] }), /table.rows: one of objects, arrays, values/);
  assert.match(D.check({ rows: 'values', columns: [] }), /at least one/);
  assert.match(D.check({ rows: 'values', columns: [{ key: 'a' }, { key: 'a' }] }), /a key twice/);
  assert.match(D.check({ rows: 'values', columns: [{ key: 'a' }], link: 'b' }), /table.link: not a column/);
  assert.match(D.check({ rows: 'values', columns: [{ key: 'a' }], keys: { j: { intent: 'x' } } }), /j is taken by the panel/);
  assert.match(D.check({ rows: 'values', columns: [{ key: 'a' }], keys: { s: { intent: 'x', params: { f: 'b' } } } }), /not a column: b/);
  assert.match(D.check({ rows: 'values', columns: [{ key: 'a' }], keys: { s: {} } }), /an intent, a command, a table or a diff/);
  assert.match(D.check({ rows: 'values', columns: [{ key: 'a' }], keys: { st: { intent: 'x' } } }), /one character each/);
  assert.match(D.check({ rows: 'values', columns: [{ key: 'a' }], keys: { r: { intent: 'x' } } }), /r is taken by the panel/);
  // ask: a sentence from a code_vi_minimum for the intent's param (D-minimum)
  assert.equal(D.check({ rows: 'values', columns: [{ key: 'a' }], keys: { C: { ask: 'commit message', intent: 'magit.commit', param: 'message' } } }), null);
  assert.equal(D.check({ rows: 'values', columns: [{ key: 'a' }], keys: { C: { ask: 'note', intent: 'x', param: 'text', params: { at: 'a' } } } }), null);
  assert.match(D.check({ rows: 'values', columns: [{ key: 'a' }], keys: { C: { ask: 'commit message', intent: 'magit.commit' } } }), /C.ask: a purpose, with an intent and the param/);
  assert.match(D.check({ rows: 'values', columns: [{ key: 'a' }], keys: { C: { ask: 'm', command: 'x', param: 'p' } } }), /C.ask/);
});

test('table: plists, vectors, plain values -- from where the spec says', () => {
  const t = D.table(SPEC, { root: '/r', files: [{ section: 'unstaged', path: '/r/a.js' }, { section: 'staged', path: '/r/b.js', extra: 1 }] });
  assert.deepEqual(t.columns, [{ key: 'section', label: 'section' }, { key: 'path', label: 'file' }]);
  assert.deepEqual(t.rows.map((r) => r.cells), [{ section: 'unstaged', path: '/r/a.js' }, { section: 'staged', path: '/r/b.js' }]);
  const arr = D.table({ rows: 'arrays', columns: [{ key: 'n', from: 1 }, { key: 'x', from: 0 }] }, [['a', 1], ['b', null]]);
  assert.deepEqual(arr.rows.map((r) => r.cells), [{ n: '1', x: 'a' }, { n: '', x: 'b' }]);
  const vals = D.table({ rows: 'values', columns: [{ key: 'file' }] }, ['a.js', 'b.js']);
  assert.deepEqual(vals.rows.map((r) => r.cells.file), ['a.js', 'b.js']);
  assert.deepEqual(D.table({ from: '0.items', rows: 'values', columns: [{ key: 'v' }] }, [{ items: [true, { a: 1 }] }]).rows.map((r) => r.cells.v), ['true', '{"a":1}']);
  assert.match(D.table(SPEC, { files: null }).error, /no list at "files"/);
  assert.match(D.table({ rows: 'nope', columns: [] }, []).error, /table.rows/);
});

test('argsOf / fsPath: a key\'s arguments from the row; a path from Emacs made one from the FS root', () => {
  const row = { cells: { section: 'unstaged', path: '/home/t/my_app/x/a.js' } };
  assert.deepEqual(D.argsOf({ file: 'path' }, row), { file: '/home/t/my_app/x/a.js' });
  assert.equal(D.fsPath('/home/t/my_app/x/a.js', '/home/t/my_app'), 'x/a.js');
  assert.equal(D.fsPath('/home/t/my_app/../other/a.js', '/home/t/my_app'), null);
  assert.equal(D.fsPath('/elsewhere/a.js', '/home/t/my_app'), null);
  assert.equal(D.fsPath('./x/a.js', '/home/t/my_app'), 'x/a.js');
  assert.equal(D.fsPath('/home/t/my_app', '/home/t/my_app'), null);
  assert.equal(D.fsPath('/a', null), null);
});

test('check, diffSides: a line beside the link, a table key, a diff of two intents', () => {
  const cols = [{ key: 'path' }, { key: 'old' }, { key: 'rev' }, { key: 'parent' }, { key: 'line' }];
  assert.equal(D.check({ rows: 'objects', columns: cols, link: 'path', line: 'line' }), null);
  assert.match(D.check({ rows: 'objects', columns: cols, line: 'line' }), /table.line: a column, beside a link/);
  assert.equal(D.check({ rows: 'objects', columns: cols, keys: { f: { table: 'magit.commit-files', params: { rev: 'rev' } } } }), null);
  assert.match(D.check({ rows: 'objects', columns: cols, keys: { f: { table: 'x', params: { rev: 'nope' } } } }), /not a column: nope/);
  const two = { intent: 'm.at', params: { path: 'path', rev: 'rev' }, path: 'path', against: { intent: 'm.at', params: { path: 'old', rev: 'parent' }, path: 'old' } };
  assert.equal(D.check({ rows: 'objects', columns: cols, keys: { d: { diff: two } } }), null);
  assert.match(D.check({ rows: 'objects', columns: cols, keys: { d: { diff: Object.assign({}, two, { path: 'nope' }) } } }), /path \(and against.path\)/);
  assert.match(D.check({ rows: 'objects', columns: cols, keys: { d: { diff: Object.assign({}, two, { against: { intent: 'm.at', params: { rev: 'zz' }, path: 'old' } }) } } }), /not a column: zz/);
  const row = { cells: { path: '/r/x/new.js', old: '/r/x/old name.js', rev: 'abc1234', parent: '', line: '8' } };
  assert.deepEqual(D.diffSides(two, row, '/r'), {
    a: { intent: 'm.at', args: { path: '/r/x/old name.js', rev: '' }, copy: '~work/emacs/m.at/-/x/old name.js' },
    b: { intent: 'm.at', args: { path: '/r/x/new.js', rev: 'abc1234' }, copy: '~work/emacs/m.at/abc1234/x/new.js' },
  });
  // against a column: the intent's version against the file (the copy as before: no other values)
  assert.deepEqual(D.diffSides({ intent: 'm.head', params: { path: 'path' }, against: 'path' }, row, '/r'),
    { a: { intent: 'm.head', args: { path: '/r/x/new.js' }, copy: '~work/emacs/m.head/x/new.js' }, b: { file: 'x/new.js' } });
  assert.match(D.diffSides(two, row, '/elsewhere').error, /not under the FS root/);
});

test('checkBook and bookRows: an answer as rows of a run_table book (D-run-table, stage 3)', () => {
  assert.match(D.checkBook({ rows: 'objects', put: { a: 'a' } }), /book.template/);
  assert.match(D.checkBook({ template: 't', rows: 'list', put: { a: 'a' } }), /book.rows/);
  assert.match(D.checkBook({ template: 't', rows: 'objects', put: {} }), /book.put: at least one/);
  assert.match(D.checkBook({ template: 't', rows: 'values', put: { a: '', b: '' } }), /one column for rows "values"/);
  assert.equal(D.checkBook({ template: 't', rows: 'objects', put: { path: 'path' } }), null);
  const spec = { template: 't', from: 'files', rows: 'objects', put: { path: 'path', where: 'section' } };
  assert.deepEqual(D.bookRows(spec, { files: [{ section: 'unstaged', path: '/r/a.js', x: 1 }, { path: 2 }] }).rows,
    [{ path: '/r/a.js', where: 'unstaged' }, { path: '2', where: '' }]);
  assert.deepEqual(D.bookRows({ template: 't', rows: 'arrays', put: { n: '1' } }, [['a', 'b']]).rows, [{ n: 'b' }]);
  assert.deepEqual(D.bookRows({ template: 't', rows: 'values', put: { f: '' } }, ['a.js']).rows, [{ f: 'a.js' }]);
  assert.match(D.bookRows(spec, { files: 'no' }).error, /no list at "files"/);
});

test('bookOf: the table shown as a book (D-db-session) -- the rows given in that order, the cells as shown', () => {
  const cols = [{ key: 'section' }, { key: 'path', label: 'file' }];
  const rows = [{ id: 'r0', cells: { section: 'staged', path: '/a' } }, { id: 'r1', cells: { section: 'unstaged', path: '/b' } }];
  assert.deepEqual(D.bookOf('magit.changed-files', { x: 1 }, cols, rows, ['r1', 'r0', 'gone']), {
    path: '~work/books/decode/magit.changed-files.json',
    book: { name: 'decode/magit.changed-files', intent: 'magit.changed-files', args: { x: 1 }, columns: ['section', 'path'], rows: [['unstaged', '/b'], ['staged', '/a']] },
  });
  assert.equal(D.bookOf('../a b', {}, cols, rows, []).path, '~work/books/decode/a_b.json');
  assert.match(D.check({ rows: 'values', columns: [{ key: 'a' }], keys: { b: { intent: 'x' } } }), /b is taken by the panel/);
});

test('table.enter: one of its keys, and no link', () => {
  const DT = require('../lib/vent/decode-table.js');
  const base = { rows: 'objects', columns: [{ key: 'branch' }], keys: { o: { intent: 'magit.checkout', params: { branch: 'branch' } } } };
  assert.equal(DT.check(Object.assign({}, base, { enter: 'o' })), null);
  assert.match(DT.check(Object.assign({}, base, { enter: 'x' })), /table\.enter/);
  assert.match(DT.check(Object.assign({}, base, { enter: 'o', link: 'branch' })), /table\.enter/);
});

test('a key with confirm: what is discarded, beside an intent, not an ask', () => {
  const DT = require('../lib/vent/decode-table.js');
  const t = (k) => ({ rows: 'objects', columns: [{ key: 'path' }], keys: { X: k } });
  assert.equal(DT.check(t({ intent: 'magit.discard-file', params: { path: 'path' }, confirm: 'discard' })), null);
  assert.match(DT.check(t({ intent: 'magit.discard-file', params: { path: 'path' }, confirm: '' })), /confirm/);
  assert.match(DT.check(t({ table: 'magit.hunks', params: {}, confirm: 'x' })), /confirm/);
  assert.match(DT.check(t({ ask: 'why', intent: 'a.b', param: 'm', confirm: 'x' })), /confirm/);
});
