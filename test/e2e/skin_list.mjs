// test/e2e/skin_list.mjs -- the skin_list panel (panels/tool/list.html?config=skin_list):
// the skins kept by skin save (~work/store/frame-skins.json of the stack's own work
// place, written here), one row each, by name: lines (empty ones), axis, ratios,
// panels, and a panel kept under an old name (code_vi) marked; Enter opens the
// skin in a new frame window; inside a frame, M-r reads it into that frame
// (skin.read), where code_vi is code_editor; a skin saved meanwhile appears.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const STORE = path.join(E2E, 'work', 'store');
fs.mkdirSync(STORE, { recursive: true });
const FILE = path.join(STORE, 'frame-skins.json');
const tag = 's' + Date.now().toString(36);
const OLD = tag + '_old';
const WIDE = tag + '_wide';
const before = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
fs.writeFileSync(FILE, JSON.stringify(Object.assign({}, before, {
  [OLD]: { name: OLD, type: 'B', axis: 'h', ratio: [1, 4], focus: '21', columns: [[['tree', 1, 1, false]], [['code_vi', 1, 1, true]]] },
  [WIDE]: { name: WIDE, type: 'D', axis: 'h', ratio: [1, 1, 1, 1], focus: '11', columns: [[['killring', 1, 1, true]], [], [], []] },
}), null, 2));

console.log('skin_list: the skins kept');
const p = await openPage(PAGES + 'panels/tool/list.html?config=skin_list');
await p.waitFor(`document.body.textContent.indexOf(${JSON.stringify(OLD)}) >= 0`, 10000);
const text = await p.eval(`document.body.textContent`);
check(text.indexOf(WIDE + '4 lines (3 empty) · axis h · 1:1:1:1 · killring | (empty) | (empty) | (empty)') >= 0 ||
      /4 lines \(3 empty\) · axis h · 1:1:1:1 · killring \| \(empty\) \| \(empty\) \| \(empty\)/.test(text), 'a row: lines, the empty ones, axis, ratios, panels');
check(/2 lines · axis h · 1:4 · tree \| code_vi\s+⚠ old name: code_vi → code_editor/.test(text), 'a panel kept under an old name is marked (code_vi → code_editor)');
check(text.indexOf(OLD) < text.indexOf(WIDE), 'by name');

// Enter: a new frame window with that skin
await p.eval(`(() => { const f = document.getElementById('filter'); f.focus(); f.value = ${JSON.stringify(WIDE)}; f.dispatchEvent(new Event('input')); return true; })()`);
await wait(300);
await p.key('Enter', 'Enter', '\r');
const w = await attachTo('skin=' + encodeURIComponent(WIDE), 10000);
await w.waitFor(`window.frameSkin && window.frameSkin.state() && window.frameSkin.state().name === ${JSON.stringify(WIDE)}`, 15000);
check((await w.eval(`window.frameSkin.state().columns.length`)) === 4, 'Enter: the skin in a new frame window (4 lines, as kept)');

// a skin saved meanwhile appears (read again every pollMs)
const LATER = tag + '_later';
const now = JSON.parse(fs.readFileSync(FILE, 'utf8'));
now[LATER] = { name: LATER, type: 'A', axis: 'v', ratio: [1], columns: [[['tree', 1, 1, true]]] };
fs.writeFileSync(FILE, JSON.stringify(now, null, 2));
await p.eval(`(() => { const f = document.getElementById('filter'); f.value = ''; f.dispatchEvent(new Event('input')); return true; })()`);
await p.waitFor(`document.body.textContent.indexOf(${JSON.stringify(LATER)}) >= 0`, 8000);
check(/1 line · axis v · 1 · tree/.test(await p.eval(`document.body.textContent`)), 'a skin saved meanwhile appears');

// inside a frame, M-r reads the skin into it (skin.read): code_vi is code_editor there
const f = await openPage(PAGES + 'panels/skins/frame.html');
await f.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
await f.eval(`document.getElementById('line').focus(); true`);
await f.send('Input.insertText', { text: 'skin add skin_list' });
await f.key('Enter', 'Enter', '\r');
await f.waitFor(`window.frameSkin.frameAt('11') && window.frameSkin.frameAt('11').contentDocument.body.textContent.indexOf(${JSON.stringify(OLD)}) >= 0`, 15000);
await f.eval(`(() => { const d = window.frameSkin.frameAt('11').contentDocument; const fl = d.getElementById('filter'); window.frameSkin.frameAt('11').contentWindow.focus(); fl.focus(); fl.value = ${JSON.stringify(OLD)}; fl.dispatchEvent(new Event('input')); return true; })()`);
await wait(300);
await f.key('r', 'KeyR', '', 1);
await f.waitFor(`window.frameSkin.state().name === ${JSON.stringify(OLD)}`, 10000);
const st = JSON.parse(await f.eval(`JSON.stringify(window.frameSkin.state())`));
const got = JSON.stringify(st.columns.map((c) => c.map((x) => (Array.isArray(x) ? x[0] : x.panel)))) + ' ' + st.ratio.join(':');
check(got === '[["tree"],["code_editor"]] 1:4', 'M-r: the frame reads it (skin.read) ── code_vi read as code_editor, ratios 1:4 -- ' + got);

const errs = [p, w, f].flatMap((x) => x.logs.filter((l) => /exception/.test(l)));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
done();
