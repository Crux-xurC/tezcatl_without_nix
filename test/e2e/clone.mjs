// test/e2e/clone.mjs -- a file another code_editor has open is not opened a second
// time: `:e <path>` (and code_editor.html?path= by hand) opens its
// clone, ~work/clone/<path>, from the disk -- a file of its own; the frame's
// receiving side says so with the first code_editor as the reference (`go on`).
// And what else happens beside what was asked is said there too:
// file_changes reading a file again, a command that fell back to a new window.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'cl2');
const work = path.join(E2E, 'work');
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(path.join(work, 'clone'), { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n');
fs.writeFileSync(path.join(dir, 'b.txt'), 'bee\n');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const lastRecv = (n = 4) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 300) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const view = (place) => `(() => { const c = window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const docOf = (place) => p.eval(`${view(place)}.state.doc.toString()`);
const pathOf = (place) => p.eval(`window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument.getElementById('path').textContent`);
const msgOf = (place) => p.eval(`window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument.getElementById('msg').textContent`);

console.log('clone: a file open elsewhere opens as its clone');
await line(':find cl2/a.txt');
await p.waitFor(`window.frameSkin.frameAt('11') && window.frameSkin.frameAt('11').contentDocument.querySelector('.cm-content') && ${view('11')}.state.doc.toString() === 'one\\ntwo\\n'`, 15000);
await wait(400);
// the first code_editor has edits not saved
await p.eval(`(() => { const v = ${view('11')}; v.dispatch({ changes: { from: 0, insert: 'UNSAVED\\n' } }); return true; })()`);
await line('skin add 1 code_editor', 600);
await p.waitFor(`window.frameSkin.frameAt('12') && window.frameSkin.frameAt('12').contentDocument.querySelector('.cm-content')`, 15000);
await wait(500);
check((await st()).focus === '12', 'a second code_editor (12), focused');

await line(':e cl2/a.txt', 1500);
await p.waitFor(`${view('12')}.state.doc.toString() === 'one\\ntwo\\n'`, 10000);
check((await pathOf('12')) === '# ~work/clone/cl2/a.txt', ':e of a file the other code_editor has open: its clone opens, shown with #: ' + await pathOf('12'));
check((await docOf('12')) === 'one\ntwo\n', "...from the disk: not the other's unsaved edits");
check(fs.readFileSync(path.join(work, 'clone', 'cl2', 'a.txt'), 'utf8') === 'one\ntwo\n' && !fs.existsSync(path.join(dir, 'a.txt~')) && fs.readdirSync(dir).length === 2,
  '...the clone is in the work place, nothing new in the project');
check(/is open in .* this is a clone \(~work\/clone\/cl2\/a\.txt\).*does not have the edits not saved there/.test(await msgOf('12')), '...said in its head: ' + JSON.stringify((await msgOf('12')).slice(0, 90)));
const said = await lastRecv(3);
check(/1 2 cl2\/a\.txt is open in .* this is a clone .* @1 1/.test(said), "...and on the frame's receiving side, pointing at the first code_editor (@1 1): " + (said.match(/1 2 cl2.*/) || [''])[0].slice(-40));
check((await docOf('11')) === 'UNSAVED\none\ntwo\n' && (await pathOf('11')) === 'cl2/a.txt', '...the first code_editor is untouched');
check(/go on ── 1 1 code_editor/.test(await line('go on')) && (await st()).focus === '11', 'go on: to the code_editor that has the file');

// the clone is a file of its own: edited and saved there
await line('skin focus 1 2');
await p.eval(`(() => { const v = ${view('12')}; v.dispatch({ changes: { from: 0, insert: 'in the clone\\n' } }); return true; })()`);
await line(':w', 800);
check(fs.readFileSync(path.join(work, 'clone', 'cl2', 'a.txt'), 'utf8') === 'in the clone\none\ntwo\n' && fs.readFileSync(path.join(dir, 'a.txt'), 'utf8') === 'one\ntwo\n',
  'the clone can be edited and saved: it is written in the work place, the file itself is not');
// :e of the same clone again reads it again (no clone of a clone), a file nobody has opens as itself
await line(':e cl2/b.txt', 1200);
await p.waitFor(`${view('12')}.state.doc.toString() === 'bee\\n'`, 10000);
check((await pathOf('12')) === 'cl2/b.txt', 'a file nobody has open opens as itself: ' + await pathOf('12'));

// by hand, in another window: ?path= of a file open here
const c = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent('cl2/a.txt') + '&name=cl2-hand');
await c.waitFor(`document.getElementById('path') && /clone/.test(document.getElementById('path').textContent)`, 15000);
check((await c.eval(`document.getElementById('path').textContent`)) === '# ~work/clone/cl2/a.txt', 'code_editor.html?path= by hand, of a file open in another window: the clone there too');
await c.close();

// -- said beside what was asked: file_changes reading a file again
await line('skin add 1 file_changes', 800);
await wait(600);
await line('skin focus 1 2');
fs.writeFileSync(path.join(dir, 'b.txt'), 'bee changed outside\n');
await line('check update', 1500);
await p.waitFor(`${view('12')}.state.doc.toString() === 'bee changed outside\\n'`, 10000);
const fc = await lastRecv(4);
check(/1 3 read cl2\/b\.txt again \(changed by check update\) @1 2/.test(fc), 'file_changes read the clean code_editor again: said on the receiving side, with the code_editor (@1 2): ' + (fc.match(/1 3 read.*/) || [''])[0]);

// -- a command nobody took opens a new tab: said
await line('color #224466', 1200);
check(/color\.show ── no window took it: opened panels\/extra\/color\.html in a new tab/.test(await lastRecv(3)), 'a command that fell back to a new tab: said');
await p.close();
done();
