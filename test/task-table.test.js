'use strict';
// lib/task/task-table.js: a note's table taken into a book, edited, put back (D-task-table)
const test = require('node:test');
const assert = require('node:assert/strict');
const TT = require('../lib/task/task-table.js');
const M = require('../lib/code/markdown.js');

let parser = null;
const ready = import('../lib/vendor/codemirror/markdown.bundle.js').then((m) => { parser = m.parser; });
async function tabs(src) { await ready; return M.tables(parser.parse(src), src); }

const NOTE = '# Tasks\n\nTable: task matrix k3x9a2bq\n\n| id | state | pri | task | inner_id |\n|:--|---|---|---|---|\n| t-01 | TODO | A | 中継のテスト | abcd1234 |\n| t-02 | NEXT | | markdown \\| パネル | #eigenvalue |\n| t-02-01 | NEXT | | 往復 | |\n\nafter\n';

test('take: a named table with the columns the settings need; else why not', async () => {
  const t = await tabs(NOTE);
  const r = TT.take(t[0], 'notes/t.md', 'sha256:x');
  assert.deepEqual(r.book.columns, ['id', 'state', 'pri', 'task', 'inner_id']);
  assert.deepEqual(r.book.rows[1], ['t-02', 'NEXT', '', 'markdown \\| パネル', '#eigenvalue']);
  assert.deepEqual([r.book.name, r.book.path, r.book.hash, r.book.captionAt], ['task matrix k3x9a2bq', 'notes/t.md', 'sha256:x', 'before']);
  assert.equal(r.book.align[0], 'left');
  const bare = await tabs('| a |\n|---|\n| 1 |\n');
  assert.match(TT.take(bare[0], 'x.md', 'h').error, /has no name/);
  const few = await tabs('Table: few\n\n| id | task |\n|---|---|\n');
  assert.match(TT.take(few[0], 'x.md', 'h').error, /has no column state, inner_id/);
  assert.match(TT.take(few[0], 'x.md', 'h', { columns: { state: 'task', key: 'id' } }).error || 'ok', /ok/);
});

test('the key column: an id set is not edited; empty and the mark get ids, in order', async () => {
  const b = TT.take((await tabs(NOTE))[0], 'n.md', 'h').book;
  assert.match(TT.locked(b, 4, 'abcd1234'), /the id abcd1234 is set/);
  assert.equal(TT.locked(b, 4, '#eigenvalue'), null);
  assert.equal(TT.locked(b, 4, ''), null);
  assert.equal(TT.locked(b, 3, 'anything'), null);
  assert.deepEqual(TT.needIds(b), [1, 2]);
  const b2 = TT.putIds(b, [1, 2], ['zzzz0001', 'zzzz0002']);
  assert.deepEqual(b2.rows.map((r) => r[4]), ['abcd1234', 'zzzz0001', 'zzzz0002']);
  assert.equal(b.rows[1][4], '#eigenvalue');
});

test('numbering: o is the next sibling, O the next child; both go after what is under the row', async () => {
  const b = TT.take((await tabs(NOTE))[0], 'n.md', 'h').book;
  assert.deepEqual(TT.newRow(b, 0, false), { no: 't-03', index: 1 });
  assert.deepEqual(TT.newRow(b, 1, false), { no: 't-03', index: 3 });
  assert.deepEqual(TT.newRow(b, 1, true), { no: 't-02-02', index: 3 });
  assert.deepEqual(TT.newRow(b, 2, false), { no: 't-02-02', index: 3 });
  assert.deepEqual(TT.newRow(b, 2, true), { no: 't-02-01-01', index: 3 });
  assert.deepEqual(TT.newRow(b, 0, true), { no: 't-01-01', index: 1 });
  assert.deepEqual(TT.newRow(Object.assign({}, b, { rows: [] }), -1, false), { no: 't-01', index: 0 });
  assert.deepEqual(TT.blankRow(b, 't-03'), ['t-03', 'TODO', '', '', '#eigenvalue']);
  assert.deepEqual(TT.parseNo('t-02-01', 't'), [2, 1]);
  assert.equal(TT.parseNo('x-02', 't'), null);
});

test('toMarkdown: the caption, the delimiter row with alignment, padded by display width; cells typed made safe', async () => {
  const b = TT.take((await tabs(NOTE))[0], 'n.md', 'h').book;
  const md = TT.toMarkdown(b);
  const lines = md.split('\n');
  assert.equal(lines[0], 'Table: task matrix k3x9a2bq');
  assert.equal(lines[1], '');
  assert.match(lines[3], /^\| :-+ \| -+ \|/);
  // every row as wide as the header, counting wide characters as 2
  const widths = lines.slice(2).map((l) => TT.width(l));
  assert.ok(widths.every((x) => x === widths[0]), JSON.stringify(widths));
  // it reads back as the same table
  const again = (await tabs(md))[0];
  assert.deepEqual([again.name, again.head, again.rows], [b.name, b.columns, b.rows]);
  assert.equal(TT.cellText('a | b\nc'), 'a \\| b c');
  assert.equal(TT.cellText('a \\| b'), 'a \\| b');
  const after = TT.toMarkdown(Object.assign({}, b, { captionAt: 'after' })).split('\n');
  assert.equal(after[after.length - 1], 'Table: task matrix k3x9a2bq');
});

test('putEdit / asTextEdit: the table and its caption replaced in the note; as a code_editor edit', async () => {
  const t = await tabs(NOTE);
  const b = TT.take(t[0], 'n.md', 'h').book;
  b.rows[0][1] = 'DONE';
  const e = TT.putEdit(M.findTable(t, 'task matrix k3x9a2bq'), b);
  const out = NOTE.slice(0, e.from) + e.insert + NOTE.slice(e.to);
  assert.ok(out.startsWith('# Tasks\n\nTable: task matrix k3x9a2bq\n\n| id '));
  assert.ok(out.endsWith('\n\nafter\n'));
  assert.equal((await tabs(out))[0].rows[0][1], 'DONE');
  assert.match(TT.putEdit(M.findTable(t, 'none'), b).error, /no table named/);
  const te = TT.asTextEdit(NOTE, e);
  assert.deepEqual(te.range.start, { line: 2, character: 0 });
  assert.equal(te.range.end.line, 8);
});

test('sorted: every row, by a column as the grid sorts (numbers as numbers, ties in book order); bookPath', () => {
  const b = { columns: ['n', 's'], rows: [['10', 'b'], ['9', 'a'], ['10', 'a'], ['x', 'c']] };
  assert.deepEqual(TT.sorted(b, 0, 1), [1, 0, 2, 3]);
  assert.deepEqual(TT.sorted(b, 1, -1), [3, 0, 1, 2]);
  assert.deepEqual(TT.sorted(b, null, 1), [0, 1, 2, 3]);
  assert.equal(TT.bookPath('task matrix k3x9a2bq'), '~work/books/task_matrix_k3x9a2bq.json');
  assert.equal(TT.bookPath('../x'), '~work/books/x.json');
});
