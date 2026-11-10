// test/e2e/xipe_skin.mjs [root] -- the Xipe dialogue window + the generic
// dictionary, against the fake Xipe server (root
// "fake", default). With root "." (the real xipe_totec copy) only the first
// steps run (connect, a reply to `help`); xipe_input.mjs covers the real
// server's `input` in full.
//
// Headless stand-ins: a real Ctrl+C is replaced by the `copy` event it fires
// (CDP key events don't trigger the copy command).
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const root = process.argv[2] || 'fake';
const p = await openPage(PAGES + 'panels/skins/xipe.html?root=' + encodeURIComponent(root));
const F = (part) => `[...document.querySelectorAll('iframe')].find(f => (f.src||'').includes(${JSON.stringify(part)}))`;
const outText = `(${F('code_xipe_out')}?.contentDocument.querySelector('.cm-content')||{innerText:''}).innerText`;
const view = (part) => `(() => { const c = ${F(part)}.contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const focusIn = () => p.eval(`${F('code_xipe_in')}.contentWindow.focus(); ${F('code_xipe_in')}.contentDocument.querySelector('.cm-content').focus(); true`);
const sendLine = async (t) => { await focusIn(); await p.send('Input.insertText', { text: t }); await p.key('Enter', 'Enter', '\r', 2); };
const clearIn = () => p.eval(`(() => { const v = ${view('code_xipe_in')}; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '' } }); return true; })()`);
const dict = (expr) => p.eval(`${F('config=dict')}.contentDocument.${expr}`);

console.log(`xipe skin, root=${root}`);
check(!!(await p.waitFor(`/connected: project/.test(${outText})`, 60000)), 'connects (attach -> initialize) and says so in the transcript');

await sendLine('help');
await p.waitFor(`/> help\\n[^\\n]/.test(${outText})`, 15000);
const afterHelp = await p.eval(outText);
check(/> help/.test(afterHelp), 'the sent line is echoed as "> help"');

if (root !== 'fake') {
  check(/^! /m.test(afterHelp) || /calc row/.test(afterHelp), 'a reply (or an error line) is shown: ' + afterHelp.split('\n').filter(Boolean).pop());
  await p.close(); done();
}

check(/row\/add: make a calc row/.test(afterHelp), 'the reply dialogue.text is shown as-is');

// yank the four help lines and store them with `p` in the dict pane
await p.eval(`(() => { const v = ${view('code_xipe_out')}; const d = v.state.doc; let a = -1, b = -1;
  for (let i = 1; i <= d.lines; i++) { const t = d.line(i).text; if (t.startsWith('row/add:') && a < 0) a = d.line(i).from; if (t.startsWith('help:')) b = d.line(i).to; }
  v.dispatch({ selection: { anchor: a, head: b } }); v.contentDOM.dispatchEvent(new Event('copy', { bubbles: true })); return true; })()`);
await wait(500);
await p.eval(`${F('config=dict')}.contentWindow.focus(); ${F('config=dict')}.contentDocument.getElementById('filter').focus(); true`);
await p.key('p', 'KeyP', 'p');
check(!!(await p.waitFor(`/eval\\/run/.test(${F('config=dict')}.contentDocument.getElementById('list').innerText)`, 8000)),
  'p in the dict pane stores the yanked lines: ' + (await dict(`getElementById('foot').textContent`)));

// completion in the input
await wait(1500);
await focusIn();
await p.send('Input.insertText', { text: 'row/' });
const pop = await p.waitFor(`${F('code_xipe_in')}.contentDocument.querySelector('.cm-tooltip-autocomplete')?.innerText`, 5000);
check(!!pop && /row\/add/.test(pop) && /row\/list/.test(pop), 'typing "row/" offers row/add and row/list');
await p.key('Enter', 'Enter', '\r');
await wait(300);
check((await p.eval(`${view('code_xipe_in')}.state.doc.toString()`)) === 'row/add', 'Enter accepts the candidate');
await clearIn();

// Enter in the dict pane inserts the word into the input
await p.eval(`${F('config=dict')}.contentWindow.focus(); ${F('config=dict')}.contentDocument.getElementById('filter').focus(); true`);
await p.key('ArrowDown'); await p.key('ArrowDown');
await p.key('Enter', 'Enter', '\r');
await wait(500);
check((await p.eval(`${view('code_xipe_in')}.state.doc.toString()`)) === 'eval/run', 'Enter on a dict entry inserts it into the input');
await clearIn();

// a notify/* reaches the transcript
await sendLine('ping');
check(!!(await p.waitFor(`/notify\\/passCompleted/.test(${outText})`, 8000)), 'notify/* is shown in the transcript');

const errs = p.logs.filter((l) => /exception|console.error/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
