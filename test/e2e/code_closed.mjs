// test/e2e/code_closed.mjs -- a code_editor closed with unsaved edits,
// replaces): closing is never refused; the copy
// stays (the slot is kept, marked unsaved_closed) and the file_changes panel
// says so -- when the panel is closed (skin del) and when the whole window is
// reloaded (the panel reads the relay's slots when it starts). Enter on the
// notice opens the file in the frame; the code_editor says a copy is left;
// :Replay and :w save it. Nothing is replayed by itself. A clean close says
// nothing and removes the slot.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const RELAY = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
const dir = path.join(E2E, 'fsroot', 'cc');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n');
fs.writeFileSync(path.join(dir, 'b.txt'), 'bee\n');
const slot = async (p) => ((await (await fetch(RELAY + '/mirror/list')).json()).slots || []).find((s) => s.path === p) || null;
const disk = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(300);
}
const view = (place) => `(() => { const f = window.frameSkin.frameAt('${place}'); const c = f && f.contentDocument.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;
const docAt = (place) => p.eval(`${view(place)} ? ${view(place)}.state.doc.toString() : null`);
const msgAt = (place) => p.eval(`window.frameSkin.frameAt('${place}').contentDocument.getElementById('msg').textContent`);
const panelText = () => p.eval(`window.frameSkin.frameAt('21').contentDocument.getElementById('list').innerText`);
const edit = (place, insert) => p.eval(`(() => { const v = ${view(place)}; v.dispatch({ changes: { from: 0, insert: ${JSON.stringify(insert)} } }); return true; })()`);

console.log('a code_editor closed with unsaved edits');
await line('skin main 2,1');
await line(':find cc/a.txt');
await p.waitFor(`${view('11')} && ${view('11')}.state.doc.toString() === 'one\\ntwo\\n'`, 15000);
await line('skin add 2 file_changes');
await p.waitFor(`window.frameSkin.frameAt('21') && window.frameSkin.frameAt('21').contentDocument.getElementById('list')`, 10000);
await wait(800);

// 1. skin del: closed, not refused; the copy stays, file_changes says so
await edit('11', 'EDIT ONE\n');
await wait(2800);   // the copy is written when editing rests (mirror.idleMs 2000)
await line('skin del 1 1');
await p.waitFor(`/the code_editor panel of cc\\/a\\.txt was closed unsaved/.test(window.frameSkin.frameAt('21').contentDocument.getElementById('list').innerText)`, 10000);
check(!JSON.stringify(await p.eval(`JSON.stringify(window.frameSkin.state())`)).includes('code_editor'), 'skin del closes the edited code_editor (not refused)');
check(true, '...file_changes says it was closed without saving');
const s1 = await slot('cc/a.txt');
check(s1 && typeof s1.unsaved_closed === 'number', '...the slot is kept, marked unsaved_closed');
check(disk('a.txt') === 'one\ntwo\n', '...the disk is as it was');

// 2. Enter on the notice: opened in the frame (a code_editor added), a copy is left; nothing replayed by itself
await line('skin focus 2 1');
await p.eval(`window.frameSkin.frameAt('21').contentDocument.getElementById('list').focus(); true`);
await p.key('Enter', 'Enter', '\r');
const place = await (async () => {
  for (let i = 0; i < 60; i++) {
    const st = JSON.parse(await p.eval(`JSON.stringify(window.frameSkin.state())`));
    for (let c = 0; c < st.columns.length; c++) for (const q of st.columns[c]) if (q[0] === 'code_editor') return '' + (c + 1) + q[1];
    await wait(250);
  }
  return null;
})();
check(!!place, 'Enter on the notice adds a code_editor to the frame: ' + place);
await p.waitFor(`${view(place)} && ${view(place)}.state.doc.toString() === 'one\\ntwo\\n'`, 15000);
await p.waitFor(`/a copy is left/.test(window.frameSkin.frameAt('${place}').contentDocument.getElementById('msg').textContent)`, 10000);
check(/a copy is left.*:Replay/.test(await msgAt(place)), '...it opens the disk version and says a copy is left (not replayed by itself)');
check(((await slot('cc/a.txt')) || {}).unsaved_closed == null, '...the mark goes (the slot is the new code_editor\'s)');
await line(':Replay');
await p.waitFor(`${view(place)}.state.doc.toString() === 'EDIT ONE\\none\\ntwo\\n'`, 10000);
await line(':w');
await wait(800);
check(disk('a.txt') === 'EDIT ONE\none\ntwo\n', ':Replay then :w saves the edit');

// 3. a clean close: nothing said, the slot goes
const before = (await panelText()).split('\n').length;
await line('skin del ' + place[0] + ' ' + place[1]);
await wait(800);
check(!(await slot('cc/a.txt')), 'a clean close removes the slot');
check((await panelText()).split('\n').length === before, '...and says nothing');

// 4. the whole window reloaded with unsaved edits: the panel, started again, lists it from the relay
await line(':find cc/b.txt');
const pb = await (async () => {
  for (let i = 0; i < 60; i++) {
    const st = JSON.parse(await p.eval(`JSON.stringify(window.frameSkin.state())`));
    for (let c = 0; c < st.columns.length; c++) for (const q of st.columns[c]) if (q[0] === 'code_editor') return '' + (c + 1) + q[1];
    await wait(250);
  }
  return null;
})();
await p.waitFor(`${view(pb)} && ${view(pb)}.state.doc.toString() === 'bee\\n'`, 15000);
await wait(500);
await edit(pb, 'B EDIT\n');
await wait(2800);
await p.send('Page.reload', {});
await p.waitFor(`window.frameSkin && window.frameSkin.frameAt('21') && window.frameSkin.frameAt('21').contentDocument.getElementById('list')`, 15000);
await p.waitFor(`/cc\\/b\\.txt was closed unsaved/.test(window.frameSkin.frameAt('21').contentDocument.getElementById('list').innerText)`, 10000);
check(true, 'a reload of the window: the panel, started again, lists the code_editor closed unsaved (from the relay)');
const s4 = await slot('cc/b.txt');
check(s4 && typeof s4.unsaved_closed === 'number', '...the copy is kept');
check(disk('b.txt') === 'bee\n', '...the disk is as it was');
const copy = await (await fetch(RELAY + '/mirror?path=cc/b.txt')).text();
check(copy === 'B EDIT\nbee\n', '...the copy has the edit');

// leave nothing behind: open it (the slot becomes that code_editor's) and close it clean
await line(':find cc/b.txt');
await wait(1500);
const errs = [p].flatMap((pg) => pg.logs.filter((l) => /exception/.test(l)));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
await wait(800);
done();
