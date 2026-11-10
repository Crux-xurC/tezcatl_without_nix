'use strict';
// lib/task/run-table.js: a book of lines sent one by one (D-run-table)
const test = require('node:test');
const assert = require('node:assert/strict');
const RT = require('../lib/task/run-table.js');
const C = require('../lib/skin/run-table-commands.js');
const TX = require('../lib/recv/term-text.js');
const lead = require('../lib/core/lead.js');

const COLS = ['id', 'input', 'line', 'wait', 'auto', 'status', 'note', 'path'];
function book(rows, extra) {
  const r = RT.fromTemplate(Object.assign({ columns: COLS, defaults: { input: 't', auto: 'T' }, rows }, extra || {}), 'b', 'blank');
  assert.ok(r.book, r.error);
  return r.book;
}
const S = 5;

test('fromTemplate: the seven columns first, variables are names, rows get the defaults and ids', () => {
  assert.match(RT.fromTemplate({ columns: ['id', 'line'] }).error, /begin id, input, line/);
  assert.match(RT.fromTemplate({ columns: COLS.slice(0, 7).concat(['a b']) }).error, /not a name/);
  assert.match(RT.fromTemplate({ columns: COLS.concat(['path']) }).error, /twice/);
  const b = book([['', '', 'ls'], ['7', 'x', 'pwd', '1', 'F']]);
  assert.deepEqual(b.rows[0], ['1', 't', 'ls', '', 'T', '', '', '']);
  assert.deepEqual(b.rows[1], ['7', 'x', 'pwd', '1', 'F', '', '', '']);
  assert.equal(RT.blankRow(b)[0], '8');
  assert.equal(RT.blankRow(b)[1], 't');
});

test('next: the smallest id whose status is empty; filled ones (any status) are passed', () => {
  const b = book([['3', '', 'c'], ['1', '', 'a', '', '', 'err'], ['2', '', 'b', '', '', 'sent'], ['10', '', 'd']]);
  assert.equal(RT.next(b).index, 0);
  b.rows[0][S] = 'done';
  assert.equal(RT.next(b).index, 3);   // 10 after 3: ids compare as numbers
  b.rows[3][S] = 'stop';
  assert.equal(RT.next(b), null);
});

test('next: auto F under a failure is skip; T goes anyway; done / skip / stop / sent are not failures', () => {
  const b = book([['1', '', 'a', '', '', 'err'], ['2', '', 'b', '', 'F'], ['3', '', 'c', '', 'T']]);
  assert.deepEqual(RT.next(b), { index: 1, skip: true, because: '1' });
  b.rows[1][S] = 'skip';
  assert.deepEqual(RT.next(b), { index: 2, skip: false });
  const ok = book([['1', '', 'a', '', '', 'done'], ['2', '', 'a', '', '', 'skip'], ['3', '', 'a', '', '', 'stop'], ['4', '', 'a', '', '', 'sent'], ['5', '', 'b', '', 'F']]);
  assert.deepEqual(RT.next(ok), { index: 4, skip: false });
  const sf = book([['1', '', 'a', '', '', 'send-failed'], ['2', '', 'b', '', 'f']]);
  assert.equal(RT.next(sf).skip, true);
});

test('expand: {name} of a variable column is its cell, escaped; other braces stay', () => {
  const b = book([['1', '', 'magit stage {path} ${HOME} {nope};e', '', '', '', '', 'a;b.js']]);
  const esc = (v) => lead.escape(v);
  assert.equal(RT.expand(b, 0, esc).text, 'magit stage a;;b.js ${HOME} {nope};e');
  const p = lead.parse(RT.expand(b, 0, esc).text);
  assert.ok(p.events);
  assert.equal(p.events.filter((e) => e.key === ';').length, 1);
  assert.match(RT.expand(book([['1', '', '  ']]), 0).error, /empty/);
});

test('waitOf: the cell, else the default; not a number is an error', () => {
  const b = book([['1', '', 'a', ''], ['2', '', 'a', '0.5'], ['3', '', 'a', 'soon']]);
  assert.deepEqual(RT.waitOf(b, 0, 4), { sec: 4 });
  assert.deepEqual(RT.waitOf(b, 1, 4), { sec: 0.5 });
  assert.match(RT.waitOf(b, 2, 4).error, /not a number/);
});

test('settings and match: the global keys under the template; "" takes one out; the runner\'s own are refused', () => {
  const s = RT.settings({ wait: 2, keys: { err: ['! '], 中断: 'Interrupted' } }, { keys: { err: '', fail: ['#fail', 'FAIL'], done: 'x' } });
  assert.equal(s.wait, 2);
  assert.deepEqual(Object.keys(s.keys), ['中断', 'fail']);
  assert.match(s.errors.join(), /"done" is the runner's own/);
  assert.deepEqual(RT.match(s.keys, 'FAIL: 3 tests'), { key: 'fail', prefix: 'FAIL' });
  assert.equal(RT.match(s.keys, ' FAIL'), null);   // the head of the line only
  assert.equal(RT.match(s.keys, 'Interrupted by user').key, '中断');
  assert.equal(RT.settings(null, null).wait, RT.WAIT);
});

test('stopAll and mark', () => {
  const b = book([['1', '', 'a', '', '', 'done'], ['2', '', 'b'], ['3', '', 'c']]);
  assert.equal(RT.stopAll(b), 2);
  assert.deepEqual(b.rows.map((r) => r[S]), ['done', 'stop', 'stop']);
  RT.mark(b, 1, 'err', '! no\nsuch');
  assert.equal(b.rows[1][6], '! no such');
});

test('paths: the book in ~work/books/run; a template by name beside the pages, a saved one by its path', () => {
  assert.equal(RT.bookPath('my run/1'), '~work/books/run/my_run_1.json');
  assert.deepEqual(RT.templatePath('blank'), { from: 'page', path: 'tasks/run/blank.json' });
  assert.deepEqual(RT.templatePath('/notes/r.json'), { from: 'fs', path: 'notes/r.json' });
  const b = book([['1', '', 'a']]);
  assert.deepEqual(RT.fromTemplate(RT.toJson(b), b.name, b.template).book.rows, b.rows);
});

test('term-text take / rest: the lines ended since the last take, and the one being printed', () => {
  const t = TX.create(3);
  t.write('a\nb');
  assert.deepEqual(t.take(), ['a']);
  assert.equal(t.rest(), 'b');
  t.write('\nc\nd\ne\nf\n');
  assert.deepEqual(t.take(), ['d', 'e', 'f']);   // of those kept (3)
  assert.deepEqual(t.take(), []);
});

test('commands: parse', () => {
  assert.equal(C.parse('runner'), null);
  assert.deepEqual(C.parse('run new blank'), { cmd: 'new', template: 'blank', name: null, fresh: false });
  assert.deepEqual(C.parse('run new! notes/r.json r1'), { cmd: 'new', template: 'notes/r.json', name: 'r1', fresh: true });
  assert.deepEqual(C.parse('run start'), { cmd: 'start' });
  assert.deepEqual(C.parse('run stop'), { cmd: 'stop' });
  assert.deepEqual(C.parse('run save! /notes/r.json'), { cmd: 'save', path: 'notes/r.json', bang: true });
  assert.match(C.parse('run save').error, /where to/);
  assert.match(C.parse('run new').error, /a template/);
  assert.match(C.parse('run').error, /run new/);
});

test('commands: new adds a panel; start / stop / save go to the focused run_table, else the first', () => {
  const said = [], posts = [], added = [];
  let panels = [];
  const w = C.wire({
    bus: { post: (t, p, o) => posts.push([t, p, o.to]) },
    recv: (t, cls) => said.push([t, cls]),
    add: (t, n, f) => { added.push([t, n, f]); return true; },
    panels: () => panels,
  });
  assert.equal(w.handle('run new blank x'), true);
  assert.deepEqual(added, [['blank', 'x', false]]);
  assert.equal(w.handle('run start'), false);
  assert.match(said[0][0], /no run_table here/);
  panels = [{ id: 'p1', bus: 'b1', place: '1', focused: false }, { id: 'p2', bus: 'b2', place: '2', focused: true }];
  w.handle('run stop');
  w.handle('run save out.json');
  assert.deepEqual(posts, [['run_table.do', { op: 'stop', path: null, bang: false }, 'b2'], ['run_table.do', { op: 'save', path: 'out.json', bang: false }, 'b2']]);
  assert.equal(w.handle('ls'), false);
});

test('insert-if: the row above, a decimal id just under, a copy of #from with its status empty', () => {
  const b = book([['3', '', 'a', '', '', 'done'], ['4', '', 'run insert-if done #20'], ['5', '', 'b'], ['20', 'x', 'make;e', '9', 'F', '-', 'lib']]);
  assert.equal(RT.above(b, 1), 0);
  assert.equal(RT.above(b, 0), -1);
  const r = RT.insertIf(b, 1, 'done', '20');
  assert.equal(r.inserted, '4.1');
  assert.deepEqual(b.rows[2], ['4.1', 'x', 'make;e', '9', 'F', '', '', '']);
  assert.match(r.note, /inserted #4\.1 from #20 \(#3 was done\)/);
  assert.equal(RT.next(b).index, 1);            // #4 (its own status is set by the runner)
  b.rows[1][S] = 'done';
  assert.equal(RT.next(b).index, 2);            // then the copy, before #5
  assert.equal(RT.insertIf(b, 1, 'done', '20').inserted, '4.01');   // 4.1 there: one more decimal
  assert.equal(RT.insertId(b, '4.1').id, '4.11');
  assert.match(RT.insertIf(b, 1, 'err', '20').note, /not inserted \(#3 is done\)/);
  assert.match(RT.insertIf(b, 0, 'done', '20').note, /no row above/);
  assert.match(RT.insertIf(b, 1, 'done', '99').error, /no row #99/);
  assert.match(RT.insertId(book([['a', '', 'x']]), 'a').error, /not a number/);
});

test('commands: insert-if asks every run_table, the only one going gets it; none or two are refused', () => {
  const said = [], posts = [], handlers = {}, timers = [];
  const panels = [{ id: 'p1', bus: 'b1', place: '1' }, { id: 'p2', bus: 'b2', place: '2' }];
  const w = C.wire({
    bus: { post: (t, p, o) => posts.push([t, p, o.to]), onMine: (t, f) => { handlers[t] = f; } },
    recv: (t, cls) => said.push([t, cls]),
    add: () => true, panels: () => panels, wait: (fn) => timers.push(fn),
  });
  assert.deepEqual(C.parse('run insert-if done #20'), { cmd: 'insert-if', status: 'done', from: '20' });
  assert.match(C.parse('run insert-if done 20').error, /run insert-if <status> #<id>/);
  const ask = () => { posts.length = 0; w.handle('run insert-if done #20'); return posts.map((x) => x[1].req)[0]; };
  // one going
  let req = ask();
  assert.deepEqual(posts.map((x) => [x[0], x[2]]), [['run_table.ask', 'b1'], ['run_table.ask', 'b2']]);
  handlers['run_table.going']({ req, going: false }, { from: { id: 'b1' } });
  handlers['run_table.going']({ req, going: true, row: '4', book: 'a' }, { from: { id: 'b2' } });
  assert.deepEqual(posts[2], ['run_table.do', { op: 'insert-if', req, status: 'done', from: '20' }, 'b2']);
  handlers['run_table.inserted']({ req, ok: true, note: 'inserted #4.1' });
  assert.deepEqual(said.pop(), ['run insert-if ── inserted #4.1', undefined]);
  // its failure: a ! line
  req = ask();
  handlers['run_table.going']({ req, going: true, row: '4', book: 'a' }, { from: { id: 'b1' } });
  handlers['run_table.going']({ req, going: false }, { from: { id: 'b2' } });
  handlers['run_table.inserted']({ req, ok: false, error: 'no row #20' });
  assert.match(said.pop()[0], /^! run insert-if ── no row #20/);
  // two going: refused
  req = ask();
  handlers['run_table.going']({ req, going: true, row: '4', book: 'a' }, { from: { id: 'b1' } });
  handlers['run_table.going']({ req, going: true, row: '2', book: 's' }, { from: { id: 'b2' } });
  assert.match(said.pop()[0], /^! run insert-if ── 2 run_tables are sending a row now \(a #4, s #2\)/);
  assert.equal(posts.filter((x) => x[0] === 'run_table.do').length, 0);
  // none answers in time
  req = ask();
  timers.pop()();
  assert.match(said.pop()[0], /^! run insert-if ── no run_table is sending a row now/);
});

test('run from: addAnswer puts an answer into the variable columns, after the book\'s rows, with the defaults', () => {
  const b = book([['1', '', 'ls;e']]);
  b.defaults.line = 'intent magit.stage-file path={path}';
  assert.deepEqual(RT.addAnswer(b, [{ path: '/a.js' }, { path: 'b\nc' }]), { n: 2 });
  assert.deepEqual(b.rows.slice(1).map((r) => [r[0], r[2], r[7]]), [['2', 'intent magit.stage-file path={path}', '/a.js'], ['3', 'intent magit.stage-file path={path}', 'b c']]);
  assert.match(RT.addAnswer(b, [{ line: 'x' }]).error, /not a variable column of the template: line \(it has path\)/);
  b.intent = 'magit.changed-files';
  assert.equal(RT.fromTemplate(RT.toJson(b), b.name, b.template).book.intent, 'magit.changed-files');
});

test('run from: parse; intent <id> name=value: values up to a blank or a JSON string', () => {
  const I = require('../lib/skin/intent-commands.js');
  assert.deepEqual(C.parse('run from magit.changed-files'), { cmd: 'from', intent: 'magit.changed-files', name: null, args: {}, fresh: false });
  assert.deepEqual(C.parse('run from! x.y mine dir="/a b"'), { cmd: 'from', intent: 'x.y', name: 'mine', args: { dir: '/a b' }, fresh: true });
  assert.deepEqual(C.parse('run from x.y dir=/a'), { cmd: 'from', intent: 'x.y', name: null, args: { dir: '/a' }, fresh: false });
  assert.match(C.parse('run from').error, /an intent/);
  assert.equal(I.parse('intents'), null);
  assert.deepEqual(I.parse('intent magit.stage-file path=/a/b.js msg="a \\"b\\""'), { id: 'magit.stage-file', args: { path: '/a/b.js', msg: 'a "b"' }, table: false, confirmed: false });
  assert.deepEqual(I.parse('intent! magit.discard-file path=/a'), { id: 'magit.discard-file', args: { path: '/a' }, table: false, confirmed: true });
  assert.deepEqual(I.parse('table magit.commit-files rev=abc1234'), { id: 'magit.commit-files', args: { rev: 'abc1234' }, table: true, confirmed: false });
  assert.match(I.parse('table').error, /table <intent>/);
  assert.equal(I.parse('tables'), null);
  assert.match(I.parse('intent').error, /intent <id>/);
  assert.match(I.parse('intent a.b c').error, /<name>=<value>, not "c"/);
  assert.match(I.parse('intent a.b c="x').error, /not a closed/);
});

test('intent line: intent.run; the answer said (ok and short), a failure and no answer as ! lines', () => {
  const I = require('../lib/skin/intent-commands.js');
  const said = [], posts = [], timers = [];
  let ran = null, took = null;
  const w = I.wire({ bus: { post: (t, p) => posts.push([t, p]), on: (t, f) => { if (t === 'intent.ran') ran = f; if (t === 'intent.took') took = f; } }, recv: (t, cls) => said.push([t, cls || null]), wait: (fn) => timers.push(fn) });
  assert.equal(w.handle('ls'), false);
  assert.equal(w.handle('table m.t'), false);
  assert.deepEqual(said.pop(), ['! table ── only in a frame', 'err']);
  assert.equal(w.handle('intent m.s path=/a'), true);
  const req = posts[0][1].req;
  assert.deepEqual(posts[0], ['intent.run', { req, id: 'm.s', args: { path: '/a' } }]);
  ran({ req, ok: true, payload: { n: 1 } });
  assert.deepEqual(said.pop(), ['intent ── m.s ok {"n":1}', null]);
  timers.pop()();
  assert.equal(said.length, 0);   // answered: the timer says nothing
  w.handle('intent m.s');
  ran({ req: posts[1][1].req, ok: false, error: 'boom' });
  assert.deepEqual(said.pop(), ['! intent ── m.s: boom', 'err']);
  w.handle('intent m.t');
  timers.pop()();
  assert.match(said.pop()[0], /^! intent ── no answer for m\.t/);
  // a later intent (D-intent-later): intent.took said once, then no time limit; the answer still comes
  w.handle('intent m.p');
  const preq = posts[posts.length - 1][1].req;
  took({ req: preq, id: 'm.p' });
  took({ req: preq, id: 'm.p' });
  assert.deepEqual(said.pop(), ['intent ── m.p running (answered when it ends)', null]);
  assert.equal(said.length, 0);
  timers.pop()();
  assert.equal(said.length, 0);   // running: the timer says nothing
  ran({ req: preq, ok: true, payload: { exit: 0, output: '' } });
  assert.deepEqual(said.pop(), ['intent ── m.p ok {"exit":0,"output":""}', null]);
});

test('output_log: a line a thing said, read back; run lines', () => {
  const OL = require('../lib/recv/output-log.js');
  const d = new Date(2026, 9, 18, 9, 5, 7, 42);
  assert.equal(OL.format(d, 'xterm:f-1', 'a\nb'), '09:05:07.042 xterm:f-1 │ a\\nb\n');
  assert.equal(OL.defaultPath(d), '~work/logs/2026-10-18_090507.log');
  assert.equal(OL.markText({ book: 'a', id: '4.1', what: 'send', input: 'x', line: 'make;e' }), 'a #4.1 send x make;e');
  assert.equal(OL.markText({ book: 'a', id: '1', what: 'sent', dest: 'tezcatl', key: 'tezcatl' }), 'a #1 sent tezcatl tezcatl');
  assert.equal(OL.markText({ book: 'a', id: '1', what: 'status', status: 'err', note: '! x' }), 'a #1 status err ! x');
  const es = OL.parse('# head\n' + OL.format(d, 'run', 'a #1 send t who') + 'junk\n' + OL.format(d, 'tezcatl', '> who'));
  assert.deepEqual(es.map((e) => [e.n, e.src, e.text]), [[2, 'run', 'a #1 send t who'], [4, 'tezcatl', '> who']]);
  assert.deepEqual(OL.mark(es[0]), { book: 'a', id: '1', what: 'send', rest: 't who' });
  assert.equal(OL.mark(es[1]), null);
});

test('run match: each row its part of the record, its destination only; ≠ where the book differs', () => {
  const OL = require('../lib/recv/output-log.js');
  const RM = require('../lib/task/run-match.js');
  const d = new Date(2026, 9, 18, 9, 0, 0, 0);
  const L = (src, t) => OL.format(d, src, t);
  const rec = [
    L('log', '# output_log x started'),
    L('run', 'a #1 send x make;e'), L('run', 'a #1 sent xterm f-1'),
    L('xterm:f-1', '$ make'), L('tezcatl', '! not this row (tezcatl)'), L('xterm:f-2', '#fail other terminal'),
    L('run', 'a #1 status done'),
    L('run', 'a #2 send t who'), L('run', 'a #2 sent tezcatl tezcatl'), L('tezcatl', '> who'),
    L('xterm:f-1', '#fail 2'),                       // late: #1's terminal, after #2 (to tezcatl) went -- still #1's part
    L('run', 'a #2 status done'),
    L('run', 'a #3 send t skin x'), L('run', 'a #3 sent tezcatl tezcatl'), L('tezcatl', '! no such command'),
    L('run', 'b #1 send t who'),                     // another book: not a row of a
    L('run', 'a #5 send zz who'), L('run', 'a #5 not-sent no destination "zz"'), L('run', 'a #5 status send-failed no destination'),
    L('run', 'a #6 send e ;cg'), L('run', 'a #6 sent emacs-vent emacs'), L('emacs-vent', '[null] quit'),
  ].join('');
  const es = OL.parse(rec);
  assert.deepEqual(RM.books(es), ['a', 'b']);
  const b = book([['1', 'x', 'make;e', '', '', 'done'], ['2', '', 'who', '', '', 'done'], ['3', '', 'skin x', '', '', 'done'], ['4', '', 'who', '', '', 'sent'],
    ['5', 'zz', 'who', '', '', 'send-failed'], ['6', 'e', ';cg', '', '', 'done'], ['7', '', 'who', '', '', 'stop']]);
  b.name = 'a';
  const r = RM.match(es, b, { err: ['! '], fail: ['#fail'] });
  const by = (id) => r.find((x) => x.id === id);
  assert.equal(by('1').count, 2);                    // its terminal's lines only: not f-2's, not tezcatl's
  assert.deepEqual([by('1').key, by('1').hit, by('1').differs], ['fail', '#fail 2', true]);   // the book says done: the late line differs
  assert.match(by('1').why, /the record has fail \(#fail 2\)/);
  assert.equal(by('2').count, 1);                    // '> who' -- up to #3, the next row to tezcatl
  assert.equal(by('2').differs, false);
  assert.deepEqual([by('3').key, by('3').hit, by('3').differs], ['err', '! no such command', true]);
  assert.match(by('3').why, /the record has err/);
  assert.equal(by('3').logged, '');
  assert.deepEqual([by('4').differs, by('4').why], [true, 'left sent, not in the record']);
  const b2 = book([['9', '', 'who', '', '', 'done']]);
  b2.name = 'a';
  assert.deepEqual(RM.match(es, b2, {}).map((x) => [x.differs, x.why]), [[false, 'not in the record']]);
  assert.equal(by('5').differs, false);
  assert.deepEqual([by('6').count, by('6').differs], [1, false]);
  assert.equal(by('7').differs, false);              // stop: never sent
  assert.equal(by('2').line, 'who');
  assert.equal(by('1').logged, 'done');
});

test('log lines and run match: parse, one output_log at a time, its answers', () => {
  const LC = require('../lib/skin/log-commands.js');
  assert.equal(LC.parse('login'), null);
  assert.deepEqual(LC.parse('log'), { cmd: 'state' });
  assert.deepEqual(LC.parse('log start'), { cmd: 'start', path: null, bang: false });
  assert.deepEqual(LC.parse('log start! ~work/logs/a.log'), { cmd: 'start', path: '~work/logs/a.log', bang: true });
  assert.deepEqual(LC.parse('log start /notes/a.log'), { cmd: 'start', path: 'notes/a.log', bang: false });
  assert.deepEqual(LC.parse('log stop'), { cmd: 'stop' });
  assert.match(LC.parse('log begin').error, /log start/);
  assert.deepEqual(C.parse('run match ~work/logs/a.log'), { cmd: 'match', log: '~work/logs/a.log', book: null });
  assert.deepEqual(C.parse('run match /r.log a'), { cmd: 'match', log: 'r.log', book: 'a' });
  const said = [], posts = [], on = {}, timers = [];
  let mounted = 0, unmounted = 0;
  const el = {};
  const w = LC.wire({
    bus: { post: (t, p, o) => posts.push([t, o && o.to]), on: (t, f) => { on[t] = f; } }, recv: (t, cls) => said.push([t, cls || null]),
    mount: () => { mounted++; return el; }, unmount: () => { unmounted++; }, busOf: () => 'L1', wait: (fn) => timers.push(fn),
  });
  w.handle('log start ~work/logs/a.log');
  assert.equal(mounted, 1);
  w.handle('log start');
  assert.match(said.pop()[0], /already ── log stop first/);
  on['log.started']({ ok: true, path: '~work/logs/a.log' }, { from: { id: 'L1' } });
  assert.deepEqual(said.pop(), ['log ── writing to ~work/logs/a.log', null]);
  w.handle('log');
  assert.match(said.pop()[0], /writing to ~work\/logs\/a\.log/);
  w.handle('log stop');
  assert.deepEqual(posts.pop(), ['log.stop', 'L1']);
  on['log.stopped']({ ok: true, path: '~work/logs/a.log', lines: 9 }, { from: { id: 'L1' } });
  assert.equal(unmounted, 1);
  assert.match(said.pop()[0], /written to ~work\/logs\/a\.log \(9 lines\) and stopped/);
  timers.pop()();                                    // answered: nothing more
  assert.equal(unmounted, 1);
  w.handle('log stop');
  assert.match(said.pop()[0], /not writing/);
});

test('table line: handed to the frame with the arguments; no intent.run of its own', () => {
  const I = require('../lib/skin/intent-commands.js');
  const posts = [], tables = [];
  const w = I.wire({ bus: { post: (t, p) => posts.push([t, p]), on: () => {} }, recv: () => {}, table: (id, args) => { tables.push([id, args]); return true; } });
  assert.equal(w.handle('table magit.log count=5'), true);
  assert.deepEqual(tables, [['magit.log', { count: '5' }]]);
  assert.deepEqual(posts, []);
});
