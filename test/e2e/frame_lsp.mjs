// test/e2e/frame_lsp.mjs -- the language server's commands for files no
// code_editor has, inside the frame: :LspDef to another
// file and a :LspRename reaching another file open that file as a code_editor
// panel of the frame (window.tezcatlSkin.openNew -> skin add), never a new
// window; the rename's edits land there unsaved and the disk is untouched.
// Real typescript-language-server.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const CDP = 'http://127.0.0.1:' + (process.env.CDP_PORT || '9223');
const dir = path.join(E2E, 'fsroot', 'fl');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const A = "import { helper } from './b.js';\nconsole.log(helper(1), helper(2));\n";
const B = 'export function helper(x) {\n  return x + 1;\n}\n';
fs.writeFileSync(path.join(dir, 'a.js'), A);
fs.writeFileSync(path.join(dir, 'b.js'), B);
// a project the server knows whole (without one, tsserver knows only the open files
// and a rename from b.js would not reach a.js -- the server's limit, not ours)
fs.writeFileSync(path.join(dir, 'jsconfig.json'), '{ "include": ["*.js"] }\n');
const tabs = async () => (await (await fetch(CDP + '/json/list')).json()).filter((t) => t.type === 'page').length;

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(300);
}
const view = (place) => `(() => { const f = window.frameSkin.frameAt('${place}'); const c = f && f.contentDocument.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;
const msgAt = (place) => p.eval(`window.frameSkin.frameAt('${place}').contentDocument.getElementById('msg').textContent`);
const docAt = (place) => p.eval(`${view(place)} ? ${view(place)}.state.doc.toString() : null`);
const cursorAt = (place) => p.eval(`(() => { const v = ${view(place)}; const h = v.state.selection.main.head; const l = v.state.doc.lineAt(h); return JSON.stringify([l.number, h - l.from + 1]); })()`);
const putCursor = (place, word, n = 0) => p.eval(`(() => { const v = ${view(place)}; const t = v.state.doc.toString(); let i = -1; for (let k = 0; k <= ${n}; k++) i = t.indexOf(${JSON.stringify(word)}, i + 1); v.dispatch({ selection: { anchor: i + 1 } }); return i; })()`);
const lspUp = (place) => p.waitFor(`/lsp javascript/.test(window.frameSkin.frameAt('${place}').contentDocument.getElementById('msg').textContent)`, 25000);

console.log('frame + language server');
await line(':find fl/a.js');
await p.waitFor(`${view('11')} && ${view('11')}.state.doc.toString() === ${JSON.stringify(A)}`, 15000);
await lspUp('11');
await wait(800);
const t0 = await tabs();

// :LspDef on helper (a.js) -> b.js as a code_editor panel of the frame
await putCursor('11', 'helper', 1);
await line(':LspDef');
await p.waitFor(`${view('12')} && ${view('12')}.state.doc.toString() === ${JSON.stringify(B)}`, 15000);
await p.waitFor(`(() => { const v = ${view('12')}; return v.state.selection.main.head > 0; })()`, 8000);
check((await tabs()) === t0, ':LspDef to b.js opens no new window');
check(await cursorAt('12') === '[1,17]', '...b.js is a code_editor panel of the frame (12), the cursor at the definition (1:17)');

// close a.js's panel; rename helper from b.js -> a.js opens as a panel, edited, unsaved
await line('skin del 1 1');
await wait(300);
await lspUp('11');
await putCursor('11', 'helper', 0);
await line(':LspRename helper2');
await p.waitFor(`/renamed: |!/.test(window.frameSkin.frameAt('11').contentDocument.getElementById('msg').textContent)`, 20000);
const m = await msgAt('11');
check(/renamed: helper2 \(1 place\(s\) in this file, 3 in 1 other file\(s\)/.test(m), ':LspRename helper2 reaching a.js (open nowhere): ' + m);
check((await tabs()) === t0, '...no new window');
const st = JSON.parse(await p.eval(`JSON.stringify(window.frameSkin.state())`));
check(st.columns[0].length === 2 && st.columns[0].every((x) => x[0] === 'code_editor'), '...a.js opened as a second code_editor panel of the frame');
const a2 = await docAt('12');
check(a2 === A.replace(/helper/g, 'helper2'), '...its text has the rename: ' + JSON.stringify(a2));
check(/function helper2/.test(await docAt('11')), '...and b.js defines helper2');
check(fs.readFileSync(path.join(dir, 'a.js'), 'utf8') === A && fs.readFileSync(path.join(dir, 'b.js'), 'utf8') === B, '...unsaved: the disk is as it was');

// saved by the person: :w in each
await line('skin focus 1 2');
await line(':w');
await line('skin focus 1 1');
await line(':w');
await wait(1000);
check(fs.readFileSync(path.join(dir, 'a.js'), 'utf8') === A.replace(/helper/g, 'helper2') && /function helper2/.test(fs.readFileSync(path.join(dir, 'b.js'), 'utf8')), ':w in each saves the rename');

const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
