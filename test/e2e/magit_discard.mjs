// test/e2e/magit_discard.mjs -- discarding with Magit on a real Emacs, behind a
// second press (D-discard-confirm). Needs `./test/e2e/stack.sh emacs` after `up`
// (its cwd $E2E_DIR/fsroot/git, made again here; its trash under $E2E_DIR/emacs/xdg-data).
//   X in magit.changed-files: the first press only says what goes; moving the
//   cursor, or waiting past 3 s, forgets it; the second press on the same row
//   discards (an unstaged change back to the index, an untracked file to the
//   trash); a staged row is refused. X in magit.hunks: one hunk out of the
//   working tree. `intent magit.discard-file …` without ! is refused, `intent!`
//   runs it. R in a commit's files: the file as at that commit. X in magit.stashes drops.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms) => { const t = Date.now() + ms; while (Date.now() < t) { if (await f()) return true; await wait(200); } return false; };
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const repo = path.join(E2E, 'fsroot', 'git');
if (!fs.existsSync(path.join(repo, '.git'))) { console.log('FAIL no repository at ' + repo + ' (run: ./test/e2e/stack.sh emacs)'); process.exit(1); }
const trash = path.join(E2E, 'emacs', 'xdg-data', 'Trash', 'files');

const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
for (const f of fs.readdirSync(repo)) fs.rmSync(path.join(repo, f), { recursive: true, force: true });
fs.rmSync(trash, { recursive: true, force: true });
git('init', '-q', '-b', 'main');
const twelve = Array.from({ length: 12 }, (_, i) => 'c' + (i + 1));
const put = (f, t) => fs.writeFileSync(path.join(repo, f), t);
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
put('a.txt', 'one\n'); put('staged.js', 'const s = 1;\n'); put('c.txt', twelve.join('\n') + '\n');
git('add', '-A'); git('commit', '-q', '-m', 'base');
put('a.txt', 'two\n'); git('add', 'a.txt'); git('commit', '-q', '-m', 'second');
put('a.txt', 'three\n');
put('staged.js', 'const s = 2;\n'); git('add', 'staged.js');
put('new.md', '# new\n');
put('c.txt', twelve.map((l, i) => (i === 0 || i === 11 ? l + ' changed' : l)).join('\n') + '\n');

const CDP = 'http://127.0.0.1:' + (process.env.CDP_PORT || '9223');
for (const t of await (await fetch(CDP + '/json/list')).json()) {
  if (t.type === 'page') await fetch(CDP + '/json/close/' + t.id);
}
const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text, ms = 1500) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
}
const recv = () => p.eval(`document.getElementById('recv').innerText`);
const lastOf = async (re) => (await recv()).split('\n').filter((l) => re.test(l)).slice(-1)[0] || '';

const ip = await openPage(PAGES + 'panels/resident/input.html');
await ip.waitFor(`!!document.querySelector('.kbd')`, 10000);
await ip.waitFor(`/connected|open/i.test(document.querySelector('.status').textContent)`, 15000);
await p.send('Page.bringToFront', {}).catch(() => {});
const RELAY = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
check(await until(async () => { try { return (await (await fetch(RELAY + '/windows')).json()).uplink === true; } catch (_) { return false; } }, 30000), 'the relay holds Emacs (GET /windows: uplink)');
await wait(2500);

// a decode_emacs of an intent, by its ?intent=
const TD = (id) => `[...document.querySelectorAll('iframe')].find((f) => /decode_emacs/.test(f.src) && new URL(f.src).searchParams.get('intent') === ${JSON.stringify(id)}).contentDocument`;
const rows = (id) => p.eval(`(() => { try { return JSON.stringify([...${TD(id)}.querySelectorAll('table.mx-grid tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent))); } catch (_) { return '[]'; } })()`).then(JSON.parse);
const foot = (id) => p.eval(`(() => { try { return ${TD(id)}.getElementById('foot').textContent; } catch (_) { return ''; } })()`);
const key = (id, k) => p.eval(`(() => { const g = ${TD(id)}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`).then(() => wait(150));
async function onRow(id, pred) {
  const i = (await rows(id)).findIndex(pred);
  if (i < 0) return false;
  for (let n = 0; n < 10; n++) await key(id, 'k');
  for (let n = 0; n < i; n++) await key(id, 'j');
  return true;
}
const CF = 'magit.changed-files';
const file = (name) => (r) => r[1].split('/').pop() === name;

console.log('X in magit.changed-files');
await line('table magit.changed-files', 500);
check(await until(async () => (await rows(CF)).length === 4, 10000), 'the table: four changed files -- ' + JSON.stringify((await rows(CF)).map((r) => r[0] + ' ' + r[1].split('/').pop())));
check(await onRow(CF, (r) => r[0] === 'unstaged' && file('a.txt')(r)), 'the cursor on a.txt (unstaged)');
await key(CF, 'X');
check(/discard \{.*a\.txt.*\} ── X again to do it \(it cannot be undone\)/.test(await foot(CF)), 'the first X says what goes and how to do it -- ' + await foot(CF));
await wait(800);
check(read('a.txt') === 'three\n', '...nothing discarded yet');
await key(CF, 'j'); await key(CF, 'k');
await key(CF, 'X');
await wait(800);
check(read('a.txt') === 'three\n', 'X after moving the cursor: a first press again, nothing discarded');
await wait(3300);
await key(CF, 'X');
await wait(800);
check(read('a.txt') === 'three\n', 'X after more than 3 s: a first press again');
await key(CF, 'X');
check(await until(() => read('a.txt') === 'two\n', 10000), 'X twice: a.txt back to the index (two)');
check(await until(async () => !(await rows(CF)).some((r) => r[0] === 'unstaged' && file('a.txt')(r)), 10000), '...the table asked again: no unstaged a.txt');
check(await until(async () => /check update ── /.test(await lastOf(/check update ── /)), 8000), '...check update all ran in the frame');

check(await onRow(CF, (r) => r[0] === 'staged' && file('staged.js')(r)), 'the cursor on staged.js (staged)');
await key(CF, 'X'); await key(CF, 'X');
check(await until(async () => /! magit\.discard-file ── staged\.js is staged: unstage it first \(u\), then discard/.test(await foot(CF)), 8000), 'X twice on a staged row: refused -- ' + await foot(CF));
check(git('diff', '--cached', '--name-only').trim() === 'staged.js' && read('staged.js') === 'const s = 2;\n', '...staged.js as it was');

check(await onRow(CF, (r) => r[0] === 'untracked' && file('new.md')(r)), 'the cursor on new.md (untracked)');
await key(CF, 'X'); await key(CF, 'X');
check(await until(() => !fs.existsSync(path.join(repo, 'new.md')), 10000), 'X twice on an untracked file: gone from the working tree');
check(fs.existsSync(path.join(trash, 'new.md')) && fs.readFileSync(path.join(trash, 'new.md'), 'utf8') === '# new\n', '...into the trash (' + trash + ')');

console.log('X in magit.hunks');
const HK = 'magit.hunks';
await line('table magit.hunks path=' + JSON.stringify(path.join(repo, 'c.txt')), 500);
check(await until(async () => (await rows(HK)).length === 2, 10000), 'two hunks of c.txt');
check(await onRow(HK, (r) => r[2] === '2'), 'the cursor on the second');
await key(HK, 'X'); await key(HK, 'X');
check(await until(() => read('c.txt').endsWith('c12\n') && read('c.txt').startsWith('c1 changed\n'), 10000), 'X twice: the second hunk out of the working tree, the first kept');
check(await until(async () => (await rows(HK)).length === 1, 10000), '...one hunk left in the table');

console.log('intent and intent!');
const cpath = JSON.stringify(path.join(repo, 'c.txt'));
await line('intent magit.discard-file section=unstaged path=' + cpath, 1500);
check(/! intent ── magit\.discard-file: magit\.discard-file discards what cannot be had back: press its key twice in the table, or write intent! <id>/.test(await lastOf(/magit\.discard-file/)), 'intent without !: refused, said how -- ' + await lastOf(/magit\.discard-file/));
check(read('c.txt').startsWith('c1 changed\n'), '...c.txt untouched');
await line('intent! magit.discard-file section=unstaged path=' + cpath, 500);
check(await until(() => read('c.txt') === twelve.join('\n') + '\n', 10000), 'intent!: c.txt back to the index');

console.log('R in a commit\'s files');
await line('table magit.log count=2', 500);
check(await until(async () => (await rows('magit.log')).length === 2, 10000), 'the log: two commits');
check(await onRow('magit.log', (r) => r[3] === 'base'), 'the cursor on "base"');
await key('magit.log', 'f');
const CM = 'magit.commit-files';
check(await until(async () => (await rows(CM)).length === 3, 10000), 'f: the files of "base" -- ' + JSON.stringify((await rows(CM)).map((r) => r[1].split('/').pop())));
check(await onRow(CM, file('a.txt')), 'the cursor on a.txt');
await key(CM, 'R');
check(/restore, as at the commit, \{.*a\.txt.*\} ── R again/.test(await foot(CM)), 'the first R says what goes -- ' + await foot(CM));
await key(CM, 'R');
check(await until(() => read('a.txt') === 'one\n', 10000), 'R twice: a.txt as at "base" (one)');
check(git('diff', '--cached', '--name-only').split('\n').includes('a.txt'), '...in the index too');

console.log('X in magit.stashes');
git('stash', 'push', '-q', '-m', 'to drop');
await line('table magit.stashes', 500);
check(await until(async () => (await rows('magit.stashes')).length === 1, 10000), 'one stash');
await key('magit.stashes', 'j');
await key('magit.stashes', 'X'); await key('magit.stashes', 'X');
check(await until(() => git('stash', 'list').trim() === '', 10000), 'X twice: the stash dropped');
check(await until(async () => (await rows('magit.stashes')).length === 0, 10000), '...the table asked again: none');

done();
