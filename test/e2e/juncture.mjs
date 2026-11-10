// test/e2e/juncture.mjs -- the junctures (D-juncture) from the frame's input
// form: `juncture point` sets an unset file first (j0), makes points, says
// "no new point" for the same text; `juncture back` keeps the unsaved edits
// as a point first, then puts the parent into the code_editor unsaved (the file
// on disk untouched); back at j0 says so; `forward` follows the way taken
// last; a new point after back makes a branch; a path nobody has opens in a
// code_editor added for it; the work place is refused.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const RELAY = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
const dir = path.join(E2E, 'fsroot', 'jt');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
fs.writeFileSync(path.join(dir, 'b.txt'), 'bee\n');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (n = 3) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 800) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const view = (place) => `(() => { const c = window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const docOf = (place) => p.eval(`${view(place)}.state.doc.toString()`);
const append = (place, s) => p.eval(`(() => { const v = ${view(place)}; v.dispatch({ changes: { from: v.state.doc.length, insert: ${JSON.stringify(s)} } }); return true; })()`);
const tree = (rel) => fetch(RELAY + '/juncture/tree?path=' + encodeURIComponent(rel)).then((r) => r.json());

console.log('junctures: set, point, back, forward, a branch');
await line(':find jt/a.txt');
await p.waitFor(`window.frameSkin.frameAt('11') && window.frameSkin.frameAt('11').contentDocument.querySelector('.cm-content') && ${view('11')}.state.doc.toString() === 'one\\n'`, 15000);
await wait(500);

// -- point on an unset file: set first, j0 the text now
let said = await line('juncture point');
check(/juncture point ── jt\/a\.txt: set ── j0 is the text now/.test(said) && /@1 1/.test(said), 'juncture point on an unset file sets it: j0, with the code_editor as reference: ' + said.split('\n').pop());
let t = await tree('jt/a.txt');
check(t.current === 'j0' && t.nodes.j0.ancestor === true && /^~work\/juncture\/files\/.*\/j0-a\.txt$/.test(t.nodes.j0.text), '...the relay has j0 (the ancestor), its text in the work place');

await append('11', 'two\n');
check(/jt\/a\.txt: j1 @1 1$/.test(await line('juncture point')), 'an edit, juncture point: j1');
check(/the text is j1 already \(no new point\)/.test(await line('juncture point')), 'the same text again: no new point');

// -- back with unsaved edits: they become j2 first, then j1 goes in, unsaved
await append('11', 'three\n');
said = await line('juncture back', 1200);
check(/jt\/a\.txt: j2 → j1 \(the edits were kept as j2\)/.test(said), 'juncture back with edits: kept as j2, then to j1: ' + said.split('\n').pop());
check((await docOf('11')) === 'one\ntwo\n', '...the code_editor has j1');
check(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8') === 'one\n', '...unsaved: the file on disk is untouched');
check(/●/.test(await p.eval(`window.frameSkin.frameAt('11').contentDocument.getElementById('head').innerText`)) || (await p.eval(`!window.frameSkin.frameAt('11').contentDocument.getElementById('dirty').hidden`)), '...and the code_editor shows it unsaved');

check(/j1 → j0/.test(await line('juncture back')) && (await docOf('11')) === 'one\n', 'back again: j0');
said = await line('juncture back');
check(/! juncture back ── jt\/a\.txt: at the start, j0/.test(said), 'back at j0: said, nothing changes');

// -- forward: the way taken last
check(/j0 → j1/.test(await line('juncture forward')) && (await docOf('11')) === 'one\ntwo\n', 'forward: j1');
check(/j1 → j2/.test(await line('juncture forward')) && (await docOf('11')) === 'one\ntwo\nthree\n', 'forward: j2 (the edits kept before back)');
check(/no point ahead of j2/.test(await line('juncture forward')), 'forward at a leaf: said');

// -- a branch: back to j1, edit, point -> j3 beside j2; forward from j1 now goes to j3
await line('juncture back');
await append('11', 'other\n');
check(/jt\/a\.txt: j3 @1 1$/.test(await line('juncture point')), 'back to j1, another edit, point: j3');
t = await tree('jt/a.txt');
check(t.nodes.j2.parent === 'j1' && t.nodes.j3.parent === 'j1' && t.nodes.j1.lastChild === 'j3', '...j2 and j3 both children of j1, the way from j1 to j3');
await line('juncture back');
check(/j1 → j3/.test(await line('juncture forward')) && (await docOf('11')) === 'one\ntwo\nother\n', 'forward from j1 goes to j3 (taken last)');

// -- the point put in is an edit as any: :w writes it
await line(':w');
check(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8') === 'one\ntwo\nother\n', ':w writes the point put in');

// -- a path nobody here has: a code_editor added for it
said = await line('juncture set jt/b.txt', 4000);
check(/added a code_editor/.test(said) && /juncture set ── jt\/b\.txt: set ── j0 is the text now/.test(said), 'juncture set <path>: a code_editor added for it, and set: ' + said.split('\n').join(' | '));
check(/already set \(current j0\)/.test(await line('juncture set jt/b.txt')), 'set again: already set, nothing changes');

// -- refused
check(/work place has no junctures/.test(await line('juncture set ~work/scratch')), 'a file of the work place is refused');
check(/juncture set\|point\|back\|forward\|tree/.test(await line('juncture undo')), 'a juncture line that cannot be read: how to write it');

// -- the juncture_tree panel
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const placeOf = async (panel) => { const s = await st(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][0] === panel) return String(c + 1) + String(r + 1); return null; };
const tdoc = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentDocument`;
const rowsOf = (pl) => p.eval(`JSON.stringify([...${tdoc(pl)}.querySelectorAll('#list li')].map((li) => li.className.trim() + '|' + li.textContent))`).then(JSON.parse);
const press = (pl, key) => p.eval(`(() => { const l = ${tdoc(pl)}.getElementById('list'); l.focus(); l.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true })); return true; })()`);
await line('skin focus 1 1');
said = await line('juncture tree', 1500);
const tp = await placeOf('juncture_tree');
check(tp && new RegExp('juncture tree ── jt/a\\.txt in a juncture_tree added at ' + tp[0] + ' ' + tp[1]).test(said), 'juncture tree: a juncture_tree panel added for the file of the code_editor meant now: ' + said.split('\n').pop());
await p.waitFor(`${tdoc(tp)} && ${tdoc(tp)}.querySelectorAll('#list li').length === 5`, 10000);
let rows = await rowsOf(tp);
check(rows[0] === 'path|jt/a.txt' && /^\|└── j0  \d\d:\d\d:\d\d  start$/.test(rows[1]) && /├── j2/.test(rows[3]) && /└── j3 .*← current$/.test(rows[4]) && /sel/.test(rows[4].split('|')[0]),
  '...drawn as tree draws it: j0 the start, j2 and j3 under j1, j3 current and selected: ' + JSON.stringify(rows.map((r) => r.split('|')[1])));
await press(tp, 'k');
await press(tp, 'Enter');
check(await p.waitFor(`${view('11')}.state.doc.toString() === 'one\\ntwo\\nthree\\n'`, 10000), 'k, Enter: the code_editor has j2');
check(/juncture j2 ── jt\/a\.txt: j3 → j2/.test(await lastRecv(4)), 'k, Enter: j2 goes into the code_editor (unsaved), said on the receiving side: ' + (await lastRecv(1)));
check(await p.waitFor(`/current/.test(${tdoc(tp)}.querySelectorAll('#list li')[3].className)`, 10000), '...and the panel reads the tree again: j2 is current');
await press(tp, 'd');
await p.waitFor(`(() => { const s = window.frameSkin.state(); return JSON.stringify(s).includes('code_diff'); })()`, 10000);
const dp = await placeOf('code_diff');
await p.waitFor(`${tdoc(dp)}.querySelectorAll('.cm-mergeViewEditor .cm-content').length === 2`, 15000);
const sides = await p.eval(`JSON.stringify([...${tdoc(dp)}.querySelectorAll('.cm-mergeViewEditor .cm-content')].map((c) => ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)).state.doc.toString()))`).then(JSON.parse);
check(sides[0] === 'one\ntwo\nthree\n' && sides[1] === 'one\ntwo\nother\n', 'd: a code_diff added here, the point against the file on disk');
await line('skin focus 1 1');
await append('11', 'four\n');
check(/jt\/a\.txt: j4 @1 1$/.test(await line('juncture point')), 'another edit, juncture point: j4');
check(await p.waitFor(`/j4 .*← current/.test(${tdoc(tp)}.getElementById('list').textContent)`, 10000), 'a point made elsewhere: the panel reads the tree again (juncture.changed)');
// o: the selected point (j2 -- the selection stays where k put it) opened read only
await press(tp, 'o');
const op = await p.waitFor(`(() => { const s = window.frameSkin.state(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) { const f = window.frameSkin.frameAt(String(c + 1) + String(r + 1)); try { if (s.columns[c][r][0] === 'code_editor' && /~work\\/juncture\\//.test(f.contentDocument.getElementById('head').innerText) && !f.contentDocument.getElementById('ro').hidden) return String(c + 1) + String(r + 1); } catch (_) {} } return null; })()`, 15000);
check(op && (await docOf(op)) === 'one\ntwo\nthree\n', 'o: the point opened in a code_editor added here, read only: ' + op);
if (op) {
  check(await p.eval(`${view(op)}.state.readOnly === true`), '...the editor is read only (typing and :w refuse)');
}
said = await line('juncture tree jt/b.txt', 1500);
await p.waitFor(`${tdoc(tp)}.getElementById('path').textContent === 'jt/b.txt'`, 10000);
check(new RegExp('jt/b\\.txt in the juncture_tree at ' + tp[0] + ' ' + tp[1]).test(said), 'juncture tree <path>: the panel here shows that file');

// -- the tezcatl-command runs as its line, in the frame
await line('skin focus 1 1');
await append('11', 'cmd\n');
await p.eval(`window.Tezcatl.commands.invoke('juncture.point', {}); true`);
await wait(1200);
check(/jt\/a\.txt: j5/.test(await lastRecv(4)), 'the tezcatl-command juncture.point runs the line in the frame: ' + (await lastRecv(1)));

done();
