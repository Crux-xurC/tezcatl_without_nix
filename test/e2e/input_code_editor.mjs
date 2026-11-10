// test/e2e/input_code_editor.mjs -- the lead-key input form sending to a code_editor
// of the same skin (D-lead-key): input_target lists it (c, with its file and
// vim's mode), and the keys are pressed on the editor as typed -- vim's normal
// mode commands, insert mode text, ;q (Esc), ;e (Return), a ctrl key -- with
// the mode following. A read-only viewer is not listed.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const C = (s) => JSON.stringify(s);
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'lk');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'hello world\nsecond\n');

const f = await openPage(PAGES + 'panels/skins/frame.html');
await f.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await f.eval(`document.getElementById('line').focus(); true`);
  await f.send('Input.insertText', { text });
  await f.key('Enter', 'Enter', '\r');
  await wait(400);
}
await line('skin main 1');
await line('skin add code_editor');
await f.waitFor(`window.frameSkin.frameAt('11')`, 10000);
await line('skin focus 1 1');
await line(':e lk/a.txt');
await line('skin add input_target');
await line('skin add input_leadkey');
const CV = `(() => { const c = window.frameSkin.frameAt('11').contentDocument.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;
await f.waitFor(`${CV} && ${CV}.state.doc.toString().startsWith('hello')`, 15000);
const W = (n) => `[...document.querySelectorAll('iframe')].find((i) => /${n}\\.html/.test(i.src)).contentWindow`;
const IT = W('input_target');
const IL = W('input_leadkey');
const rowsOf = () => f.eval(`${IT}.document.getElementById('list').textContent`);
await f.waitFor(`/code_editor 1 1/.test(${IT}.document.getElementById('list').textContent)`, 10000);
check(/c\s*code_editor 1 1\s*open|c\s*code_editor 1 1/.test(await rowsOf()), 'input_target lists the code_editor (c): ' + C(await rowsOf()));
await f.waitFor(`/a\\.txt\\s+NORMAL/.test(${IT}.document.getElementById('list').textContent)`, 8000);
check(/a\.txt\s+NORMAL/.test(await rowsOf()), '...with its file and vim\'s mode');

await f.eval(`(() => { const w = ${IT}; w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'c' })); return true; })()`);
await wait(200);
check(/code_editor 1 1/.test(await f.eval(`${IT}.document.getElementById('head').textContent`)), 'c chooses it');

const noteText = () => f.eval(`${IL}.document.getElementById('note').textContent`);
const text = () => f.eval(`${CV}.state.doc.toString()`);
async function send(s) {
  await f.eval(`(() => { const el = ${IL}.document.getElementById('form'); el.focus(); el.value = ''; el.dispatchEvent(new Event('click')); return true; })()`);
  for (const ch of s) await f.key(ch, '', ch);
  await f.key('Enter', 'Enter', '\r');
  await wait(400);
}

await send('wdw');
check(await text() === 'hello \nsecond\n', 'normal mode: w dw deletes "world": ' + C(await text()));
check(/→ code_editor 1 1/.test(await noteText()), 'the answer is shown: ' + C(await noteText()));

await send('0ihey ');
await f.waitFor(`/INSERT/.test(${IT}.document.getElementById('list').textContent)`, 4000);
check(await text() === 'hey hello \nsecond\n', 'i then text: typed into the line: ' + C(await text()));
check(/INSERT/.test(await rowsOf()), 'the mode follows: INSERT');

await send('there;eok;q');
await f.waitFor(`/NORMAL/.test(${IT}.document.getElementById('list').textContent)`, 4000);
check(await text() === 'hey there\nokhello \nsecond\n', ';e is a newline in insert mode, ;q (Esc) back to normal: ' + C(await text()));
check(/NORMAL/.test(await rowsOf()), '...NORMAL again');

await send('u');
check(await text() === 'hey therehello \nsecond\n', 'u undoes the last of the insert (CodeMirror\'s history splits it at the newline, as typing does): ' + C(await text()));
await send(';cr');
check(await text() === 'hey there\nokhello \nsecond\n', 'a ctrl key: C-r redoes: ' + C(await text()));

done();
