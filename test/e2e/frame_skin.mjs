// test/e2e/frame_skin.mjs -- the frame (panels/skins/frame.html,
// it starts empty as workspace_N, the `skin ...` lines of
// its input form build the layout and are answered on the receiving side, a
// panel moved by `skin switch` is not reloaded, the leave key in a panel
// comes to the input form, ":" alone (skin focus abs) goes on to the map
// (panel_abstract) where hjkl / the arrows move the focus and Enter goes into
// the panel, the window is named after its skin, `skin save` / `skin read` /
// ?skin= keep and open a skin, and a reload keeps this window's skin.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'fr');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'alpha\n');
fs.writeFileSync(path.join(dir, 'b.txt'), 'beta\n');
const disk = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const URL0 = PAGES + 'panels/skins/frame.html';
const SKIN = 'e2e-' + Date.now().toString(36);

const p = await openPage(URL0);
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const names = (s) => s.columns.map((c) => c.map((x) => x[0]));
const lastRecv = () => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-3).map((d) => d.textContent).join('\\n'); })()`);
// a line typed in the input form and sent with Enter -> what came back
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(150);
  return lastRecv();
}
// a key in the input form (empty line)
async function formKey(key, code, modifiers = 0) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.key(key, code, '', modifiers);
  await wait(100);
}
// a key wherever the keyboard is (the map)
async function key(k, code) {
  await p.key(k, code, '');
  await wait(150);
}
// the map's boxes: [place, focused]
const map = () => p.eval(`JSON.stringify([...window.frameSkin.abs().contentDocument.querySelectorAll('.cell')].map((c) => [c.textContent, c.classList.contains('focused')]))`).then(JSON.parse);
const box = (place) => p.eval(`(() => {
  const el = window.frameSkin.frameAt(${JSON.stringify(place)}).parentNode; const st = document.getElementById('stage').getBoundingClientRect(); const r = el.getBoundingClientRect();
  return [r.left - st.left, r.top - st.top, r.width, r.height].map((v, i) => Math.round(100 * v / (i % 2 ? st.height : st.width)));
})()`);

console.log('frame skin');
const s0 = await st();
check(/^workspace_\d+$/.test(s0.name) && s0.type === 'A' && JSON.stringify(names(s0)) === '[[]]', 'starts empty as workspace_N (A): ' + s0.name);
check(await p.eval(`Tezcatl.bus.whoami().name`) === s0.name && (await p.eval(`document.title`)).endsWith(s0.name), '...and that is the name of the window (the bus, the title)');
check(/empty\./.test(await p.eval(`document.getElementById('recv').textContent`)), '...and the receiving side says how to add a panel');

check(/C \(1 : 2 : 1\)/.test(await line('skin main 1,2,1')), 'skin main 1,2,1 -> C');
await line('skin add 2 killring');
await line('skin add 2 tree');
await line('skin add 2 input');
check(/column 2 \(1 : 2 : 1\)/.test(await line('skin sub 1,2,1')), 'skin sub 1,2,1 in the focused column (2)');
check(JSON.stringify(names(await st())) === '[[],["killring","tree","input"],[]]', 'skin add put killring, tree, input in column 2');
check(JSON.stringify(await box('22')) === '[25,25,50,50]', '...tree (22) is the middle half: ' + JSON.stringify(await box('22')));
check(/no such panel: nosuch/.test(await line('skin add 1 nosuch')), 'an unknown panel is refused, on the receiving side');
check(/start with skin, block or thema/.test(await line('set 1.1 tree')), 'the old commands are gone');

// switch hor moves whole columns without reloading their panels
await p.waitFor(`window.frameSkin.frameAt('22').contentDocument && window.frameSkin.frameAt('22').contentDocument.getElementById('tree')`, 10000);
await p.eval(`window.frameSkin.frameAt('22').contentWindow.__mark = 42; true`);
await line('skin add 3 code_editor');
check(/column 2 ⇄ column 3/.test(await line('skin switch hor 2 3')), 'skin switch hor 2 3');
const s1 = await st();
check(JSON.stringify(names(s1)) === '[[],["code_editor"],["killring","tree","input"]]' && JSON.stringify(s1.ratio) === '[1,2,1]', '...whole columns changed places; the widths stayed');
check(await p.eval(`window.frameSkin.frameAt('32').contentWindow.__mark`) === 42, '...the tree was not reloaded');
check(/column 3: 1 ⇄ 3/.test(await line('skin switch ver 1 3 3')), 'skin switch ver 1 3 3 (column given)');
check(JSON.stringify(names(await st())[2]) === '["input","tree","killring"]', '...rows 1 and 3 of column 3 changed places');

// the focus from the map (panel_abstract): ":" alone goes there, hjkl / arrows move, Enter goes in
await line('skin focus 2 1');
check((await st()).focus === '21', 'skin focus 2 1');
await formKey('L', 'KeyL', 8);
check((await st()).focus === '21', 'Shift+L in the input form no longer moves the focus');
await line(':');
check(await p.eval(`document.activeElement === window.frameSkin.abs()`), '":" alone (skin focus abs) goes to the map');
check(JSON.stringify(await map()) === '[["2 1",true],["3 1",false],["3 2",false],["3 3",false]]', '...which shows the panels, the focused one marked: ' + JSON.stringify(await map()));
await key('l', 'KeyL');
check((await st()).focus === '31', 'l in the map: right -> 31');
await key('ArrowDown', 'ArrowDown');
check((await st()).focus === '32' && (await map())[2][1], 'ArrowDown -> 32, and the map follows');
await key('h', 'KeyH');
check((await st()).focus === '21', 'h: left -> 21 (column 2 has one: the nearest)');
check(await p.eval(`document.activeElement === window.frameSkin.abs()`), '...the keyboard stays in the map');
await key('Enter', 'Enter');
await wait(200);
check(await p.eval(`document.activeElement === window.frameSkin.frameAt('21')`), 'Enter in the map goes into the focused panel (code_editor)');
await p.key('Escape', 'Escape', '');
await p.key('Escape', 'Escape', '');
await wait(300);
await line('skin focus abs');
await p.key('Escape', 'Escape', '');
await p.key('Escape', 'Escape', '');
await wait(300);
check(await p.eval(`document.activeElement === document.getElementById('line')`), 'the leave key (Esc Esc) in the map comes to the input form');
check(/the nearest/.test(await line('skin focus 2 3')) && (await st()).focus === '21', 'skin focus 2 3 (empty) -> the nearest, 2 1');
await formKey('Enter', 'Enter');
await wait(200);
check(await p.eval(`document.activeElement === window.frameSkin.frameAt('21')`), 'Enter on an empty line goes into the focused panel (code_editor)');
// the leave key in that panel comes back to the input form
await p.key('Escape', 'Escape', '');
await p.key('Escape', 'Escape', '');
await wait(300);
check(await p.eval(`document.activeElement === document.getElementById('line')`), 'the leave key (Esc Esc) in a panel comes to the input form');

// del
check(/closed killring at /.test(await line('skin del killring')), 'skin del killring');
check(/there is no panel at 3 3/.test(await line('skin del 3 3')), 'skin del 3 3: nothing there now');
check(await p.eval(`document.querySelectorAll('.pane').length`) === 3, '...its iframe is gone');

// the wiring: a tree in the frame opens a file in the frame's code_editor; ":" lines go to it; `:#` comes back
const codeView = (place) => `(() => { const c = window.frameSkin.frameAt(${JSON.stringify(place)}).contentDocument.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const fromTree = (place, type, payload) => p.eval(`window.frameSkin.frameAt(${JSON.stringify(place)}).contentWindow.Tezcatl.bus.post(${JSON.stringify(type)}, ${JSON.stringify(payload)}); true`);
const recvText = () => p.eval(`document.getElementById('recv').textContent`);
check(JSON.stringify(names(await st())) === '[[],["code_editor"],["input","tree"]]', 'the frame now: code_editor in 21, tree in 32');
await p.waitFor(`window.frameSkin.frameAt('21').contentWindow.Tezcatl && window.frameSkin.frameAt('21').contentDocument.querySelector('.cm-content')`, 15000);
await wait(500);
await fromTree('32', 'code.open', { path: 'fr/a.txt' });
await p.waitFor(`${codeView('21')}.state.doc.toString() === 'alpha\\n'`, 10000);
check((await st()).focus === '21' && await p.eval(`document.activeElement === window.frameSkin.frameAt('21')`), "the tree's Enter (code.open) opens fr/a.txt in the frame's code_editor, and goes into it");
await p.eval(`(() => { const v = ${codeView('21')}; v.dispatch({ changes: { from: 0, insert: 'ALPHA ' } }); return true; })()`);
await wait(300);
await fromTree('32', 'code.open', { path: 'fr/b.txt' });
await p.waitFor(`window.frameSkin.frameAt('22') && ${codeView('22')}.state.doc.toString() === 'beta\\n'`, 15000);
check(JSON.stringify(names(await st())[1]) === '["code_editor","code_editor"]' && (await st()).focus === '22' &&
  (await p.eval(`${codeView('21')}.state.doc.toString()`)).startsWith('ALPHA'),
  'another file over unsaved edits: one more code_editor (skin add under it, 22) opens it; the edits in 21 stay (A3)');
await line('skin focus 2 1');
await line(':w');
await wait(600);
check(disk('a.txt') === 'ALPHA alpha\n', "the input form's :w saves the focused code_editor (21)");
await fromTree('32', 'code.open', { path: 'fr/b.txt' });
await wait(200);
check(/to the code_editor that has it \(2 2\)/.test(await recvText()) && (await st()).focus === '22', 'the same file again goes to the code_editor that has it (22)');
// :find of a file nobody has: a code_editor panel here, at the line
fs.writeFileSync(path.join(dir, 'c.txt'), 'one\ntwo\nthree\n');
await line(':find fr/c.txt:2');
await p.waitFor(`window.frameSkin.frameAt('23') && ${codeView('23')}.state.doc.toString() === 'one\\ntwo\\nthree\\n'`, 15000);
await wait(300);
check(await p.eval(`(() => { const v = ${codeView('23')}; return v.state.doc.lineAt(v.state.selection.main.head).number; })()`) === 2 && (await st()).focus === '23',
  ':find fr/c.txt:2 adds a code_editor panel (23) at line 2, not a new window');
await line('skin del 2 3');
// code_editor's :# -> the input form with the text; sending goes back
await p.eval(`(() => { const w = window.frameSkin.frameAt('21').contentWindow; w.Tezcatl.bus.post('cmd.focus', { name: w.Tezcatl.bus.self.name, text: ':12' }); return true; })()`);
await wait(300);
check(await p.eval(`document.activeElement === document.getElementById('line') && document.getElementById('line').value === ':12'`), "code_editor's :# comes to the input form with its text");
await p.key('Enter', 'Enter', '\r');
await wait(300);
check(await p.eval(`document.activeElement === window.frameSkin.frameAt('21')`), '...and sending goes back to code_editor');
// skin add goes into the new panel
await line('skin add 1 bookmarks');
await wait(300);
check(await p.eval(`document.activeElement === window.frameSkin.frameAt('11')`), 'skin add goes into the new panel');
await line('skin del 1 1');

// name / save / read, and another window
await line('skin name ' + SKIN);
const saved = await line('skin save');
check(new RegExp('saved "' + SKIN + '"').test(saved) && /"type":"C"/.test(saved), 'skin save keeps it (and shows the JSON)');
const q = await openPage(URL0 + '?skin=' + encodeURIComponent(SKIN));
await q.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const qs = await q.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
check(qs.name === SKIN && JSON.stringify(names(qs)) === JSON.stringify(names(await st())), 'frame.html?skin=<name> opens it in another window');
await q.eval(`window.frameSkin.run('skin read nosuch-${SKIN}'); true`);
check(!!(await q.waitFor(`/no saved skin/.test(document.getElementById('recv').textContent)`, 5000)), 'skin read of an unknown name says so');

// a skin from a file: local/skins/<name>.json -- a person's own, not in git -- when none is saved by that name
const LOCAL = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'local', 'skins');
const FILE_SKIN = 'e2e-file-' + Date.now().toString(36);
fs.mkdirSync(LOCAL, { recursive: true });
fs.writeFileSync(path.join(LOCAL, FILE_SKIN + '.json'), JSON.stringify({ name: FILE_SKIN, type: 'B', ratio: [1, 1], focus: '11', columns: [[['tree', 1, 1, true]], [['killring', 1, 1, false]]] }));
await q.eval(`window.frameSkin.run('skin read ${FILE_SKIN}'); true`);
await q.waitFor(`/read .*local\\/skins\\/${FILE_SKIN}\\.json/.test(document.getElementById('recv').textContent)`, 5000);
const fsk = await q.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
check(fsk.name === FILE_SKIN && JSON.stringify(names(fsk)) === JSON.stringify([['tree'], ['killring']]), 'skin read finds local/skins/<name>.json');
const r2 = await openPage(URL0 + '?skin=' + encodeURIComponent(FILE_SKIN));
await r2.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
check(JSON.stringify(names(await r2.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse))) === JSON.stringify([['tree'], ['killring']]), '...and frame.html?skin=<name> too');
await r2.close();
fs.rmSync(path.join(LOCAL, FILE_SKIN + '.json'));

// a reload keeps this window's skin
const before = JSON.stringify(names(await st()));
await p.send('Page.reload', {});
await wait(500);
await p.waitFor(`window.frameSkin && /ready/.test(document.getElementById('recv').textContent)`, 15000);
check(JSON.stringify(names(await st())) === before && (await st()).name === SKIN, 'a reload keeps the skin (this window)');

const errs = [p, q].flatMap((pg) => pg.logs.filter((l) => /exception/.test(l)));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await q.eval(`Tezcatl.store.update('tezcatl:frame:skins', (m) => { m = m || {}; delete m[${JSON.stringify(SKIN)}]; return m; }).then(() => true)`);
await p.close();
await q.close();
done();
