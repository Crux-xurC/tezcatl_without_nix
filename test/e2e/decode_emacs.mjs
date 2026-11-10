// test/e2e/decode_emacs.mjs -- the decode_emacs panel (D-decode-emacs) and
// code_vi_minimum (D-minimum), without Emacs: the resolver's answer is played by
// posting intent.result, and the input panel by answering intent.run.
//   an answer made a table by its result.table; Enter opens the row's file (an
//   absolute path made one from the FS root); a key runs its intent with the
//   row's value, then asks the refresh intent; a diff key writes the answered
//   text to ~work/emacs/... and adds a code_diff; ?intent= keeps one intent.
//   minimum: :m input fills the input form, :m code_editor <file> adds at the end
//   (unsaved), :m xterm pastes, :m with no one asking goes to the kill ring,
//   minimum.ask -> :m answers minimum.done.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const root = path.join(E2E, 'fsroot');
const dir = path.join(root, 'de');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 2;\n');
fs.writeFileSync(path.join(dir, 'b.md'), '# B\n');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (n = 3) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 1500) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const placeOf = async (panel) => { const s = await st(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][0] === panel) return String(c + 1) + String(r + 1); return null; };
const fdoc = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentDocument`;
const fwin = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentWindow`;

console.log('decode_emacs: an answer made a table');
await line('skin add 1 decode_emacs', 2000);
const dp = await placeOf('decode_emacs');
await p.waitFor(`${fdoc(dp)} && ${fdoc(dp)}.getElementById('grid-wrap')`, 10000);
// the frame's bus plays the resolver; a page of its own plays the input panel
const helper = await openPage(PAGES + 'panels/tool/list.html?config=commands');
await helper.waitFor(`!!(window.Tezcatl && Tezcatl.bus)`, 10000);
await helper.eval(`(() => {
  window.__ran = [];
  Tezcatl.bus.on('intent.run', (p, meta) => {
    window.__ran.push(p);
    const answer = p.id === 'magit.file-at' ? 'const a = 1;\\n' : null;
    Tezcatl.bus.post('intent.ran', { req: p.req, ok: true, payload: answer }, { to: meta.from.id });
    if (p.id === 'magit.changed-files') post([{ section: 'staged', path: ${JSON.stringify(path.join(dir, 'a.js'))} }]);
  });
  window.post = (files) => Tezcatl.bus.post('intent.result', { id: 'magit.changed-files', corr: 'c1', args: {}, payload: { files }, table: {
    from: 'files', rows: 'objects', columns: [{ key: 'section' }, { key: 'path' }], link: 'path',
    keys: { s: { intent: 'magit.stage-file', params: { file: 'path' } }, d: { diff: { intent: 'magit.file-at', params: { file: 'path' }, against: 'path' } } },
    refresh: 'magit.changed-files' } });
  return true; })()`);
await helper.eval(`post([{ section: 'unstaged', path: ${JSON.stringify(path.join(dir, 'a.js'))} }, { section: 'untracked', path: ${JSON.stringify(path.join(dir, 'b.md'))} }]); true`);
check(await p.waitFor(`${fdoc(dp)}.querySelectorAll('table.mx-grid tbody tr').length === 2`, 5000), 'intent.result with a table: drawn as a matrix (2 rows)');
check(await p.eval(`${fdoc(dp)}.getElementById('intent').textContent === 'magit.changed-files' && [...${fdoc(dp)}.querySelectorAll('table.mx-grid thead th')].map((t) => t.textContent).slice(1).join() === 'section,path'`), '...headed by the intent, its columns');
const press = async (k) => { await p.eval(`(() => { const g = ${fdoc(dp)}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`); await wait(100); };
// s on row 1: the intent with the row's path, then the refresh intent
await press('s');
await wait(800);
const ran = await helper.eval(`JSON.stringify(window.__ran)`).then(JSON.parse);
check(ran[0].id === 'magit.stage-file' && ran[0].args.file === path.join(dir, 'a.js') && ran[1] && ran[1].id === 'magit.changed-files', 's: magit.stage-file with the row\'s path, then the refresh: ' + ran.map((r) => r.id).join(', '));
check(await p.waitFor(`${fdoc(dp)}.querySelectorAll('table.mx-grid tbody tr').length === 1 && ${fdoc(dp)}.querySelector('table.mx-grid tbody td:nth-child(2)').textContent === 'staged'`, 5000), '...the answer to the refresh drawn (staged)');
// Enter: the row's file (absolute -> from the FS root) opens in a code_editor of the frame
await press('Enter');
check(await p.waitFor(`(() => { const s = window.frameSkin.state(); return JSON.stringify(s).includes('code_editor'); })()`, 10000) && await p.waitFor(`/de\\/a\\.js ── added a code_editor/.test(document.getElementById('recv').textContent)`, 10000), 'Enter: the file opens in a code_editor of the frame (the absolute path made de/a.js)');
// d: the answered text written to the work place, a code_diff added
await press('d');
check(await p.waitFor(`JSON.stringify(window.frameSkin.state()).includes('code_diff')`, 10000), 'd: a code_diff added');
check(fs.existsSync(path.join(E2E, 'work', 'emacs', 'magit.file-at', 'de', 'a.js')) && fs.readFileSync(path.join(E2E, 'work', 'emacs', 'magit.file-at', 'de', 'a.js'), 'utf8') === 'const a = 1;\n', '...the version answered is in ~work/emacs/magit.file-at/de/a.js');
// an answer with no list where the table says
await helper.eval(`Tezcatl.bus.post('intent.result', { id: 'x.bad', payload: { files: 3 }, table: { from: 'files', rows: 'values', columns: [{ key: 'v' }] } }); true`);
check(await p.waitFor(`/no list at "files"/.test(${fdoc(dp)}.getElementById('grid-wrap').textContent)`, 5000), 'an answer without the list the table says: said, not drawn');

console.log('code_vi_minimum');
let said = await line('minimum commit message', 2500);
const mp = await placeOf('code_vi_minimum');
check(mp && /a code_vi_minimum at .* \(commit message\)/.test(said), 'minimum <purpose>: added at the end of the frame: ' + said.split('\n').pop());
await p.waitFor(`${fdoc(mp)} && ${fdoc(mp)}.querySelector('.cm-content')`, 10000);
const mview = `(() => { const c = ${fdoc(mp)}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const write = (t) => p.eval(`(() => { const v = ${mview}; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: ${JSON.stringify(t)} } }); return true; })()`);
// vim takes keys, not inserted text: each character as a key
async function keys(text) {
  for (const ch of text) {
    await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch });
    await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
  }
}
const exIn = (vw, cmd) => p.eval(`(() => { ${vw}.focus(); return true; })()`).then(async () => {
  await p.key('Escape', 'Escape');
  await keys(':' + cmd);
  await p.key('Enter', 'Enter', '\r');
  await wait(800);
});
const ex = (cmd) => exIn(mview, cmd);
check(await p.eval(`${fdoc(mp)}.getElementById('purpose').textContent === 'commit message'`), '...its head says what it is for');
// :m input
await write('skin equal');
await ex('m input');
check(await p.eval(`document.getElementById('line').value === 'skin equal'`), ':m input: the text is in the input form');
await p.eval(`document.getElementById('line').value = ''; true`);
// :m code_editor <file>
await write('appended line');
await ex('m code_editor de/a.js');
const cp = await placeOf('code_editor');
const cview = `(() => { const c = ${fdoc(cp)}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
check(await p.waitFor(`${cview}.state.doc.toString() === 'const a = 2;\\nappended line\\n'`, 5000), ':m code_editor de/a.js: added at the end of that code_editor');
check(fs.readFileSync(path.join(dir, 'a.js'), 'utf8') === 'const a = 2;\n' && !(await p.eval(`${fdoc(cp)}.getElementById('dirty').hidden`)), '...unsaved');
check(await p.eval(`${mview}.state.doc.toString() === ''`), '...and the minimum is cleared');
// :m with no one asking: the kill ring
await write('to the ring');
await helper.eval(`window.__ring = []; Tezcatl.bus.on('killring.add', (p) => window.__ring.push(p.text)); true`);
await ex('m');
check((await helper.eval(`JSON.stringify(window.__ring)`)).includes('to the ring'), ':m with no one asking: into the kill ring');
// :m nowhere
await write('x');
await ex('m emacs');
check(/no such place to send to: emacs/.test(await p.eval(`${fdoc(mp)}.getElementById('foot').textContent`)), ':m to an unknown place: said');

// minimum.ask from a panel of the frame: :m answers minimum.done to it
await p.eval(`(() => { const w = ${fwin(dp)}; w.__done = []; w.Tezcatl.bus.on('minimum.done', (q) => w.__done.push(q)); w.Tezcatl.bus.post('minimum.ask', { req: 'k1', purpose: 'a path', text: 'de/' }); return true; })()`);
await wait(2000);
const s = await st();
const asks = s.columns.flat().filter((x) => x[0] === 'code_vi_minimum').length;
check(asks === 2, 'minimum.ask: another code_vi_minimum added');
const mp2 = (() => { for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][0] === 'code_vi_minimum' && String(c + 1) + String(r + 1) !== mp) return String(c + 1) + String(r + 1); return null; })();
const m2view = `(() => { const c = ${fdoc(mp2)}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
await p.waitFor(`${fdoc(mp2)}.querySelector('.cm-content') && ${m2view}.state.doc.toString() === 'de/'`, 8000);
check(await p.eval(`${m2view}.state.doc.toString() === 'de/' && ${fdoc(mp2)}.getElementById('purpose').textContent === 'a path'`), '...with its purpose and the text it was given');
await p.eval(`(() => { const v = ${m2view}; v.dispatch({ changes: { from: v.state.doc.length, insert: 'a.js' } }); return true; })()`);
await exIn(m2view, 'm');
check((await p.eval(`JSON.stringify(${fwin(dp)}.__done)`)) === JSON.stringify([{ req: 'k1', text: 'de/a.js' }]), ':m: minimum.done {req, text} to the panel that asked');

done();
