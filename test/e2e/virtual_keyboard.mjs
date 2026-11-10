// test/e2e/virtual_keyboard.mjs -- the virtual keyboard
// (panels/extra/virtual_keyboard.html; D-lead-key): bus `lead.keys` lights
// keys in five shades, newest first; every 2 s the shades step down and go out;
// in a skin only the panels of the same skin are listened to, alone anyone is.
// The board fits the panel (the whole of it is on screen).
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');

// shades of some keys in a keyboard document reached by `doc` (an expression)
const shades = (p, doc, ids) => p.eval(`(() => {
  const d = ${doc};
  const out = {};
  for (const el of d.querySelectorAll('#kb span')) {
    const t = el.textContent.replace(/^\\[\\s*|\\s*\\]$/g, '');
    if (out[t] === undefined || out[t] === 'none') out[t] = el.getAttribute('data-shade') || 'none';
  }
  return JSON.stringify(${JSON.stringify(ids)}.map((t) => out[t] === undefined ? 'none' : out[t]));
})()`).then(JSON.parse);

console.log('alone in a window');
const kb = await openPage(PAGES + 'panels/extra/virtual_keyboard.html');
await kb.waitFor(`document.querySelectorAll('#kb span').length === 87`, 8000);
check(true, '87 keys drawn');
const fits = await kb.eval(`(() => { const r = document.getElementById('kb').getBoundingClientRect();
  return r.width <= innerWidth + 1 && r.height <= innerHeight + 1 && r.width > innerWidth * 0.8; })()`);
check(fits, 'the board fits the window (and fills its width)');

const other = await openPage(PAGES + 'panels/extra/color.html');
await other.waitFor(`!!(window.Tezcatl && Tezcatl.bus)`, 8000);
const post = (p, keys) => p.eval(`Tezcatl.bus.post('lead.keys', { keys: ${JSON.stringify(keys)} }); true`);

// ;cY;e as lead.js gives it: control, Y, return
await post(other, ['control']);
await post(other, ['Y']);
await post(other, ['return']);
await wait(150);
let s = await shades(kb, 'document', ['Ctl', 'Shift', 'Y', 'Enter', 'Q']);
check(JSON.stringify(s) === '["3","2","1","0","none"]', ';cY;e: ctrl 3, shift 2, y 1, enter 0 (newest first) -- ' + JSON.stringify(s));

const shot = await kb.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(E2E, 'virtual_keyboard.png'), Buffer.from(shot.result.data, 'base64'));
console.log('  (screenshot: ' + path.join(E2E, 'virtual_keyboard.png') + ')');

await wait(2200);
s = await shades(kb, 'document', ['Ctl', 'Enter']);
check(s[1] === '1' || s[1] === '2', 'two seconds later the shades stepped down (one or two ticks, by the timer\'s phase) -- ' + JSON.stringify(s));
await wait(10500);
s = await shades(kb, 'document', ['Ctl', 'Shift', 'Y', 'Enter']);
check(s.every((x) => x === 'none'), 'not typed over: all out -- ' + JSON.stringify(s));

await post(other, ['あ', 'left', ';', ':']);
await wait(150);
s = await shades(kb, 'document', ['<', ';', 'Shift']);
// a tick may fall between the post and the read: then all are one shade down
check(['["3","0","1"]', '["4","1","2"]'].includes(JSON.stringify(s)), 'あ lights nothing; left, ";", ":" (shift + ;) -- ' + JSON.stringify(s));

console.log('in a frame');
const f = await openPage(PAGES + 'panels/skins/frame.html');
await f.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await f.eval(`document.getElementById('line').focus(); true`);
  await f.send('Input.insertText', { text });
  await f.key('Enter', 'Enter', '\r');
  await wait(400);
}
await line('skin main 2');
await line('skin add virtual_keyboard');
await line('skin add color');
await f.waitFor(`(() => { const s = window.frameSkin.state(); return s.columns.flat().length === 2; })()`, 10000);
const frameDoc = (name) => `[...document.querySelectorAll('iframe')].find((i) => /${name}/.test(i.src)).contentDocument`;
await f.waitFor(`(() => { try { return ${frameDoc('virtual_keyboard')}.querySelectorAll('#kb span').length === 87; } catch (_) { return false; } })()`, 10000);
await f.waitFor(`(() => { try { return !!${frameDoc('color')}.defaultView.Tezcatl.bus; } catch (_) { return false; } })()`, 10000);

await post(other, ['q']);
await wait(300);
s = await shades(f, frameDoc('virtual_keyboard'), ['Q']);
check(s[0] === 'none', 'a page outside the skin does not light it');
await f.eval(`${frameDoc('color')}.defaultView.Tezcatl.bus.post('lead.keys', { keys: ['q'] }); true`);
await wait(300);
s = await shades(f, frameDoc('virtual_keyboard'), ['Q']);
check(s[0] === '0', 'a panel of the same skin does');

// close what was opened here (a colour page left open is taken for one
// `color …` opened by frame_color.mjs)
await f.close();
await other.close();
await kb.close();
done();
