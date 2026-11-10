// test/e2e/code_set_guard.mjs -- two ways unsaved edits could be lost:
//  1. code.set over unsaved edits: the code_editor refuses it now (as :e does)
//     and says so (code.openFailed {dirty}); the frame, whose idea of
//     "unsaved" was behind, opens the file in a code_editor of its own instead
//  2. the copy of a code_editor closed unsaved: the close carries the text at
//     closing (the edits of the last idleMs are kept), and a slot pushed out
//     while the code_editor was open is made again; a marked copy is never pushed out
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const RELAY = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
const ORIGIN = PAGES.replace(/\/+$/, '').replace(/^(https?:\/\/[^/]+).*$/, '$1');
const dir = path.join(E2E, 'fsroot', 'csg');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'aaa\n');
fs.writeFileSync(path.join(dir, 'b.txt'), 'bbb\n');
fs.writeFileSync(path.join(dir, 'c.txt'), 'ccc\n');
const slot = async (p) => ((await (await fetch(RELAY + '/mirror/list')).json()).slots || []).find((s) => s.path === p) || null;
const copyOf = async (p) => { const r = await fetch(RELAY + '/mirror?path=' + encodeURIComponent(p)); return r.ok ? r.text() : null; };

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
const edit = (place, insert) => p.eval(`(() => { const v = ${view(place)}; v.dispatch({ changes: { from: 0, insert: ${JSON.stringify(insert)} } }); return true; })()`);
const codePlaces = async () => {
  const st = JSON.parse(await p.eval(`JSON.stringify(window.frameSkin.state())`));
  const out = [];
  for (let c = 0; c < st.columns.length; c++) for (const q of st.columns[c]) if (q[0] === 'code_editor') out.push('' + (c + 1) + q[1]);
  return out;
};

console.log('1. code.set over unsaved edits');
await line('skin main 2,1');
await line(':find csg/a.txt');
await p.waitFor(`${view('11')} && ${view('11')}.state.doc.toString() === 'aaa\\n'`, 15000);
await wait(500);
await edit('11', 'EDIT A\n');
await wait(300);
// the frame's idea of "unsaved" is behind (code.dirty not heard yet)
await p.eval(`(() => { const cs = window.frameSkin.codes(); Object.keys(cs).forEach((k) => { cs[k].dirty = false; }); return true; })()`);
// a panel of the frame asks for another file (what a tree's Enter does)
await p.eval(`window.frameSkin.frameAt('11').contentWindow.Tezcatl.bus.post('code.open', { path: 'csg/b.txt' }); true`);
await p.waitFor(`/unsaved changes/.test(window.frameSkin.frameAt('11').contentDocument.getElementById('msg').textContent)`, 10000);
check(await p.eval(`${view('11')}.state.doc.toString()`) === 'EDIT A\naaa\n', 'the code_editor with unsaved edits keeps them (code.set refused)');
check(/unsaved changes.*csg\/b\.txt/.test(await msgAt('11')), '...and says why');
let places = [];
for (let i = 0; i < 60 && places.length < 2; i++) { places = await codePlaces(); if (places.length < 2) await wait(250); }
const pb = places.find((x) => x !== '11');
check(!!pb, 'the frame opens it in a code_editor of its own instead: ' + pb);
if (pb) await p.waitFor(`${view(pb)} && ${view(pb)}.state.doc.toString() === 'bbb\\n'`, 15000);
check(!!pb, '...with the file');

console.log('2. the copy of a code_editor closed unsaved');
// closed right after typing (under idleMs): the close carries the text
await edit('11', 'LAST SECOND\n');
await line('skin del 1 1');
await wait(1200);
const sa = await slot('csg/a.txt');
check(sa && typeof sa.unsaved_closed === 'number', 'closed unsaved: the slot is kept, marked');
check((await copyOf('csg/a.txt')) === 'LAST SECOND\nEDIT A\naaa\n', '...with the text at closing (the last edits, typed under idleMs, too)');

// pushed out while open, then closed unsaved: made again
await line(':find csg/c.txt');
// the places move as panels go (skin del): found by the text
let pc = null;
for (let i = 0; i < 60 && !pc; i++) {
  for (const x of await codePlaces()) if ((await p.eval(`${view(x)} ? ${view(x)}.state.doc.toString() : null`)) === 'ccc\n') pc = x;
  if (!pc) await wait(250);
}
check(!!pc, ':find opens csg/c.txt in a code_editor: ' + pc);
await wait(500);
await edit(pc, 'EDIT C\n');
await wait(2800);   // the copy written at rest
const slots = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'code.json'), 'utf8')).mirror.slots;
for (let i = 0; i <= slots; i++) {
  await fetch(RELAY + '/mirror?' + new URLSearchParams({ path: 'csg/other' + i, owner: 'e2e', mode: 'open', slots: String(slots) }), {
    method: 'PUT', headers: { origin: ORIGIN, 'content-type': 'text/plain' }, body: 'x',
  });
  await wait(5);
}
check(!(await slot('csg/c.txt')), 'more files than slots: the open code_editor\'s slot is pushed out (' + slots + ' slots)');
check(!!(await slot('csg/a.txt')), '...but not the copy left by the code_editor closed unsaved');
await edit(pc, 'MORE\n');
await line('skin del ' + pc[0] + ' ' + pc[1]);
await wait(1200);
const sc = await slot('csg/c.txt');
check(sc && typeof sc.unsaved_closed === 'number', 'closed unsaved after it was pushed out: the slot is made again, marked');
check((await copyOf('csg/c.txt')) === 'MORE\nEDIT C\nccc\n', '...with the text at closing');

// leave nothing behind
for (let i = 0; i <= slots; i++) await fetch(RELAY + '/mirror/close?' + new URLSearchParams({ path: 'csg/other' + i, owner: 'e2e' }), { method: 'POST', headers: { origin: ORIGIN } });
for (const f of ['csg/a.txt', 'csg/c.txt']) await fetch(RELAY + '/mirror/drop?path=' + f, { method: 'POST', headers: { origin: ORIGIN } });
const errs = [p].flatMap((pg) => pg.logs.filter((l) => /exception/.test(l)));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
await wait(800);
done();
