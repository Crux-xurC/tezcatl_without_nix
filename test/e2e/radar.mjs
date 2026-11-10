// test/e2e/radar.mjs -- the table's coordinate, `radar` and "@":
// the table says where its selection is (row ids, column keys, the type of
// its rows -- no value) to the cursor panel each time it moves; `radar` in the
// command line of the synthesis matrix_set makes it the last reference; "@" alone in a line
// of the dialogue window (another window) is replaced by it before the line
// is sent; the frame's `radar` puts it on its receiving side, where "@" and
// `go on` take it. A key the table does not know does nothing.
// The table: the real xipe_totec copy (root "."); the dialogue window: the fake server.
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const F = (part) => `[...document.querySelectorAll('iframe')].find(f => (f.src||'').includes(${JSON.stringify(part)}))`;
const doc = (part) => `${F(part)}.contentDocument`;
const S = `${F('matrix_bar.html')}.contentDocument.getElementById('status')`;

const m = await openPage(PAGES + 'panels/skins/frame.html?synthesis=matrix_set');
const MX = 'panels/resident/matrix.html';
const status = () => m.eval(`${S}.textContent`);
const cmd = async (line) => {
  await m.eval(`${S}.textContent = ''; ${F('code_cmd_in')}.contentWindow.focus(); ${doc('code_cmd_in')}.querySelector('.cm-content').focus(); true`);
  await m.send('Input.insertText', { text: line });
  await m.key('Enter', 'Enter', '\r', 2);
  await m.waitFor(`${S}.textContent !== ''`, 8000);
  return status();
};
const toTable = () => m.eval(`${F(MX)}.contentWindow.focus(); ${doc(MX)}.getElementById('grid-wrap').focus(); true`);
const tkey = async (k, code) => { await toTable(); await m.key(k, code, k); await wait(120); };

console.log('radar');
await m.waitFor(`${F(MX)} && ${doc(MX)}.querySelectorAll('table.mx-grid tbody tr').length > 1`, 60000);
const rows = (await m.eval(`${F(MX)}.contentWindow.Tezcatl.xipeClient.request(${F(MX)}.contentWindow.Tezcatl.config, '.', 'row/list', {})`)).rows;
check(rows.length > 1, 'the calc rows of the copy: ' + rows.length);

// the whole first row (the cursor starts on the gutter)
let r = await cmd('radar');
check(r === 'radar ── xipe_rows:all  calc_row  @' + rows[0].id, 'radar: the row the cursor is on, as the table\'s path, the type and the id: ' + r);
// down one, into the first column
await tkey('j', 'KeyJ');
await tkey('l', 'KeyL');
r = await cmd('radar');
check(r === 'radar ── xipe_rows:all  calc_row  [sentence]  @' + rows[1].id, '...after j l: the second row, the column key (no value): ' + r);
check(!r.includes('→'), '...the line carries no cell value');
// a key the table does not know
await m.eval(`window.__seen = []; Tezcatl.bus.on('matrix.action', (p) => window.__seen.push(p)); true`);
await tkey('e', 'KeyE');
check((await m.eval(`window.__seen.length`)) === 0, 'a key the table does not know does nothing (no matrix.action)');
// two rows selected
await tkey('v', 'KeyV');
await tkey('j', 'KeyJ');
r = await cmd('radar');
check(r === 'radar ── xipe_rows:all  calc_row ×2  [sentence]  @' + rows[1].id + ' ' + rows[2].id, '...v j: two rows, their ids in order: ' + r);

// the dialogue window (another window): "@" alone takes the last reference
const x = await openPage(PAGES + 'panels/skins/xipe.html?root=fake');
const outText = `(${F('code_xipe_out')}?.contentDocument.querySelector('.cm-content')||{innerText:''}).innerText`;
const sendLine = async (t) => {
  await x.eval(`${F('code_xipe_in')}.contentWindow.focus(); ${F('code_xipe_in')}.contentDocument.querySelector('.cm-content').focus(); true`);
  await x.send('Input.insertText', { text: t });
  await x.key('Enter', 'Enter', '\r', 2);
};
await x.waitFor(`/connected: project/.test(${outText})`, 60000);
await sendLine('eval @');
const want = '> eval ' + rows[1].id + ' ' + rows[2].id;
check(!!(await x.waitFor(`${outText}.includes(${JSON.stringify(want)})`, 8000)), 'the dialogue window: "eval @" is sent as "' + want.slice(2) + '"');
await x.eval(`(() => { const c = ${F('code_xipe_in')}.contentDocument.querySelector('.cm-content'); const v = (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '' } }); return true; })()`);
await sendLine('do row/add node=@attr');
check(!!(await x.waitFor(`${outText}.includes('> do row/add node=@attr')`, 8000)), '...an "@" inside a word is left as it is');

// the frame: radar on its receiving side; "@" and go on take it
const f = await openPage(PAGES + 'panels/skins/frame.html');
await f.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (n = 2) => f.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
const line = async (text, ms = 500) => {
  await f.eval(`document.getElementById('line').focus(); true`);
  await f.send('Input.insertText', { text });
  await f.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
};
check(/^! @ ── no line with a reference/m.test(await line('skin focus @')), 'the frame: "@" with no reference yet says so (the line is not run)');
r = await line('radar');
check(r.endsWith('radar ── xipe_rows:all  calc_row ×2  [sentence] @' + rows[1].id + ' ' + rows[2].id), 'the frame\'s radar: the table of the other window, on the receiving side with the reference: ' + r.split('\n').pop());
r = await line('skin focus @');
check(r.startsWith('> skin focus ' + rows[1].id + ' ' + rows[2].id), '"@" alone in the frame\'s line is replaced by it (the line shown is the one run)');
check(/go on ── xipe_rows:all \(another window/.test(await line('go on')), 'go on to a coordinate of another window: asks that panel to take the focus, and says so');

await m.close(); await x.close();
done();
