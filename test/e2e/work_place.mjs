// test/e2e/work_place.mjs -- the work place and what stands on it:
// `:Scratch` writes the code_editor's text over ~work/scratch (the file here
// untouched), `:Diff` shows it against the file on disk in a code_diff panel
// (headers: path and time; read again when one of the two is saved),
// `diff -f A,B` puts two files into that panel, `diff -n A,B` adds another;
// `check update` says when the disk is no longer what the code_editor opened;
// a file of the work place gets no language server.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'wp');
const work = path.join(E2E, 'work');
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\nthree\n');
fs.writeFileSync(path.join(dir, 'b.txt'), 'one\n2\nthree\nfour\n');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const lastRecv = (n = 3) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 300) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const view = (place) => `(() => { const c = window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const docOf = (place) => p.eval(`${view(place)}.state.doc.toString()`);
const headOf = (place) => p.eval(`window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument.getElementById('head').innerText`);
const diffDoc = (place) => `window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument`;
const diffHead = (place) => p.eval(`[${diffDoc(place)}.getElementById('ha').textContent, ${diffDoc(place)}.getElementById('hb').textContent].join(' || ')`);
const diffFoot = (place) => p.eval(`${diffDoc(place)}.getElementById('foot').textContent`);
const sides = (place) => p.eval(`JSON.stringify([...${diffDoc(place)}.querySelectorAll('.cm-mergeViewEditor .cm-content')].map((c) => ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)).state.doc.toString()))`).then(JSON.parse);

console.log('the work place: :Scratch, :Diff, diff -n / -f, check update');
await line(':find wp/a.txt');
await p.waitFor(`window.frameSkin.frameAt('11') && window.frameSkin.frameAt('11').contentDocument.querySelector('.cm-content') && ${view('11')}.state.doc.toString() === 'one\\ntwo\\nthree\\n'`, 15000);
await wait(500);

// -- :Scratch: the text here over ~work/scratch, the file untouched
await p.eval(`(() => { const v = ${view('11')}; v.dispatch({ changes: { from: 0, insert: 'ZERO\\n' } }); return true; })()`);
await line(':Scratch', 600);
check(fs.existsSync(path.join(work, 'scratch')) && fs.readFileSync(path.join(work, 'scratch'), 'utf8') === 'ZERO\none\ntwo\nthree\n',
  ':Scratch writes the text of the code_editor over ~work/scratch (the relay made the work place)');
check(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8') === 'one\ntwo\nthree\n' && /wp\/a\.txt/.test(await headOf('11')),
  '...the file here is untouched, and the code_editor still has it: ' + JSON.stringify((await headOf('11')).slice(0, 120)));
check(!fs.existsSync(path.join(E2E, 'fsroot', '~work')), '...and nothing of it is under the FS root');

// -- :Diff: the scratch against the file on disk, in a code_diff added here
await p.eval(`(() => { const v = ${view('11')}; v.dispatch({ changes: { from: v.state.doc.length, insert: 'four\\n' } }); return true; })()`);
await line(':Diff', 800);
await p.waitFor(`window.frameSkin.frameAt('12') && ${diffDoc('12')}.querySelectorAll('.cm-mergeViewEditor .cm-content').length === 2`, 15000);
check((await st()).columns[0].map((x) => x[0]).join(',') === 'code_editor,code_diff', ':Diff adds a code_diff panel under the code_editor (12)');
let two = await sides('12');
check(two[0] === 'ZERO\none\ntwo\nthree\nfour\n' && two[1] === 'one\ntwo\nthree\n', '...left: what the code_editor holds (through the scratch), right: the file on disk');
check(/^~work\/scratch · \d{4}-\d\d-\d\d \d\d:\d\d:\d\d \|\| wp\/a\.txt · \d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(await diffHead('12')), '...each side headed by its path and when it was saved: ' + await diffHead('12'));
check(/2 changes/.test(await diffFoot('12')), '...and the changes are counted: ' + await diffFoot('12'));
check(/@1 2/.test(await lastRecv(4)), "...the frame's line points at the code_diff (@1 2)");
check(await p.eval(`!!${diffDoc('12')}.querySelector('.cm-changedLine, .cm-changedText, .cm-deletedChunk, .cm-insertedLine')`), '...the differences are marked');
check(await p.eval(`${diffDoc('12')}.querySelector('.cm-content').getAttribute('contenteditable') === 'false'`), '...read only');

// -- the code_editor saves: the code_diff reads both again (code.saved), no difference left
await line(':w', 600);
await p.waitFor(`/no difference/.test(${diffDoc('12')}.getElementById('foot').textContent)`, 10000);
two = await sides('12');
check(two[0] === two[1] && two[1] === 'ZERO\none\ntwo\nthree\nfour\n', 'the code_editor saved: the code_diff read both again, no difference: ' + await diffFoot('12'));

// -- diff -f A,B into the code_diff there; diff -n A,B adds another
check(/in the code_diff at 1 2/.test(await line('diff -f wp/a.txt,wp/b.txt', 600)), 'diff -f: the two files go into the code_diff here');
await p.waitFor(`/^wp\\/a\\.txt · .* \\|\\| wp\\/b\\.txt · /.test([${diffDoc('12')}.getElementById('ha').textContent, ${diffDoc('12')}.getElementById('hb').textContent].join(' || '))`, 10000);
two = await sides('12');
check(two[1] === 'one\n2\nthree\nfour\n', '...and it shows them: ' + await diffHead('12'));
await line('skin focus 1 1');
check(/added at 1 3/.test(await line('diff -n wp/b.txt,./a.txt', 800)), 'diff -n: another code_diff (13); ./ is from the file of the code_editor meant now');
await p.waitFor(`window.frameSkin.frameAt('13') && ${diffDoc('13')}.querySelectorAll('.cm-mergeViewEditor .cm-content').length === 2`, 15000);
check(/^wp\/b\.txt · .* \|\| wp\/a\.txt · /.test(await diffHead('13')), '...showing b | a: ' + await diffHead('13'));
check(/the same file twice/.test(await line('diff -n wp/a.txt,wp/a.txt')), 'the same file twice is refused');
check(/diff -n A,B/.test(await line('diff wp/a.txt')), 'a diff line that cannot be read: how to write it');
// a file that is not there reads as empty, and its header says so
await line('diff -f wp/a.txt,wp/none.txt', 800);
await p.waitFor(`/not on the disk/.test(${diffDoc('13')}.getElementById('hb').textContent)`, 10000);
check(/wp\/none\.txt · not on the disk/.test(await diffHead('13')), 'a file that is not on the disk: said in its header, compared as empty');

// -- check update: nothing watches the disk; asked, the code_editor says it is not what it opened
await line('skin focus 1 1');
check(/wp\/a\.txt \(1 1\): the disk is what was opened/.test(await line('check update', 800)), 'check update: the disk is what the code_editor opened');
fs.writeFileSync(path.join(dir, 'a.txt'), 'changed outside\n');
await wait(300);
check((await docOf('11')) === 'ZERO\none\ntwo\nthree\nfour\n', 'the file changed outside tezcatl: the code_editor does not know (nothing watches)');
const said = await line('check update', 1000);
check(/! check update ── wp\/a\.txt \(1 1\): changed on the disk/.test(said) && /@1 1/.test(said), 'check update: said on the receiving side, with the code_editor as reference: ' + said.split('\n').slice(-1)[0]);
check(/changed after it was opened/.test(await headOf('11')), '...and in the head of the code_editor');
// file.changed went out: the code_diff showing that file read it again
await p.waitFor(`/read again \\(file\\.changed\\)/.test(${diffDoc('12')}.getElementById('foot').textContent)`, 10000);
check((await sides('12'))[0] === 'changed outside\n', '...file.changed was said: the code_diff showing wp/a.txt read it again');
await line(':e', 800);
await p.waitFor(`${view('11')}.state.doc.toString() === 'changed outside\\n'`, 10000);
check(/the disk is what was opened/.test(await line('check update', 800)), ':e reads it again; check update: the same again');
check(/2 code_editor|1 code_editor, 0 not what the disk has/.test(await line('check update all', 1000)), 'check update all: every code_editor of the frame, counted: ' + (await lastRecv(1)));
fs.unlinkSync(path.join(dir, 'a.txt'));
check(/gone from the disk/.test(await line('check update', 1000)), 'a file deleted outside: check update says it is gone');

// -- a file of the work place: opened as any file, no language server
fs.mkdirSync(path.join(work, 'clone', 'wp'), { recursive: true });
fs.writeFileSync(path.join(work, 'clone', 'wp', 't.js'), 'const x = 1;\n');
const c = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent('~work/clone/wp/t.js') + '&name=wp-clone');
const VIEW = `(() => { const c = document.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
await c.waitFor(`document.querySelector('.cm-content') && ${VIEW}.state.doc.toString() === 'const x = 1;\\n'`, 15000);
await wait(2500);
const chead = await c.eval(`document.getElementById('head').innerText`);
check(/~work\/clone\/wp\/t\.js/.test(chead) && !/lsp /.test(chead), 'a file of the work place opens in code_editor, with no language server: ' + JSON.stringify(chead.slice(0, 100)));
await c.eval(`(() => { const v = ${VIEW}; v.dispatch({ changes: { from: 0, insert: '// edited\\n' } }); return true; })()`);
await c.eval(`(() => { const v = ${VIEW}; v.focus(); return true; })()`);
await p.eval(`window.Tezcatl.bus.post('code.file', { op: 'write', arg: '', bang: false }, { to: ${JSON.stringify(await c.eval('window.Tezcatl.bus.self.id'))} }); true`);
await wait(800);
check(fs.readFileSync(path.join(work, 'clone', 'wp', 't.js'), 'utf8') === '// edited\nconst x = 1;\n', '...and :w saves it there');
await c.close();
await p.close();
done();
