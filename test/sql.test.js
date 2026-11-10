'use strict';
// lib/db/sql.js (D-db-backend): an answer of /sql made a matrix table; where
// a database window's socket is
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/db/sql.js');

test('toGrid: columns by position (two alike are two), NULL shown, the count said', () => {
  const g = S.toGrid({ ok: true, columns: ['a', 'a', 'z'], rows: [[1, 'x', null], [2.5, '日本語', '']], num_rows: 2, truncated: false });
  assert.deepEqual(g.columns.map((c) => [c.key, c.label]), [['c0', 'a'], ['c1', 'a'], ['c2', 'z']]);
  assert.deepEqual(g.rows, [{ id: 'q1', cells: { c0: '1', c1: 'x', c2: 'NULL' } }, { id: 'q2', cells: { c0: '2.5', c1: '日本語', c2: '' } }]);
  assert.equal(g.message, '2 row(s)');
  assert.equal(S.toGrid({ ok: true, columns: ['i'], rows: [[1]], num_rows: 9000, truncated: true }).message, '9000 row(s) (the first 1 shown)');
});

test('toGrid: a statement without columns says what it changed; a refusal is the server\'s message', () => {
  assert.equal(S.toGrid({ ok: true, columns: null, num_rows: 3, last_insert_id: 0 }).message, '3 row(s) changed');
  assert.equal(S.toGrid({ ok: true, columns: null, num_rows: 1, last_insert_id: 7 }).message, '1 row(s) changed, last id 7');
  assert.deepEqual(S.toGrid({ ok: false, error: "Table 'x' doesn't exist", code: 'ER_NO_SUCH_TABLE' }), { error: "Table 'x' doesn't exist", code: 'ER_NO_SUCH_TABLE' });
});

test("socketUrl: the relay's /sql, from config.json's first connection", async () => {
  const config = (u) => ({ load: () => Promise.resolve({ connections: [{ url: u }] }) });
  assert.equal(await S.socketUrl(config('ws://127.0.0.1:4100/')), 'ws://127.0.0.1:4100/sql');
  assert.equal(await S.socketUrl(config('wss://h:9/x')), 'wss://h:9/sql');
  await assert.rejects(S.socketUrl({ load: () => Promise.resolve({}) }), /no relay URL/);
});

test("command: a database window's own commands are exactly these; anything else is a statement", () => {
  assert.deepEqual(S.command('db login'), { cmd: 'login', account: null });
  assert.deepEqual(S.command('  db login  tezcatl \n'), { cmd: 'login', account: 'tezcatl' });
  assert.deepEqual(S.command('db exit'), { cmd: 'exit' });
  assert.deepEqual(S.command('db cancel'), { cmd: 'cancel' });
  for (const t of ['select 1', 'db', 'db login a b', 'db exit now', 'db drop', "db login a'b", 'DB EXIT', 'select 1; db exit']) {
    assert.equal(S.command(t), null, t);
  }
});

test('head: the first line of a statement, cut short', () => {
  assert.equal(S.head('  select 1\nfrom dual'), 'select 1');
  assert.equal(S.head('x'.repeat(80)).length, 60);
  assert.equal(S.head(null), '');
});

test('check: an intent\'s sql is a statement, and the names of params for its ?s', () => {
  assert.equal(S.check({ statement: 'show tables like ?', args: ['like'] }), null);
  assert.equal(S.check({ statement: 'select 1' }), null);
  assert.match(S.check({ statement: '  ' }), /sql.statement/);
  assert.match(S.check({ statement: 'x', args: 'like' }), /sql.args/);
  assert.match(S.check({ statement: 'x', args: [''] }), /sql.args/);
});

test('intentArgs: values in sql.args\' order, typed by the params; never text put into the statement', () => {
  const it = {
    params: [
      { name: 'like', type: 'string', default: '%' },
      { name: 'n', type: 'int', required: true },
      { name: 'on', type: 'bool' },
      { name: 'k', type: 'enum', values: ['a', 'b'] },
      { name: 'opt', type: 'string' },
    ],
    sql: { statement: '…', args: ['n', 'like', 'on', 'k', 'opt'] },
  };
  assert.deepEqual(S.intentArgs(it, { n: '3', on: 'true', k: 'b' }), [3, '%', true, 'b', null]);
  assert.deepEqual(S.intentArgs(it, { n: 1, like: "a'; drop table x; --" }).slice(0, 2), [1, "a'; drop table x; --"]);
  assert.throws(() => S.intentArgs(it, {}), /missing required param "n"/);
  assert.throws(() => S.intentArgs(it, { n: '1.5' }), /integer/);
  assert.throws(() => S.intentArgs(it, { n: 1, k: 'z' }), /enum/);
  assert.throws(() => S.intentArgs({ params: [], sql: { statement: 'x', args: ['nope'] } }, {}), /not a param/);
  assert.deepEqual(S.intentArgs({ params: [], sql: { statement: 'select 1' } }, {}), []);
});

test('check: sql.load is up to 8 of {book: a param, as: a table name}', () => {
  assert.equal(S.check({ statement: 'x', load: [{ book: 'book', as: 't_in' }] }), null);
  assert.match(S.check({ statement: 'x', load: {} }), /sql.load/);
  assert.match(S.check({ statement: 'x', load: [{ as: 't' }] }), /load\[0\]\.book/);
  assert.match(S.check({ statement: 'x', load: [{ book: 'b', as: 't-in' }] }), /load\[0\]\.as/);
  assert.match(S.check({ statement: 'x', load: Array(9).fill({ book: 'b', as: 't' }) }), /up to 8/);
});

test('intentLoads: the book a param names (its default too), under ~work/books, without .json', () => {
  const it = {
    params: [{ name: 'book', type: 'string', default: 'decode/magit.changed-files' }],
    sql: { statement: 'select * from t_in', load: [{ book: 'book', as: 't_in' }] },
  };
  assert.deepEqual(S.intentLoads(it, {}), [{ book: 'decode/magit.changed-files', as: 't_in' }]);
  assert.deepEqual(S.intentLoads(it, { book: '~work/books/run/x.json' }), [{ book: 'run/x', as: 't_in' }]);
  for (const b of ['../x', 'a/../b', '/abs', 'a b', '~work/other']) {
    assert.throws(() => S.intentLoads(it, { book: b }), /a name under ~work\/books/);
  }
  assert.throws(() => S.intentLoads({ params: [], sql: it.sql }, {}), /not a param/);
  assert.deepEqual(S.intentLoads({ params: [], sql: { statement: 'select 1' } }, {}), []);
});
