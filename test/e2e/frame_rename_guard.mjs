// test/e2e/frame_rename_guard.mjs -- a :LspRename reaching other files, in the
// frame, when it must not go through:
//   -  one code_editor refuses its part (here: read-only) -> the ones that
//             applied theirs take them back, this file is not touched
//   -  a file whose copy was left by a code_editor closed unsaved -> refused
//             before anything opens (editing it would overwrite the copy);
//             file_changes lists it with how to tidy up; `d d` there throws the
//             copy away (POST /mirror/drop); the rename then goes through
// Real typescript-language-server.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const RELAY = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
const ORIGIN = 'http://127.0.0.1:' + (process.env.PAGES_PORT || '4021');
const dir = path.join(E2E, 'fsroot', 'rg');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const B = 'export function helper(x) {\n  return x + 1;\n}\n';
const A = "import { helper } from './b.js';\nconsole.log(helper(1));\n";
const C = "import { helper } from './b.js';\nexport const c = helper(3);\n";
fs.writeFileSync(path.join(dir, 'b.js'), B);
fs.writeFileSync(path.join(dir, 'a.js'), A);
fs.writeFileSync(path.join(dir, 'c.js'), C);
fs.writeFileSync(path.join(dir, 'jsconfig.json'), '{ "include": ["*.js"] }\n');
const disk = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const slots = async () => ((await (await fetch(RELAY + '/mirror/list')).json()).slots || []);
// a copy of rg/ left closed unsaved by an earlier run cut short would refuse this run's renames (A12): thrown away first
for (const s of (await slots()).filter((x) => /^rg\//.test(x.path))) {
  await fetch(RELAY + '/mirror/drop?path=' + encodeURIComponent(s.path), { method: 'POST', headers: { origin: ORIGIN } });
}

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(300);
}
const view = (place) => `(() => { const f = window.frameSkin.frameAt('${place}'); const c = f && f.contentDocument.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;
const msgAt = (place) => p.eval(`window.frameSkin.frameAt('${place}').contentDocument.getElementById('msg').textContent`);
const docAt = (place) => p.eval(`${view(place)} ? ${view(place)}.state.doc.toString() : null`);
const putCursor = (place, word) => p.eval(`(() => { const v = ${view(place)}; const i = v.state.doc.toString().indexOf(${JSON.stringify(word)}); v.dispatch({ selection: { anchor: i + 1 } }); return i; })()`);
const lspUp = (place) => p.waitFor(`/lsp javascript/.test(window.frameSkin.frameAt('${place}').contentDocument.getElementById('msg').textContent)`, 25000);
const state = async () => JSON.parse(await p.eval(`JSON.stringify(window.frameSkin.state())`));
// the place (e.g. "12") of the code_editor showing `file`
async function placeOf(file) {
  const st = await state();
  for (let ci = 0; ci < st.columns.length; ci++) {
    for (let ri = 0; ri < st.columns[ci].length; ri++) {
      if (st.columns[ci][ri][0] !== 'code_editor') continue;
      const pl = '' + (ci + 1) + (ri + 1);
      const t = await p.eval(`(() => { const d = window.frameSkin.frameAt('${pl}').contentDocument.getElementById('path'); return d ? d.textContent : ''; })()`);
      if (t === 'rg/' + file) return pl;
    }
  }
  return null;
}
// ... waiting for it to open
async function waitPlace(file, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    const pl = await placeOf(file);
    if (pl || Date.now() > end) return pl;
    await wait(250);
  }
}
const waitMsg = (place) => p.waitFor(`/renamed: |!/.test(window.frameSkin.frameAt('${place}').contentDocument.getElementById('msg').textContent)`, 25000);

console.log('frame: a rename that must not go through');
await line('skin main 2,1');
await line('skin add 2 file_changes');
await line('skin focus 2 1');
await line(':find rg/b.js');
const pb = await waitPlace('b.js');
check(!!pb, 'b.js in a code_editor panel (' + pb + ')');
await lspUp(pb);
await line(':find rg/a.js');
const pa = await waitPlace('a.js');
await p.waitFor(`${view(pa)} && ${view(pa)}.state.doc.toString() === ${JSON.stringify(A)}`, 15000);
await lspUp(pa);

// -- A13: a.js's code_editor is read-only -> refuses its part; c.js (opened by the rename) takes its own back
const aId = await p.eval(`window.frameSkin.frameAt('${pa}').contentWindow.Tezcatl.bus.self.id`);
await p.eval(`Tezcatl.bus.post('code.configure', { readOnly: true }, { to: ${JSON.stringify(aId)} }); true`);
await wait(300);
await line('skin focus ' + pb[0] + ' ' + pb[1]);
await putCursor(pb, 'helper');
await p.eval(`window.frameSkin.frameAt('${pb}').contentDocument.getElementById('msg').textContent = ''; true`);
await line(':LspRename helper2');
await waitMsg(pb);
const m1 = await msgAt(pb);
check(/could not apply to: rg\/a\.js \(read-only\)/.test(m1) && /were taken back/.test(m1) && /Nothing was changed/.test(m1),
  'A13: a read-only code_editor refuses -> nothing changed: ' + m1);
const pc = await waitPlace('c.js');
check(!!pc, '...c.js was opened by the rename (' + pc + ')');
await p.waitFor(`${view(pc)} && ${view(pc)}.state.doc.toString() === ${JSON.stringify(C)}`, 8000);
check(await docAt(pc) === C, '...c.js got its part and took it back');
check(await p.eval(`window.frameSkin.frameAt('${pc}').contentDocument.getElementById('dirty').hidden`) === true, '...c.js is not dirty');
check(await docAt(pb) === B && await docAt(pa) === A, '...b.js (this file) and a.js untouched');
check(disk('a.js') === A && disk('b.js') === B && disk('c.js') === C, '...the disk too');
await p.eval(`Tezcatl.bus.post('code.configure', { readOnly: false }, { to: ${JSON.stringify(aId)} }); true`);

// -- A12: c.js's code_editor goes; a copy of c.js left by a code_editor closed unsaved (made at the relay)
await line('skin del ' + pc.charAt(0) + ' ' + pc.charAt(1));
await wait(500);
const put = await fetch(RELAY + '/mirror?path=rg/c.js&owner=gone&mode=write&slots=10', { method: 'PUT', headers: { origin: ORIGIN, 'content-type': 'text/plain' }, body: C + '// unsaved edit\n' });
const close = await fetch(RELAY + '/mirror/close?path=rg/c.js&owner=gone&unsaved=1', { method: 'POST', headers: { origin: ORIGIN } });
check(put.ok && close.ok && (await slots()).some((s) => s.path === 'rg/c.js' && s.unsaved_closed != null), 'a copy of c.js left (unsaved_closed)');
const before = (await state()).columns.flat().length;
await line('skin focus ' + pb[0] + ' ' + pb[1]);
await putCursor(pb, 'helper');
await p.eval(`window.frameSkin.frameAt('${pb}').contentDocument.getElementById('msg').textContent = ''; true`);
await line(':LspRename helper2');
await waitMsg(pb);
const m2 = await msgAt(pb);
check(/rg\/c\.js: a copy closed unsaved is left/.test(m2) && /Nothing was changed/.test(m2), 'A12: refused over the copy: ' + m2);
check((await state()).columns.flat().length === before, '...nothing was opened');
check(await docAt(pb) === B && await docAt(pa) === A, '...nothing changed');
const fc = `window.frameSkin.frameAt('21').contentDocument`;
await p.waitFor(`/rg\\/c\\.js: a copy closed unsaved is left \\(a rename/.test(${fc}.getElementById('list').textContent)`, 5000);
check(true, '...file_changes lists it, with how to tidy up');

// d d in file_changes throws the copy away
await line('skin focus 2 1');
await p.eval(`(() => { const d = ${fc}; const ul = d.getElementById('list'); ul.focus();
  for (let i = 0; i < 2; i++) ul.dispatchEvent(new d.defaultView.KeyboardEvent('keydown', { key: 'd', bubbles: true })); return true; })()`);
await p.waitFor(`/dropped the copy/.test(${fc}.getElementById('foot').textContent)`, 5000);
check(!(await slots()).some((s) => s.path === 'rg/c.js'), 'd d: the copy is gone from the relay');

// the rename now goes through: all three files
await line('skin focus ' + pb[0] + ' ' + pb[1]);
await putCursor(pb, 'helper');
await p.eval(`window.frameSkin.frameAt('${pb}').contentDocument.getElementById('msg').textContent = ''; true`);
await line(':LspRename helper2');
await waitMsg(pb);
const m3 = await msgAt(pb);
check(/renamed: helper2 \(1 place\(s\) in this file, \d+ in 2 other file\(s\)/.test(m3), 'then the rename goes through: ' + m3);
const pc2 = await waitPlace('c.js');
check(await docAt(pa) === A.replace(/helper/g, 'helper2') && pc2 && await docAt(pc2) === C.replace(/helper/g, 'helper2'), '...a.js and c.js have it (unsaved)');

const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
