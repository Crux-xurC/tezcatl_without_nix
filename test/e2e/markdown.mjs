// test/e2e/markdown.mjs -- the markdown panel: `markdown <path>` draws a note
// (headings, a task list, a GFM table with its pandoc caption, a link), raw
// HTML stays text (nothing of it runs), an image is said, not loaded; the
// saved text is read again when a code_editor saves it; `markdown follow` shows the
// code_editor's unsaved text and marks the block under its cursor; Enter in the
// panel goes to that block's line; the code_editor opening another file ends it.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'md');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const NOTE = [
  '# Note',
  '',
  'Some *text* and a [link](./b.md).',
  '',
  '- [ ] open task',
  '- [x] done task',
  '',
  'Table: tasks one',
  '',
  '| id | task |',
  '|----|------|',
  '| t-01 | first |',
  '',
  '![a picture](img/p.png)',
  '',
  '<script>window.__pwned = 1</script>',
  '',
  'inline <img src="x" onerror="window.__pwned = 2"> html',
  '',
].join('\n');
fs.writeFileSync(path.join(dir, 'a.md'), NOTE);
fs.writeFileSync(path.join(dir, 'b.md'), '# B\n');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (n = 3) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 800) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const placeOf = async (panel) => { const s = await st(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][0] === panel) return String(c + 1) + String(r + 1); return null; };
const fdoc = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentDocument`;
const fwin = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentWindow`;
const view = (pl) => `(() => { const c = ${fdoc(pl)}.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const press = (pl, key) => p.eval(`(() => { const d = ${fdoc(pl)}.getElementById('doc'); d.focus(); d.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true })); return true; })()`);

console.log('markdown: draw a note, its saved text, follow a code_editor');
let said = await line('markdown md/a.md', 1500);
const mp = await placeOf('markdown');
check(mp && new RegExp('markdown ── md/a\\.md in a markdown panel added at ' + mp[0] + ' ' + mp[1]).test(said), 'markdown <path>: a markdown panel added: ' + said.split('\n').pop());
check(await p.waitFor(`${fdoc(mp)} && ${fdoc(mp)}.querySelector('#doc h1') && ${fdoc(mp)}.querySelector('#doc h1').textContent === 'Note'`, 15000), '...the note is drawn: the heading');
check(await p.eval(`/^disk · \\d{4}-/.test(${fdoc(mp)}.getElementById('mode').textContent) && ${fdoc(mp)}.getElementById('path').textContent === 'md/a.md'`), '...the head says the saved text, and when');
check(await p.eval(`(() => { const d = ${fdoc(mp)}; const boxes = [...d.querySelectorAll('#doc li.task input')]; return boxes.length === 2 && !boxes[0].checked && boxes[1].checked; })()`), '...the task list: two boxes, the second checked');
check(await p.eval(`(() => { const t = ${fdoc(mp)}.querySelector('#doc table'); return !!t && t.querySelector('caption').textContent === 'tasks one' && [...t.querySelectorAll('td')].map((x) => x.textContent).join(',') === 't-01,first'; })()`), '...the GFM table, its pandoc caption above it');
check(await p.eval(`/this panel cannot show an image ── its file is img\\/p\\.png/.test(${fdoc(mp)}.getElementById('doc').textContent) && !${fdoc(mp)}.querySelector('#doc img')`), '...an image is said with its path, not loaded');
check(await p.eval(`(() => { const d = ${fdoc(mp)}; return !d.querySelector('#doc script') && !d.querySelector('#doc img') && /<script>window.__pwned = 1<\\/script>/.test(d.getElementById('doc').textContent) && /<img src="x" onerror/.test(d.getElementById('doc').textContent) && ${fwin(mp)}.__pwned === undefined; })()`), '...raw HTML is shown as text, and none of it runs');
check(await p.eval(`[...${fdoc(mp)}.querySelectorAll('#doc a')].map((a) => a.textContent + '>' + a.title).join() === 'link>./b.md'`), '...the link drawn');

// -- a code_editor saves the note: the panel reads the saved text again
await line(':find md/a.md', 1500);
const cp = await placeOf('code_editor');
await p.waitFor(`${fdoc(cp)}.querySelector('.cm-content') && ${view(cp)}.state.doc.toString().startsWith('# Note')`, 15000);
await p.eval(`(() => { const v = ${view(cp)}; v.dispatch({ changes: { from: 2, to: 6, insert: 'Saved' } }); return true; })()`);
await line(':w', 1000);
check(await p.waitFor(`${fdoc(mp)}.querySelector('#doc h1').textContent === 'Saved'`, 10000), 'the code_editor saves the note: the panel reads the saved text again');

// -- follow: the unsaved text and the cursor
said = await line('markdown follow', 1500);
check(/follows the code_editor/.test(said), 'markdown follow: said on the receiving side: ' + said.split('\n').pop());
check(await p.waitFor(`/^following code_editor /.test(${fdoc(mp)}.getElementById('mode').textContent)`, 5000), '...the head says it follows');
await p.eval(`(() => { const v = ${view(cp)}; v.dispatch({ changes: { from: 2, to: 7, insert: 'Unsaved' } }); return true; })()`);
check(await p.waitFor(`${fdoc(mp)}.querySelector('#doc h1').textContent === 'Unsaved'`, 5000), '...an unsaved edit in the code_editor is drawn');
check(await p.waitFor(`/●/.test(${fdoc(mp)}.getElementById('mode').textContent)`, 5000), '...and the head marks it unsaved');
// the code_editor's cursor on the table's row (line 12): the table's block is marked
await p.eval(`(() => { const v = ${view(cp)}; v.dispatch({ selection: { anchor: v.state.doc.line(12).from } }); return true; })()`);
check(await p.waitFor(`(() => { const h = ${fdoc(mp)}.querySelector('#doc > .blk.here'); return !!h && !!h.querySelector('table'); })()`, 5000), '...the block under the code_editor\'s cursor (the table) is marked');

// -- Enter in the panel: the line of the selected block in the code_editor
await press(mp, 'j');
await press(mp, 'j');
await press(mp, 'Enter');
check(await p.waitFor(`${view(cp)}.state.doc.lineAt(${view(cp)}.state.selection.main.head).number === 3`, 5000), 'j j Enter in the panel: the code_editor goes to that block\'s line (3)');

// -- the code_editor opens another file: following ends, the saved text again
// (Enter brought the code_editor forward, a moment later: typed before that, a line would go to it)
await wait(800);
await line(':w', 800);
check(await p.waitFor(`${fdoc(cp)}.getElementById('dirty').hidden`, 10000), ':w: the code_editor is saved');
await line(':e md/b.md', 1500);
check(await p.waitFor(`/^disk/.test(${fdoc(mp)}.getElementById('mode').textContent)`, 5000), 'the code_editor opens another file: the panel no longer follows, the saved text again');
check(/no longer follows .*it opened md\/b\.md/.test(await lastRecv(4)), '...said on the receiving side');
check(await p.waitFor(`${fdoc(mp)}.querySelector('#doc h1').textContent === 'Unsaved'`, 5000), '...the saved text (the edit was saved)');

// -- refused
check(/no code_editor of this skin has md\/a\.md/.test(await line('markdown follow', 1200)), 'markdown follow with no code_editor on the note: said');
check(/follows nothing/.test(await line('markdown unfollow', 800)), 'markdown unfollow when following nothing: said');
check(/markdown <path>/.test(await line('markdown')), 'markdown alone: how to write it');

done();
