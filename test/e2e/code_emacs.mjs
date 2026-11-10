// test/e2e/code_emacs.mjs -- a code_editor whose keymap is not vim (D-code-editor):
// the frame's code_editor switched to emacs at run time (code.configure keymap)
// says it takes no ":" lines (code.input-line-ex), so the input line refuses
// `:w` / `:2` / `:Diff` without sending them; code.json's emacs keys name
// tezcatl commands (C-M-e / C-M-a: code.def-next / -prev, by the syntax tree)
// above codemirror-emacs' own (M-x: code.to-input, to the input line); inputLineEx
// true lets ":" lines through again; back to vim, they are taken as before. No language server is needed.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
// a directory of this run's own: a page left open by an earlier run may hold the file
const SUB = 'em' + Date.now().toString(36);
const dir = path.join(E2E, 'fsroot', SUB);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const SRC = 'function one() {\n  return 1;\n}\n\nfunction two() {\n  return 2;\n}\n';
fs.writeFileSync(path.join(dir, 'a.txt.js'), SRC);
const disk = () => fs.readFileSync(path.join(dir, 'a.txt.js'), 'utf8');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (n = 2) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 500) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const W = `window.frameSkin.frameAt('11').contentWindow`;
const VIEW = `(() => { const c = ${W}.document.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const lineNo = () => p.eval(`(() => { const v = ${VIEW}; return v.state.doc.lineAt(v.state.selection.main.head).number; })()`);
const at = (ln) => p.eval(`(() => { const v = ${VIEW}; v.dispatch({ selection: { anchor: v.state.doc.line(${ln}).from } }); ${W}.focus(); v.focus(); return true; })()`);
// CDP modifiers: Alt 1, Ctrl 2
const press = async (key, code, mod) => { await p.key(key, code, '', mod); await wait(300); };

console.log('code_editor with the emacs keymap');
await line(':find ' + SUB + '/a.txt.js');
await p.waitFor(`window.frameSkin.frameAt('11') && ${W}.document.getElementById('path').textContent === ${JSON.stringify(SUB + '/a.txt.js')}`, 15000);
await wait(500);
const codeId = await p.eval(`${W}.Tezcatl.bus.whoami().id`);
const configure = (payload) => p.eval(`(() => { const c = new BroadcastChannel('tezcatl'); c.postMessage({ v: 1, type: 'code.configure', from: { id: 'e2e' }, to: ${JSON.stringify(codeId)}, payload: ${JSON.stringify(payload)}, ts: Date.now() }); c.close(); return true; })()`);

// vim (editorKeymap's default): ":" lines are taken
await line(':2');
check((await lineNo()) === 2, 'vim: the input line\'s :2 moves the code_editor');

await configure({ keymap: 'emacs' });
await wait(800);
check(!(await p.eval(`!!${W}.document.querySelector('.cm-vim-panel')`)), 'code.configure keymap emacs: vim is gone');

// ":" lines refused, nothing sent
await p.eval(`(() => { const v = ${VIEW}; v.dispatch({ changes: { from: 0, insert: '// edited\\n' } }); return true; })()`);
check(/takes no ":" lines \(inputLineEx/.test(await line(':w')), 'emacs: the input line refuses :w');
await wait(500);
check(disk() === SRC, '...and nothing was saved');
check(/takes no ":" lines/.test(await line(':5')), 'emacs: :5 refused too');
check(/takes no ":" lines/.test(await line(':Diff')), 'emacs: the frame\'s :Diff refused too');
check(/code\.write/.test(await p.eval(`Tezcatl.commands.list().map(c => c.name).join(' ')`)), 'the code.* commands are still there (only the ":" spelling is off)');

// code.json's emacs keys: C-M-e / C-M-a (def-next / def-prev, the syntax tree)
await at(2);
await press('e', 'KeyE', 3);
check((await lineNo()) === 6, 'C-M-e: code.def-next (to two, line 6 after the edit) -- line ' + (await lineNo()));
await press('a', 'KeyA', 3);
check((await lineNo()) === 2, 'C-M-a: code.def-prev (back to one, line 2) -- line ' + (await lineNo()));
// (codemirror-emacs' own keys -- C-e, C-f ... -- do not answer CDP's synthetic keys, before
// D-code-editor too, so they are not checked here: docs/issues.md)
// M-x: code.to-input -- the frame's input line has the focus
await press('x', 'KeyX', 1);
await wait(400);
check((await p.eval(`document.activeElement && document.activeElement.id`)) === 'line', 'M-x: code.to-input, the frame\'s input line focused (not codemirror-emacs\' M-x)');

// inputLineEx true: ":" lines go through again
await configure({ inputLineEx: true });
await wait(500);
await line(':w', 1200);
check(disk() === '// edited\n' + SRC, 'inputLineEx true: :w from the input line saves');

// back to vim, inputLineEx left to the keymap
await configure({ keymap: 'vim', inputLineEx: null });
await wait(800);
await line(':3');
check((await lineNo()) === 3, 'back to vim: :3 is taken again');

const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
done();
