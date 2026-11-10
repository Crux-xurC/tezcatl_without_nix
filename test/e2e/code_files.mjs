// test/e2e/code_files.mjs -- code_editor's file commands (lib/code/code-files.js,
// lib/code/code-editor.js, the relay's /fs/write base check, /fs/delete,
// /fs/rename): a save over a file
// changed on disk is stopped (:w! writes, :e! reads it again), :e <path>
// makes a new file on :w (never a new directory), :Rename / :Move / :Delete,
// code_editor.html?path=, and a tree that is open picks up what changed. A file
// that is not UTF-8 is not opened.
// Works in $E2E_DIR/fsroot/cf (the isolated FS root).
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'cf');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'alpha\n');
const disk = (rel) => { try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch (_) { return null; } };

// a tree showing cf/, to see it follow the changes
const tree = await openPage(PAGES + 'panels/resident/tree.html?name=cf-tree');
await tree.waitFor(`!!document.getElementById('tree')`, 10000);
await wait(500);
await tree.eval(`(() => { const c = new BroadcastChannel('tezcatl'); c.postMessage({ v: 1, type: 'tree.root', from: { id: 'e2e' }, to: null, payload: { path: 'cf', tree: 'cf-tree' }, ts: Date.now() }); c.close(); return true; })()`);
const treeText = () => tree.eval(`document.getElementById('tree').innerText`);
await tree.waitFor(`/a\\.txt/.test(document.getElementById('tree').innerText)`, 10000);

const p = await openPage(PAGES + 'panels/resident/code_editor.html?path=cf/a.txt');
const doc = () => p.eval(`(() => { const c = document.querySelector('.cm-content'); const v = (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); return v.state.doc.toString(); })()`);
const msg = () => p.eval(`document.getElementById('msg').textContent`);
const head = (id) => p.eval(`document.getElementById(${JSON.stringify(id)}).textContent`);
const dirty = () => p.eval(`!document.getElementById('dirty').hidden`);
const focus = () => p.eval(`document.querySelector('.cm-content').focus(); true`);
async function normal() { await focus(); await p.key('Escape', 'Escape', ''); await wait(100); }
// an ex command: ":" then the line in vim's prompt, then Enter
async function ex(line, expect, ms = 8000) {
  await normal();
  await p.eval(`document.getElementById('msg').textContent = ''; true`);
  await p.key(':', 'Semicolon', ':', 8);
  await wait(100);
  await p.send('Input.insertText', { text: line });
  await p.key('Enter', 'Enter', '\r');
  if (expect) await p.waitFor(`${expect.toString()}.test(document.getElementById('msg').textContent)`, ms);
  return msg();
}
async function type(text) { await normal(); await p.key('A', 'KeyA', 'A', 8); await p.send('Input.insertText', { text }); await normal(); }

console.log('code_editor files');
await p.waitFor(`document.querySelector('.cm-content') && /alpha/.test(document.querySelector('.cm-content').innerText)`, 15000);
check((await doc()) === 'alpha\n' && (await head('path')) === 'cf/a.txt', 'code_editor.html?path=cf/a.txt opens the file and shows its path');

// -- A1: a save over a file changed on disk is stopped -------------------------
await type(' mine');
check(await dirty(), 'edited -> dirty');
fs.writeFileSync(path.join(dir, 'a.txt'), 'theirs\n');
check(/the file on disk changed after it was opened/.test(await ex('w', /the file on disk changed/)), ':w over a file changed on disk is stopped and says how to choose');
check(disk('a.txt') === 'theirs\n', '...and the file on disk is untouched');
await normal();
await p.eval(`document.getElementById('msg').textContent = ''; true`);
await p.key('s', 'KeyS', '', 2);   // Ctrl+S saves nothing (removed 2026-10-25)
await wait(800);
check(disk('a.txt') === 'theirs\n' && (await dirty()) && !/sav/.test(await msg()), 'Ctrl+S does not save (no save key; :w only)');
check(/^saved cf\/a\.txt/.test(await ex('w!', /saved/)), ':w! writes anyway');
check(disk('a.txt') === 'alpha mine\n', '...with the edited text');
check(!(await dirty()), 'and it is clean');
check(/^saved/.test(await ex('w', /saved/)), 'the next :w goes through (the base is what was written)');

// :e! reads the disk again, dropping the edits
fs.writeFileSync(path.join(dir, 'a.txt'), 'theirs again\n');
await type(' x');
check(/unsaved changes/.test(await ex('e cf/sub/n.txt', /unsaved/)), ':e <path> with unsaved edits is refused');
await ex('e!', /opened cf\/a\.txt/);
check((await doc()) === 'theirs again\n' && !(await dirty()), ':e! reads the file again (the edits dropped)');

// -- A2: a new file ------------------------------------------------------------
check(/\[new\] cf\/new\.txt/.test(await ex('e cf/new.txt', /\[new\]/)), ':e of a path that does not exist opens a new file');
check((await head('path')) === 'cf/new.txt' && (await doc()) === '', '...empty, under its path');
await type('fresh');
check(/^saved cf\/new\.txt/.test(await ex('w', /saved/)), ':w makes it');
check(disk('new.txt') === 'fresh', '...on disk');
await tree.waitFor(`/new\\.txt/.test(document.getElementById('tree').innerText)`, 5000);
check(/new\.txt/.test(await treeText()), 'the open tree shows the new file (fs.changed)');
// a new file somewhere else, relative to the current one
check(/\[new\] cf\/sub\/rel\.txt/.test(await ex('e ./sub/rel.txt', /\[new\]/)), ':e ./sub/rel.txt is from the current file\'s directory');
// no new directories
await ex('e cf/nodir/x.txt', /\[new\]/);
await type('x');
check(/no such directory: cf\/nodir.*make the directory in a terminal/.test(await ex('w', /no such directory/)), 'a file in a directory that does not exist is not saved (make it in the terminal)');
check(!fs.existsSync(path.join(dir, 'nodir')), '...and no directory is made');
// someone made the new file meanwhile: :w is stopped too
await ex('e! cf/race.txt', /\[new\]/);
await type('mine');
fs.writeFileSync(path.join(dir, 'race.txt'), 'theirs');
check(/the file on disk changed/.test(await ex('w', /the file on disk changed/)) && disk('race.txt') === 'theirs', 'a new file that appeared on disk meanwhile is not overwritten');
await ex('e! cf/new.txt', /opened/);

// -- rename / move / delete ----------------------------------------------------
check(/moved cf\/new\.txt → cf\/renamed\.txt/.test(await ex('Rename renamed.txt', /moved /)), ':Rename renames in the same directory');
check(disk('renamed.txt') === 'fresh' && disk('new.txt') === null && (await head('path')) === 'cf/renamed.txt', '...on disk, and the editor follows');
await tree.waitFor(`/renamed\\.txt/.test(document.getElementById('tree').innerText) && !/new\\.txt/.test(document.getElementById('tree').innerText)`, 5000);
check(/renamed\.txt/.test(await treeText()), 'the tree follows the rename');
check(/:Move/.test(await ex('Rename sub/x.txt', /Move/)), ':Rename with a directory says to use :Move');
check(/moved cf\/renamed\.txt → cf\/sub\/moved\.txt/.test(await ex('Move cf/sub/moved.txt', /moved /)), ':Move moves to a path from the FS root');
check(disk('sub/moved.txt') === 'fresh', '...on disk');
check(/already exists: cf\/a\.txt/.test(await ex('Move ../a.txt', /already exists/)), ':Move onto an existing file is refused');
check(/^saved cf\/sub\/moved\.txt/.test(await (async () => { await type('!'); return ex('w', /saved/); })()), 'and :w saves to the new path (the base moved with it)');

fs.writeFileSync(path.join(dir, 'sub/moved.txt'), 'changed');
check(/:Delete! deletes it/.test(await ex('Delete', /Delete!/)) && disk('sub/moved.txt') === 'changed', ':Delete of a file changed on disk is stopped');
check(/deleted cf\/sub\/moved\.txt/.test(await ex('Delete!', /deleted /)), ':Delete! deletes it');
check(disk('sub/moved.txt') === null, '...from disk');
check((await doc()) === 'fresh!' && (await dirty()), 'the text stays in the editor, dirty');
check(/^saved/.test(await ex('w', /saved/)) && disk('sub/moved.txt') === 'fresh!', ':w makes it again');

// -- line endings: a CRLF file stays CRLF (CodeMirror holds "\n" inside) --------
fs.writeFileSync(path.join(dir, 'crlf.txt'), 'one\r\ntwo\r\n');
await ex('e cf/crlf.txt', /opened cf\/crlf\.txt/);
check(/CRLF/.test(await head('lang')), 'a CRLF file shows CRLF in the head');
await type('z');
check(await dirty(), 'edited -> dirty');
await normal();
await p.key('u', 'KeyU', 'u');
await p.waitFor(`document.getElementById('dirty').hidden`, 3000).catch(() => {});
check(!(await dirty()), 'undoing back to the file as opened is clean again (was: dirty for good)');
await type('!');
check(/^saved cf\/crlf\.txt \(CRLF\)/.test(await ex('w', /saved/)), ':w of a CRLF file says CRLF');
check(disk('crlf.txt') === (await doc()).replace(/\n/g, '\r\n') && /\r\n/.test(disk('crlf.txt')), '...and writes CRLF (was: every line turned LF)');
fs.writeFileSync(path.join(dir, 'mixed.txt'), 'a\r\nb\r\nc\n');
check(/mixed line endings \(a save makes them all CRLF\)/.test(await ex('e cf/mixed.txt', /opened/)), 'mixed line endings are said when the file opens');
await ex('w', /saved/);
check(disk('mixed.txt') === 'a\r\nb\r\nc\r\n', '...and :w makes them the common one');

// -- two saves at once: the second checks against what the first wrote ----------
await ex('e cf/a.txt', /opened/);
await type(' twice');
await ex('w', null);
await ex('w', null);
await p.waitFor(`/saved/.test(document.getElementById('msg').textContent)`, 5000);
await wait(800);
check(!/the file on disk changed/.test(await msg()), ':w twice in a row is not a conflict (was: the second was refused)');
check(disk('a.txt') === (await doc()) && !(await dirty()), '...the file is saved and clean');

// -- A9: a file that is not UTF-8 is not opened (it would be written back with U+FFFD)
const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);   // Latin-1 "café"
fs.writeFileSync(path.join(dir, 'l1.txt'), latin1);
const before = { path: await head('path'), doc: await doc() };
check(/not UTF-8 text, so it is not opened/.test(await ex('e cf/l1.txt', /UTF-8/)), ':e of a Latin-1 file is refused and says why');
check((await head('path')) === before.path && (await doc()) === before.doc, '...the file open before stays');
check(fs.readFileSync(path.join(dir, 'l1.txt')).equals(latin1), '...and the file on disk is untouched');
const q = await openPage(PAGES + 'panels/resident/code_editor.html?path=cf/l1.txt');
await q.waitFor(`/UTF-8/.test(document.getElementById('msg').textContent)`, 15000);
check(true, 'code_editor.html?path= of it says the same');
await q.close();

// code.file write {req} from another window (compile.run's save first): the
// answer carries the req; a code_editor that cannot save answers at once
await tree.eval(`(() => { window.__ans = []; const c = new BroadcastChannel('tezcatl'); c.onmessage = (e) => { const m = e.data; if (m && (m.type === 'code.saved' || m.type === 'code.saveFailed')) window.__ans.push([m.type, m.payload.req || null, m.payload.code || null]); }; window.__bc = c; return true; })()`);
const busPost = (type, payload) => tree.eval(`(() => { window.__bc.postMessage({ v: 1, type: ${JSON.stringify(type)}, from: { id: 'e2e' }, to: null, payload: ${JSON.stringify(payload)}, ts: Date.now() }); return true; })()`);
await type('req');
await busPost('code.file', { op: 'write', arg: '', bang: false, req: 'r1' });
await tree.waitFor(`window.__ans.some((a) => a[1] === 'r1')`, 8000);
check(JSON.stringify(await tree.eval(`window.__ans.find((a) => a[1] === 'r1')`)) === '["code.saved","r1",null]' && /req/.test(disk((await head('path')).replace(/^cf\//, '')) || ''),
  'code.file write {req} saves, and code.saved carries the req');
await busPost('code.configure', { readOnly: true });
await wait(200);
await busPost('code.file', { op: 'write', arg: '', bang: false, req: 'r2' });
await tree.waitFor(`window.__ans.some((a) => a[1] === 'r2')`, 3000);
check(JSON.stringify(await tree.eval(`window.__ans.find((a) => a[1] === 'r2')`)) === '["code.saveFailed","r2","read_only"]',
  '...a read-only code_editor answers code.saveFailed read_only at once (no 10 s wait)');
await busPost('code.configure', { readOnly: false });
await wait(200);

const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
await tree.close();
done();
