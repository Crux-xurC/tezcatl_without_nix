// test/e2e/frame_axis.mjs -- the frame's two axes and its size commands:
// skin main / sub (the old names horizon / vertical are gone),
// skin add line, skin axis v turns the skin over without reloading a panel,
// hjkl in the map follow the axis, skin equal, skin zoom / unzoom, and a zoom kept
// over a reload of the window.
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const lastRecv = () => p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-2).map((d) => d.textContent).join('\\n'); })()`);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(200);
  return lastRecv();
}
async function formKey(key, code, modifiers = 0) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.key(key, code, '', modifiers);
  await wait(150);
}
// a panel's box as % of the stage: [left, top, width, height]
const box = (place) => p.eval(`(() => {
  const el = window.frameSkin.frameAt(${JSON.stringify(place)}).parentNode; const st = document.getElementById('stage').getBoundingClientRect(); const r = el.getBoundingClientRect();
  return [r.left - st.left, r.top - st.top, r.width, r.height].map((v, i) => Math.round(100 * v / (i % 2 ? st.height : st.width)));
})()`);
const emptyBox = () => p.eval(`(() => {
  const el = [...document.querySelectorAll('#stage .col')].find((e) => !e.classList.contains('used')); if (!el) return null;
  const st = document.getElementById('stage').getBoundingClientRect(); const r = el.getBoundingClientRect();
  return [r.left - st.left, r.top - st.top, r.width, r.height].map((v, i) => Math.round(100 * v / (i % 2 ? st.height : st.width)));
})()`);

console.log('the frame: two axes, line, equal, zoom');
check(/B \(1 : 3\)/.test(await line('skin main 1,3')), 'skin main 1,3 -> B');
check(/added column 3/.test(await line('skin add line')), 'skin add line -> a 3rd column');
await line('skin add 1 tree');
await line('skin add 1 killring');
await line('skin add 2 bookmarks');
check(JSON.stringify(await box('11')) === '[0,0,20,50]', 'axis h: 11 is the top half of the 1st column (1/5 wide): ' + JSON.stringify(await box('11')));
check(/no such command: skin vertical/.test(await line('skin vertical 3,1 1')), 'the old name skin vertical is gone');
check(/column 1 \(3 : 1\)/.test(await line('skin sub 3,1 1')), 'skin sub sets the heights in a column');

// a mark in the panel's page: the same page after the turn = not reloaded
await p.eval(`window.frameSkin.frameAt('11').contentWindow.__mark = 'kept'; true`);
check(/axis v.*transposed/.test(await line('skin axis v')), 'skin axis v turns the skin over');
check(JSON.stringify(await box('11')) === '[0,0,75,20]', '...11 is the left 3/4 of the top row (1/5 high): ' + JSON.stringify(await box('11')));
check(JSON.stringify(await box('21')) === '[0,20,100,60]', '...21 is the whole 2nd row: ' + JSON.stringify(await box('21')));
check(JSON.stringify(await emptyBox()) === '[0,80,100,20]', '...the empty 3rd line is the bottom row: ' + JSON.stringify(await emptyBox()));
check((await p.eval(`window.frameSkin.frameAt('11').contentWindow.__mark`)) === 'kept', '...the panel is not reloaded');
check(/ v \(1 : 3 : 1\)/.test(await p.eval(`document.body.textContent`)), '...the heading says v');
check(/row 3 \*/.test(await p.eval(`document.getElementById('stage').textContent`)), '...an empty line is called a row');

// hjkl in the map: l along the row, j down to the next row
await line('skin focus 1 1');
await line(':');
await p.key('l', 'KeyL', '');
await wait(150);
check((await st()).focus === '12', 'axis v: l in the map goes along the row (11 -> 12)');
await p.key('j', 'KeyJ', '');
await wait(150);
check((await st()).focus === '21', '...j goes down to the next row (12 -> 21)');

// zoom / unzoom / equal
check(/zoom 2 1: C \(1 : 10 : 1\)/.test(await line('skin zoom -m')), 'skin zoom -m: the focused row 10 times the others');
check(JSON.stringify(await box('21')) === '[0,8,100,83]', '...drawn so: ' + JSON.stringify(await box('21')));
await p.send('Page.reload', {});
await p.waitFor(`window.frameSkin && window.frameSkin.frameAt('21')`, 15000);
await wait(500);
check(JSON.stringify((await st()).zoom) === '{"main":[1,3,1],"sub":null}', 'a reload of the window keeps the zoom and what to give back');
check(/taken back: C \(1 : 3 : 1\)/.test(await line('skin unzoom')), 'skin unzoom gives the sizes back');
check(/equal: C \(1 : 1 : 1\)/.test(await line('skin equal -m')), 'skin equal -m');
await line('skin focus 1 1');
check(/row 1 \(1 : 1\)/.test(await line('skin equal -s')), 'skin equal -s: the panels of the focused row');
check(/row 1 \(10 : 1\)/.test(await line('skin zoom -s')), 'skin zoom -s: the focused panel in its row');
check(/axis h/.test(await line('skin axis h')), 'skin axis h turns it back');
check(JSON.stringify(await box('11')) === '[0,0,33,91]', '...11 is the top of the 1st column again, zoomed in it: ' + JSON.stringify(await box('11')));

const errs = p.logs.filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
