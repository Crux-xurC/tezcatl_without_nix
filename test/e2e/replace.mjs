// test/e2e/replace.mjs -- marks replaced with ids (D-id-pool): `:Replace
// #eigenvalue tasks` puts a different id of the relay's list in place of each
// mark (`#eigenvalues` untouched), as one change that `u` takes back; the list
// keeps what it handed out and where; `:w replace ...` replaces, then saves --
// with ids never handed out before; a save that stops on a conflict keeps the
// ids in the text, and they are not handed out again.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'rp');
const ids = path.join(E2E, 'ids');
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(ids, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const NOTE = 'Table: task matrix #eigenvalue\n\n| id | task | inner_id |\n|---|---|---|\n| t-01 | a | #eigenvalue |\n| t-02 | b | #eigenvalue |\n\n#eigenvalues stays\n';
fs.writeFileSync(path.join(dir, 't.md'), NOTE);

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (n = 3) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 1000) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const view = `(() => { const c = window.frameSkin.frameAt('11').contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const docNow = () => p.eval(`${view}.state.doc.toString()`);
const list = () => JSON.parse(fs.readFileSync(path.join(ids, 'tasks.json'), 'utf8'));

console.log('marks replaced with ids: :Replace, u, :w replace, a conflict');
await line(':find rp/t.md', 1500);
await p.waitFor(`window.frameSkin.frameAt('11') && window.frameSkin.frameAt('11').contentDocument.querySelector('.cm-content') && ${view}.state.doc.toString().startsWith('Table:')`, 15000);
await wait(500);

// -- :Replace: each mark its own id, one change
let said = await line(':Replace #eigenvalue tasks', 1500);
let t = await docNow();
const first = [...t.matchAll(/(?:matrix |\| )([0-9a-z]{8})(?= \||\n)/g)].map((m) => m[1]);
check(!t.includes('#eigenvalue ') && !/#eigenvalue\n/.test(t) && !/\| #eigenvalue \|/.test(t), ':Replace: no mark left: ' + JSON.stringify(t.split('\n')[0]));
check(first.length === 3 && new Set(first).size === 3, '...three different ids of 8 [0-9a-z]: ' + first.join(', '));
check(t.includes('#eigenvalues stays'), '...#eigenvalues is not the mark (untouched)');
check(/put 3 id\(s\) of tasks in place of #eigenvalue/.test(said), '...said on the receiving side: ' + said.split('\n').pop());
check(fs.readFileSync(path.join(dir, 't.md'), 'utf8') === NOTE, '...not saved: the file is as it was');
let l = list();
check(first.every((id) => l.issued[id] && l.issued[id].path === 'rp/t.md') && l.available.length === 100 && first.every((id) => !l.available.includes(id)),
  '...the list keeps them as handed out (with the file), 100 more ready');

// -- u: one undo takes all three back
await p.eval(`(() => { ${view}.focus(); return true; })()`);
await p.key('u', 'KeyU', 'u');
await wait(400);
check((await docNow()) === NOTE, 'u once: all three marks back');

// -- :w replace: replaced with ids never handed out before, then saved
said = await line(':w replace #eigenvalue tasks', 2000);
const saved = fs.readFileSync(path.join(dir, 't.md'), 'utf8');
const second = [...saved.matchAll(/(?:matrix |\| )([0-9a-z]{8})(?= \||\n)/g)].map((m) => m[1]);
check(second.length === 3 && second.every((id) => !first.includes(id)), ':w replace: saved with three new ids (none of the first three again): ' + second.join(', '));
check(await p.waitFor(`window.frameSkin.frameAt('11').contentDocument.getElementById('dirty').hidden`, 5000), '...the code_editor is saved');
check(/\| [0-9a-z]{8} \|/.test(saved) && saved.includes('#eigenvalues stays'), '...the file has them, #eigenvalues untouched');

// -- a mark added, the file changed outside: the save stops, the id stays in the text
await p.eval(`(() => { const v = ${view}; v.dispatch({ changes: { from: v.state.doc.length, insert: '| t-03 | c | #eigenvalue |\\n' } }); return true; })()`);
fs.writeFileSync(path.join(dir, 't.md'), saved + 'outside\n');
await line(':w replace #eigenvalue tasks', 2000);
t = await docNow();
const third = /\| t-03 \| c \| ([0-9a-z]{8}) \|/.exec(t);
check(third && ![...first, ...second].includes(third[1]), 'a conflict: the mark got a new id in the text: ' + (third && third[1]));
check(fs.readFileSync(path.join(dir, 't.md'), 'utf8') === saved + 'outside\n', '...the save stopped (the file is the one changed outside)');
check(await p.eval(`!window.frameSkin.frameAt('11').contentDocument.getElementById('dirty').hidden`), '...the text stays unsaved');
l = list();
check(third && l.issued[third[1]] && !l.available.includes(third[1]), '...and that id is handed out (never again)');

// -- refused
check(/needs a mark and a list/.test(await line(':Replace #eigenvalue', 800)), ':Replace without a list: said');
check(/takes no path/.test(await line(':w other.md', 800)), ':w <path>: still refused');

done();
