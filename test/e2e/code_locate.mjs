// test/e2e/code_locate.mjs -- "this file, this place"
// lib/code/code-locate.js): the list of the code_editor windows open now
// (list.html?config=code_editor), code.find, code.open-at going to the code_editor
// that has the file (never opening it twice) or opening a new one, and the
// cursor put at line:col; in the tree skin, `:12` and `:find path:line:col`
// in the input form (its own code_editor's pane is focused). Works in
// $E2E_DIR/fsroot/lo.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'lo');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const lines = (tag) => Array.from({ length: 10 }, (_, i) => `${tag} line ${i + 1}`).join('\n') + '\n';
for (const f of ['a', 'b', 'c', 'd']) fs.writeFileSync(path.join(dir, f + '.txt'), lines(f));

// the cursor of a code_editor page (1-based line and column)
const VIEW = `(() => { const c = document.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const cursorOf = (pg, view = VIEW) => pg.eval(`(() => { const v = ${view}; const h = v.state.selection.main.head; const l = v.state.doc.lineAt(h); return [l.number, h - l.from + 1]; })()`);
async function openVi(rel) {
  const pg = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent(rel) + '&name=' + encodeURIComponent('vi-' + path.basename(rel)));
  await pg.waitFor(`document.getElementById('path').textContent === ${JSON.stringify(rel)}`, 15000);
  return pg;
}
// as a key press would (window.open needs the user's activation; CDP's own
// evaluation has none unless asked)
const gesture = (pg, expr) => pg.send('Runtime.evaluate', { expression: expr, userGesture: true, awaitPromise: true });
async function tabs() {
  const list = await (await fetch('http://127.0.0.1:' + (process.env.CDP_PORT || '9223') + '/json/list')).json();
  return list.filter((t) => t.type === 'page');
}

console.log('code locate');
const A = await openVi('lo/a.txt');
const B = await openVi('lo/b.txt');
await A.eval(`(() => { const v = ${VIEW}; v.dispatch({ changes: { from: 0, insert: 'x' } }); return true; })()`);   // a: unsaved

// the list of the code_editor open now
const L = await openPage(PAGES + 'panels/tool/list.html?config=code_editor');
await L.waitFor(`/lo\\/a\\.txt/.test(document.getElementById('list').innerText) && /lo\\/b\\.txt/.test(document.getElementById('list').innerText)`, 10000);
const listText = await L.eval(`document.getElementById('list').innerText`);
check(/● lo\/a\.txt/.test(listText) && /lo\/b\.txt/.test(listText) && !/● lo\/b\.txt/.test(listText), 'list.html?config=code_editor lists the code_editor open now (● = unsaved)');

// code.find (from the palette's window: the foot says)
await L.eval(`(Tezcatl.commands.invoke('code.find', { path: 'lo/b.txt' }), true)`);
await L.waitFor(`/ ── open /.test(document.getElementById('foot').textContent)`, 5000);
check(/code\.find lo\/b\.txt ── open \(vi-b\.txt\)/.test(await L.eval(`document.getElementById('foot').textContent`)), 'code.find says which code_editor has it');
await L.eval(`(Tezcatl.commands.invoke('code.find', { path: 'lo/zzz.txt' }), true)`);
await L.waitFor(`/no open code_editor has it/.test(document.getElementById('foot').textContent)`, 5000);
check(/no open code_editor has it/.test(await L.eval(`document.getElementById('foot').textContent`)), '...and when none has it');

// code.open-at a file open already: that code_editor, the cursor at line:col, no new window
const before = (await tabs()).length;
await L.eval(`(Tezcatl.commands.invoke('code.open-at', { path: 'lo/b.txt:3:4' }), true)`);
await B.waitFor(`(() => { const v = ${VIEW}; return v.state.doc.lineAt(v.state.selection.main.head).number === 3; })()`, 5000);
check(JSON.stringify(await cursorOf(B)) === '[3,4]', 'code.open-at lo/b.txt:3:4 puts the cursor of the code_editor showing it at 3:4');
await wait(500);
check((await tabs()).length === before, '...and opens no new window (the file was open)');

// a file open nowhere: a new code_editor, the cursor at the line
await gesture(L, `(Tezcatl.commands.invoke('code.open-at', { path: 'lo/c.txt', line: 5 }), true)`);
const C = await attachTo('code_editor.html?path=lo%2Fc.txt');
await C.waitFor(`document.getElementById('path').textContent === 'lo/c.txt' && (() => { const v = ${VIEW}; return v.state.doc.lineAt(v.state.selection.main.head).number === 5; })()`, 15000);
check(JSON.stringify(await cursorOf(C)) === '[5,1]', 'code.open-at of a file open nowhere opens a new code_editor at line 5');
await L.eval(`(Tezcatl.commands.invoke('code.open-at', { path: 'lo/c.txt', line: 2 }), true)`);
await C.waitFor(`(() => { const v = ${VIEW}; return v.state.doc.lineAt(v.state.selection.main.head).number === 2; })()`, 5000);
check(JSON.stringify(await cursorOf(C)) === '[2,1]' && (await tabs()).filter((t) => t.url.includes('lo%2Fc.txt')).length === 1, '...the second time it goes to that one (not opened twice)');

// Enter in the list brings the code_editor to the front (headless: it answers)
await L.waitFor(`/lo\\/c\\.txt/.test(document.getElementById('list').innerText)`, 5000);
const revealed = await L.eval(`new Promise((res) => { const off = Tezcatl.bus.on('code.revealed', () => { off(); res(true); }); const items = [...document.querySelectorAll('#list li')]; const i = items.findIndex((li) => /lo\\/b\\.txt/.test(li.innerText)); items[i].click(); setTimeout(() => res(false), 2000); })`);
check(revealed, 'Enter (click) on a code_editor in the list asks it to come forward (code.reveal answered)');

// -- the tree skin: :12 and :find in its input form -------------------------
const S = await openPage(PAGES + 'panels/skins/tree.html');
const F = (part) => `[...document.querySelectorAll('iframe')].find(f => (f.src||'').includes(${JSON.stringify(part)}))`;
const sdoc = (part) => `${F(part)}.contentDocument`;
const sview = (part) => `(() => { const c = ${sdoc(part)}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
await S.waitFor(`${F('code_cmd_in')} && ${F('code_editor')} && ${sdoc('code_editor')}.querySelector('.cm-content') && ${sdoc('code_cmd_in')}.querySelector('.cm-content')`, 20000);
await wait(800);
async function line(text) {
  await S.eval(`${F('code_cmd_in')}.contentWindow.focus(); ${sview('code_cmd_in')}.focus(); true`);
  await S.send('Input.insertText', { text });
  await S.key('Enter', 'Enter', '\r', 2);
  await wait(400);
}
const status = () => S.eval(`document.getElementById('status').textContent`);
const focusedPane = () => S.eval(`(() => { const a = document.activeElement; return a && a.tagName === 'IFRAME' ? a.src : ''; })()`);

await line(':e lo/d.txt');
await S.waitFor(`${sdoc('code_editor')}.getElementById('path').textContent === 'lo/d.txt'`, 8000);
await line(':7');
await S.waitFor(`(() => { const v = ${sview('code_editor')}; return v.state.doc.lineAt(v.state.selection.main.head).number === 7; })()`, 5000);
check(JSON.stringify(await cursorOf(S, sview('code_editor'))) === '[7,1]', ':7 in the input form puts the skin\'s code_editor at line 7');
check((await focusedPane()).includes('code_editor'), '...and focuses the code_editor pane');

// :find of the file in the skin's own code_editor: that pane, at line:col
await line(':find lo/d.txt:4:3');
await S.waitFor(`(() => { const v = ${sview('code_editor')}; return v.state.doc.lineAt(v.state.selection.main.head).number === 4; })()`, 5000);
check(JSON.stringify(await cursorOf(S, sview('code_editor'))) === '[4,3]', ':find lo/d.txt:4:3 goes to the skin\'s own code_editor at 4:3');
check((await focusedPane()).includes('code_editor'), '...its pane focused (lib/core/panes.js, by the frame\'s window)');
check(/:find lo\/d\.txt:4:3 ── .*to the code_editor that has it/.test(await status()), '...and the bar says so');

// :find of a file open in another window: that window's code_editor
await line(':find lo/a.txt:9');
await A.waitFor(`(() => { const v = ${VIEW}; return v.state.doc.lineAt(v.state.selection.main.head).number === 9; })()`, 5000);
check(JSON.stringify(await cursorOf(A)) === '[9,1]', ':find lo/a.txt:9 goes to the code_editor window that has it');
await line(':find');
check(/no path/.test(await status()), ':find with no path says so');

const errs = [S, L, A, B, C].flatMap((pg) => pg.logs.filter((l) => /exception/.test(l)));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
for (const pg of [S, L, A, B, C]) await pg.close();
done();
