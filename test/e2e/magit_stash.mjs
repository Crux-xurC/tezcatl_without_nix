// test/e2e/magit_stash.mjs -- Magit's stashes with a real Emacs (needs
// `./test/e2e/stack.sh emacs` after `up`; its cwd $E2E_DIR/fsroot/git, made again
// here: one commit).
//   table magit.stashes (empty first); z asks a code_vi_minimum for the message
//   and stashes (magit-stash-save), check.update-all runs in the frame; nothing
//   to save is refused (Magit's words); untracked=true takes an untracked file
//   away; a applies a stash and keeps it; p pops one; a pop git refuses (the
//   file is there) keeps the stash and says git's words.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms) => { const t = Date.now() + ms; while (Date.now() < t) { if (await f()) return true; await wait(200); } return false; };
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const repo = path.join(E2E, 'fsroot', 'git');
if (!fs.existsSync(path.join(repo, '.git'))) { console.log('FAIL no repository at ' + repo + ' (run: ./test/e2e/stack.sh emacs)'); process.exit(1); }

const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
for (const f of fs.readdirSync(repo)) fs.rmSync(path.join(repo, f), { recursive: true, force: true });
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
git('add', '-A'); git('commit', '-q', '-m', 'one');
const stashes = () => git('stash', 'list', '--format=%gs').trim().split('\n').filter(Boolean);
const aTxt = () => fs.readFileSync(path.join(repo, 'a.txt'), 'utf8');
const newTxt = path.join(repo, 'new.txt');

// pages left open by earlier scenarios answer intent.run too: close them all
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
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const fdoc = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentDocument`;

const ip = await openPage(PAGES + 'panels/resident/input.html');
await ip.waitFor(`!!document.querySelector('.kbd')`, 10000);
await ip.waitFor(`/connected|open/i.test(document.querySelector('.status').textContent)`, 15000);
await p.send('Page.bringToFront', {}).catch(() => {});
const RELAY = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
check(await until(async () => { try { return (await (await fetch(RELAY + '/windows')).json()).uplink === true; } catch (_) { return false; } }, 30000), 'the relay holds Emacs (GET /windows: uplink)');
await wait(2500);

// a code_editor on a.txt: what check.update-all asks after a stash
await line(':find git/a.txt', 2500);

const TD = `[...document.querySelectorAll('iframe')].find((f) => /decode_emacs/.test(f.src) && new URL(f.src).searchParams.get('intent') === 'magit.stashes').contentDocument`;
const rows = () => p.eval(`(() => { try { return JSON.stringify([...${TD}.querySelectorAll('table.mx-grid tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent))); } catch (_) { return '[]'; } })()`).then(JSON.parse);
const foot = () => p.eval(`(() => { try { return ${TD}.getElementById('foot').textContent; } catch (_) { return ''; } })()`);
const key = (k) => p.eval(`(() => { const g = ${TD}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`).then(() => wait(100));
async function onRow(msg) {
  const i = (await rows()).findIndex((r) => r[3] === msg);
  if (i < 0) return false;
  for (let n = 0; n < 10; n++) await key('k');
  for (let n = 0; n < i; n++) await key('j');
  return true;
}
const msgs = async () => (await rows()).map((r) => r[0] + ' ' + r[3]);

// z: asks the message in a code_vi_minimum; :m sends it
// each ask adds a code_vi_minimum of its own: the newest is the one to write in
const minimums = async () => { const s = await st(); const at = []; s.columns.forEach((col, c) => col.forEach((cell, r) => { if (cell[0] === 'code_vi_minimum') at.push(String(c + 1) + String(r + 1)); })); return at; };
async function stashWith(text) {
  const before = (await minimums()).length;
  await key('z');
  if (!(await until(async () => (await minimums()).length === before + 1, 10000))) return false;
  await wait(500);
  const mp = (await minimums()).slice(-1)[0];
  await p.waitFor(`${fdoc(mp)} && ${fdoc(mp)}.querySelector('.cm-content')`, 10000);
  const mview = `(() => { const c = ${fdoc(mp)}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
  await p.eval(`(() => { const v = ${mview}; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: ${JSON.stringify(text)} } }); v.focus(); return true; })()`);
  await p.key('Escape', 'Escape');
  for (const ch of ':m') { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); }
  await p.key('Enter', 'Enter', '\r');
  return true;
}

console.log('table magit.stashes');
await line('table magit.stashes', 500);
check(await until(async () => /z: stash message → magit\.stash-push/.test(await foot()), 10000), 'table magit.stashes: drawn with its keys, no stash yet -- ' + (await foot()).slice(0, 140));
check((await rows()).length === 0, '...no rows');

console.log('z: stash the changes');
fs.writeFileSync(path.join(repo, 'a.txt'), 'two\n');
check(await stashWith('wip one'), 'z: a code_vi_minimum asked for the message');
check(await until(() => stashes().length === 1 && stashes()[0] === 'wip one', 10000), ':m: git has the stash "wip one" -- ' + JSON.stringify(stashes()));
check(await until(() => aTxt() === 'one\n', 10000), '...a.txt back to the commit');
check(await until(async () => JSON.stringify(await msgs()) === JSON.stringify(['stash@{0} wip one']), 10000), '...the table asked again -- ' + JSON.stringify(await msgs()));
check(await until(async () => /check update ── /.test(await lastOf(/check update ── /)), 8000), '...check update all ran in the frame -- ' + await lastOf(/check update ── /));

console.log('nothing to save; untracked=true');
check(await stashWith('nothing here'), 'z with no changes');
check(await until(async () => /! magit\.stash-push ── No local changes to save/.test(await foot()), 10000), '...refused with Magit\'s words -- ' + await foot());
check(stashes().length === 1, '...no stash made');
fs.writeFileSync(newTxt, 'new\n');
await line('intent magit.stash-push untracked=true message="with new"', 500);
check(await until(() => stashes().length === 2 && stashes()[0] === 'with new', 10000), 'intent magit.stash-push untracked=true: a stash of the untracked file -- ' + JSON.stringify(stashes()));
check(await until(() => !fs.existsSync(newTxt), 10000), '...new.txt taken away from the working tree');

console.log('a: apply; p: pop');
await key('r');
await until(async () => (await rows()).length === 2, 8000);
check(await onRow('wip one'), 'the cursor on "wip one"');
await key('a');
check(await until(() => aTxt() === 'two\n', 10000), 'a: a.txt has the stash\'s change');
check(stashes().length === 2, '...the stash kept');
fs.writeFileSync(newTxt, 'in the way\n');
await key('r');
await until(async () => (await rows()).length === 2, 8000);
check(await onRow('with new'), 'the cursor on "with new"');
await key('p');
check(await until(async () => /! magit\.stash-pop ── git stash pop exited \d+: [\s\S]*new\.txt already exists/.test(await foot()), 10000), 'p while new.txt is in the way: refused, git\'s words -- ' + (await foot()).slice(0, 140));
check(stashes().length === 2 && fs.readFileSync(newTxt, 'utf8') === 'in the way\n', '...the stash kept, the file untouched');
fs.rmSync(newTxt);
await key('p');
check(await until(() => stashes().length === 1 && fs.existsSync(newTxt) && fs.readFileSync(newTxt, 'utf8') === 'new\n', 10000), 'p: new.txt back, the stash dropped -- ' + JSON.stringify(stashes()));
check(await until(async () => JSON.stringify(await msgs()) === JSON.stringify(['stash@{0} wip one']), 10000), '...the table asked again -- ' + JSON.stringify(await msgs()));

await line('intent magit.stash-pop stash=HEAD', 500);
check(/! intent ── magit\.stash-pop: not a stash: HEAD/.test(await lastOf(/magit\.stash-pop/)), 'a stash named otherwise is refused before git -- ' + await lastOf(/magit\.stash-pop/));

done();
