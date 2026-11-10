// test/e2e/lsp_log.mjs -- the lsp_log panel (panels/resident/lsp_log.html,
// in the frame: the code_editor's LSP operations are written down
// (a jump, a description, references); C-o / C-i in a code_editor (lsp.back /
// lsp.forward) are taken by the lsp_log of the same skin and go back to
// where the jump left from / forward to where it went; Enter on a line goes
// to its place; the panel is a read-only code_editor derivative (vim). Real
// typescript-language-server.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'll');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.js'), "import { helper } from './b.js';\nconst v = helper(1);\nconsole.log(v, helper(2));\n");
fs.writeFileSync(path.join(dir, 'b.js'), 'export function helper(x) {\n  return x + 1;\n}\n');
fs.writeFileSync(path.join(dir, 'jsconfig.json'), '{ "include": ["*.js"] }\n');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(300);
}
const view = (place) => `(() => { const f = window.frameSkin.frameAt('${place}'); const c = f && f.contentDocument.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;
const cursorAt = (place) => p.eval(`(() => { const v = ${view(place)}; const h = v.state.selection.main.head; const l = v.state.doc.lineAt(h); return JSON.stringify([l.number, h - l.from + 1]); })()`);
const putCursor = (place, ln, col) => p.eval(`(() => { const v = ${view(place)}; const l = v.state.doc.line(${ln}); v.dispatch({ selection: { anchor: l.from + ${col} - 1 } }); return true; })()`);
const LG = `window.frameSkin.frameAt('21').contentWindow`;
const logText = () => p.eval(`${LG}.lspLog.text()`);
const focusPlace = () => p.eval(`window.frameSkin.state().focus`);
async function keyIn(place, key, code, text, mod) {
  await line('skin focus ' + place[0] + ' ' + place[1]);
  await p.eval(`(() => { ${view(place)}.focus(); return true; })()`);
  await p.key('Escape', 'Escape', '');
  await p.key(key, code, text, mod || 0);
  await wait(500);
}

console.log('lsp_log');
await line('skin main 2,1');
await line(':find ll/a.js');
await p.waitFor(`${view('11')} && ${view('11')}.state.doc.toString().startsWith('import')`, 15000);
await p.waitFor(`/lsp javascript/.test(window.frameSkin.frameAt('11').contentDocument.getElementById('msg').textContent)`, 25000);
await line('skin add 2 lsp_log');
await p.waitFor(`window.frameSkin.frameAt('21') && ${LG}.lspLog`, 10000);
await wait(800);

// a jump: :LspDef on helper (2:11) -> b.js as a panel; written down
await putCursor('11', 2, 11);
await line(':LspDef');
await p.waitFor(`${view('12')} && ${view('12')}.state.doc.toString().startsWith('export')`, 15000);
await p.waitFor(`/def    ll\\/a\\.js:2:11 → ll\\/b\\.js:1:17/.test(${LG}.lspLog.text())`, 8000);
check(true, 'the jump is written down: def ll/a.js:2:11 → ll/b.js:1:17');
check(JSON.stringify(await p.eval(`${LG}.lspLog.size()`)) === '{"jumps":1,"at":1}', '...and is one jump in its history');

// C-o in b.js's code_editor: back to a.js 2:11 (the jump's from), taken by the lsp_log of this skin
await keyIn('12', 'o', 'KeyO', 'o', 2);
await p.waitFor(`(() => { const v = ${view('11')}; return v.state.doc.lineAt(v.state.selection.main.head).number === 2; })()`, 8000);
await wait(300);
check(await cursorAt('11') === '[2,11]' && await focusPlace() === '11', 'C-o goes back to where the jump left from (a.js 2:11, its code_editor focused): ' + await cursorAt('11'));
// C-i: forward again to b.js 1:17
await keyIn('11', 'i', 'KeyI', 'i', 2);
await wait(500);
check(await cursorAt('12') === '[1,17]' && await focusPlace() === '12', 'C-i goes forward to where it went (b.js 1:17): ' + await cursorAt('12'));
await keyIn('12', 'i', 'KeyI', 'i', 2);
check(/no later jump/.test(await p.eval(`${LG}.document.getElementById('foot').textContent`)), '...C-i again: no jump ahead, said in the panel');

// K: the description, written whole
await putCursor('12', 1, 18);
await keyIn('12', 'K', 'KeyK', 'K', 8);
await p.waitFor(`/hover  ll\\/b\\.js:1:18/.test(${LG}.lspLog.text())`, 8000);
const t = await logText();
check(/│ .*function helper\(x: any\): any/.test(t), 'K writes the description whole in the lsp_log');

// :LspRefs on helper in a.js: the places, one a line
await putCursor('11', 3, 17);
await line('skin focus 1 1');
await line(':LspRefs');
await p.waitFor(`/refs   helper  \\d+ place/.test(${LG}.lspLog.text())`, 10000);
await wait(500);
const CDP = 'http://127.0.0.1:' + (process.env.CDP_PORT || '9223');
const listWins = (await (await fetch(CDP + '/json/list')).json()).filter((x) => /config=locations/.test(x.url)).length;
check(listWins === 0 && /written to lsp_log/.test(await p.eval(`window.frameSkin.frameAt('11').contentDocument.getElementById('msg').textContent`)),
  ':LspRefs in a skin with an lsp_log opens no list window (said in the code_editor): ' + listWins);
const t2 = await logText();
check(/refs   helper  4 place/.test(t2) && /    ll\/b\.js:1:17/.test(t2) && /    ll\/a\.js:3:16/.test(t2), 'refs are written with every place (ll/a.js:1:10 … ll/b.js:1:17): ' + JSON.stringify(t2.split('\n').filter((l) => /refs|^    ll/.test(l))));

// Enter on the ll/b.js:1:17 line of the record: that place
await p.eval(`(() => { const v = ${view('12')}; v.dispatch({ selection: { anchor: v.state.doc.length } }); return true; })()`);
await line('skin focus 2 1');
const lineNo = await p.eval(`${LG}.lspLog.text().split('\\n').findIndex((l) => /^    ll\\/b\\.js:1:17/.test(l)) + 1`);
await p.eval(`(() => { const v = ${LG}.lspLog.view(); v.focus(); v.dispatch({ selection: { anchor: v.state.doc.line(${lineNo}).from } }); return true; })()`);
await p.key('Enter', 'Enter', '\r');
await wait(800);
check(await cursorAt('12') === '[1,17]' && await focusPlace() === '12', 'Enter on a place in the record goes there (b.js 1:17): ' +
  await cursorAt('12') + ' focus ' + await focusPlace() + ' line ' + lineNo + ' foot ' + await p.eval(`${LG}.document.getElementById('foot').textContent`));

// the record is a read-only text with vim: G, and it does not change by typing
await line('skin focus 2 1');
await p.eval(`(() => { ${LG}.lspLog.view().focus(); return true; })()`);
await p.key('G', 'KeyG', 'G', 8);
await wait(200);
const before = await logText();
await p.key('x', 'KeyX', 'x');
await wait(200);
check(await p.eval(`${LG}.lspLog.cursorLine()`) === before.split('\n').length && (await logText()) === before, 'vim moves in the record (G); it cannot be edited (x does nothing)');

const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
