// test/e2e/project_env.mjs -- the projects' environments (D-project-env). The
// scenario writes the relay's project_env.json itself (read on every request)
// with markers of its own, so nothing like a flake is needed:
//   penv/   .e2e-env.json (cat, after a second): sets TEZCATL_E2E_ENV, keeps PATH --
//           a code_editor of a.js: its language server starts with it (/proc/<pid>/environ)
//   ppath/  .e2e-env.json: PATH with ppath/bin first, LANG unset -- env xterm: the shell
//           starts in ppath with it (its own tool is found), env show, env reload
//   pbad/   .e2e-env-bad (fails): the relay's own, said in the xterm
//   none/   no marker: no project
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const RELAY = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
const ORIGIN = PAGES.replace(/\/$/, '');
const fsroot = path.join(E2E, 'fsroot');

fs.writeFileSync(path.join(E2E, 'relay', 'project_env.json'), JSON.stringify({
  timeoutMs: 10000,
  entries: [
    { marker: '.e2e-env.json', command: ['sh', '-c', 'sleep 1; cat .e2e-env.json'], format: 'env' },
    { marker: '.e2e-env-bad', command: ['sh', '-c', 'echo "the env is broken" >&2; exit 2'], format: 'env' },
  ],
}));
const mk = (rel, files) => {
  const d = path.join(fsroot, rel);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  for (const [f, text, mode] of files) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), text);
    if (mode) fs.chmodSync(path.join(d, f), mode);
  }
  return d;
};
mk('penv', [['.e2e-env.json', JSON.stringify({ TEZCATL_E2E_ENV: 'from-penv' })], ['a.js', 'export const one = 1;\n'], ['jsconfig.json', '{ "include": ["*.js"] }\n']]);
const ppath = mk('ppath', [['sub/x.txt', 'x\n'], ['bin/e2e-tool', '#!/bin/sh\necho "e2e-tool ran"\n', 0o755]]);
fs.writeFileSync(path.join(ppath, '.e2e-env.json'), JSON.stringify({ PATH: path.join(ppath, 'bin') + ':/usr/bin:/bin', TEZCATL_E2E_ENV: 'from-ppath', LANG: null }));
mk('pbad', [['.e2e-env-bad', ''], ['x.txt', 'x\n']]);
mk('none', [['x.txt', 'x\n']]);
await fetch(RELAY + '/env/reload', { method: 'POST', headers: { origin: ORIGIN } });
for (const s of (await (await fetch(RELAY + '/lsp/servers')).json()).servers)
  await fetch(RELAY + '/lsp/servers/' + encodeURIComponent(s.key), { method: 'DELETE', headers: { origin: ORIGIN } });

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (n = 4) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 600) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const doc = (place) => `window.frameSkin.frameAt('${place}').contentDocument`;
const termText = (place) => p.eval(`(() => { const r = ${doc(place)}.querySelector('.xterm-rows'); return r ? r.innerText : ''; })()`);
// rows joined with nothing: a line longer than the terminal is wrapped over rows (a long E2E_DIR in its paths)
const unwrapped = async (place) => (await termText(place)).replace(/\n/g, '').replace(/\s+/g, ' ');
const head = (place) => p.eval(`${doc(place)}.getElementById('status').textContent`);
async function typeIn(place, text) {
  await p.eval(`${doc(place)}.querySelector('.xterm-helper-textarea').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
}
// the place of the newest xterm of the frame
const newestXterm = () => p.eval(`(() => { const fr = [...document.querySelectorAll('iframe')].filter((f) => /xterm\\.html/.test(f.src)); const f = fr[fr.length - 1]; return f ? new URL(f.src).searchParams.get('name') : null; })()`);

console.log('project environments: language servers, env xterm, env show, env reload');

// a language server in penv: asked first (the code_editor's head says so), then started with it
await line(':find penv/a.js');
await p.waitFor(`window.frameSkin.frameAt('11') && ${doc('11')}.getElementById('msg')`, 15000);
await p.waitFor(`/asking for the project environment|lsp javascript/.test(${doc('11')}.getElementById('msg').textContent)`, 8000);
check(/asking for the project environment \(\.e2e-env\.json in \S*penv\)/.test(await p.eval(`${doc('11')}.getElementById('msg').textContent`)), 'a code_editor in penv: its head says the project environment is being asked for');
await p.waitFor(`/lsp javascript/.test(${doc('11')}.getElementById('msg').textContent)`, 25000);
const srv = (await (await fetch(RELAY + '/lsp/servers')).json()).servers.filter((s) => /\/penv$/.test(s.root))[0];
const environ = srv && srv.pid ? fs.readFileSync('/proc/' + srv.pid + '/environ', 'latin1').split('\0') : [];
check(environ.includes('TEZCATL_E2E_ENV=from-penv'), '...then the language server runs with the project environment (TEZCATL_E2E_ENV in /proc/' + (srv && srv.pid) + '/environ)');

// env show: kept now
const sh = await line('env show penv/a.js', 1500);
check(/penv\/a\.js: \S*penv by \.e2e-env\.json \(sh -c sleep 1; cat \.e2e-env\.json\) ── kept/.test(sh) && /set: TEZCATL_E2E_ENV/.test(sh) && /PATH before the relay's: nothing/.test(sh), 'env show penv/a.js: by which marker, kept, what it sets');

// env xterm in ppath (from a file in a subdirectory): the root as the directory, PATH first
const lx = await line('env xterm ppath/sub/x.txt', 800);
check(/env xterm ── an xterm at \d+ \d+ in the project of ppath\/sub\/x\.txt/.test(lx), 'env xterm ppath/sub/x.txt: an xterm added, said where: ' + lx.split('\n').pop());
const xid = await newestXterm();
const xplace = await p.eval(`(() => { for (const c of [1,2,3,4]) for (const r of [1,2,3,4]) { const f = window.frameSkin.frameAt('' + c + r); if (f && new URL(f.src).searchParams.get('name') === ${JSON.stringify(xid)}) return '' + c + r; } return null; })()`);
await p.waitFor(`/\\[project environment: /.test(${doc(xplace)}.querySelector('.xterm-rows') ? ${doc(xplace)}.querySelector('.xterm-rows').innerText : '')`, 15000);
check(/\[project environment: \S*ppath by \.e2e-env\.json · PATH \+3 · 1 set\]/.test(await unwrapped(xplace)), '...it says the project environment in grey');
check(/ppath \(\.e2e-env\.json\)/.test(await head(xplace)), '...and in its head: ' + await head(xplace));
await wait(800);
await typeIn(xplace, 'echo "E=$TEZCATL_E2E_ENV D=$PWD"; e2e-tool');
await p.waitFor(`/e2e-tool ran/.test(${doc(xplace)}.querySelector('.xterm-rows').innerText)`, 8000).catch(() => {});
const t1 = (await termText(xplace)).replace(/\s+/g, ' ');
check(t1.includes('E=from-ppath D=' + ppath), '...the shell has the environment and starts at the project root' + (t1.includes('E=from-ppath D=' + ppath) ? '' : ': ' + t1.slice(-300)));
check(/e2e-tool ran/.test(t1), '...the project\'s own tool is found first on PATH');

// env reload, then env show asks again
const rl = await line('env reload ppath', 800);
check(/env reload ── \S*ppath: thrown away \(\S*ppath\)/.test(rl), 'env reload ppath: what was kept is thrown away: ' + rl.split('\n').pop());
const sp = await line('env show ppath', 2500);
check(/asked now/.test(sp), '...env show asks it again (asked now)');
// a null unsets (a login shell may set it again from its profile: bash -l's LANG)
check(/^unset: LANG$/m.test(sp) && /PATH before the relay's: 3 \(\S*ppath\/bin \/usr\/bin \/bin\)/.test(sp), '...and says what it unsets and puts first on PATH');

// a project whose command fails: the relay's own, said
await line('env xterm pbad/x.txt', 800);
const bid = await newestXterm();
const bplace = await p.eval(`(() => { for (const c of [1,2,3,4]) for (const r of [1,2,3,4]) { const f = window.frameSkin.frameAt('' + c + r); if (f && new URL(f.src).searchParams.get('name') === ${JSON.stringify(bid)}) return '' + c + r; } return null; })()`);
await p.waitFor(`/no project environment/.test(${doc(bplace)}.querySelector('.xterm-rows') ? ${doc(bplace)}.querySelector('.xterm-rows').innerText : '')`, 15000);
const tb = await unwrapped(bplace);
check(/no project environment for \S*pbad: the command ended with exit code 2: the env is broken ── the relay's own/.test(tb), 'a failing project: the xterm says why and that the relay\'s own is used');
check(/the relay's own environment/.test(await head(bplace)), '...its head says so too');
const sb = await line('env show pbad/x.txt', 1500);
check(/could not be read: the command ended with exit code 2: the env is broken/.test(sb), '...env show says the failure (it is kept till env reload)');

// no project
check(/none\/x\.txt: no project \(no marker of project_env\.json from none\/x\.txt up to the FS root\)/.test(await line('env show none/x.txt', 1000)), 'no marker: env show says there is no project');
check(/^! env xterm, show, reload$/m.test(await line('env now')), 'env <anything else>: what there is');
check(/does not exist/.test(await line('env show nowhere/at/all', 1000)), 'a path that does not exist is said');

fs.rmSync(path.join(E2E, 'relay', 'project_env.json'), { force: true });
await p.close();
done();
