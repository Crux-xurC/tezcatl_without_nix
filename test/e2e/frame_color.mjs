// test/e2e/frame_color.mjs -- a panel's own place in the frame
// (block place, skin add <panel>: kept with what the panel's block file says)
// and the colour panel (panels/extra/color.html): `color <colour>` with none
// open opens a new window (color.show's fallback); a colour panel in the frame
// takes `color …` from its input form, a colour of a JSON by name included.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'fc');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.txt'), 'alpha\n');
fs.writeFileSync(path.join(dir, 'p.json'), JSON.stringify({ orange: '#FF9900', navy: 'rgb(0, 0, 128)' }));

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
await p.eval(`Tezcatl.store.set('tezcatl:frame:blocks', {}).then(() => true)`);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const names = (s) => s.columns.map((c) => c.map((x) => x[0]));
const lastRecv = () => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-2).map((d) => d.textContent).join('\\n'); })()`);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(400);
  return lastRecv();
}

console.log('a panel\'s own place');
await line('skin main 1,2,1');
check(/skin add code_editor puts it in line 2/.test(await line('block place code_editor 2')), 'block place code_editor 2');
await line('skin add code_editor');
await p.waitFor(`window.frameSkin.frameAt('21')`, 10000);
check(JSON.stringify(names(await st())) === '[[],["code_editor"],[]]', 'skin add code_editor puts it in its place (line 2)');
await line('skin focus 2 1');
await line(':e fc/a.txt');
await p.waitFor(`(() => { try { return window.frameSkin.frameAt('21').parentNode.querySelector('iframe.thema').contentDocument.getElementById('text').textContent === '21 fc/a.txt'; } catch (_) { return false; } })()`, 10000);
check(true, '...and keeps what blocks/code_editor.json says (source file): its thema says the file');
await line('skin focus 2 1');
await line('skin add tree');
check(JSON.stringify(names(await st())) === '[[],["code_editor","tree"],[]]', 'skin add tree (no place of its own): the focused line');

console.log('the colour panel');
await line('color #FF9900');
const w = await attachTo('panels/extra/color.html', 8000);
await w.waitFor(`getComputedStyle(document.getElementById('swatch')).backgroundColor === 'rgb(255, 153, 0)'`, 8000);
check(true, 'color <colour> with no colour panel open: a new window, that colour');
check((await w.eval(`getComputedStyle(document.getElementById('swatch')).color`)) === 'rgb(0, 0, 0)', '...black text on it');
await w.close();
await wait(500);

const colourTabs = async () => (await (await fetch('http://127.0.0.1:' + (process.env.CDP_PORT || '9223') + '/json/list')).json())
  .filter((t) => t.type === 'page' && /panels\/extra\/color\.html/.test(t.url)).length;
const colourTabsBefore = await colourTabs();   // other scenarios may have left some open
await line('skin add 3 color');
await p.waitFor(`window.frameSkin.frameAt('31') && window.frameSkin.frameAt('31').contentWindow.Tezcatl && window.frameSkin.frameAt('31').contentWindow.Tezcatl.commands`, 10000);
await wait(600);
const swatch = () => p.eval(`getComputedStyle(window.frameSkin.frameAt('31').contentDocument.getElementById('swatch')).backgroundColor`);
await line('color rgb(0,0,128)');
await p.waitFor(`getComputedStyle(window.frameSkin.frameAt('31').contentDocument.getElementById('swatch')).backgroundColor === 'rgb(0, 0, 128)'`, 8000);
check(true, 'the colour panel in the frame takes color <colour>');
check((await p.eval(`getComputedStyle(window.frameSkin.frameAt('31').contentDocument.getElementById('swatch')).color`)) === 'rgb(255, 255, 255)', '...white text on a dark one');
await line('color fc/p.json orange');
await p.waitFor(`getComputedStyle(window.frameSkin.frameAt('31').contentDocument.getElementById('swatch')).backgroundColor === 'rgb(255, 153, 0)'`, 8000);
check(/orange \(fc\/p\.json\)/.test(await p.eval(`window.frameSkin.frameAt('31').contentDocument.getElementById('what').textContent`)), 'color <json> <name>: the colour of that name');
await line('color fc/p.json teal');
await p.waitFor(`/fc\\/p\\.json has no teal \\(orange, navy\\)/.test(window.frameSkin.frameAt('31').contentDocument.getElementById('err').textContent)`, 8000);
check((await swatch()) === 'rgb(255, 153, 0)', 'a name not in it: said, the colour stays');
check(/not a colour/.test(await line('color red;;x')), 'what is not a colour is refused on the input form (;; is a ";" -- the input form is a lead-key form)');
check((await colourTabs()) === colourTabsBefore, 'with a colour panel open, no new window');

await p.eval(`Tezcatl.store.set('tezcatl:frame:blocks', {}).then(() => true)`);
const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
