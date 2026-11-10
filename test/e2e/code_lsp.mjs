// test/e2e/code_lsp.mjs -- the language server's commands in code_editor
// and the grep:LspDef to another file (a new code_editor
// at the definition) and in the same file, :LspRename in one file and one
// reaching another file (applied in the code_editor showing it, unsaved; refused
// whole over unsaved edits there), :LspRefs in a list whose Enter
// goes to the code_editor that has the file, :LspFormat; the tree skin's
// `:grep` into a list, Enter opens the match. Works in $E2E_DIR/fsroot/ls;
// uses typescript-language-server and ripgrep.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'ls');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const A = "import { helper } from './b.js';\nconst value = helper(1);\nconsole.log(value, helper(2));\n";
fs.writeFileSync(path.join(dir, 'a.js'), A);
fs.writeFileSync(path.join(dir, 'b.js'), 'export function helper(x) {\n  return x + 1;\n}\n');
fs.writeFileSync(path.join(dir, 'c.js'), 'let   x=1\nfunction f( a ){return a}\n');
fs.writeFileSync(path.join(dir, 'd.js'), 'const d = 1;\n');
fs.writeFileSync(path.join(dir, 'e.js'), 'const slow = 1;\nconsole.log(slow);\n');

const VIEW = `(() => { const c = document.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const docOf = (pg) => pg.eval(`${VIEW}.state.doc.toString()`);
const msgOf = (pg) => pg.eval(`document.getElementById('msg').textContent`);
const cursorOf = (pg) => pg.eval(`(() => { const v = ${VIEW}; const h = v.state.selection.main.head; const l = v.state.doc.lineAt(h); return [l.number, h - l.from + 1]; })()`);
// the cursor on the n-th (0-based) occurrence of `word`
const putCursor = (pg, word, n = 0) => pg.eval(`(() => { const v = ${VIEW}; const t = v.state.doc.toString(); let i = -1; for (let k = 0; k <= ${n}; k++) i = t.indexOf(${JSON.stringify(word)}, i + 1); v.dispatch({ selection: { anchor: i + 1 } }); return i; })()`);
async function openVi(rel) {
  const pg = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent(rel));
  await pg.waitFor(`document.getElementById('path').textContent === ${JSON.stringify(rel)} && /lsp javascript/.test(document.getElementById('msg').textContent)`, 25000);
  await wait(800);
  return pg;
}
// an ex command typed in code_editor (real key events: window.open is allowed)
async function ex(pg, line, expect, ms = 15000) {
  await pg.eval(`document.querySelector('.cm-content').focus(); true`);
  await pg.key('Escape', 'Escape', '');
  await pg.eval(`document.getElementById('msg').textContent = ''; true`);
  await pg.key(':', 'Semicolon', ':', 8);
  await wait(100);
  await pg.send('Input.insertText', { text: line });
  await pg.key('Enter', 'Enter', '\r');
  if (expect) await pg.waitFor(`${expect.toString()}.test(document.getElementById('msg').textContent)`, ms);
  return msgOf(pg);
}

console.log('code_editor + language server');
const a = await openVi('ls/a.js');

// :LspDef in the same file: the use of `value` on line 3 -> its const on line 2
await putCursor(a, 'value', 1);
await ex(a, 'LspDef', /to the definition/);
check(JSON.stringify(await cursorOf(a)) === '[2,7]', ':LspDef on a use goes to the definition in the same file (2:7)');

// :LspDef to another file: a new code_editor at helper's definition in b.js
await putCursor(a, 'helper', 1);
await ex(a, 'LspDef', /to the definition/);
const b = await attachTo('code_editor.html?path=ls%2Fb.js');
await b.waitFor(`(() => { const v = ${VIEW}; return v.state.doc.lineAt(v.state.selection.main.head).number === 1 && v.state.selection.main.head > 0; })()`, 15000);
check(JSON.stringify(await cursorOf(b)) === '[1,17]', ':LspDef on helper opens b.js in a new code_editor at the definition (1:17)');

// :LspRefs -> a list; Enter on b.js's goes to the code_editor showing it
await putCursor(a, 'helper', 2);
await ex(a, 'LspRefs', /\d+ reference\(s\)/);
const L = await attachTo('config=locations&from=');
await L.waitFor(`document.querySelectorAll('#list li').length >= 4`, 10000);
const lt = await L.eval(`document.getElementById('list').innerText`);
check(/ls\/a\.js:1:/.test(lt) && /ls\/a\.js:2:/.test(lt) && /ls\/a\.js:3:/.test(lt) && /ls\/b\.js:1:17/.test(lt), ':LspRefs lists the uses in a.js and the definition in b.js');
await b.eval(`(() => { const v = ${VIEW}; v.dispatch({ selection: { anchor: v.state.doc.length } }); return true; })()`);
await L.eval(`(() => { const items = [...document.querySelectorAll('#list li')]; items.find((li) => /ls\\/b\\.js:1:17/.test(li.innerText)).click(); return true; })()`);
await b.waitFor(`(() => { const v = ${VIEW}; return v.state.doc.lineAt(v.state.selection.main.head).number === 1; })()`, 8000);
check(JSON.stringify(await cursorOf(b)) === '[1,17]', '...Enter on ls/b.js:1:17 puts the cursor of the code_editor showing b.js there');

// :LspRename of the exported helper, from b.js: it reaches a.js.
// a.js open with unsaved edits: refused whole, nothing changed anywhere
await putCursor(b, 'helper', 0);
const beforeB = await docOf(b);
await a.eval(`(() => { const v = ${VIEW}; v.dispatch({ changes: { from: v.state.doc.length, insert: '// mine\\n' } }); return true; })()`);
const dirtyA = await docOf(a);
check(/ls\/a\.js: unsaved edits.*Nothing was changed/.test(await ex(b, 'LspRename helper2', /reaches other files|renamed: |!/)), ':LspRename reaching a.js while a.js has unsaved edits is refused whole, naming a.js');
check((await docOf(a)) === dirtyA && (await docOf(b)) === beforeB, '...nothing changed in a.js nor b.js');
await ex(a, 'e!', /opened/);
check((await docOf(a)) === A, '(a.js read again: clean)');
// a.js clean: the edits go to the code_editor showing a.js, unsaved; the disk untouched
await putCursor(b, 'helper', 0);
check(/renamed: helper2 \(1 place\(s\) in this file, 3 in 1 other file\(s\)/.test(await ex(b, 'LspRename helper2', /renamed: |!/)), ':LspRename helper2 from b.js renames there and in the code_editor showing a.js (3 places)');
const renamedA = await docOf(a);
check(!/helper\(/.test(renamedA) && /helper2\(1\)/.test(renamedA) && /helper2\(2\)/.test(renamedA) && /function helper2/.test(await docOf(b)), '...a.js calls helper2, b.js defines helper2');
check(/a rename was applied \(3 place/.test(await msgOf(a)), '...a.js\'s code_editor says the edits came from another code_editor');
check(fs.readFileSync(path.join(dir, 'a.js'), 'utf8') === A && /function helper\(/.test(fs.readFileSync(path.join(dir, 'b.js'), 'utf8')), '...unsaved: the disk is as it was');
// back to the disk for what follows
await ex(a, 'e!', /opened/);
await ex(b, 'e!', /opened/);

// :LspRename in one file
await putCursor(a, 'value', 0);
check(/renamed: total \(2 place/.test(await ex(a, 'LspRename total', /renamed: |!/)), ':LspRename total renames value in this file (2 places)');
check((await docOf(a)) === A.replace(/value/g, 'total'), '...the text has total for value');

// :LspFormat
const c = await openVi('ls/c.js');
check(/formatted /.test(await ex(c, 'LspFormat', /format/)), ':LspFormat formats the file');
check(/let x = 1/.test(await docOf(c)) && /function f\(a\)/.test(await docOf(c)), '...as the server does (let x = 1, function f(a))');

// :e another file in the same code_editor: its text must not reach the server as a
// change of the file it leaves -- the old connection goes
// first, the new file is opened on a new one
await c.eval(`(() => { window.__sent = []; const o = WebSocket.prototype.send; WebSocket.prototype.send = function (m) { try { window.__sent.push(JSON.parse(m)); } catch (_) {} return o.call(this, m); }; return true; })()`);
await ex(c, 'e! ls/d.js', /opened ls\/d\.js/);
await c.waitFor(`/lsp javascript/.test(document.getElementById('msg').textContent) || window.__sent.some((m) => m.method === 'textDocument/didOpen')`, 15000);
await wait(500);
// (a didChange of c.js with c.js's own text -- the format just made, sent while the
// code_editor asks who has d.js open -- is as it should be: what must never go is d.js's text)
const dText = await docOf(c);
const sent = await c.eval(`JSON.stringify(window.__sent.map((m) => [m.method || m.kind, (m.params && m.params.textDocument && m.params.textDocument.uri) || m.path || '', JSON.stringify((m.params && m.params.contentChanges) || '')]))`);
check(dText.length > 0 && !JSON.parse(sent).some(([m, u, ch]) => m === 'textDocument/didChange' && /c\.js$/.test(u) && ch.includes(JSON.stringify(dText.split('\n')[0]).slice(1, -1))), ':e ls/d.js sends no didChange of c.js (d.js\'s text under the old URI)' + ' ' + sent);
check(JSON.parse(sent).some(([m, u]) => m === 'textDocument/didOpen' && /d\.js$/.test(u)), '...and opens d.js on the new connection');

// -- :grep in the tree skin ------------------------------------------------------
const S = await openPage(PAGES + 'panels/skins/tree.html');
const F = (part) => `[...document.querySelectorAll('iframe')].find(f => (f.src||'').includes(${JSON.stringify(part)}))`;
const sview = (part) => `(() => { const c = ${F(part)}.contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
await S.waitFor(`${F('code_cmd_in')} && ${F('code_cmd_in')}.contentDocument.querySelector('.cm-content')`, 20000);
await wait(800);
await S.eval(`${F('code_cmd_in')}.contentWindow.focus(); ${sview('code_cmd_in')}.focus(); true`);
await S.send('Input.insertText', { text: ':grep "return x" ls' });
await S.key('Enter', 'Enter', '\r', 2);
const G = await attachTo('config=locations&grep=');
await G.waitFor(`document.querySelectorAll('#list li').length >= 1`, 10000);
check(/ls\/b\.js:2:3/.test(await G.eval(`document.getElementById('list').innerText`)) && /1 match/.test(await G.eval(`document.getElementById('foot').textContent`)),
  ':grep "return x" ls in the tree skin lists ls/b.js:2:3 (1 match)');
await G.eval(`document.querySelector('#list li').click(); true`);
await b.waitFor(`(() => { const v = ${VIEW}; return v.state.doc.lineAt(v.state.selection.main.head).number === 2; })()`, 8000);
check(JSON.stringify(await cursorOf(b)) === '[2,3]', '...Enter goes to b.js:2:3 in the code_editor that has it');

// -- a request that runs out of time is asked again with a longer wait --
const e = await openVi('ls/e.js');
const configure = (pg, lsp) => pg.eval(`Tezcatl.bus.post('code.configure', { lsp: ${JSON.stringify(lsp)} }, { echo: true }); true`);
await e.eval(`window.__msgs = []; new MutationObserver(() => window.__msgs.push(document.getElementById('msg').textContent)).observe(document.getElementById('msg'), { childList: true, characterData: true, subtree: true }); true`);
// a slow server: every definition request leaves this page 300ms late
await e.eval(`(() => { const send = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { if (typeof d === 'string' && d.includes('"textDocument/definition"')) { setTimeout(() => send.call(this, d), 300); return; } return send.call(this, d); }; return true; })()`);
// 50ms is not enough: the wait doubles (100, 200, 400) until the answer fits
await configure(e, { timeoutMs: 50, maxTimeoutMs: 8000 });
await putCursor(e, 'slow', 1);
await ex(e, 'LspDef', /to the definition/);
const said = JSON.parse(await e.eval(`JSON.stringify(window.__msgs)`));
check(said.some((m) => /no answer in .* s; asking again and waiting up to/.test(m)), ':LspDef past its wait says it asks again with a longer one');
check(JSON.stringify(await cursorOf(e)) === '[1,7]', '...and the answer comes: the definition (1:7)');
// the wait already at its limit: said so, with where the limit is set
await configure(e, { timeoutMs: 50, maxTimeoutMs: 50 });
await putCursor(e, 'slow', 1);
const gaveUp = await ex(e, 'LspDef', /no answer after /);
check(/lsp\.maxTimeoutMs/.test(gaveUp), ':LspDef at the limit of the wait gives up and names lsp.maxTimeoutMs: ' + gaveUp);
await configure(e, { timeoutMs: 3000, maxTimeoutMs: 60000 });
await putCursor(e, 'slow', 1);
await ex(e, 'LspDef', /to the definition/);
check(JSON.stringify(await cursorOf(e)) === '[1,7]', '...and with the wait set back, it answers at once');

const errs = [a, b, c, e, L, S, G].flatMap((pg) => pg.logs.filter((l) => /exception/.test(l)));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
for (const pg of [a, b, c, e, L, S, G]) await pg.close();
done();
