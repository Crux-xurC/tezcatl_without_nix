// test/e2e/frame_lsp_commands.mjs -- the frame's `lsp ...` lines: lsp list puts
// the running language servers on the receiving side, numbered; lsp stop takes
// that number (or the name); lsp timeout says the wait to the frame's code_editor;
// lsp restart stops the server of the code_editor meant now and connects it again
// (another process). Real typescript-language-server.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const RELAY = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
const dir = path.join(E2E, 'fsroot', 'lc');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.js'), 'export const one = 1;\n');
fs.writeFileSync(path.join(dir, 'jsconfig.json'), '{ "include": ["*.js"] }\n');
// the servers of this scenario's project (others may be left by earlier scenarios)
const mine = async () => (await (await fetch(RELAY + '/lsp/servers')).json()).servers.filter((s) => /\/lc$/.test(s.root));
const all = async () => (await (await fetch(RELAY + '/lsp/servers')).json()).servers;
for (const s of await all()) await fetch(RELAY + '/lsp/servers/' + encodeURIComponent(s.key), { method: 'DELETE', headers: { origin: PAGES.replace(/\/$/, '') } });

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (n = 3) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 500) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const msgAt = (place) => p.eval(`window.frameSkin.frameAt('${place}').contentDocument.getElementById('msg').textContent`);
const lspUp = (place) => p.waitFor(`/lsp javascript/.test(window.frameSkin.frameAt('${place}').contentDocument.getElementById('msg').textContent)`, 25000);

console.log('frame: lsp list / stop / timeout / restart');
check(/lsp list ── none running/.test(await line('lsp list')), 'lsp list with no server running says so');
check(/the last lsp list is empty/.test(await line('lsp stop 1')), '...and lsp stop 1 has nothing to take');
check(/^! lsp list, stop, timeout, restart$/m.test(await line('lsp now')), 'lsp <anything else>: what there is');

await line(':find lc/a.js');
await p.waitFor(`window.frameSkin.frameAt('11') && window.frameSkin.frameAt('11').contentDocument.getElementById('msg')`, 15000);
await lspUp('11');
const s0 = await mine();
check(s0.length === 1 && s0[0].serverId === 'javascript' && s0[0].pid, 'a code_editor with a.js: its language server runs (pid ' + (s0[0] && s0[0].pid) + ')');

const l1 = await line('lsp list');
check(/lsp list ── 1 running/.test(l1) && /^1 {2}javascript {2}\S*lc {2}\S+ · 1 pane · 1 doc · pid \d+$/m.test(l1), 'lsp list: numbered, one line a server: ' + l1.split('\n').pop());

check(/lsp timeout ── 8 s \(asked again up to 90 s\) for the 1 code_editor here/.test(await line('lsp timeout 8000 90000')), 'lsp timeout 8000 90000: said to the code_editor here');
check(/the max \(1000\) is under the wait/.test(await line('lsp timeout 8000 1000')), '...a max under the wait is refused');

// restart: the same server, another process, and the code_editor attached again
await p.eval(`window.frameSkin.frameAt('11').contentDocument.getElementById('msg').textContent = ''; true`);
const lr = await line('lsp restart', 800);
check(/lsp restart ── stopped javascript \S*lc; :Reconnect to the code_editor at 1 1/.test(lr), 'lsp restart: stopped it, :Reconnect to the code_editor: ' + lr.split('\n').pop());
check(/@1 1$/m.test(lr), '...the line points at that code_editor (go on goes there)');
await lspUp('11');
let s1 = [];
for (let i = 0; i < 40 && !(s1.length === 1 && s1[0].pid && s1[0].consumers === 1); i++) { await wait(250); s1 = await mine(); }
check(s1.length === 1 && s1[0].pid !== s0[0].pid && s1[0].consumers === 1, '...the server runs again as another process (pid ' + (s1[0] && s1[0].pid) + '), the code_editor attached');

// stop by the number of the list; the old number does not stop another one
await line('lsp list');
const ls = await line('lsp stop 1', 800);
check(/lsp stop ── stopped javascript \S*lc ── 1 pane was on it: :Reconnect connects again/.test(ls), 'lsp stop 1: the first of the last list: ' + ls.split('\n').pop());
check((await mine()).length === 0, '...it is gone (GET /lsp/servers)');
await p.waitFor(`/disconnected/.test(window.frameSkin.frameAt('11').contentDocument.getElementById('msg').textContent)`, 8000);
check(/disconnected ── :Reconnect/.test(await msgAt('11')), '...and the code_editor says it was disconnected');
check(/is not running any more/.test(await line('lsp stop 1')), 'lsp stop 1 again: not running any more');
check(/no language server called javascript/.test(await line('lsp stop javascript')), 'lsp stop javascript: none of that name now');

// by name
await line(':Reconnect', 800);
await lspUp('11');
for (let i = 0; i < 40 && (await mine()).length !== 1; i++) await wait(250);
check(/lsp stop ── stopped javascript/.test(await line('lsp stop javascript', 800)) && (await mine()).length === 0, 'lsp stop javascript: by name');

done();
