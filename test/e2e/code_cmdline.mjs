// test/e2e/code_cmdline.mjs -- Vim's ways through the input form
// (lib/skin/skin-ex.js): in the tree skin, code_editor's `:#` moves to the
// command line (with the rest typed in) and comes back after the line is
// sent; a ":" line there (`:e`, `:w`, `:Rename` ...) goes to code_editor; the
// code.* tezcatl-commands do the same from the palette. A code_editor on its own
// has no input form. Works in $E2E_DIR/fsroot/cl.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'cl');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'alpha\n');
const disk = (rel) => { try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch (_) { return null; } };

const p = await openPage(PAGES + 'panels/skins/tree.html');
const F = (part) => `[...document.querySelectorAll('iframe')].find(f => (f.src||'').includes(${JSON.stringify(part)}))`;
const doc = (part) => `${F(part)}.contentDocument`;
const viewOf = (part) => `(() => { const c = ${doc(part)}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const status = () => p.eval(`document.getElementById('status').textContent`);
const codeMsg = () => p.eval(`${doc('code_editor')}.getElementById('msg').textContent`);
const codeText = () => p.eval(`${viewOf('code_editor')}.state.doc.toString()`);
const codePath = () => p.eval(`${doc('code_editor')}.getElementById('path').textContent`);
const cmdText = () => p.eval(`${viewOf('code_cmd_in')}.state.doc.toString()`);
const focusedPane = () => p.eval(`(() => { const a = document.activeElement; return a && a.tagName === 'IFRAME' ? a.src : ''; })()`);
await p.waitFor(`${F('code_cmd_in')} && ${F('code_editor')} && ${doc('code_editor')}.querySelector('.cm-content') && ${doc('code_cmd_in')}.querySelector('.cm-content')`, 20000);
await wait(800);

// a line in the command line, sent with Mod-Enter
async function line(text) {
  await p.eval(`${F('code_cmd_in')}.contentWindow.focus(); ${viewOf('code_cmd_in')}.focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r', 2);
  await wait(300);
}
// an ex command typed in code_editor
async function ex(text) {
  await p.eval(`${F('code_editor')}.contentWindow.focus(); ${viewOf('code_editor')}.focus(); true`);
  await p.key('Escape', 'Escape', '');
  await p.key(':', 'Semicolon', ':', 8);
  await wait(100);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(300);
}

console.log('code_editor + input form');
// :e from the command line opens the file in code_editor
await line(':e cl/a.txt');
await p.waitFor(`${viewOf('code_editor')}.state.doc.toString() === 'alpha\\n'`, 8000);
check((await codePath()) === 'cl/a.txt', ':e cl/a.txt typed in the command line opens it in code_editor');
check(/^:e cl\/a\.txt ── to code_editor/.test(await status()), 'the bar says it went to code_editor');

// :# moves to the command line, and back after the line is sent
await ex('#');
await wait(300);
check((await focusedPane()).includes('code_cmd_in'), ':# in code_editor focuses the command line');
check(/^$/.test(await codeMsg()) || !/there is no input form next to this/.test(await codeMsg()), 'no "no input form" message inside the skin');
await p.send('Input.insertText', { text: ':w' });
await p.key('Enter', 'Enter', '\r', 2);
await wait(500);
check((await focusedPane()).includes('code_editor'), 'after the line is sent, focus goes back to code_editor');

// :# with text: it is typed in, the cursor at its end
await ex('# :Rename b.txt');
await wait(300);
check((await cmdText()) === ':Rename b.txt' && (await focusedPane()).includes('code_cmd_in'), ':# :Rename b.txt puts ":Rename b.txt" in the command line');
check(await p.eval(`${viewOf('code_cmd_in')}.state.selection.main.head === ${viewOf('code_cmd_in')}.state.doc.length && ${doc('code_cmd_in')}.activeElement.classList.contains('cm-content')`), '...with the cursor at its end, in the input form\'s editor');
await p.key('Enter', 'Enter', '\r', 2);
await p.waitFor(`${doc('code_editor')}.getElementById('path').textContent === 'cl/b.txt'`, 8000);
check(disk('b.txt') === 'alpha\n' && disk('a.txt') === null, 'sending it renames the file (code_editor follows)');
check((await focusedPane()).includes('code_editor') && await p.eval(`${doc('code_editor')}.activeElement.classList.contains('cm-content')`), '...and focus is back in code_editor, in its editor');

// :w from the command line, with the disk check
await p.eval(`(() => { const v = ${viewOf('code_editor')}; v.dispatch({ changes: { from: v.state.doc.length, insert: 'more\\n' } }); return true; })()`);
fs.writeFileSync(path.join(dir, 'b.txt'), 'theirs\n');
await line(':w');
await p.waitFor(`/the file on disk changed/.test(${doc('code_editor')}.getElementById('msg').textContent)`, 8000);
check(disk('b.txt') === 'theirs\n', ':w from the command line is stopped when the disk changed (the message in code_editor)');
await line(':w!');
await p.waitFor(`/^saved/.test(${doc('code_editor')}.getElementById('msg').textContent)`, 8000);
check(disk('b.txt') === 'alpha\nmore\n', ':w! from the command line writes');

// the code.* tezcatl-commands (palette / another window)
const palette = await openPage(PAGES + 'panels/tool/list.html?config=commands');
await palette.waitFor(`!!(window.Tezcatl && Tezcatl.commands)`, 10000);
await palette.eval(`Tezcatl.commands.load().then(() => true)`);
check((await palette.eval(`Tezcatl.commands.list().filter(c => c.name.startsWith('code.')).map(c => c.name).sort().join(' ')`)) === 'code.def-next code.def-prev code.delete code.diag-next code.diag-prev code.edit code.find code.goto code.grep code.list code.lsp-definition code.lsp-format code.lsp-hover code.lsp-references code.lsp-rename code.mirror code.move code.node-next code.node-parent code.node-prev code.node-select code.open-at code.reconnect code.rename code.replace code.replay code.scratch code.to-input code.write',
  'command_map.json lists code.write / edit / delete / rename / move (and code.list / find / goto / open-at, A10; the keys\' commands, 2026-10-08; code.to-input, 2026-11-08)');
await palette.eval(`(Tezcatl.commands.invoke('code.edit', { path: 'cl/new.txt' }), true)`);
await p.waitFor(`${doc('code_editor')}.getElementById('path').textContent === 'cl/new.txt'`, 8000);
check(/\[new\]/.test(await codeMsg()), 'code.edit from the palette opens a new file in the skin\'s code_editor');
await p.eval(`(() => { const v = ${viewOf('code_editor')}; v.dispatch({ changes: { from: 0, insert: 'n' } }); return true; })()`);
await palette.eval(`(Tezcatl.commands.invoke('code.write', {}), true)`);
await p.waitFor(`/^saved/.test(${doc('code_editor')}.getElementById('msg').textContent)`, 8000);
check(disk('new.txt') === 'n', 'code.write from the palette saves it');
await palette.close();

// what is refused / still the skin's own
await line(':ls');
check(/^! :ls ── no such command: :ls/.test(await status()), 'an unknown ":" command says so');
await line('tree update');
await p.waitFor(`/tree update/.test(document.getElementById('status').textContent)`, 8000);
check(/tree update/.test(await status()), 'a line without ":" is still the skin\'s own (tree update)');

// the symbol is code.json "inputFormEx": changed to "@" at run time
const codeId = await p.eval(`${F('code_editor')}.contentWindow.Tezcatl.bus.whoami().id`);
const configure = (v) => p.eval(`(() => { const c = new BroadcastChannel('tezcatl'); c.postMessage({ v: 1, type: 'code.configure', from: { id: 'e2e' }, to: ${JSON.stringify(codeId)}, payload: { inputFormEx: ${JSON.stringify(v)} }, ts: Date.now() }); c.close(); return true; })()`);
await configure('@');
await wait(300);
await ex('#');
check(/:# is not the command to the input form.*inputFormEx in code\.json is @/.test(await codeMsg()), 'with inputFormEx "@", :# says it is not the one');
await ex('@');
await wait(300);
check((await focusedPane()).includes('code_cmd_in'), '...and :@ goes to the command line');
await configure('*');
await wait(300);
check(/inputFormEx is one of .*so it stays :@/.test(await codeMsg()), '"*" is refused (a line range in vim), the symbol stays @');
await configure('#');

// a code_editor on its own has no input form
const solo = await openPage(PAGES + 'panels/resident/code_editor.html?path=cl/b.txt');
await solo.waitFor(`/alpha/.test(document.querySelector('.cm-content') && document.querySelector('.cm-content').innerText)`, 10000);
await solo.eval(`document.querySelector('.cm-content').focus(); true`);
await solo.key('Escape', 'Escape', '');
await solo.key(':', 'Semicolon', ':', 8);
await wait(100);
await solo.send('Input.insertText', { text: '#' });
await solo.key('Enter', 'Enter', '\r');
await solo.waitFor(`/there is no input form next to this/.test(document.getElementById('msg').textContent)`, 3000);
check(/there is no input form next to this/.test(await solo.eval(`document.getElementById('msg').textContent`)), 'a code_editor on its own says there is no input form');
await solo.close();

const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
