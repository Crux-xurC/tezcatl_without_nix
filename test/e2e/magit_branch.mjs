// test/e2e/magit_branch.mjs -- Magit's branches, fetch, pull and push with a real
// Emacs (needs `./test/e2e/stack.sh emacs` after `up`; its cwd $E2E_DIR/fsroot/git).
// The repository is made again here as a clone of a bare remote in $E2E_DIR
// (no network); a second clone stands for someone else pushing.
//   table magit.branches; f, F, P are later intents (D-intent-later): the
//   resolver hears `took` and waits with no time limit, the table is asked again
//   when git ends; F and a checkout run check.update-all in the frame
//   (post.commands); n asks a code_vi_minimum for the new branch's name;
//   P without an upstream is refused, `intent magit.push set-upstream=origin`
//   makes one; a pull that cannot fast-forward is refused with git's words.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms) => { const t = Date.now() + ms; while (Date.now() < t) { if (await f()) return true; await wait(200); } return false; };
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const repo = path.join(E2E, 'fsroot', 'git');
if (!fs.existsSync(path.join(repo, '.git'))) { console.log('FAIL no repository at ' + repo + ' (run: ./test/e2e/stack.sh emacs)'); process.exit(1); }

// a bare remote with one commit; the repository Emacs is in made again as its clone
const g = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', '-c', 'init.defaultBranch=main', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const remote = path.join(E2E, 'remote.git'), other = path.join(E2E, 'other');
for (const d of [remote, other]) fs.rmSync(d, { recursive: true, force: true });
g(E2E, 'init', '-q', '--bare', remote);
for (const f of fs.readdirSync(repo)) fs.rmSync(path.join(repo, f), { recursive: true, force: true });
g(E2E, 'clone', '-q', remote, other);
fs.writeFileSync(path.join(other, 'a.txt'), 'one\n');
g(other, 'add', '-A'); g(other, 'commit', '-q', '-m', 'one'); g(other, 'push', '-q', '-u', 'origin', 'main');
g(repo, 'clone', '-q', remote, '.');
const git = (...a) => g(repo, ...a);
const otherPush = (file, text, msg) => { g(other, 'pull', '-q', '--ff-only'); fs.writeFileSync(path.join(other, file), text); g(other, 'add', '-A'); g(other, 'commit', '-q', '-m', msg); g(other, 'push', '-q'); };

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
const placeOf = async (panel) => { const s = await st(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][0] === panel) return String(c + 1) + String(r + 1); return null; };
const fdoc = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentDocument`;

// the input panel (it holds the resolver), connected to the relay -> Emacs
const ip = await openPage(PAGES + 'panels/resident/input.html');
await ip.waitFor(`!!document.querySelector('.kbd')`, 10000);
await ip.waitFor(`/connected|open/i.test(document.querySelector('.status').textContent)`, 15000);
await p.send('Page.bringToFront', {}).catch(() => {});
// the relay reaches Emacs on its own retries; the resolver hears it from GET /windows (every 2 s)
const RELAY = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
check(await until(async () => { try { return (await (await fetch(RELAY + '/windows')).json()).uplink === true; } catch (_) { return false; } }, 30000), 'the relay holds Emacs (GET /windows: uplink)');
await wait(2500);

// a code_editor on a.txt: what check.update-all asks after a pull
await line(':find git/a.txt', 2500);

const TD = `[...document.querySelectorAll('iframe')].find((f) => /decode_emacs/.test(f.src) && new URL(f.src).searchParams.get('intent') === 'magit.branches').contentDocument`;
const rows = () => p.eval(`(() => { try { return JSON.stringify([...${TD}.querySelectorAll('table.mx-grid tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent))); } catch (_) { return '[]'; } })()`).then(JSON.parse);
const foot = () => p.eval(`(() => { try { return ${TD}.getElementById('foot').textContent; } catch (_) { return ''; } })()`);
const key = (k) => p.eval(`(() => { const g = ${TD}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`).then(() => wait(100));
async function onRow(branch) {
  const i = (await rows()).findIndex((r) => r[1] === branch);
  if (i < 0) return false;
  for (let n = 0; n < 10; n++) await key('k');
  for (let n = 0; n < i; n++) await key('j');
  return true;
}
const show = (rs) => rs.map((r) => r.join(' ').trim()).join(' | ');
const rowOf = async (b) => (await rows()).find((r) => r[1] === b) || null;

console.log('table magit.branches');
await line('table magit.branches', 500);
check(await until(async () => (await rows()).length === 1, 10000), 'table magit.branches: one local branch -- ' + show(await rows()));
check(JSON.stringify(await rowOf('main')) === JSON.stringify(['*', 'main', 'origin/main', '0', '0']), '...main, current, its upstream, 0 ahead 0 behind -- ' + show(await rows()));
check(/Enter: o/.test(await foot()), '...Enter does o (the table\'s enter) -- ' + (await foot()).slice(0, 120));

// f: fetch (later): took, then the table asked again shows behind 1
console.log('f: fetch, a later intent');
otherPush('a.txt', 'two\n', 'two');
check(await onRow('main'), 'the cursor on main');
await key('f');
check(await until(async () => /magit\.fetch ── running|magit\.fetch ── done/.test(await foot()), 5000), 'f: the panel says it is running (intent.took) -- ' + await foot());
check(await until(async () => JSON.stringify(await rowOf('main')) === JSON.stringify(['*', 'main', 'origin/main', '0', '1']), 15000), '...done, the table asked again: 1 behind -- ' + show(await rows()));
const trace = await ip.eval(`document.querySelector('.log').textContent`);
check(/magit\.fetch \[[^\]]+\] running \(process \d+\)/.test(trace), '...the input panel heard took (running, its process)');

// F: pull --ff-only (later), then check.update-all says a.txt changed on the disk
console.log('F: pull, then check update all');
await key('F');
check(await until(async () => git('log', '-1', '--format=%s').trim() === 'two', 15000), 'F: git pulled "two" (fast-forward)');
check(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8') === 'two\n', '...a.txt on the disk is two');
check(await until(async () => /check update ── .*a\.txt[^\n]*(changed on the disk|the disk is what was opened)/.test(await recv()) || /check update ── .*code_editor/.test(await recv()), 10000), '...check update all ran in the frame (post.commands) -- ' + await lastOf(/check update ── /));
check(await until(async () => JSON.stringify(await rowOf('main')) === JSON.stringify(['*', 'main', 'origin/main', '0', '0']), 10000), '...the table asked again: 0 behind');

// n: a code_vi_minimum asks the name; :m makes feat from the row's branch and checks it out
console.log('n: a new branch');
check(await onRow('main'), 'the cursor on main');
await key('n');
await wait(500);
check(await p.waitFor(`JSON.stringify(window.frameSkin.state()).includes('code_vi_minimum')`, 10000), 'n: a code_vi_minimum added');
const mp = await placeOf('code_vi_minimum');
await p.waitFor(`${fdoc(mp)} && ${fdoc(mp)}.querySelector('.cm-content')`, 10000);
check(await p.eval(`${fdoc(mp)}.getElementById('purpose').textContent === 'new branch name'`), '...headed "new branch name"');
const mview = `(() => { const c = ${fdoc(mp)}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
await p.eval(`(() => { const v = ${mview}; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'feat' } }); v.focus(); return true; })()`);
await p.key('Escape', 'Escape');
for (const ch of ':m') { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); }
await p.key('Enter', 'Enter', '\r');
check(await until(async () => git('rev-parse', '--abbrev-ref', 'HEAD').trim() === 'feat', 10000), ':m: git is on feat');
check(await until(async () => (await rowOf('feat')) && (await rowOf('feat'))[0] === '*' && (await rowOf('main'))[0] === '', 10000), '...the table: feat current, no upstream -- ' + show(await rows()));

// P on feat: no upstream, refused with the way out; intent magit.push set-upstream=origin makes one
console.log('P: push');
check(await onRow('feat'), 'the cursor on feat');
await key('P');
check(await until(async () => /! magit\.push ── feat has no upstream: magit\.push set-upstream=/.test(await foot()), 8000), 'P on feat: refused, said how -- ' + await foot());
await line('intent magit.push branch=feat set-upstream=origin', 500);
check(await until(async () => /intent ── magit\.push running/.test(await recv()), 5000), 'intent magit.push set-upstream=origin: running (the intent line heard took)');
check(await until(async () => /intent ── magit\.push ok/.test(await recv()), 15000), '...then ok -- ' + (await lastOf(/magit\.push ok/)).slice(0, 120));
check(g(remote, 'branch', '--list', 'feat').trim() !== '' && git('rev-parse', '--abbrev-ref', 'feat@{upstream}').trim() === 'origin/feat', '...the remote has feat, its upstream origin/feat');

// Enter on main: checks it out (the table's enter); a commit there, P pushes it to origin/main
console.log('Enter: checkout; P');
await key('r');
await until(async () => (await rowOf('feat')) && (await rowOf('feat'))[2] === 'origin/feat', 8000);
check(await onRow('main'), 'the cursor on main');
await key('Enter');
check(await until(async () => git('rev-parse', '--abbrev-ref', 'HEAD').trim() === 'main', 10000), 'Enter: git is on main');
check(await until(async () => (await rowOf('main'))[0] === '*', 10000), '...the table says so -- ' + show(await rows()));
fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n');
git('add', 'b.txt'); git('commit', '-q', '-m', 'three');
await key('r');
check(await until(async () => JSON.stringify(await rowOf('main')) === JSON.stringify(['*', 'main', 'origin/main', '1', '0']), 8000), 'a commit on main: 1 ahead -- ' + show(await rows()));
check(await onRow('main'), 'the cursor on main');
await key('P');
check(await until(async () => g(remote, 'rev-parse', 'main').trim() === git('rev-parse', 'main').trim(), 15000), 'P: origin\'s main is the local main');
check(await until(async () => JSON.stringify(await rowOf('main')) === JSON.stringify(['*', 'main', 'origin/main', '0', '0']), 10000), '...the table asked again: 0 ahead');

// a pull that cannot fast-forward: refused with git's words; nothing merged
console.log('F: refused when the branches went apart');
otherPush('c.txt', 'c\n', 'four');
fs.writeFileSync(path.join(repo, 'd.txt'), 'd\n');
git('add', 'd.txt'); git('commit', '-q', '-m', 'five');
const before = git('rev-parse', 'HEAD').trim();
await key('F');
check(await until(async () => /! magit\.pull ── exited \d+: [\s\S]*(fast-forward|Not possible)/i.test(await foot()), 15000), 'F: refused, git\'s own words -- ' + (await foot()).slice(0, 160));
check(git('rev-parse', 'HEAD').trim() === before && git('rev-list', '--merges', '--count', 'HEAD').trim() === '0', '...no merge made, HEAD where it was');

// a checkout git refuses (an unknown branch): its words come back
await line('intent magit.checkout branch=nope', 500);
check(await until(async () => /! intent ── magit\.checkout: git checkout exited \d+: .*nope/.test(await recv()), 8000), 'checkout of an unknown branch: git\'s words -- ' + await lastOf(/magit\.checkout/));

done();
