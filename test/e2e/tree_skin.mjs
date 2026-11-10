// test/e2e/tree_skin.mjs -- the tree skin (panels/skins/tree.html, treemacs's
// place): the slots list picks the tree's root, the tree opens a file into
// code_editor, code_editor saves it itself (also after the window that opened it is
// gone), and the `tree ...` commands edit the slots through the list (tidied
// to 1..n on every write; an unreadable file is never written). Writes its
// own files under $E2E_DIR/fsroot (the isolated FS root).
import fs from 'node:fs';
import path from 'node:path';
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// :w typed into the code_editor that has the focus (vim's ex line); Mod-s is gone (2026-10-25)
const vimW = async (pg) => { await pg.key('Escape', 'Escape', ''); await wait(100); await pg.key(':', 'Semicolon', ':', 8); await wait(100); await pg.send('Input.insertText', { text: 'w' }); await pg.key('Enter', 'Enter', '\r'); };
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const root = path.join(E2E, 'fsroot');
fs.mkdirSync(path.join(root, 'proj', 'sub'), { recursive: true });
fs.writeFileSync(path.join(root, 'proj', 'a.txt'), 'alpha\n');
fs.writeFileSync(path.join(root, 'proj', 'b.txt'), 'beta\n');
fs.writeFileSync(path.join(root, 'tree.json'), JSON.stringify({ slots: [
  { order: 2, tag: 'proj', path: 'proj' },
  { order: 1, tag: 'root', path: '' },
] }, null, 2) + '\n');
const slotsOnDisk = () => { try { return JSON.parse(fs.readFileSync(path.join(root, 'tree.json'), 'utf8')).slots; } catch (_) { return null; } };

// a basic skin open alongside: the tree skin's tree must not open files in it
const basic = await openPage(PAGES + 'panels/skins/basic.html');
const p = await openPage(PAGES + 'panels/skins/tree.html');
const F = (part) => `[...document.querySelectorAll('iframe')].find(f => (f.src||'').includes(${JSON.stringify(part)}))`;
const doc = (part) => `${F(part)}.contentDocument`;
const status = () => p.eval(`document.getElementById('status').textContent`);
const view = `(() => { const c = ${doc('code_editor')}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const listKey = async (key, code, text) => {
  await p.eval(`${F('config=slots')}.contentWindow.focus(); ${doc('config=slots')}.getElementById('filter').focus(); true`);
  await p.key(key, code, text);
};
const treeKey = async (key, code, text) => {
  await p.eval(`${F('panels/resident/tree.html')}.contentWindow.focus(); ${doc('panels/resident/tree.html')}.getElementById('tree').focus(); true`);
  await p.key(key, code, text);
};
const treeSel = () => p.eval(`(${doc('panels/resident/tree.html')}.querySelector('.row.sel') || {}).innerText || ''`);
async function treeSelect(name) {
  await treeKey('Home');
  for (let i = 0; i < 30; i++) {
    if ((await treeSel()).trim().split(/\s+/).includes(name)) return true;
    await treeKey('ArrowDown');
  }
  return false;
}

console.log('tree skin');
const listed = await p.waitFor(`${F('config=slots')} && /proj/.test(${doc('config=slots')}.getElementById('list').innerText) && ${doc('config=slots')}.getElementById('list').innerText`, 20000);
const lines = String(listed || '').split('\n').filter(Boolean);
check(/^1\s+root/.test(lines[0] || '') && /^2\s+proj/.test(lines[1] || ''), 'slots are listed by order: ' + JSON.stringify(lines));

// slot 2 (proj) -> the tree's root
await listKey('ArrowDown'); await listKey('Enter', 'Enter', '\r');
check(!!(await p.waitFor(`/tree · proj/.test(${doc('panels/resident/tree.html')}.getElementById('title').textContent) && /a\\.txt/.test(${doc('panels/resident/tree.html')}.body.innerText)`, 10000)),
  'Enter on a slot opens it as the tree\'s root (title "tree · proj", a.txt shown)');

// tree: select a.txt, Enter -> code_editor
check(await treeSelect('a.txt'), 'tree: cursor on a.txt');
check((await p.eval(`window.treeSkin.selection()`))?.path === 'proj/a.txt', 'the skin holds the tree\'s selected path (tree.selection)');
await treeKey('Enter', 'Enter', '\r');
check(!!(await p.waitFor(`${view} && ${view}.state.doc.toString() === 'alpha\\n'`, 10000)), 'Enter on a file opens it in the skin\'s code_editor');
await wait(1000);
check((await basic.eval(`[...document.querySelectorAll('iframe')].filter(f => /code_editor/.test(f.src)).length`)) === 0,
  'a basic skin in another tab does not open it too (code.open from another skin\'s tree)');
await basic.close();

// edit + :w: code_editor writes it itself
await p.eval(`(() => { const v = ${view}; v.dispatch({ changes: { from: 0, insert: 'ALPHA ' } }); return true; })()`);
await p.eval(`${F('code_editor')}.contentWindow.focus(); ${view}.focus(); true`);
await vimW(p);
await p.waitFor(`/saved proj\\/a\\.txt/.test(document.getElementById('status').textContent)`, 8000);
check(fs.readFileSync(path.join(root, 'proj', 'a.txt'), 'utf8') === 'ALPHA alpha\n', ':w in code_editor writes the file (status: ' + await status() + ')');

// unsaved edits: opening another file is refused
await p.eval(`(() => { const v = ${view}; v.dispatch({ changes: { from: 0, insert: 'x' } }); return true; })()`);
await wait(300);
check(await treeSelect('b.txt'), 'tree: cursor on b.txt');
await treeKey('Enter', 'Enter', '\r');
await wait(800);
check(/unsaved changes/.test(await status()) && (await p.eval(`${view}.state.doc.toString()`)).startsWith('xALPHA'),
  'with unsaved edits, opening another file is refused and the edits stay');

await p.eval(`${F('code_editor')}.contentWindow.focus(); ${view}.focus(); true`);
await vimW(p);   // save the pending edit, so code_editor is clean again
await p.waitFor(`/saved/.test(document.getElementById('status').textContent)`, 8000);

// -- the commands ---------------------------------------------------------------
const cmd = async (line, expect, ms = 8000) => {
  await p.eval(`${F('code_cmd_in')}.contentWindow.focus(); ${doc('code_cmd_in')}.querySelector('.cm-content').focus(); true`);
  await p.send('Input.insertText', { text: line });
  await p.key('Enter', 'Enter', '\r', 2);
  const esc = line.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await p.waitFor(`new RegExp(${JSON.stringify(esc)}).test(document.getElementById('status').textContent)`, ms);
  const st = await status();
  return expect ? expect.test(st) : st;
};
const listText = () => p.eval(`${doc('config=slots')}.getElementById('list').innerText`);
const rows = async () => (await listText()).split('\n').filter(Boolean);

check(await treeSelect('sub'), 'tree: cursor on the directory sub');
check(await cmd('tree add', /added proj\/sub as 3/), 'tree add (no path) adds the directory selected in the tree');
check(!!(await p.waitFor(`/^3\\s/m.test(${doc('config=slots')}.getElementById('list').innerText)`, 5000)), 'the list shows slot 3 at once');
check(await cmd('tree add proj/a.txt', /^! .*cannot be opened as a directory/), 'tree add of a file is refused');
check(await cmd('tree tag 3 subdir', /slot 3 is tagged "subdir"/), 'tree tag 3 subdir');
check(await cmd('tree order 1 3', /swapped slots/), 'tree order 1 3');
check(JSON.stringify(slotsOnDisk().map((x) => [x.order, x.tag, x.path])) === JSON.stringify([[1, 'subdir', 'proj/sub'], [2, 'proj', 'proj'], [3, 'root', '']]),
  'the file is written sorted and numbered 1..n: ' + JSON.stringify(slotsOnDisk()));
check(await cmd('tree del 2', /removed slot 2 \(proj\)/), 'tree del 2');
check(JSON.stringify(slotsOnDisk().map((x) => x.order)) === '[1,2]', 'after del the numbers close up (1, 2)');
check(await cmd('tree del 9', /^! .*there is no slot 9/), 'tree del of a missing slot is refused');
check(await cmd('tree set', /^! .*no such command: set/), 'an unknown command says so');

// hand-edited file (gaps, out of order) -> tree update tidies it
fs.writeFileSync(path.join(root, 'tree.json'), JSON.stringify({ slots: [{ order: 9, tag: 'b', path: 'proj' }, { order: 4, tag: 'a', path: '' }] }));
check(await cmd('tree update', /read again/), 'tree update');
check(JSON.stringify(slotsOnDisk()) === JSON.stringify([{ order: 1, tag: 'a', path: '' }, { order: 2, tag: 'b', path: 'proj' }]), 'tree update sorts and renumbers a hand-edited file');

// an unreadable file: said, and never written
fs.writeFileSync(path.join(root, 'tree.json'), '{ "slots": [ oops');
check(!!(await p.waitFor(`/could not read the list/.test(document.getElementById('status').textContent)`, 5000)), 'an unreadable slots file is said in the bar');
check(await cmd('tree add proj', /^! .*not written/), 'a command on it is refused');
check(fs.readFileSync(path.join(root, 'tree.json'), 'utf8') === '{ "slots": [ oops', 'and the file is left as it was');

// tree edit -> fix it in code_editor -> :w -> tree update
await cmd('tree edit', null);
check(!!(await p.waitFor(`${view}.state.doc.toString().includes('oops')`, 5000)), 'tree edit opens the slots file in code_editor');
await p.eval(`(() => { const v = ${view}; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '{"slots":[{"order":3,"tag":"p","path":"proj"}]}' } }); return true; })()`);
await p.eval(`${F('code_editor')}.contentWindow.focus(); ${view}.focus(); true`);
await vimW(p);
await p.waitFor(`/saved tree\\.json/.test(document.getElementById('status').textContent)`, 8000);
check(await cmd('tree update', /read again/), 'after fixing it in code_editor, tree update works');
check(!!(await p.waitFor(`${view}.state.doc.toString().includes('"order": 1')`, 5000)), 'code_editor showing the slots file follows the tidied file');

// keys in the list itself: M-j moves the selected slot down, and it stays selected
await cmd('tree add', null);   // the tree selection (sub) again -> 2 slots
await p.waitFor(`/^2\\s/m.test(${doc('config=slots')}.getElementById('list').innerText)`, 5000);
await p.eval(`${F('config=slots')}.contentWindow.focus(); ${doc('config=slots')}.getElementById('filter').focus(); true`);
await p.key('Home');
await p.key('j', 'KeyJ', 'j', 1);   // M-j (Alt)
await wait(800);
check(JSON.stringify(slotsOnDisk().map((x) => x.path)) === JSON.stringify(['proj/sub', 'proj']), 'M-j in the list moves slot 1 down: ' + JSON.stringify(slotsOnDisk()));
check(/proj\s*$/.test(await p.eval(`(${doc('config=slots')}.querySelector('#list .sel, #list li.on, #list [aria-selected=true]') || {}).innerText || ''`)), 'the moved slot stays selected');

// -- the same commands as tezcatl-commands (command_map.json), from another window
const pal = await openPage(PAGES + 'panels/tool/list.html?config=commands');
check(!!(await pal.waitFor(`/tree\.update/.test(document.getElementById('list').innerText)`, 10000)), 'the palette lists tree.add ... tree.update (command_map.json)');
const before = slotsOnDisk().length;
await pal.eval(`Tezcatl.commands.invoke('tree.tag', { n: 1, tag: 'viaCmd' }); true`);
check(!!(await p.waitFor(`/tree\.tag .*is tagged "viaCmd"/.test(document.getElementById('status').textContent)`, 8000)) && slotsOnDisk()[0].tag === 'viaCmd',
  'tree.tag sent from another window runs in the tree skin');

// two tree skins: only the one focused last runs a command from the bus
const p2 = await openPage(PAGES + 'panels/skins/tree.html');
await p2.waitFor(`window.treeSkin && document.getElementById('status').textContent === 'ready'`, 15000);
await wait(1000);
await pal.eval(`Tezcatl.commands.invoke('tree.add', { path: 'proj' }); true`);
await p2.waitFor(`/tree\.add/.test(document.getElementById('status').textContent)`, 8000);
await wait(1500);
check(slotsOnDisk().length === before + 1, 'with two tree skins open, tree.add from the bus adds once (' + before + ' -> ' + slotsOnDisk().length + ')');
check(/tree\.add/.test(await p2.eval(`document.getElementById('status').textContent`)) && !/tree\.add/.test(await status()),
  'the skin opened (focused) last is the one that ran it');
await p2.close();
await pal.close();

const errs = p.logs.filter((l) => /exception|console.error/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();

// -- a tree on its own: Enter opens a new code_editor window (as o); the window that
// opened it is gone, and code_editor still saves (was: saving did nothing)
const t = await openPage(PAGES + 'panels/resident/tree.html');
await t.waitFor(`/proj/.test(document.body.innerText)`, 10000);
await t.eval(`window.focus(); true`);
const tsel = () => t.eval(`(document.querySelector('.row.sel') || {}).innerText || ''`);
for (const name of ['proj', 'b.txt']) {
  for (let i = 0; i < 30 && !(await tsel()).trim().split(/\s+/).includes(name); i++) await t.key('ArrowDown');
  if (name === 'proj') { await t.key('Enter', 'Enter', '\r'); await t.waitFor(`/b\\.txt/.test(document.body.innerText)`, 8000); }
}
await t.key('Enter', 'Enter', '\r');
const ed = await attachTo('tree-code-');
const edView = `(() => { const c = document.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
check(!!(await ed.waitFor(`${edView} && ${edView}.state.doc.toString() === 'beta\\n'`, 10000)), 'Enter in a tree on its own opens b.txt in a new code_editor window');
await t.close();
await wait(500);
await ed.eval(`(() => { const v = ${edView}; v.dispatch({ changes: { from: 0, insert: 'BETA ' } }); v.focus(); return true; })()`);
await vimW(ed);
await wait(1500);
check(fs.readFileSync(path.join(root, 'proj', 'b.txt'), 'utf8') === 'BETA beta\n', 'after the tree window is closed, :w in that code_editor still saves');
check(!(await ed.eval(`!document.getElementById('dirty').hidden`)), 'and the unsaved mark (●) is cleared');
await ed.close();

// a code_editor with no path says so
const bare = await openPage(PAGES + 'panels/resident/code_editor.html');
const bareView = edView;
await bare.waitFor(`document.querySelector('.cm-content')`, 10000);
await bare.eval(`(() => { const v = ${bareView}; v.dispatch({ changes: { from: 0, insert: 'scratch' } }); v.focus(); return true; })()`);
await vimW(bare);
check(!!(await bare.waitFor(`/nowhere to save/.test(document.getElementById('msg').textContent)`, 5000)), 'a code_editor with no file says there is nowhere to save');
await bare.close();

// -- a list's one-letter keys act only on an empty filter; otherwise the letter is typed
const dict = await openPage(PAGES + 'panels/tool/list.html?config=dict');
await dict.waitFor(`document.getElementById('title').textContent === 'Dictionary'`, 10000);
await dict.eval(`document.getElementById('filter').focus(); true`);
for (const ch of 'pap') { await dict.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: 'Key' + ch.toUpperCase(), text: ch }); await dict.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Key' + ch.toUpperCase() }); }
await wait(300);
const typed = await dict.eval(`document.getElementById('filter').value`);
check(typed === 'ap', 'in the dict list, "a" and "p" can be typed into the filter once it has text (filter: ' + JSON.stringify(typed) + '; the first p, on an empty filter, is the store key)');
await dict.close();
done();
