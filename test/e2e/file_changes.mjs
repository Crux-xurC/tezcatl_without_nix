// test/e2e/file_changes.mjs -- the file-changes panel (panels/resident/file_changes.html,
// living in the frame next to a code_editor: a save of the
// same file by a code_editor in another window makes the frame's clean code_editor
// read it again (the cursor kept); an edited one is not touched but told,
// and Enter on the notice brings that code_editor forward; a file.changed (what a
// decoding patch would post) is taken the same way; a delete is told.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'fc');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\nthree\n');

const VIEW = `(() => { const c = document.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(200);
}
const fview = `(() => { const c = window.frameSkin.frameAt('11').contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const fdoc = () => p.eval(`${fview}.state.doc.toString()`);
const panelText = () => p.eval(`window.frameSkin.frameAt('21').contentDocument.getElementById('list').innerText`);

console.log('file changes');
await line('skin main 2,1');
await line(':find fc/a.txt:2');
await p.waitFor(`window.frameSkin.frameAt('11') && ${fview} && ${fview}.state.doc.toString() === 'one\\ntwo\\nthree\\n'`, 15000);
await line('skin add 2 file_changes');
const up = await p.waitFor(`window.frameSkin.frameAt('21') && window.frameSkin.frameAt('21').contentDocument.getElementById('list')`, 10000);
await wait(500);
// not there: what the frame said and holds (the rest cannot run)
const why = up ? '' : ' -- ' + await p.eval(`JSON.stringify(window.frameSkin.state()) + ' | ' + document.getElementById('recv').innerText.split('\\n').slice(-12).join(' / ')`);
check(!!up, 'the frame: code_editor with fc/a.txt (11), file_changes (21)' + why);
if (!up) done();
// the cursor at offset 6 (after `:find`'s line 2 has landed)
await wait(800);
await p.eval(`(() => { const v = ${fview}; v.dispatch({ selection: { anchor: 6 } }); return true; })()`);

// another window's code_editor saves the same file. (Opening the same file there
// by hand gives its clone now -- test/e2e/clone.mjs --, so the other holder is a
// stand-in: a code_editor of another window that writes the file and says so, as one
// that had it would -- e.g. opened through a tree of another frame.)
fs.writeFileSync(path.join(dir, 'other.txt'), 'other\n');
const s = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent('fc/other.txt') + '&name=fc-other');
await s.waitFor(`document.querySelector('.cm-content') && ${VIEW}.state.doc.toString() === 'other\\n'`, 15000);
await wait(300);
const otherSaves = async (text) => {
  fs.writeFileSync(path.join(dir, 'a.txt'), text);
  await s.eval(`window.Tezcatl.bus.post('code.saved', { name: 'fc-other', path: 'fc/a.txt' }); true`);
};
await otherSaves('ZERO\none\ntwo\nthree\n');
await p.waitFor(`${fview}.state.doc.toString() === 'ZERO\\none\\ntwo\\nthree\\n'`, 10000);
check(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8') === 'ZERO\none\ntwo\nthree\n', 'another window saves fc/a.txt');
check(true, "...the frame's clean code_editor read it again");
const head = await p.eval(`${fview}.state.selection.main.head`);
check(head === 6, '...the cursor stayed where it was (offset 6): ' + head);
check(/read fc\/a\.txt again/.test(await panelText()), '...and file_changes says so');

// the frame's code_editor edited: not read again, told; Enter goes to it
await p.eval(`(() => { const v = ${fview}; v.dispatch({ changes: { from: v.state.doc.length, insert: 'mine\\n' } }); return true; })()`);
await wait(300);
await otherSaves('MORE\nZERO\none\ntwo\nthree\n');
await p.waitFor(`/this code_editor has edits: :e! reads it again/.test(window.frameSkin.frameAt('21').contentDocument.getElementById('list').innerText)`, 10000);
check((await fdoc()).endsWith('mine\n'), 'an edited code_editor is not read again (its edits stay), and is told');
await line('skin focus 2 1');
await p.eval(`window.frameSkin.frameAt('21').contentDocument.getElementById('list').focus(); true`);
await p.key('Enter', 'Enter', '\r');
await wait(500);
check(JSON.parse(await p.eval(`JSON.stringify(window.frameSkin.state())`)).focus === '11' && await p.eval(`document.activeElement === window.frameSkin.frameAt('11')`),
  'Enter on the notice brings that code_editor forward (the frame focuses 11)');

// what a decoding patch would post: file.changed
await line(':e!');
await p.waitFor(`${fview}.state.doc.toString() === 'MORE\\nZERO\\none\\ntwo\\nthree\\n'`, 10000);
fs.writeFileSync(path.join(dir, 'a.txt'), 'from git\n');
await s.eval(`window.Tezcatl.bus.post('file.changed', { op: 'write', paths: ['fc/a.txt'], source: 'git' }); true`);
await p.waitFor(`${fview}.state.doc.toString() === 'from git\\n'`, 10000);
check(/changed by git/.test(await panelText()), 'file.changed (a decoding patch) makes the clean code_editor read the disk again');

// a delete is told
fs.unlinkSync(path.join(dir, 'a.txt'));
await s.eval(`window.Tezcatl.bus.post('fs.changed', { op: 'delete', paths: ['fc/a.txt'] }); true`);
await p.waitFor(`/fc\\/a\\.txt was deleted/.test(window.frameSkin.frameAt('21').contentDocument.getElementById('list').innerText)`, 10000);
check(!fs.existsSync(path.join(dir, 'a.txt')) && (await fdoc()) === 'from git\n', 'a delete is told; the text stays in the code_editor');

const errs = [p, s].flatMap((pg) => pg.logs.filter((l) => /exception/.test(l)));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await s.close();
await p.close();
done();
