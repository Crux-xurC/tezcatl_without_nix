// test/e2e/decode_emacs_magit.mjs -- the decode_emacs panel (D-decode_emacs) with
// a real Emacs: needs `./test/e2e/stack.sh emacs` after `up` (the Emacs of
// ../editor/emacs, magit loaded, its cwd $E2E_DIR/fsroot/git).
//   magit.changed-files run from the input panel: Emacs answers, the resolver
//   posts intent.result, the decode_emacs panel of a frame draws the table.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const repo = path.join(E2E, 'fsroot', 'git');
if (!fs.existsSync(path.join(repo, '.git'))) { console.log('FAIL no repository at ' + repo + ' (run: ./test/e2e/stack.sh emacs)'); process.exit(1); }

// a repository with one file of each section
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', ...a], { encoding: 'utf8' });
for (const f of fs.readdirSync(repo)) if (f !== '.git') fs.rmSync(path.join(repo, f), { recursive: true, force: true });
fs.writeFileSync(path.join(repo, 'kept.js'), 'const kept = 1;\n');
fs.writeFileSync(path.join(repo, 'staged.js'), 'const staged = 1;\n');
git('add', '-A');
try { git('commit', '-q', '-m', 'base'); } catch (_) { git('commit', '-q', '--allow-empty', '-m', 'base'); }
git('rm', '-q', '-r', '--cached', '.');
git('add', 'kept.js', 'staged.js');
git('commit', '-q', '--allow-empty', '-m', 'reset');
fs.writeFileSync(path.join(repo, 'kept.js'), 'const kept = 2;\n');
fs.writeFileSync(path.join(repo, 'staged.js'), 'const staged = 2;\n');
git('add', 'staged.js');
fs.writeFileSync(path.join(repo, 'new.md'), '# new\n');

// pages left open by earlier scenarios answer intent.run too (an input panel runs
// every intent; decode_emacs.mjs' helper answers each with null): close them all
const CDP = 'http://127.0.0.1:' + (process.env.CDP_PORT || '9223');
for (const t of await (await fetch(CDP + '/json/list')).json()) {
  if (t.type === 'page') await fetch(CDP + '/json/close/' + t.id);
}

// the frame with a decode_emacs panel
const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text, ms = 1500) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
}
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const placeOf = async (panel) => { const s = await st(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][0] === panel) return String(c + 1) + String(r + 1); return null; };
const fdoc = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentDocument`;
await line('skin add 1 decode_emacs', 2000);
const dp = await placeOf('decode_emacs');
await p.waitFor(`${fdoc(dp)} && ${fdoc(dp)}.getElementById('grid-wrap')`, 10000);

// the input panel (it holds the resolver), connected to the relay -> Emacs
const ip = await openPage(PAGES + 'panels/resident/input.html');
await ip.waitFor(`!!document.querySelector('.kbd')`, 10000);
await ip.waitFor(`/connected|open/i.test(document.querySelector('.status').textContent)`, 15000);
const ilog = () => ip.eval(`document.querySelector('.log').textContent`);
async function run(id) {
  await ip.eval(`(() => { const k = document.querySelector('.kbd'); k.value = ${JSON.stringify(id)}; k.dispatchEvent(new Event('input')); document.querySelector('.send').click(); return true; })()`);
}

console.log('decode_emacs with Emacs: magit.changed-files');
await run('magit.changed-files');
const drew = await p.waitFor(`${fdoc(dp)}.querySelectorAll('table.mx-grid tbody tr').length > 0`, 8000);
console.log('--- input panel log:\n' + (await ilog()).slice(-1500));
console.log('--- decode_emacs: ' + (await p.eval(`${fdoc(dp)}.body.innerText`)).slice(0, 800));
check(drew, 'magit.changed-files from the input panel: the decode_emacs panel draws a table');

// the rows as [section, file name], and the cursor moved to a row by keys
const rows = () => p.eval(`JSON.stringify([...${fdoc(dp)}.querySelectorAll('table.mx-grid tbody tr')].map((tr) => [tr.children[1].textContent, tr.children[2].textContent.split('/').pop()]))`).then(JSON.parse);
const press = async (k) => { await p.eval(`(() => { const g = ${fdoc(dp)}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`); await wait(100); };
async function onRow(section, name) {
  const i = (await rows()).findIndex(([s, n]) => s === section && n === name);
  if (i < 0) return false;
  for (let n = 0; n < 10; n++) await press('k');
  for (let n = 0; n < i; n++) await press('j');
  return true;
}
const staged = () => git('diff', '--cached', '--name-only').trim().split('\n').filter(Boolean).sort().join(',');
const drawn = (want) => p.waitFor(`JSON.stringify([...${fdoc(dp)}.querySelectorAll('table.mx-grid tbody tr')].map((tr) => tr.children[1].textContent + ' ' + tr.children[2].textContent.split('/').pop()).sort()) === ${JSON.stringify(JSON.stringify(want.slice().sort()))}`, 8000);
check(JSON.stringify((await rows()).sort()) === JSON.stringify([['staged', 'staged.js'], ['unstaged', 'kept.js'], ['untracked', 'new.md']]), 'one row per section: ' + JSON.stringify(await rows()));

// s on the untracked file: magit-stage-files in Emacs, git has it staged, the table asked again
check(await onRow('untracked', 'new.md'), 'the cursor on new.md');
await press('s');
check(await drawn(['staged new.md', 'staged staged.js', 'unstaged kept.js']), 's: refreshed -- new.md now staged: ' + JSON.stringify(await rows()));
check(staged() === 'new.md,staged.js', '...and git agrees: ' + staged());

// u on a staged file: magit-unstage-files
check(await onRow('staged', 'staged.js'), 'the cursor on staged.js');
await press('u');
check(await drawn(['staged new.md', 'unstaged kept.js', 'unstaged staged.js']), 'u: refreshed -- staged.js now unstaged: ' + JSON.stringify(await rows()));
check(staged() === 'new.md', '...and git agrees: ' + staged());

// d on kept.js: HEAD's text from Emacs written to ~work, a code_diff against the file
check(await onRow('unstaged', 'kept.js'), 'the cursor on kept.js');
await press('d');
check(await p.waitFor(`JSON.stringify(window.frameSkin.state()).includes('code_diff')`, 10000), 'd: a code_diff added');
const atHead = path.join(E2E, 'work', 'emacs', 'magit.file-at-head', 'git', 'kept.js');
check(fs.existsSync(atHead) && fs.readFileSync(atHead, 'utf8') === 'const kept = 1;\n', '...HEAD\'s kept.js (from Emacs) in ~work/emacs/magit.file-at-head/git/kept.js');

// C: a code_vi_minimum asked for the commit message; :m runs magit.commit (git commit -m) and the table is asked again
check(await onRow('unstaged', 'kept.js'), 'the cursor on the table again');
await press('C');
await wait(500);   // the frame re-renders while it adds the panel
check(await p.waitFor(`JSON.stringify(window.frameSkin.state()).includes('code_vi_minimum')`, 10000), 'C: a code_vi_minimum added to the frame');
const mp = await placeOf('code_vi_minimum');
await p.waitFor(`${fdoc(mp)} && ${fdoc(mp)}.querySelector('.cm-content')`, 10000);
check(await p.eval(`${fdoc(mp)}.getElementById('purpose').textContent === 'commit message'`), '...headed "commit message"');
const mview = `(() => { const c = ${fdoc(mp)}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const message = 'Add new.md\n\nThe "body", two lines\nand a backslash \\ too';
await p.eval(`(() => { const v = ${mview}; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: ${JSON.stringify(message)} } }); v.focus(); return true; })()`);
await p.key('Escape', 'Escape');
for (const ch of ':m') { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); }
await p.key('Enter', 'Enter', '\r');
check(await drawn(['unstaged kept.js', 'unstaged staged.js']), ':m: committed and refreshed -- nothing staged: ' + JSON.stringify(await rows()));
const msg = git('log', '-1', '--format=%B').replace(/\n+$/, '');
check(msg === message, '...git has the message as written: ' + JSON.stringify(msg));
check(git('show', '--name-only', '--format=', 'HEAD').trim() === 'new.md', '...and only new.md in it');
check(await p.eval(`${mview}.state.doc.toString() === ''`), '...the code_vi_minimum cleared');

// run from magit.changed-files: its result.book makes a run_table of tasks/run/magit_stage.json, one row a
// changed file; - leaves kept.js out, run start stages the others through `intent magit.stage-file`
console.log('run from magit.changed-files (magit_stage)');
fs.writeFileSync(path.join(repo, 'other.md'), '# other\n');
const bookFile = path.join(E2E, 'work', 'books', 'run', 'magit.changed-files.json');
fs.rmSync(bookFile, { force: true });
const bk = () => { try { return JSON.parse(fs.readFileSync(bookFile, 'utf8')); } catch (_) { return null; } };
const until = async (f, ms) => { const t = Date.now() + ms; while (Date.now() < t) { if (await f()) return true; await wait(200); } return false; };
await line('run from magit.changed-files', 500);
check(await until(() => { const b = bk(); return b && b.rows.length === 3; }, 15000), 'run from: a book of three rows (~work/books/run/magit.changed-files.json) -- ' + JSON.stringify(bk() && bk().rows.map((r) => r[7] + ' ' + r[8])));
const b0 = bk();
check(b0.template === 'magit_stage' && b0.rows.every((r) => r[1] === 't' && r[2] === 'intent magit.stage-file path="{path}"'), '...of the template magit_stage, each row calling magit.stage-file');
check(JSON.stringify(b0.rows.map((r) => r[7] + ' ' + r[8].split('/').pop()).sort()) === JSON.stringify(['unstaged kept.js', 'unstaged staged.js', 'untracked other.md']), '...section and path from the answer');
const RD = `[...document.querySelectorAll('iframe')].find((f) => /intent=magit\\.changed-files/.test(f.src)).contentDocument`;
const ki = b0.rows.findIndex((r) => r[8].endsWith('/kept.js'));
await p.waitFor(`(() => { try { return ${RD}.querySelectorAll('table.mx-grid tbody tr').length === 3; } catch (_) { return false; } })()`, 8000);
const rkey = (k) => p.eval(`(() => { const g = ${RD}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`).then(() => wait(100));
for (let n = 0; n < 5; n++) await rkey('k');
for (let n = 0; n < ki; n++) await rkey('j');
await rkey('-');
check(await until(() => bk().rows[ki][5] === '-', 3000), '-: kept.js left out');
await line('run start', 500);
check(await until(() => bk().rows.every((r) => r[5] && r[5] !== 'sent'), 20000), 'run start: every status filled -- ' + bk().rows.map((r) => r[5] + ' ' + r[6]).join(' | '));
check(bk().rows.every((r, i) => i === ki || r[5] === 'done'), '...the two rows done (no ! line)');
check(staged() === 'other.md,staged.js', '...and git has them staged, kept.js not: ' + staged());

// table <intent>: a decode_emacs of its own (?intent=&args=, it asks on opening); hunks staged one by one
console.log('table magit.hunks: s / u one hunk');
const lines14 = Array.from({ length: 14 }, (_, i) => 'line ' + (i + 1));
fs.writeFileSync(path.join(repo, 'multi.txt'), lines14.join('\n') + '\n');
git('add', 'multi.txt');
git('commit', '-q', '-m', 'multi', '--', 'multi.txt');
fs.writeFileSync(path.join(repo, 'multi.txt'), lines14.map((l, i) => (i === 1 || i === 11 ? l + ' changed' : l)).join('\n') + '\n');
const TD = (id) => `[...document.querySelectorAll('iframe')].find((f) => /decode_emacs/.test(f.src) && new URL(f.src).searchParams.get('intent') === ${JSON.stringify(id)}).contentDocument`;
const trows = (id) => p.eval(`(() => { try { return JSON.stringify([...${TD(id)}.querySelectorAll('table.mx-grid tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent))); } catch (_) { return '[]'; } })()`).then(JSON.parse);
const tkey = (id, k) => p.eval(`(() => { const g = ${TD(id)}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`).then(() => wait(100));
async function onTableRow(id, pred) {
  const i = (await trows(id)).findIndex(pred);
  if (i < 0) return false;
  for (let n = 0; n < 10; n++) await tkey(id, 'k');
  for (let n = 0; n < i; n++) await tkey(id, 'j');
  return true;
}
const multi = path.join(repo, 'multi.txt');
await line('table magit.hunks path=' + JSON.stringify(multi), 500);
check(await until(async () => (await trows('magit.hunks')).length === 2, 10000), 'table magit.hunks path=…: a decode_emacs of its own, two hunks -- ' + JSON.stringify(await trows('magit.hunks')));
const hk = (r) => r[0] + ' ' + r[2] + ' ' + r[3];   // section n line
check(JSON.stringify((await trows('magit.hunks')).map(hk)) === JSON.stringify(['unstaged 1 1', 'unstaged 2 9']), '...section, number and line of each -- ' + JSON.stringify((await trows('magit.hunks')).map(hk)));
check(await onTableRow('magit.hunks', (r) => r[2] === '2'), 'the cursor on the second hunk');
await tkey('magit.hunks', 's');
check(await until(async () => JSON.stringify((await trows('magit.hunks')).map(hk)) === JSON.stringify(['unstaged 1 1', 'staged 1 9']), 10000), 's: the second hunk staged, the table asked again -- ' + JSON.stringify((await trows('magit.hunks')).map(hk)));
const cachedMulti = git('diff', '--cached', '--', 'multi.txt');
check(/\+line 12 changed/.test(cachedMulti) && !/line 2 changed/.test(cachedMulti), '...git has only that hunk staged');
check(await onTableRow('magit.hunks', (r) => r[0] === 'staged'), 'the cursor on the staged hunk');
await tkey('magit.hunks', 'u');
check(await until(async () => JSON.stringify((await trows('magit.hunks')).map(hk)) === JSON.stringify(['unstaged 1 1', 'unstaged 2 9']), 10000), 'u: unstaged again');
check(git('diff', '--cached', '--', 'multi.txt') === '', '...git agrees');

// table magit.log; f: the commit's files in a table of their own; d: the file at the parent against it at the commit
console.log('table magit.log, f, d');
await line('table magit.log count=3', 500);
check(await until(async () => (await trows('magit.log')).length === 3, 10000), 'table magit.log count=3: three commits -- ' + JSON.stringify((await trows('magit.log')).map((r) => r[3])));
check(JSON.stringify((await trows('magit.log')).map((r) => r[3].split('\n')[0])) === JSON.stringify(['multi', 'Add new.md', 'reset']), '...newest first, the subjects');
const addRev = (await trows('magit.log'))[1][0];
check(await onTableRow('magit.log', (r) => r[0] === addRev), 'the cursor on "Add new.md"');
await tkey('magit.log', 'f');
check(await until(async () => (await trows('magit.commit-files')).length === 1, 10000), 'f: the commit\'s files in a decode_emacs of their own -- ' + JSON.stringify(await trows('magit.commit-files')));
const cf = (await trows('magit.commit-files'))[0];
check(cf[0] === 'A' && cf[1].endsWith('/new.md') && cf[3] === addRev, '...new.md added in that commit');
await tkey('magit.commit-files', 'j');
await tkey('magit.commit-files', 'd');
const atRev = path.join(E2E, 'work', 'emacs', 'magit.file-at-rev', addRev, 'git', 'new.md');
const atParent = path.join(E2E, 'work', 'emacs', 'magit.file-at-rev', cf[4], 'git', 'new.md');
check(await until(() => fs.existsSync(atRev) && fs.existsSync(atParent), 10000), 'd: both versions written to ~work/emacs/magit.file-at-rev/<rev>/git/new.md');
check(fs.readFileSync(atRev, 'utf8') === '# new\n' && fs.readFileSync(atParent, 'utf8') === '', '...the commit\'s text, and empty at the parent');
check(await p.waitFor(`JSON.stringify(window.frameSkin.state()).split('code_diff').length > 2`, 10000), '...a second code_diff added');
const nDecode = async () => (await st()).columns.flat().filter((c) => c[0] === 'decode_emacs').length;
const n0d = await nDecode();
await line('table magit.log count=1', 500);
check(await until(async () => (await trows('magit.log')).length === 1, 10000) && (await nDecode()) === n0d, 'table magit.log again: the same panel asked again (no new one)');

await ip.close();
await p.close();
done();
