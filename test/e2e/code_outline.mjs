// test/e2e/code_outline.mjs -- the outline panel (panels/resident/code_outline.html,
// in the frame: the definitions of the code_editor used last
// in the same skin -- read off the Lezer tree (Elixir, JS), or asked of the
// language server's documentSymbol where the grammar has no tree (OCaml,
// ocaml-lsp); the definition holding the cursor is marked, it follows the
// text as it is edited, and Enter puts that code_editor's cursor there.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'oln');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.ex'), 'defmodule Calc do\n  def add(a, b), do: a + b\n\n  defp sub(a, b) do\n    a - b\n  end\nend\n');
fs.writeFileSync(path.join(dir, 'b.js'), 'function top(a) { return a; }\nclass K {\n  m() { return 1; }\n}\n');
fs.writeFileSync(path.join(dir, 'c.ml'), 'let add a b = a + b\n\nmodule Inner = struct\n  let f x = x * 2\nend\n');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(300);
}
const view = (place) => `(() => { const f = window.frameSkin.frameAt('${place}'); const c = f && f.contentDocument.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;
const OL = `window.frameSkin.frameAt('21').contentWindow`;
const outline = () => p.eval(`JSON.stringify((${OL}.codeOutline ? ${OL}.codeOutline.items() : []).map((x) => [x.kind, x.name, x.line, x.depth]))`).then(JSON.parse);
const hereText = () => p.eval(`(() => { const h = ${OL}.document.querySelector('.cm-ol-here'); return h ? h.textContent : ''; })()`);
const HERE = `(() => { const h = ${OL}.document.querySelector('.cm-ol-here'); return h ? h.textContent : ''; })()`;
const setCursor = (place, ln) => p.eval(`(() => { const v = ${view(place)}; v.focus(); v.dispatch({ selection: { anchor: v.state.doc.line(${ln}).from + 2 } }); return true; })()`);

console.log('outline');
await line('skin main 2,1');
await line(':find oln/a.ex');
await p.waitFor(`${view('11')} && ${view('11')}.state.doc.toString().startsWith('defmodule')`, 15000);
await line('skin add 2 code_outline');
await p.waitFor(`window.frameSkin.frameAt('21') && ${OL}.codeOutline && ${OL}.codeOutline.items().length >= 3`, 15000);
check(JSON.stringify(await outline()) === JSON.stringify([['module', 'Calc', 1, 0], ['def', 'add', 2, 1], ['defp', 'sub', 4, 1]]),
  'Elixir (the Lezer tree): defmodule Calc > def add, defp sub: ' + JSON.stringify(await outline()));
check(/syntax tree/.test(await p.eval(`${OL}.document.getElementById('what').textContent`)), '...said to come from the syntax tree');

// the cursor in sub: it is marked
await setCursor('11', 5);
await p.waitFor(`/sub/.test(${HERE})`, 5000);
check(/defp\s*sub/.test(await hereText()), 'the cursor inside sub marks sub');

// an edit: a new def shows after the text rests
await p.eval(`(() => { const v = ${view('11')}; const at = v.state.doc.line(7).from; v.dispatch({ changes: { from: at, insert: '\\n  def mul(a, b), do: a * b\\n' } }); return true; })()`);
await p.waitFor(`${OL}.codeOutline.items().some((x) => x.name === 'mul')`, 5000);
check((await outline()).some((x) => x[1] === 'mul' && x[3] === 1), 'an edit (unsaved): def mul appears, inside Calc');

// the outline is a read-only CodeMirror (a code_editor derivative): its text, one definition a line
const olText = await p.eval(`${OL}.codeOutline.view().state.doc.toString()`);
check(/^module Calc  :1\n  def add  :2\n  defp sub  :4/.test(olText), 'the outline is text, one definition a line, indented: ' + JSON.stringify(olText));
// vim in it: G goes to the last line (the outline's own cursor), / searches
await line('skin focus 2 1');
await p.eval(`(() => { ${OL}.codeOutline.view().focus(); return true; })()`);
await p.key('G', 'KeyG', 'G', 8);
await wait(200);
const gLine = await p.eval(`${OL}.codeOutline.cursorLine()`);
check(gLine === (await outline()).length, 'vim works in it: G to the last definition: ' + gLine + ' / ' + (await outline()).length + ' ' + await p.eval(`(document.activeElement && document.activeElement.tagName) + ' ' + ${OL}.document.activeElement.className`));
await p.key('/', 'Slash', '/');
await wait(150);
await p.send('Input.insertText', { text: 'add' });
await p.key('Enter', 'Enter', '\r');
await wait(300);
check(await p.eval(`${OL}.codeOutline.cursorLine()`) === 2, '...and /add finds add (line 2)');
// Enter on add: the code_editor's cursor on line 2, focused
await p.key('Enter', 'Enter', '\r');
await p.waitFor(`(() => { const v = ${view('11')}; return v.state.doc.lineAt(v.state.selection.main.head).number === 2; })()`, 5000);
await wait(300);
check(JSON.parse(await p.eval(`JSON.stringify(window.frameSkin.state())`)).focus === '11', 'Enter on add puts the cursor on line 2 and focuses that code_editor');

// a second code_editor (JS): once its cursor moves, the outline is its
await line(':find oln/b.js');
await p.waitFor(`${view('12')} && ${view('12')}.state.doc.toString().startsWith('function')`, 15000);
await setCursor('12', 3);
await p.waitFor(`${OL}.codeOutline.items().some((x) => x.name === 'top')`, 8000);
check(JSON.stringify(await outline()) === JSON.stringify([['function', 'top', 1, 0], ['class', 'K', 2, 0], ['method', 'm', 3, 1]]),
  'the other code_editor used: its JS outline (function top, class K > m)');
await p.waitFor(`/method/.test(${HERE})`, 5000);
check(/method\s*m/.test(await hereText()), '...the cursor in m marks m: ' + JSON.stringify(await hereText()));
check(await p.eval(`${OL}.codeOutline.cursorLine()`) === (await p.eval(`${OL}.codeOutline.here()`)) + 1, "...and the outline's own cursor follows it there (the panel not focused)");

// OCaml: no tree in its legacy mode -> ocaml-lsp's documentSymbol
await line(':find oln/c.ml');
await p.waitFor(`${view('13')} && ${view('13')}.state.doc.toString().startsWith('let add')`, 15000);
await wait(500);
await setCursor('13', 4);
await p.waitFor(`${OL}.codeOutline.items().some((x) => x.name === 'Inner')`, 40000);
const ml = await outline();
console.log('  ocaml:', JSON.stringify(ml));
check(ml.some((x) => x[1] === 'add' && x[3] === 0) && ml.some((x) => x[1] === 'Inner') && ml.some((x) => x[1] === 'f' && x[3] === 1),
  'OCaml (the language server): add, module Inner > f');
check(/lsp/.test(await p.eval(`${OL}.document.getElementById('what').textContent`)), '...said to come from lsp');

const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
