// test/e2e/frame_go_on.mjs -- the references of the frame's receiving side and `go on`:
// a line about a panel or a place in a file carries it (shown as @21,
// @path:line), `go on` goes to the last one -- a panel is focused, a place is
// code.open-at's -- whatever was done in between; go.on from the palette does the same.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'go');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\nthree\nfour\n');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const lastRecv = (n = 3) => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(text, ms = 200) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
const refsShown = () => p.eval(`JSON.stringify([...document.querySelectorAll('#recv .ref')].map((s) => s.textContent.trim()))`).then(JSON.parse);
const codeView = (place) => `(() => { const c = window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const lineOf = (place) => p.eval(`(() => { const v = ${codeView(place)}; return v.state.doc.lineAt(v.state.selection.main.head).number; })()`);

console.log('frame: references and go on');
check(/no line with a reference/.test(await line('go on')), 'go on with nothing to go to says so');
check(/go on \(to the panel or place/.test(await line('go there')), 'go <anything else>: how to write it');

await line('skin main 1,2');
await line('skin add 1 tree');
check(JSON.stringify(await refsShown()) === '["@1 1"]', 'skin add: its line points at the panel added (@1 1): ' + JSON.stringify(await refsShown()));
await line('skin add 2 killring');
check((await st()).focus === '21', '...then another panel is added and focused (21)');
await line('skin focus 1 1');
check((await st()).focus === '11', '...and the focus is taken elsewhere (11)');
check(/go on ── 2 1 killring/.test(await line('go on')) && (await st()).focus === '21', 'go on: back to the panel the last reference points at (21)');
check(await p.eval(`document.activeElement === window.frameSkin.frameAt('21')`), '...with the keyboard in it');
check(/go on ── 2 1 killring/.test(await line('go on')), 'go on again goes to the same one (its own line carries no reference)');

// a panel moved since: the reference is the panel, not the place it was at
await line('skin add 2 commands');
await line('skin switch ver 1 2 2');
await line('skin focus 1 1');
check(/go on ── 2 1 commands/.test(await line('go on')) && (await st()).focus === '21', 'a panel moved by skin switch: go on follows the panel (commands, now 21)');
await line('skin del commands');
check(/that panel is closed/.test(await line('go on')), 'the panel closed since: go on says so');

// a place in a file: :find adds a code_editor here (its line points at that panel) ...
await line(':find go/a.txt:3', 400);
await p.waitFor(`window.frameSkin.frameAt('22') && window.frameSkin.frameAt('22').contentDocument.querySelector('.cm-content')`, 15000);
await p.waitFor(`/added a code_editor at 2 2/.test(document.getElementById('recv').textContent)`, 20000);
check((await refsShown()).slice(-1)[0] === '@2 2' && await lineOf('22') === 3, ':find of a file nobody has: a code_editor panel at line 3, the line points at it (@2 2)');
// ... and once it is open, :find points at the place
await line(':find go/a.txt:2', 1200);
check((await refsShown()).slice(-1)[0] === '@go/a.txt:2' && await lineOf('22') === 2, ':find of an open file: the line points at the place (@go/a.txt:2)');
await p.eval(`(() => { const v = ${codeView('22')}; v.dispatch({ selection: { anchor: v.state.doc.line(4).from } }); return true; })()`);
await line('skin focus 1 1');
check(await lineOf('22') === 4 && (await st()).focus === '11', '...the cursor moved to line 4, the focus elsewhere');
await line('go on', 1200);
check(/go on ── go\/a\.txt:2 ── to the code_editor that has it/.test(await lastRecv()) && await lineOf('22') === 2 && (await st()).focus === '22',
  'go on: to that place again (code.open-at: the code_editor that has it, line 2)');

// go.on as a tezcatl-command (the palette, another window)
await p.eval(`(() => { const v = ${codeView('22')}; v.dispatch({ selection: { anchor: v.state.doc.line(1).from } }); return true; })()`);
await p.eval(`Tezcatl.commands.invoke('go.on', {}); true`);
await wait(1200);
check(await lineOf('22') === 2, 'go.on (tezcatl-command) does the same');

done();
