// test/e2e/work_list.mjs -- the record of what is running and who is open
// the frame's `who` (the panels open, after a roll call, with
// their places), `work list` (the pairs of work.json matched from the bus: a
// save, an LSP request), `work watch` (only what is still waited for),
// `work cancel <n>` (the pair's cancel goes to who fired the row), a start
// whose end never comes ends by time (expired), a panel
// closed leaves the roster, and one recorder serves every window.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'wl');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"wl","version":"1.0.0"}\n');
fs.writeFileSync(path.join(dir, 'a.js'), 'function add(a, b) { return a + b; }\nconst three = add(1, 2);\nconsole.log(three);\n');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (n = 3) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 300, page = p) {
  await page.eval(`document.getElementById('line').focus(); true`);
  await page.send('Input.insertText', { text });
  await page.key('Enter', 'Enter', '\r');
  await wait(ms);
  // what was said since this line was sent (windows other scenarios left open make `who` long)
  return page.eval(`(() => { const all = [...document.getElementById('recv').children].map((d) => d.textContent); let i = all.length - 1; while (i > 0 && all[i].indexOf('> ') !== 0) i--; return all.slice(i).join('\\n'); })()`);
}
const view = (place) => `(() => { const c = window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const listText = (place) => p.eval(`window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument.getElementById('list').innerText`);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);

console.log('the work record: who, work list / watch / cancel');
await wait(800);   // the store takes its lock and calls the roll

await line(':find wl/a.js');
await p.waitFor(`window.frameSkin.frameAt('11') && window.frameSkin.frameAt('11').contentDocument.querySelector('.cm-content') && /function add/.test(${view('11')}.state.doc.toString())`, 15000);
await p.waitFor(`/lsp /.test(window.frameSkin.frameAt('11').contentDocument.getElementById('head').innerText)`, 30000);

// -- who: a roll call, the panels open with their places
let said = await line('who', 1800);
check(/who ── \d+ open/.test(said), 'who: the panels open, counted: ' + (said.match(/who ── .*/) || [''])[0]);
check(/\d+ +code \S+ +workspace_\d+ 1 1 +since \d\d:\d\d:\d\d/.test(said), "...the frame's code_editor with where it is (11)");
check(/\d+ +skin workspace_\d+ +since/.test(said), '...and the frame itself, by the name of its skin');

// -- work list: a save from the input form is a pair (code.file write -> code.saved)
await p.eval(`(() => { const v = ${view('11')}; v.dispatch({ changes: { from: v.state.doc.length, insert: '// more\\n' } }); return true; })()`);
await line(':w', 800);
check(/in line 2|added|work/.test(await line('work list', 1200)), 'work list adds the work panel');
await p.waitFor(`window.frameSkin.frameAt('12') && window.frameSkin.frameAt('12').contentDocument.getElementById('list') && /save/.test(window.frameSkin.frameAt('12').contentDocument.getElementById('list').innerText)`, 10000);
let rows = await listText('12');
check(/\d+ +done +save/.test(rows), 'the save is a row, done: ' + JSON.stringify((rows.match(/.*save.*/) || [''])[0]));
check(/skin workspace_\d+ · \d\d:\d\d:\d\d · \d+(\.\d+)? m?s/.test(rows), '...with who fired it, when, and how long it took');
check((await st()).focus === '12', '...and the keyboard is in the list');
check(/work ── at 1 2/.test(await line('work list', 500)), 'work list again: the panel here is focused, not another added');

// -- an LSP request is said on the bus by the code_editor (lsp.request / lsp.response)
await line('skin focus 1 1');
await p.eval(`(() => { const v = ${view('11')}; const at = v.state.doc.toString().indexOf('add(1'); v.dispatch({ selection: { anchor: at + 1 } }); v.focus(); return true; })()`);
await line(':LspDef', 2500);
await p.waitFor(`/textDocument\\/definition wl\\/a\\.js/.test(window.frameSkin.frameAt('12').contentDocument.getElementById('list').innerText)`, 15000);
rows = await listText('12');
check(/\d+ +done +textDocument\/definition wl\/a\.js/.test(rows), 'an LSP request is a row (its method and file), done when answered');
check(/code \S+ · /.test(rows), '...fired by the code_editor');

// -- work watch / work cancel: a request still waited for (said by a stand-in, as a code_editor would)
const me = await p.eval(`window.Tezcatl.bus.self.id`);
await p.eval(`(() => { window.__cancels = []; window.Tezcatl.bus.onMine('lsp.cancel', (x) => window.__cancels.push(x)); return true; })()`);
await p.eval(`window.Tezcatl.bus.post('lsp.request', { req: 'wl-slow', name: 'stand-in', path: 'wl/a.js', method: 'textDocument/rename' }); true`);
await wait(500);
check(/work/.test(await line('work watch', 1500)), 'work watch adds the list of what is still waited for');
await p.waitFor(`window.frameSkin.frameAt('13') && window.frameSkin.frameAt('13').contentDocument.getElementById('list') && /rename/.test(window.frameSkin.frameAt('13').contentDocument.getElementById('list').innerText)`, 10000);
let watch = await listText('13');
check(/running +textDocument\/rename wl\/a\.js/.test(watch) && !/definition/.test(watch) && /Del stops it/.test(watch), 'work watch: only the running row, and that it can be stopped: ' + JSON.stringify(watch.split('\n').slice(0, 2).join(' | ')));
await p.waitFor(`/slow +textDocument\\/rename/.test(window.frameSkin.frameAt('13').contentDocument.getElementById('list').innerText)`, 8000);
check(/slow +textDocument\/rename/.test(await listText('13')), '...after its pair\'s time it is slow (worked out when read)');
const n = Number((watch.match(/(\d+) +running +textDocument\/rename/) || [])[1]);
said = await line('work cancel ' + n, 800);
check(/work cancel ── asked skin workspace_\d+ to stop row/.test(said), 'work cancel <n>: the pair\'s cancel is sent to who fired the row: ' + (said.match(/work cancel ── .*/) || [''])[0]);
check(JSON.stringify(await p.eval(`JSON.stringify(window.__cancels)`)) === JSON.stringify('[{"req":"wl-slow"}]'), '...lsp.cancel {req} arrived there');
await p.eval(`window.Tezcatl.bus.post('lsp.response', { req: 'wl-slow', name: 'stand-in', ok: false, message: 'stopped' }); true`);
await p.waitFor(`!/rename/.test(window.frameSkin.frameAt('13').contentDocument.getElementById('list').innerText)`, 8000);
check(!/rename/.test(await listText('13')), 'the request ended: it leaves work watch');
check(/failed +textDocument\/rename/.test(await listText('12')), '...and is failed in work list');
check(/has ended already: failed/.test(await line('work cancel ' + n, 800)), 'a row that ended cannot be stopped: said');
check(/there is no row 9999/.test(await line('work cancel 9999', 800)), 'a number that is no row: said');
const saveN = Number(((await listText('12')).match(/(\d+) +done +save/) || [])[1]);
check(/has ended already|cannot be stopped/.test(await line('work cancel ' + saveN, 800)), 'a save cannot be stopped from here: said');

// -- a start whose end never comes (a command no window takes) ends by time: expired (work.json's expireMs)
const rowsOf = async (text) => {
  await p.eval(`(() => { window.__wl = null; const b = Tezcatl.bus; const off = b.on('work.rows', (m) => { if (m && m.req === 'e2e-rows') { off(); window.__wl = m.rows; } }); b.post('work.query', { req: 'e2e-rows' }); return true; })()`);
  await p.waitFor(`window.__wl !== null`, 3000);
  return (await p.eval(`JSON.stringify(window.__wl)`).then(JSON.parse)).filter((r) => r.text === text);
};
await p.eval(`Tezcatl.bus.post('command', { name: 'e2e.nobody', args: {}, req: 'e2e-nobody' }); true`);
await wait(300);
check((await rowsOf('e2e.nobody')).map((r) => r.status).join() === 'running', 'a command no window takes: a row, running');
await wait(2200);
const gone = await rowsOf('e2e.nobody');
check(gone.length === 1 && gone[0].status === 'expired' && gone[0].ms === 2000, '...after expireMs (2 s) it has ended, expired: ' + JSON.stringify(gone.map((r) => [r.status, r.ms])));

// -- a panel closed says so and leaves the roster
const before = Number(((await line('who', 1800)).match(/who ── (\d+) open/) || [])[1]);
await line('skin del 1 3', 800);
const after = Number(((await line('who', 1800)).match(/who ── (\d+) open/) || [])[1]);
check(after === before - 1, 'skin del: the panel said it closed, one fewer open (' + before + ' -> ' + after + ')');

// -- one recorder for every window: another frame's who sees this one's panels, numbers mean the same
const q = await openPage(PAGES + 'panels/skins/frame.html');
await q.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
await wait(800);
const other = await line('who', 1800, q);
const mine = (await p.eval(`document.title`)).replace('Tezcatl — ', '');
// (by the code_editor's own name: windows other scenarios left open may be called workspace_1 too)
const codeName = await p.eval(`window.frameSkin.frameAt('11').contentWindow.Tezcatl.bus.self.name`);
check(new RegExp('code ' + codeName + ' +' + mine + ' 1 1').test(other), "another window's who: the first frame's code_editor, with its place: " + (other.match(/.*code .* 1 1.*/) || [''])[0]);
check(Number((other.match(/who ── (\d+) open/) || [])[1]) > after, '...and its own panels too');
check(/has ended already: failed/.test(await line('work cancel ' + n, 800, q)), "...a row's number means the same there (the same recorder answers)");
// the recorder's window goes: the other window's store takes over and calls the roll
await p.close();
await wait(1500);
const took = await line('who', 2000, q);
check(/who ── \d+ open/.test(took) && !new RegExp('code ' + codeName + ' ').test(took), "the recorder's window closed: another store took over, and the closed window's panels are not open");
await q.close();
done();
