// test/e2e/db_books.mjs -- Tezcatl's own tables into the database and back
// (D-db-session, step 7), against nix/db (tezcatl_e2e). Without Emacs: the
// answer of magit.changed-files is played by posting intent.result.
//   b in decode_emacs writes the table shown (the rows chosen with v, else every
//   row shown) to ~work/books/decode/<intent>.json; an intent's sql.load naming a
//   book outside ~work/books is not sent; window 1 not open: the intent stops
//   with what is needed. With TEZCATL_E2E_DB_PASSWORD also: logged in,
//   db.magit-section makes the book the temporary table t_in on window 1 and
//   takes one section from it in the book's order; a book that is not there is
//   said; `run from db.magit-section` makes the answer the rows of a run_table.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = process.env.TEZCATL_E2E_DB_PASSWORD || '';
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const books = path.join(E2E, 'work', 'books');
fs.rmSync(path.join(books, 'decode'), { recursive: true, force: true });
fs.rmSync(path.join(books, 'run', 'e2e_sec.json'), { force: true });
const readBook = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(books, rel), 'utf8')); } catch (_) { return null; } };

// pages left open by earlier scenarios may hold window 1, or answer intent.run: close them all
const CDP = 'http://127.0.0.1:' + (process.env.CDP_PORT || '9223');
for (const t of await (await fetch(CDP + '/json/list')).json()) {
  if (t.type === 'page') await fetch(CDP + '/json/close/' + t.id);
}

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
await p.eval(`sessionStorage.clear(); true`);
await p.send('Page.reload', {});
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text, ms = 500) {
  await p.send('Runtime.evaluate', { expression: `document.getElementById('line').focus(); true`, userGesture: true });
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
}
// what the frame says of an intent: its own line (the answer comes later than the echo)
const said = (id, ms = 8000) => p.waitFor(`(() => { const r = [...document.getElementById('recv').children].map((d) => d.textContent).reverse().find((t) => /intent ── ${id.replace('.', '\\.')}/.test(t)); return r || false; })()`, ms);
const clear = () => p.eval(`document.getElementById('recv').textContent = ''; true`);
const recv = () => p.eval(`document.getElementById('recv').textContent`);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const placeOf = async (panel) => { const s = await st(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][0] === panel) return String(c + 1) + String(r + 1); return null; };
const synthOf = (own) => p.eval(`(() => { const s = window.frameSkin.state(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][4] && s.columns[c][r][4].synthesis === ${JSON.stringify(own)}) return '' + (c + 1) + (r + 1); return null; })()`);
const fdoc = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentDocument`;
const inner = (place, k) => `window.frameSkin.innerAt('${place}', ${k})`;
const bar = (place) => `${inner(place, 0)}.contentWindow.dbBar`;

// the input panel (its resolver runs the intents)
const ip = await openPage(PAGES + 'panels/resident/input.html');
await ip.waitFor(`!!document.querySelector('.kbd')`, 10000);
await wait(1000);

console.log('decode_emacs: b writes the table into a book');
await line('skin add 1 decode_emacs', 2000);
const dp = await placeOf('decode_emacs');
check(!!dp, 'a decode_emacs placed (' + dp + ')');
const magit = JSON.parse(fs.readFileSync(new URL('../../command/dialects/emacs/extensions/magit.json', import.meta.url), 'utf8'));
const table = magit.intents.find((i) => i.id === 'magit.changed-files').result.table;
const files = [
  { section: 'unstaged', path: '/w/c.js' }, { section: 'staged', path: '/w/a.js' },
  { section: 'untracked', path: '/w/n.md' }, { section: 'unstaged', path: '/w/b.js' },
];
await p.eval(`Tezcatl.bus.post('intent.result', { id: 'magit.changed-files', corr: 'c1', args: {}, payload: ${JSON.stringify(files)}, table: ${JSON.stringify(table)} }); true`);
check(!!await p.waitFor(`${fdoc(dp)}.querySelectorAll('table.mx-grid tbody tr').length === 4`, 5000), 'the answer drawn (4 rows)');
async function keys(...ks) {
  await p.eval(`(() => { const f = window.frameSkin.frameAt(${JSON.stringify(dp)}); f.focus(); f.contentWindow.focus(); f.contentDocument.getElementById('grid-wrap').focus(); return true; })()`);
  for (const k of ks) { await p.key(k, 'Key' + k.toUpperCase(), k); await wait(80); }
  await wait(600);
}
await keys('b');
let bk = readBook('decode/magit.changed-files.json');
check(!!bk && JSON.stringify(bk.columns) === '["section","path"]' && bk.rows.length === 4 && bk.rows[0][1] === '/w/c.js' && bk.intent === 'magit.changed-files',
  'b: every row shown, in the order shown, the columns by their keys: ' + JSON.stringify(bk && bk.rows));
check(/book decode\/magit\.changed-files ── 4 row\(s\)/.test(await recv()), 'the receiving side says which book');
await keys('j', 'v', 'j', 'b');
bk = readBook('decode/magit.changed-files.json');
check(!!bk && JSON.stringify(bk.rows) === JSON.stringify([['staged', '/w/a.js'], ['untracked', '/w/n.md']]), 'v then b: only the rows chosen: ' + JSON.stringify(bk && bk.rows));
await p.key('Escape', 'Escape', '');
await wait(200);
await keys('b');   // back to all four for the database part
check((readBook('decode/magit.changed-files.json') || { rows: [] }).rows.length === 4, 'b again: the book written over (4 rows)');

console.log('an intent\'s book outside ~work/books; window 1 not open');
await clear();
await line('intent db.magit-section book=../secret', 300);
const bad = await said('db.magit-section');
check(/^! intent ── db\.magit-section.*a name under ~work\/books/.test(bad), 'a book outside ~work/books: not sent: ' + bad);
await clear();
await line('intent db.magit-section', 100);
const none = await said('db.magit-section');
check(/This operation requires database window 1, logged in: `database id=1`$/.test(none), 'no window 1: the intent stops and says what is needed: ' + none);

if (!PASSWORD) {
  console.log('\nNOT RUN: books into a logged-in window 1 -- set TEZCATL_E2E_DB_PASSWORD');
} else {
  console.log('window 1 logged in: the book shaped');
  await line('database id=1', 800);
  const one = await synthOf('database_1');
  await p.waitFor(`${bar(one)} && ${bar(one)}.state() === 'logged out'`, 15000);
  await p.eval(`${inner(one, 0)}.focus(); ${inner(one, 0)}.contentDocument.getElementById('password').focus(); true`);
  await p.send('Input.insertText', { text: PASSWORD });
  await p.key('Enter', 'Enter', '\r');
  check(!!await p.waitFor(`${bar(one)}.state() === 'waiting'`, 15000), 'window 1 logged in');

  await clear();
  await line('intent db.magit-section', 100);
  const ok = await said('db.magit-section');
  check(/^intent ── db\.magit-section ok .*"rows":\[\["unstaged","\/w\/c\.js"\],\["unstaged","\/w\/b\.js"\]\]/.test(ok),
    'unstaged, in the book\'s order: ' + ok);
  await clear();
  await line('intent db.magit-section section=staged', 100);
  check(/"rows":\[\["staged","\/w\/a\.js"\]\]/.test(await said('db.magit-section')), 'section=staged: the one staged file');
  check(/db\.magit-section ── select section, path from t_in/.test(await p.eval(`${bar(one)}.said()`)), 'window 1 says which intent ran');

  await clear();
  await line('intent db.magit-section book=decode/none', 100);
  const missing = await said('db.magit-section');
  check(/^! intent ── db\.magit-section: load decode\/none as t_in: no such book/.test(missing), 'a book that is not there: said: ' + missing);

  console.log('the answer into a run_table');
  await clear();
  await line('run from db.magit-section e2e_sec', 3000);
  const rb = await (async () => { for (let i = 0; i < 30; i++) { const b = readBook('run/e2e_sec.json'); if (b) return b; await wait(200); } return null; })();
  const pathCol = rb ? rb.columns.indexOf('path') : -1;
  check(!!rb && rb.template === 'magit_stage' && JSON.stringify(rb.rows.map((r) => r[pathCol])) === '["/w/c.js","/w/b.js"]',
    'run from: one row a file, in that order: ' + JSON.stringify(rb && rb.rows) + ' ── ' + await recv());
}

await ip.close();
await p.close();
done();
