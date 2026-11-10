// test/e2e/agenda.mjs -- the task list (D-task-list): a task_table's rows shown
// (its filter, its order) cut by `L` into ~work/books/task_list.json; the agenda
// (list.html?config=agenda) shows them in that order; `d` DONE goes into the
// task_table's book, to every row under it too (one the list does not show as
// well), and an open task_table reads its book again; `M-n` a new task with an
// id in both; Del takes a row out of the list only; W puts it all into the note.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'ag');
const books = path.join(E2E, 'work', 'books');
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(books, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'n.md'), [
  'Table: plan', '',
  '| id | state | pri | task | inner_id |',
  '|---|---|---|---|---|',
  '| t-01 | TODO | B | first | |',
  '| t-02 | TODO | A | second | |',
  '| t-02-01 | NEXT | | under second | |',
  '| t-03 | DONE | | done already | |',
  '',
].join('\n'));
const book = () => JSON.parse(fs.readFileSync(path.join(books, 'plan.json'), 'utf8'));
const list = () => JSON.parse(fs.readFileSync(path.join(books, 'task_list.json'), 'utf8'));

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text, ms = 1500) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
}
const tdoc = `window.frameSkin.frameAt('11').contentDocument`;
const press = async (...ks) => { for (const k of ks) { await p.eval(`(() => { const g = ${tdoc}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`); await wait(80); } };
const footT = () => p.eval(`${tdoc}.getElementById('foot').textContent`);

console.log('the agenda: a task list cut from a task_table');
await line('task_table take ag/n.md plan', 2500);
await p.waitFor(`${tdoc} && ${tdoc}.querySelectorAll('table.mx-grid tbody tr').length === 4`, 10000);
// sort by pri (the header), filter state to not DONE: shown t-02, t-01, t-02-01 (pri '' sorts first? -- empty first): check what is shown
await p.eval(`(() => { const th = [...${tdoc}.querySelectorAll('table.mx-grid thead th')].find((x) => x.textContent.startsWith('pri')); th.click(); return true; })()`);
await press('l', 'l', '/');
await p.waitFor(`!!${tdoc}.querySelector('tr.mx-filter-row input')`, 3000);
await p.eval(`(() => { const i = ${tdoc}.querySelector('tr.mx-filter-row input'); i.value = '!= DONE'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
await wait(200);
const shown = await p.eval(`JSON.stringify([...${tdoc}.querySelectorAll('table.mx-grid tbody tr')].map((tr) => tr.querySelectorAll('td')[1].textContent))`).then(JSON.parse);
check(!shown.includes('t-03') && shown.length === 3, 'the task_table sorted by pri and filtered to what is not DONE: ' + shown.join(','));
await press('L');
check(await p.waitFor(`/cut into the task list/.test(${tdoc}.getElementById('foot').textContent)`, 8000), 'L: said: ' + (await footT()));
check(JSON.stringify(list().rows.map((r) => r[0])) === JSON.stringify(shown) && list().source === 'plan', '...the task list has the rows shown, in that order (the rank)');
const b0 = book();
check(b0.rows.every((r) => /^[0-9a-z]{8}$/.test(r[4])), '...after w: every row of the book has an id');
const idOf = (no) => book().rows.find((r) => r[0] === no)[4];

// the agenda
const ag = await openPage(PAGES + 'panels/tool/list.html?config=agenda');
await ag.waitFor(`document.querySelectorAll('#list li').length === 3`, 10000);
const labels = () => ag.eval(`JSON.stringify([...document.querySelectorAll('#list li')].map((li) => li.textContent))`).then(JSON.parse);
let l = await labels();
check(shown.every((no, i) => l[i].includes(no)), 'the agenda shows the list in its order: ' + l.join(' | '));
// d on t-02 (where it is in the list): DONE, and t-02-01 under it
const at = shown.indexOf('t-02');
const sel = async (i) => { await ag.eval(`document.getElementById('filter').focus(); true`); for (let k = 0; k < 5; k++) await ag.key('ArrowUp', 'ArrowUp'); for (let k = 0; k < i; k++) await ag.key('ArrowDown', 'ArrowDown'); };
await sel(at);
await ag.key('d', 'KeyD', 'd');
await wait(1200);
check(book().rows.find((r) => r[0] === 't-02')[1] === 'DONE' && book().rows.find((r) => r[0] === 't-02-01')[1] === 'DONE', 'd: t-02 DONE in the book, and t-02-01 under it');
check(list().rows.find((r) => r[0] === 't-02-01')[1] === 'DONE', '...the list shows it too');
// (its filter `!= DONE` is still on: t-02 and t-02-01 leave the table shown)
check(await p.waitFor(`/read the book again/.test(${tdoc}.getElementById('foot').textContent) && ![...${tdoc}.querySelectorAll('table.mx-grid tbody tr')].some((tr) => /^t-02/.test(tr.querySelectorAll('td')[1].textContent))`, 8000), '...the open task_table reads its book again (t-02 and t-02-01 now DONE: filtered out)');
// M-n: a new task
await ag.eval(`(() => { const f = document.getElementById('filter'); f.focus(); f.value = '資料を作る'; f.dispatchEvent(new Event('input')); return true; })()`);
await ag.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'n', code: 'KeyN', modifiers: 1 });
await ag.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'n', code: 'KeyN', modifiers: 1 });
await wait(1500);
const nw = book().rows.find((r) => r[3] === '資料を作る');
check(nw && nw[0] === 't-04' && /^[0-9a-z]{8}$/.test(nw[4]) && list().rows.some((r) => r[4] === nw[4]), 'M-n: a new task t-04 with an id, in the book and the list');
// Del: out of the list only
await ag.eval(`(() => { const f = document.getElementById('filter'); f.value = ''; f.dispatchEvent(new Event('input')); return true; })()`);
const before = list().rows.length;
await sel(0);
const gone = list().rows[0][4];
await ag.key('Delete', 'Delete');
await wait(1200);
check(list().rows.length === before - 1 && !list().rows.some((r) => r[4] === gone) && book().rows.some((r) => r[4] === gone), 'Del: out of the list, the book keeps it');

// W: all of it into the note
await press('W');
await p.waitFor(`/put into ag\\/n\\.md/.test(${tdoc}.getElementById('foot').textContent)`, 8000);
const note = fs.readFileSync(path.join(dir, 'n.md'), 'utf8');
check(/\| t-02-01 +\| DONE /.test(note) && note.includes('資料を作る') && note.includes(idOf('t-01')), 'W: the note has DONE under t-02, the new task, the ids');

done();
