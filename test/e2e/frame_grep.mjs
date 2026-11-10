// test/e2e/frame_grep.mjs -- a list window the frame opened (the grep list of
// the input form's :grep, the :LspRefs list of a code_editor panel) opens a file
// nobody has in a code_editor panel of that frame, not a new window
// (code-locate.js pageEnv looks at the opener). Once the frame is
// closed, the list falls back to a new code_editor window. Real
// typescript-language-server and ripgrep.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const CDP = 'http://127.0.0.1:' + (process.env.CDP_PORT || '9223');
const dir = path.join(E2E, 'fsroot', 'fg');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const A = "import { helper } from './b.js';\nconsole.log(helper(1));\n";
const B = 'export function helper(x) {\n  return x + 1;\n}\n';
const C = "import { helper } from './b.js';\n\nexport const two = helper(1);\n";
fs.writeFileSync(path.join(dir, 'a.js'), A);
fs.writeFileSync(path.join(dir, 'b.js'), B);
fs.writeFileSync(path.join(dir, 'c.js'), C);
fs.writeFileSync(path.join(dir, 'jsconfig.json'), '{ "include": ["*.js"] }\n');
const pages = async () => (await (await fetch(CDP + '/json/list')).json()).filter((t) => t.type === 'page');
const codeWindows = async () => (await pages()).filter((t) => /code_editor\.html/.test(t.url)).length;

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(300);
}
const st = async () => JSON.parse(await p.eval(`JSON.stringify(window.frameSkin.state())`));
const names = (s) => s.columns.map((c) => c.map((x) => x[0]));
const view = (place) => `(() => { const f = window.frameSkin.frameAt('${place}'); const c = f && f.contentDocument.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;
const cursorAt = (place) => p.eval(`(() => { const v = ${view(place)}; const h = v.state.selection.main.head; const l = v.state.doc.lineAt(h); return JSON.stringify([l.number, h - l.from + 1]); })()`);
// click the list row whose text matches
const pick = (L, re) => L.eval(`(() => { const li = [...document.querySelectorAll('#list li')].find((x) => ${re}.test(x.innerText)); if (!li) return false; li.click(); return true; })()`);

console.log('frame + list windows');
await line('skin main 1');
await line(':find fg/b.js');
await p.waitFor(`${view('11')} && ${view('11')}.state.doc.toString() === ${JSON.stringify(B)}`, 15000);
await p.waitFor(`/lsp javascript/.test(window.frameSkin.frameAt('11').contentDocument.getElementById('msg').textContent)`, 25000);
await wait(800);
const cw0 = await codeWindows();

// :grep in the input form -> the grep list window; Enter on a.js (open nowhere) -> a panel of the frame
await line(':grep "helper\\(1\\)" fg');
const G = await attachTo('config=locations&grep=');
await G.waitFor(`document.querySelectorAll('#list li').length >= 2`, 10000);
check(/fg\/a\.js:2/.test(await G.eval(`document.getElementById('list').innerText`)), ':grep from the frame lists fg/a.js:2 in a list window');
check(await pick(G, /fg\/a\.js:2/), '...Enter on fg/a.js:2');
await p.waitFor(`window.frameSkin.frameAt('12') && ${view('12')} && ${view('12')}.state.doc.toString() === ${JSON.stringify(A)}`, 15000);
await p.waitFor(`(() => { const v = ${view('12')}; return v.state.doc.lineAt(v.state.selection.main.head).number === 2; })()`, 8000);
check(JSON.stringify(names(await st())) === '[["code_editor","code_editor"]]', '...opens a.js as a code_editor panel of the frame (12): ' + JSON.stringify(names(await st())));
check(JSON.parse(await cursorAt('12'))[0] === 2, '...at line 2');
check((await codeWindows()) === cw0, '...no new code_editor window');
// the same row again: the panel that has it, still no window
await line('skin focus 1 1');
check(await pick(G, /fg\/a\.js:2/), '...Enter on it again');
await p.waitFor(`window.frameSkin.state().focus === '12'`, 8000);
check(names(await st())[0].length === 2 && (await st()).focus === '12' && (await codeWindows()) === cw0, '...goes to that panel (12), nothing added');

// :LspRefs in the code_editor panel (no lsp_log here) -> the refs list window (its opener is the panel);
// Enter on c.js (open nowhere) -> a panel of the frame
await line('skin focus 1 1');
await p.eval(`(() => { const v = ${view('11')}; const i = v.state.doc.toString().indexOf('helper'); v.dispatch({ selection: { anchor: i + 1 } }); return true; })()`);
await line(':LspRefs');
const R = await attachTo('config=locations&from=');
await R.waitFor(`/fg\\/c\\.js/.test(document.getElementById('list').innerText)`, 15000);
check(/fg\/c\.js:3/.test(await R.eval(`document.getElementById('list').innerText`)), ':LspRefs in the panel lists fg/c.js:3 in a list window');
check(await pick(R, /fg\/c\.js:3/), '...Enter on fg/c.js:3');
await p.waitFor(`window.frameSkin.frameAt('13') && ${view('13')} && ${view('13')}.state.doc.toString() === ${JSON.stringify(C)}`, 15000);
check(JSON.stringify(names(await st())) === '[["code_editor","code_editor","code_editor"]]' && (await codeWindows()) === cw0,
  '...opens c.js as a code_editor panel of the frame (13), no new window');

// the frame closed: the grep list falls back to a new code_editor window
fs.writeFileSync(path.join(dir, 'd.js'), 'export const d = helper(1);\n');
await line(':grep "const d" fg');
const G2 = await attachTo('grep=const');
await G2.waitFor(`/fg\\/d\\.js/.test(document.getElementById('list').innerText)`, 10000);
const errs = [p, G, R].flatMap((pg) => pg.logs.filter((l) => /exception/.test(l)));
await p.close();
await wait(500);
// a real key this time: a new window needs the person's gesture (a click() from eval is not one)
await G2.eval(`document.getElementById('filter').focus(); true`);
await G2.send('Input.insertText', { text: 'd.js' });
await wait(300);
await G2.key('Enter', 'Enter', '\r');
const said = await G2.waitFor(`/in a new code_editor/.test(document.body.innerText)`, 15000);
check(!!said && (await codeWindows()) === cw0 + 1, 'the frame closed: Enter on fg/d.js:1 opens a new code_editor window (as before)' +
  (said ? '' : ': ' + JSON.stringify((await G2.eval('document.body.innerText')).slice(-200))));

check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
for (const pg of [G, R, G2]) await pg.close();
for (const t of (await pages()).filter((t) => /code_editor\.html\?path=fg/.test(t.url))) await fetch(CDP + '/json/close/' + t.id);
done();
