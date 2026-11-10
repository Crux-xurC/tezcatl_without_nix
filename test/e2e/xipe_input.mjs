// test/e2e/xipe_input.mjs -- the Xipe dialogue window against the real Xipe
// Totec copy (root "."): its `input` method. The
// window sends each line as `input {text}` and shows dialogue.text as-is;
// what a line means is Xipe Totec's. Covers: `help` as one
// "command: note" line each, storing yanked help lines in the dictionary
// and completing from them, a command list, an evaluation (the
// reply waits for the pass), and a CLI-only command being refused.
//
// Headless stand-ins as in xipe_skin.mjs (the `copy` event for Ctrl+C).
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await openPage(PAGES + 'panels/skins/xipe.html?root=.&dict=xipe-real');
const F = (part) => `[...document.querySelectorAll('iframe')].find(f => (f.src||'').includes(${JSON.stringify(part)}))`;
const outText = `(${F('code_xipe_out')}?.contentDocument.querySelector('.cm-content')||{innerText:''}).innerText`;
const view = (part) => `(() => { const c = ${F(part)}.contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const focusIn = () => p.eval(`${F('code_xipe_in')}.contentWindow.focus(); ${F('code_xipe_in')}.contentDocument.querySelector('.cm-content').focus(); true`);
const sendLine = async (t) => { await focusIn(); await p.send('Input.insertText', { text: t }); await p.key('Enter', 'Enter', '\r', 2); };
const clearIn = () => p.eval(`(() => { const v = ${view('code_xipe_in')}; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '' } }); return true; })()`);
const dictList = () => p.eval(`${F('config=dict')}.contentDocument.getElementById('list').innerText`);
// what arrived after the last "> <line>" echo
const after = (line) => p.eval(`(() => { const t = ${outText}; const i = t.lastIndexOf(${JSON.stringify('> ' + line)}); return i < 0 ? '' : t.slice(i); })()`);

console.log('xipe input, root=.');
check(!!(await p.waitFor(`/connected: project/.test(${outText})`, 60000)), 'connects to the Xipe Totec copy');

// -- help: one "command: note" line each ----------------------------------
await sendLine('help');
await p.waitFor(`/row\\/update: /.test(${outText})`, 15000);
const help = await after('help');
check(/\nrow\/add: make a calc row  node=<node id> args=\[\.\.\.\]\n/.test(help), 'help lists row/add as "row/add: make a calc row  node=<node id> args=[...]"');
check(/\nscan: /.test(help) && /\neval: /.test(help), 'help lists the CLI commands the window runs (scan, eval)');
check(!/choice project:/.test(help) && !/\nstart:/.test(help), 'help leaves out the commands that need a terminal');

// -- yank every help line, p in the dict pane ------------------------------
await p.eval(`(() => { const v = ${view('code_xipe_out')}; const d = v.state.doc; let a = -1, b = -1;
  for (let i = 1; i <= d.lines; i++) { const t = d.line(i).text; if (t.startsWith('help:')) a = d.line(i).from; if (t.startsWith('scan/run:')) b = d.line(i).to; }
  v.dispatch({ selection: { anchor: a, head: b } }); v.contentDOM.dispatchEvent(new Event('copy', { bubbles: true })); return true; })()`);
await wait(500);
await p.eval(`${F('config=dict')}.contentWindow.focus(); ${F('config=dict')}.contentDocument.getElementById('filter').focus(); true`);
await p.key('p', 'KeyP', 'p');
check(!!(await p.waitFor(`/row\\/update/.test(${F('config=dict')}.contentDocument.getElementById('list').innerText)`, 8000)),
  'p stores the yanked help lines in the dictionary');
const words = await dictList();
check(/row\/add/.test(words) && /make a calc row/.test(words), 'a stored entry is the command, with its note');

// -- completion from those words --------------------------------------------
await wait(1500);
await focusIn();
await p.send('Input.insertText', { text: 'row/li' });
const pop = await p.waitFor(`${F('code_xipe_in')}.contentDocument.querySelector('.cm-tooltip-autocomplete')?.innerText`, 5000);
check(!!pop && /row\/list/.test(pop), 'typing "row/li" offers row/list');
await p.key('Enter', 'Enter', '\r');
await wait(300);
check((await p.eval(`${view('code_xipe_in')}.state.doc.toString()`)) === 'row/list', 'Enter accepts it');
await clearIn();

// -- commands ------------------------------------------------------------------
await sendLine('show');
check(!!(await p.waitFor(`/Calc\\.add\\/2/.test(${outText})`, 15000)), 'show prints the book (Calc.add/2)');

await sendLine('node/resolve module=Calc name=square arity=1 -- row/list');
await p.waitFor(`/xipe: 2 command\\(s\\)/.test(${outText})`, 15000);
check(/xipe: 2 command\(s\), 2 ok/.test(await after('node/resolve')), 'a command list answers with the CLI lines ("xipe: 2 command(s), 2 ok")');

await sendLine('scan -- row/list');
await p.waitFor(`(() => { const t = ${outText}; const i = t.lastIndexOf('> scan -- row/list'); return i >= 0 && /xipe: 2 command\\(s\\)/.test(t.slice(i)); })()`, 60000);
check(/xipe: 2 command\(s\), 2 ok/.test(await after('scan -- row/list')), 'the window\'s scan is a step of a -- list too ("scan -- row/list")');

await sendLine('eval');
check(!!(await p.waitFor(`/eval call [^\\n]*ok +repr=exact +3/.test(${outText})`, 60000)), 'eval waits for the pass and shows each row (add(1,2) = 3)');
check(/notify\/passCompleted/.test(await p.eval(outText)), 'the pass notifications reach the transcript too');

// -- search (a dialogue held across lines) ---------------------------------------
await sendLine('search -e name square');
await p.waitFor(`/hit\\(s\\)/.test(${outText})`, 15000);
check(/1 hit\(s\)\. \(id: \[/.test(await after('search -e name square')), 'search: the first turn finds Calc.square\'s row');
await sendLine('get id');
await p.waitFor(`/took the id of element/.test(${outText})`, 15000);
await sendLine('eval x');
check(!!(await p.waitFor(`(() => { const t = ${outText}; const i = t.lastIndexOf('> eval x'); return i >= 0 && /eval call [^\\n]*ok +repr=exact +9/.test(t.slice(i)); })()`, 60000)),
  'inside the search, "eval x" evaluates the kept row (square(⟦add⟧) = 9)');
await sendLine('quit dialogue');
await p.waitFor(`/The dialogue has ended/.test(${outText})`, 15000);
check(/The dialogue has ended/.test(await after('quit dialogue')), 'quit dialogue ends the search');

await sendLine('choice project /tmp');
await p.waitFor(`/a terminal command, run as xipe choice project/.test(${outText})`, 15000);
check(/! input_error: /.test(await after('choice project')), 'a command that needs a terminal is refused, saying so');

const errs = p.logs.filter((l) => /exception|console.error/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
