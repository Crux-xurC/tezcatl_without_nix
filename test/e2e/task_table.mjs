// test/e2e/task_table.mjs -- the task_table panel (D-task-table): `task_table
// take <path> <name>` takes a note's table into a book; cells edited (an id set
// is refused), rows added by number (o a sibling, O a child), moved, deleted;
// `w` saves every row to the book and gives ids to the rows with the mark or
// none; `W` puts it into the note -- the file when no code_editor has it, the
// code_editor unsaved when one has; a table changed in the note since it was
// taken is refused, `task_table put!` puts it anyway; a table without the
// columns is refused; the markdown panel's `t` takes a table too.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'tt');
const books = path.join(E2E, 'work', 'books');
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(books, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const NOTE = [
  '# Tasks', '',
  'Table: tasks a', '',
  '| id | state | pri | task | inner_id |',
  '|----|-------|-----|------|----------|',
  '| t-01 | TODO | A | first | abcd1234 |',
  '| t-02 | NEXT | | second | #eigenvalue |',
  '| t-02-01 | NEXT | | under second | |',
  '',
  'Table: few', '',
  '| id | task |',
  '|----|------|',
  '| t-01 | x |',
  '',
  'the end',
  '',
].join('\n');
const note = () => fs.readFileSync(path.join(dir, 'n.md'), 'utf8');
fs.writeFileSync(path.join(dir, 'n.md'), NOTE);

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (n = 3) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 1200) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const placeOf = async (panel) => { const s = await st(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][0] === panel) return String(c + 1) + String(r + 1); return null; };
const fdoc = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentDocument`;
const press = async (pl, ...ks) => { for (const k of ks) { await p.eval(`(() => { const g = ${fdoc(pl)}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`); await wait(60); } };
const type = (pl, text) => p.eval(`(() => { const i = ${fdoc(pl)}.getElementById('edit-input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
const rows = (pl) => p.eval(`JSON.stringify([...${fdoc(pl)}.querySelectorAll('table.mx-grid tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent)))`).then(JSON.parse);
const foot = (pl) => p.eval(`${fdoc(pl)}.getElementById('foot').textContent`);
const book = () => JSON.parse(fs.readFileSync(path.join(books, 'tasks_a.json'), 'utf8'));

console.log('task_table: take, edit, w, W');
let said = await line('task_table take tt/n.md tasks a', 2000);
const tp = await placeOf('task_table');
check(tp && /"tasks a" of tt\/n\.md in a task_table added at/.test(said), 'task_table take: a panel added: ' + said.split('\n').pop());
check(await p.waitFor(`${fdoc(tp)} && ${fdoc(tp)}.querySelectorAll('table.mx-grid tbody tr').length === 3`, 10000), '...the table drawn as a matrix');
check(JSON.stringify((await rows(tp))[2]) === JSON.stringify(['t-02-01', 'NEXT', '', 'under second', '']), '...cells in their columns (an empty one too)');
check(fs.existsSync(path.join(books, 'tasks_a.json')) && book().path === 'tt/n.md' && /^sha256:/.test(book().hash), '...its book made in the work place (~work/books/tasks_a.json), with the note and the hash of its table');

// i on a task cell (row 1: the cursor starts there; l x4 -> task)
await press(tp, 'l', 'l', 'l', 'l', 'i');
check(await p.eval(`!${fdoc(tp)}.getElementById('edit').hidden && ${fdoc(tp)}.getElementById('edit-input').value === 'first'`), 'i: the cell in the edit line');
await type(tp, 'first | edited');
check((await rows(tp))[0][3] === 'first \\| edited', '...Enter: the cell is the markdown of it (a bare | escaped)');
// the id set is not edited
await press(tp, 'l', 'i');
check(/the id abcd1234 is set/.test(await foot(tp)) && await p.eval(`${fdoc(tp)}.getElementById('edit').hidden`), 'i on an id set: refused');
// o on t-01: t-03 just after it; O on t-02: t-02-02 after t-02-01
await press(tp, 'h', 'h', 'h', 'h', 'o');
let r = await rows(tp);
check(r.map((x) => x[0]).join() === 't-01,t-03,t-02,t-02-01' && r[1][1] === 'TODO' && r[1][4] === '#eigenvalue', 'o: the next sibling t-03 after t-01 (TODO, the mark in its id): ' + r.map((x) => x[0]).join());
await press(tp, 'j', 'O');
r = await rows(tp);
check(r.map((x) => x[0]).join() === 't-01,t-03,t-02,t-02-01,t-02-02', 'O on t-02: the child t-02-02 after t-02-01');
// J / K, d d
await press(tp, 'K');
r = await rows(tp);
check(r.map((x) => x[0]).join() === 't-01,t-03,t-02,t-02-02,t-02-01', 'K: the row up one');
await press(tp, 'k', 'k', 'k', 'd', 'd');
r = await rows(tp);
check(r.map((x) => x[0]).join() === 't-03,t-02,t-02-02,t-02-01', 'd d: the row deleted (t-01)');
await press(tp, 'J');
check((await rows(tp)).map((x) => x[0]).join() === 't-02,t-03,t-02-02,t-02-01', 'J: the row down one');

// w: to the book, ids given to the mark and the empty
await press(tp, 'w');
await p.waitFor(`/saved tasks a/.test(${fdoc(tp)}.getElementById('foot').textContent)`, 5000);
let b = book();
const ids = b.rows.map((x) => x[4]);
check(b.rows.map((x) => x[0]).join() === 't-02,t-03,t-02-02,t-02-01' && ids.every((x) => /^[0-9a-z]{8}$/.test(x)) && new Set(ids).size === 4, 'w: every row to the book in this order, each with an id of 8: ' + ids.join(','));
check(note() === NOTE, '...the note is not touched by w');

// W: no code_editor has the note -> the file
await press(tp, 'W');
await p.waitFor(`/put into tt\\/n\\.md/.test(${fdoc(tp)}.getElementById('foot').textContent)`, 5000);
let n = note();
check(n.startsWith('# Tasks\n\nTable: tasks a\n\n| id ') && n.includes('Table: few') && n.endsWith('the end\n'), 'W: the table and its caption replaced in the file, the rest as it was');
check(ids.every((id) => n.includes(id)) && !n.includes('#eigenvalue') && !n.includes('| t-01  |'), '...with the ids, without t-01');

// W when a code_editor has the note: unsaved there
await line(':find tt/n.md', 2000);
const cp = await placeOf('code_editor');
const view = `(() => { const c = ${fdoc(cp)}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
await p.waitFor(`${fdoc(cp)}.querySelector('.cm-content') && ${view}.state.doc.toString().startsWith('# Tasks')`, 15000);
await wait(500);
await press(tp, 'l', 'i');
await type(tp, 'DONE');
await press(tp, 'W');
await p.waitFor(`/put into tt\\/n\\.md .*the code_editor/.test(${fdoc(tp)}.getElementById('foot').textContent)`, 5000);
check(/\| t-03 +\| DONE /.test(await p.eval(`${view}.state.doc.toString()`)) && !/\| t-03 +\| DONE /.test(note()), 'W with a code_editor on the note: put there, unsaved (the file not yet) ── the state of t-03 (the cursor went with J)');
await line(':w', 1200);
check(/\| t-03 +\| DONE /.test(note()), '...:w there saves it');

// the note's table changed since: refused; put! anyway
await p.eval(`(() => { const v = ${view}; const t = v.state.doc.toString(); const i = t.indexOf('NEXT'); v.dispatch({ changes: { from: i, to: i + 4, insert: 'WAIT' } }); return true; })()`);
await line(':w', 1200);
await press(tp, 'W');
await p.waitFor(`/changed since it was taken/.test(${fdoc(tp)}.getElementById('foot').textContent)`, 5000);
check(/WAIT/.test(note()), 'the note\'s table changed since: W refused (the note keeps WAIT)');
said = await line('task_table put!', 2500);
check(/put into tt\/n\.md/.test(await foot(tp)) && /NEXT/.test(await p.eval(`${view}.state.doc.toString()`)) && !/WAIT/.test(await p.eval(`${view}.state.doc.toString()`)), 'task_table put!: put over it (in the code_editor)');
await line(':w', 1200);

// a table without the columns; the markdown panel's t
said = await line('task_table take tt/n.md few', 2500);
check(/has no column state, inner_id/.test(said), 'a table without the columns: refused: ' + said.split('\n').pop());
await line('markdown tt/n.md', 2000);
const mp = await placeOf('markdown');
await p.waitFor(`${fdoc(mp)} && ${fdoc(mp)}.querySelector('#doc table')`, 10000);
for (let i = 0; i < 6; i++) {
  if (await p.eval(`!!${fdoc(mp)}.querySelector('#doc > .blk.sel table')`)) break;
  await p.eval(`(() => { const d = ${fdoc(mp)}.getElementById('doc'); d.focus(); d.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true })); return true; })()`);
}
const before = (await st()).columns.flat().filter((x) => x[0] === 'task_table').length;
await p.eval(`(() => { const d = ${fdoc(mp)}.getElementById('doc'); d.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true })); return true; })()`);
await wait(2000);
const after = (await st()).columns.flat().filter((x) => x[0] === 'task_table').length;
check(after === before + 1 && /"tasks a" of tt\/n\.md in a task_table added/.test(await lastRecv(4)), 'the markdown panel\'s t on the table: a task_table for it (its book read)');

done();
