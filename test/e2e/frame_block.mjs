// test/e2e/frame_block.mjs -- blocks in the frame:
// skin add puts a panel as a block (the panel and its thema band); code_editor's
// block (blocks/code_editor.json, source file) says its file and ● when unsaved;
// block arrange moves the band (and the panel off it), kept over a reload;
// -bare is the panel alone (the heading as before); block new makes a block
// for a panel (kept in ~work/store), whose thema says what the panel posts as
// panel.status; a click on the band focuses the block.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'fb');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'alpha\n');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
await p.eval(`Tezcatl.store.set('tezcatl:frame:blocks', {}).then(() => true)`);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const lastRecv = () => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-2).map((d) => d.textContent).join('\\n'); })()`);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(250);
  return lastRecv();
}
const paneOf = (place) => `window.frameSkin.frameAt('${place}').parentNode`;
const themaDoc = (place) => `${paneOf(place)}.querySelector('iframe.thema').contentDocument`;
const themaText = (place) => p.eval(`(() => { try { return ${themaDoc(place)}.getElementById('text').textContent; } catch (_) { return null; } })()`);
const bandColor = (place) => p.eval(`getComputedStyle(${themaDoc(place)}.getElementById('band')).backgroundColor`);
// a box inside the pane as px from the pane: [left, top, right, bottom] gaps
const inset = (place, sel) => p.eval(`(() => {
  const pane = ${paneOf(place)}; const el = ${sel}; const a = pane.getBoundingClientRect(); const b = el.getBoundingClientRect();
  return [b.left - a.left, b.top - a.top, a.right - b.right, a.bottom - b.bottom].map((v) => Math.round(v));
})()`);
const view = (place) => `(() => { const f = window.frameSkin.frameAt('${place}'); const c = f && f.contentDocument.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;

console.log('blocks in the frame');
await line('skin main 1,1');
await line(':find fb/a.txt');
await p.waitFor(`${view('11')} && ${view('11')}.state.doc.toString() === 'alpha\\n'`, 15000);
check(await p.eval(`${paneOf('11')}.classList.contains('block') && !!${paneOf('11')}.querySelector('iframe.thema') && !${paneOf('11')}.querySelector('.head')`),
  'a code_editor added is a block: a thema, no heading');
await p.waitFor(`(() => { try { return ${themaDoc('11')}.getElementById('text').textContent === '1 1 fb/a.txt'; } catch (_) { return false; } })()`, 8000);
check(true, '...its thema says the file (blocks/code_editor.json: source file)');
const plain = await bandColor('11');
check(JSON.stringify(await inset('11', `window.frameSkin.frameAt('11')`)) === '[0,24,0,0]', '...the panel is under the band (24px on top): ' + JSON.stringify(await inset('11', `window.frameSkin.frameAt('11')`)));
await p.eval(`(() => { const v = ${view('11')}; v.dispatch({ changes: { from: 0, insert: 'X' } }); return true; })()`);
await p.waitFor(`${themaDoc('11')}.getElementById('text').textContent === '1 1 fb/a.txt ●'`, 8000);
check((await bandColor('11')) !== plain, 'unsaved: ● and the warning colour');

check(/the thema of 1 1 is at the bottom/.test(await line('block arrange b')), 'block arrange b');
check(JSON.stringify(await inset('11', `window.frameSkin.frameAt('11')`)) === '[0,0,0,24]', '...the panel moves off the band at the bottom');
check(/side-b/.test(await p.eval(`${themaDoc('11')}.body.className`)), '...the band is at the bottom');
await line('block arrange l');
check((await themaText('11')) === '', 'block arrange l: no sentence on a band at the side');
await line('block arrange t');

// bare
await line('skin add 2 tree -bare');
check(await p.eval(`!${paneOf('21')}.classList.contains('block') && !!${paneOf('21')}.querySelector('.head')`), 'skin add -bare: the panel alone, with the heading');
check(/a bare panel/.test(await line('block arrange b')), '...block arrange is refused there');

// block new + panel.status
check(/made the block of bookmarks/.test(await line('block new bookmarks status')), 'block new bookmarks status');
await line('skin add 2 bookmarks');
await p.waitFor(`(() => { try { return ${themaDoc('22')}.getElementById('text').textContent === '2 2 bookmarks'; } catch (_) { return false; } })()`, 8000);
check(true, '...a bookmarks added wears it: the name until it says something');
await p.eval(`window.frameSkin.frameAt('22').contentWindow.Tezcatl.bus.post('panel.status', { text: '3 件', level: 'alert' }); true`);
await p.waitFor(`${themaDoc('22')}.getElementById('text').textContent === '2 2 3 件'`, 5000);
check(true, '...then what it posts as panel.status');

// a click on the band focuses the block
await line('skin focus 2 1');
const rect = await p.eval(`(() => { const r = ${paneOf('11')}.getBoundingClientRect(); return [r.left + 40, r.top + 10]; })()`);
await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect[0], y: rect[1], button: 'left', clickCount: 1 });
await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect[0], y: rect[1], button: 'left', clickCount: 1 });
await wait(300);
check((await st()).focus === '11', 'a click on the band focuses the block');

// kept over a reload (the side, bare); the code_editor is a block again
await line('skin focus 1 1');
await line('block arrange b');
await p.send('Page.reload', {});
await p.waitFor(`window.frameSkin && window.frameSkin.frameAt('11') && window.frameSkin.frameAt('21')`, 15000);
await wait(800);
const s = await st();
check(JSON.stringify(s.columns.map((c) => c.map((x) => x[4] === undefined ? 'block' : x[4]))) === '[[{"side":"b"}],[false,"block"]]',
  'a reload keeps the side and the bare panel: ' + JSON.stringify(s.columns));
check(/side-b/.test(await p.eval(`${themaDoc('11')}.body.className`)), '...drawn so');

// block min / min line / unmin: along the sub axis (the height); the panel hidden, not reloaded
const hpx = (place) => p.eval(`Math.round(${paneOf(place)}.getBoundingClientRect().height)`);
const stageH = await p.eval(`Math.round(document.getElementById('stage').getBoundingClientRect().height)`);
await line('skin focus 2 1');
await line('skin add 2 code_editor');
await p.waitFor(`window.frameSkin.frameAt('23') && window.frameSkin.frameAt('23').contentWindow.Tezcatl`, 15000);
await p.eval(`window.frameSkin.frameAt('23').contentWindow.__mark = 'kept'; true`);
check(/2 3 shrunk to its band/.test(await line('block min')), 'block min');
check((await hpx('23')) === 24, '...the block is its band (24px): ' + (await hpx('23')));
check(Math.abs((await hpx('21')) + (await hpx('22')) - (stageH - 24)) <= 2, '...the others share the rest');
check((await themaText('23')) === '2 3 code_editor', '...the sentence shows: ' + (await themaText('23')));
check(await p.eval(`window.frameSkin.frameAt('23').style.display === 'none'`), '...its panel is hidden');
check(/2 3 shrunk to its line/.test(await line('block min line')), 'block min line');
check((await hpx('23')) === 4, '...a line (4px): ' + (await hpx('23')));
check((await themaText('23')) === '', '...no sentence');
check(/2 3 is back/.test(await line('block unmin')), 'block unmin');
check(Math.abs((await hpx('23')) - Math.round(stageH / 3)) <= 2, '...back to its share: ' + (await hpx('23')));
check((await p.eval(`window.frameSkin.frameAt('23').contentWindow.__mark`)) === 'kept', '...the panel was not reloaded');

// thema color / thickness / text / reset
const c0 = await bandColor('23');
await line('thema color alert');
check((await bandColor('23')) !== c0, 'thema color alert changes the band');
await line('thema thickness 40');
check(JSON.stringify(await inset('23', `window.frameSkin.frameAt('23')`)) === '[0,40,0,0]', 'thema thickness 40: the panel under a 40px band');
await line('thema text 機関 室');
check((await themaText('23')) === '2 3 機関 室', 'thema text: a sentence of its own: ' + (await themaText('23')));
await line('thema reset');
check((await themaText('23')) === '2 3 code_editor' && JSON.stringify(await inset('23', `window.frameSkin.frameAt('23')`)) === '[0,24,0,0]' && (await bandColor('23')) === c0,
  'thema reset: as code_editor\'s block says');

// an L round a corner, and a style (a file of local/thema/ for this run, as frame_skin does with local/skins/)
const STYLE = 'e2e-' + Date.now().toString(36);
const LTHEMA = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'local', 'thema');
fs.mkdirSync(LTHEMA, { recursive: true });
fs.writeFileSync(path.join(LTHEMA, STYLE + '.css'), ':root { --th-inner: 10 6; --th-arm: 50; --th-e2e-green: rgb(0, 128, 0); }\n');
check(/the thema of 2 3 is at the top and left/.test(await line('block arrange tl')), 'block arrange tl');
check(JSON.stringify(await inset('23', `window.frameSkin.frameAt('23')`)) === '[24,24,0,0]', '...the panel off two edges: ' + JSON.stringify(await inset('23', `window.frameSkin.frameAt('23')`)));
check(await p.eval(`getComputedStyle(${themaDoc('23')}.getElementById('arm')).display === 'block'`), '...the arm down the left');
check((await themaText('23')) === '2 3 code_editor', '...the sentence on the band');
const radius = () => p.eval(`window.frameSkin.frameAt('23').style.borderTopLeftRadius`);
check(['0', '0px', ''].includes(await radius()), '...no inner corner without a style');
await line('thema style ' + STYLE);
await p.waitFor(`window.frameSkin.frameAt('23').style.borderTopLeftRadius === '10px 6px'`, 8000);
check((await radius()) === '10px 6px', 'thema style: its --th-inner rounds the panel\'s inner corner (10px across, 6px down): ' + (await radius()));
check(JSON.stringify(await inset('23', `window.frameSkin.frameAt('23')`)) === '[50,24,0,0]', '...its --th-arm is the width of the arm: the panel moves by it, the band keeps its thickness: ' + JSON.stringify(await inset('23', `window.frameSkin.frameAt('23')`)));
check(await p.eval(`Math.round(${themaDoc('23')}.getElementById('arm').getBoundingClientRect().width) === 50`), '...and the arm is drawn that wide');
check(new RegExp('style-' + STYLE).test(await p.eval(`${themaDoc('23')}.body.className`)), '...the thema is marked with the style');
await line('thema color e2e-green');
check((await bandColor('23')) === 'rgb(0, 128, 0)', 'thema color <a name the style gives>: ' + (await bandColor('23')));
await line('thema style');
await p.waitFor(`['0px', '0'].includes(window.frameSkin.frameAt('23').style.borderTopLeftRadius)`, 8000);
check(JSON.stringify(await inset('23', `window.frameSkin.frameAt('23')`)) === '[24,24,0,0]', 'thema style (none): plain again, the arm as thick as the band: ' + JSON.stringify(await inset('23', `window.frameSkin.frameAt('23')`)));
await line('thema style nosuch');
await wait(800);
check(['0px', '0'].includes(await radius()), 'a style that is nowhere: plain');
fs.rmSync(path.join(LTHEMA, STYLE + '.css'), { force: true });

await p.eval(`Tezcatl.store.set('tezcatl:frame:blocks', {}).then(() => true)`);
const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
