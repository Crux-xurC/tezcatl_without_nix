'use strict';
// lib/skin/task-table-commands.js: the `task_table ...` lines of the frame (D-task-table)
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/skin/task-table-commands.js');

test('parse: take[!] <path> <name with blanks> / save / put[!]; other lines are not its', () => {
  assert.equal(C.parse('markdown a.md'), null);
  assert.equal(C.parse('task_tables'), null);
  assert.deepEqual(C.parse('task_table take notes/t.md task matrix k3x9a2bq'), { cmd: 'take', path: 'notes/t.md', name: 'task matrix k3x9a2bq', fresh: false });
  assert.deepEqual(C.parse('task_table take! /notes/t.md  x '), { cmd: 'take', path: 'notes/t.md', name: 'x', fresh: true });
  assert.deepEqual(C.parse('task_table save'), { cmd: 'save' });
  assert.deepEqual(C.parse('task_table list'), { cmd: 'list' });
  assert.deepEqual(C.parse('task_table put'), { cmd: 'put', bang: false });
  assert.deepEqual(C.parse('task_table put!'), { cmd: 'put', bang: true });
  assert.match(C.parse('task_table take notes/t.md').error, /a note and a table name/);
  assert.match(C.parse('task_table').error, /task_table take/);
  assert.match(C.parse('task_table take ../../x y', (a) => (a.startsWith('..') ? { error: 'outside the FS root' } : { path: a })).error, /outside/);
});

test('wire: take adds a panel; save / put go to the focused task_table, else the first; none is said', () => {
  const sent = [], said = [], added = [];
  let panels = [{ id: 'p1', bus: 'b1', place: '12' }, { id: 'p2', bus: 'b2', place: '13', focused: true }];
  const w = C.wire({
    bus: { post: (type, payload, o) => sent.push({ type, payload, to: o && o.to }) },
    recv: (text, cls) => said.push({ text, cls }),
    resolve: (a) => ({ path: a }),
    add: (path, name, fresh) => { added.push([path, name, fresh]); return true; },
    panels: () => panels,
  });
  assert.equal(w.handle('task_table take n.md my table'), true);
  assert.deepEqual(added, [['n.md', 'my table', false]]);
  w.handle('task_table put!');
  assert.deepEqual(sent, [{ type: 'task_table.do', payload: { op: 'put', bang: true }, to: 'b2' }]);
  panels = [];
  assert.equal(w.handle('task_table save'), false);
  assert.match(said[0].text, /there is no task_table here/);
});
