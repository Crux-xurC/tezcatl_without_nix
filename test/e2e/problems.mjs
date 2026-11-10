// test/e2e/problems.mjs -- the problems list (list.html?config=problems,
// in the frame: the diagnostics of every code_editor open
// (asked as the logbook asks, code.query -> code.here {diagnostics}), errors
// first; Enter brings that code_editor forward at the line; fixing the file
// empties it. Real typescript-language-server.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'pr');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 1;\nconst b = ;\n');
fs.writeFileSync(path.join(dir, 'b.js'), 'function f() {\n  return 1;\n}\n\n\nlet c = (;\n');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(300);
}
const view = (place) => `(() => { const f = window.frameSkin.frameAt('${place}'); const c = f && f.contentDocument.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;
const listText = () => p.eval(`(() => { const f = window.frameSkin.frameAt('21'); const l = f && f.contentDocument.getElementById('list'); return l ? l.innerText : ''; })()`);

console.log('problems');
await line('skin main 2,1');
await line(':find pr/a.js');
await p.waitFor(`${view('11')} && ${view('11')}.state.doc.toString().startsWith('const a')`, 15000);
await line(':find pr/b.js');
await p.waitFor(`${view('12')} && ${view('12')}.state.doc.toString().startsWith('function f')`, 15000);
await line('skin add 2 problems');
await p.waitFor(`/pr\\/a\\.js:2/.test((() => { const f = window.frameSkin.frameAt('21'); const l = f && f.contentDocument.getElementById('list'); return l ? l.innerText : ''; })()) && /pr\\/b\\.js:6/.test((() => { const f = window.frameSkin.frameAt('21'); const l = f && f.contentDocument.getElementById('list'); return l ? l.innerText : ''; })())`, 30000);
const t1 = await listText();
console.log(t1.split('\n').filter(Boolean).slice(0, 6).join(' | '));
check(/E pr\/a\.js:2:\d+/.test(t1) && /E pr\/b\.js:6:\d+/.test(t1), 'the diagnostics of both open code_editor are listed (E = error, file:line:col)');
const order = t1.split('\n').filter((l) => /^[EWIH] /.test(l));
check(order.length >= 2 && order.every((l, i) => i === 0 || !(l[0] === 'E' && order[i - 1][0] !== 'E')), '...errors first');

// Enter on the b.js row: that code_editor is focused, the cursor on line 6
await line('skin focus 2 1');
const idx = order.findIndex((l) => /pr\/b\.js:6/.test(l));
await p.eval(`(() => { const d = window.frameSkin.frameAt('21').contentDocument; d.getElementById('filter').focus(); return true; })()`);
const fr = await p.eval(`window.frameSkin.frameAt('21').contentDocument.getElementById('filter') ? true : false`);
for (let i = 0; i < idx; i++) await p.key('ArrowDown', 'ArrowDown', '');
await p.key('Enter', 'Enter', '\r');
await p.waitFor(`(() => { const v = ${view('12')}; return v.state.doc.lineAt(v.state.selection.main.head).number === 6; })()`, 10000);
await wait(400);
check(fr && JSON.parse(await p.eval(`JSON.stringify(window.frameSkin.state())`)).focus === '12', 'Enter on pr/b.js:6 focuses that code_editor (12)');
check(true, '...the cursor on line 6');

// fix a.js (not saved): its rows go
await p.eval(`(() => { const v = ${view('11')}; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'const a = 1;\\nconst b = 2;\\n' } }); return true; })()`);
await p.waitFor(`!/pr\\/a\\.js/.test((() => { const f = window.frameSkin.frameAt('21'); return f.contentDocument.getElementById('list').innerText; })())`, 20000);
check(!/pr\/a\.js/.test(await listText()) && /pr\/b\.js:6/.test(await listText()), 'fixing pr/a.js (unsaved) takes its rows away; pr/b.js stays');

// close b.js's code_editor (discarding the edits is not the point: it has none): its rows go too
await line('skin del 1 2');
await p.waitFor(`!/pr\\/b\\.js/.test((() => { const f = window.frameSkin.frameAt('21'); return f.contentDocument.getElementById('list').innerText; })())`, 10000);
check(true, 'closing the code_editor of pr/b.js takes its rows away (only open files are listed)');

const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
