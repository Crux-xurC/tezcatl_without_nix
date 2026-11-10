// test/e2e/frame_bridge.mjs -- another frame as a destination (D-bridge), the
// image panel and the lines past A to D: the dock of frame B (the main skin)
// chooses frame A with `;i f` and its lines run in A (skin.line), the receiving
// side following with A's lines (recv.out); `image <path>` adds an image panel
// that shows a picture of the pages, a second one goes to the same panel;
// `skin main` takes five lines, `skin del line` takes an empty one away.
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NAME = 'e2e-a-' + Date.now().toString(36);

async function frame(url) {
  const p = await openPage(PAGES + url);
  await p.waitFor(`/ready|empty\\.|read "/.test(document.getElementById('recv').textContent)`, 15000);
  return p;
}
const st = (p) => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const names = (s) => s.columns.map((c) => c.map((x) => x[0]));
const recv = (p) => p.eval(`document.getElementById('recv').textContent`);
async function line(p, text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(400);
}

const a = await frame('panels/skins/frame.html');
await line(a, 'skin name ' + NAME);

console.log('the lines past A to D, skin del line');
await line(a, 'skin main 1,1,1,1,1');
let s = await st(a);
check(s.columns.length === 5 && s.type === 'E', 'skin main 1,1,1,1,1: five columns, type E');
await line(a, 'skin add 5 tree');
await line(a, 'skin del line');
check(/column 5 still has panels/.test(await recv(a)), 'skin del line: the last column with a panel stays');
await line(a, 'skin del line 2');
s = await st(a);
check(s.columns.length === 4 && names(s)[3][0] === 'tree', 'skin del line 2: an empty column away, the tree moved to column 4');
await line(a, 'skin del tree');
await line(a, 'skin main 1');
s = await st(a);
check(s.columns.length === 1 && s.type === 'A', 'back to one column');

console.log('frame B drives frame A');
const b = await frame('panels/skins/frame.html?skin=main');
s = await st(b);
check(s.name === 'main' && names(s)[0][0] === 'image', 'frame.html?skin=main: the main skin (an image panel)');
const imgOk = (p, place) => p.eval(`(() => { const f = window.frameSkin.frameAt(${JSON.stringify(place)}); const d = f && f.contentDocument;
  const i = d && d.getElementById('img'); return !!(i && i.complete && i.naturalWidth > 0) ? i.getAttribute('src') : ''; })()`);
await b.waitFor(`(() => { const f = window.frameSkin.frameAt('11'); const i = f && f.contentDocument && f.contentDocument.getElementById('img');
  return !!(i && i.complete && i.naturalWidth > 0); })()`, 10000);
check(/assets\/tezcatlipoca\.png$/.test(await imgOk(b, '11')), 'the main skin\'s image panel shows assets/tezcatlipoca.png');

const type = async (p, str) => { for (const ch of str) await p.key(ch, '', ch); await wait(250); };
await b.waitFor(`(() => { try { return window.frameSkin.target().contentWindow.Tezcatl.targetsReady; } catch (_) { return false; } })()`, 15000);
const TG = `window.frameSkin.target().contentDocument`;
check(!!await b.waitFor(`new RegExp('f\\d?\\s*frame ' + ${JSON.stringify(NAME)}).test(${TG}.getElementById('list').textContent)`, 10000),
  'B\'s input_target lists frame A (f) -- ' + await b.eval(`${TG}.getElementById('list').textContent`));
const letters = /(f\d?)\s*frame (\S+)/g;
let pick = 'f';
for (const mm of (await b.eval(`${TG}.getElementById('list').textContent`)).matchAll(letters)) if (mm[2].startsWith(NAME)) pick = mm[1];
await b.eval(`document.getElementById('line').focus(); true`);
await type(b, ';i');
for (const ch of pick) await b.key(ch, /\d/.test(ch) ? 'Digit' + ch : 'Key' + ch.toUpperCase(), ch);
await wait(500);
const head = await b.eval(`${TG}.getElementById('head').textContent`);
check(head.indexOf('frame ' + NAME) >= 0, 'B\'s input_target sends to frame A: ' + head);

await b.eval(`document.getElementById('line').focus(); true`);
await type(b, 'skin add tree');
await b.key('Enter', 'Enter', '\r');
check(!!await a.waitFor(`window.frameSkin.state().columns[0].some((x) => x[0] === 'tree')`, 5000), 'a line in B\'s dock ran in A: skin add tree');
check(!(await st(b)).columns.flat().some((x) => x[0] === 'tree'), 'B itself did not change');
check(/> skin add tree/.test(await recv(a)), 'A said it ran (its own receiving side)');
const RX = `[...document.getElementById('recvx').children].map((d) => d.textContent).join('\\n')`;
check(!!await b.waitFor(`/tree at/.test(${RX})`, 5000), 'B\'s receiving side shows A\'s answer (following the input) -- ' + (await b.eval(RX)).split('\n')[0]);

console.log('image <path>');
await line(b, 'image assets/tezcatlipoca.png');
check(!!await a.waitFor(`window.frameSkin.state().columns.flat().some((x) => x[0] === 'image')`, 5000), 'image <path> from B: A got an image panel');
const place = await a.eval(`(() => { const s = window.frameSkin.state(); for (let c = 0; c < s.columns.length; c++) { const r = s.columns[c].findIndex((x) => x[0] === 'image'); if (r >= 0) return (c + 1) + '' + (r + 1); } return ''; })()`);
check(!!place && !!await a.waitFor(`(() => { const f = window.frameSkin.frameAt(${JSON.stringify(place)}); const i = f && f.contentDocument && f.contentDocument.getElementById('img');
  return !!(i && i.complete && i.naturalWidth > 0); })()`, 10000), 'the image panel at ' + place + ' shows the picture');
await line(a, 'image assets/nothing-here.png');
check(!!await a.waitFor(`/cannot be read: assets\\/nothing-here\\.png/.test(document.getElementById('recv').textContent)`, 5000), 'a missing picture is said');
const n = await a.eval(`window.frameSkin.state().columns.flat().filter((x) => x[0] === 'image').length`);
check(n === 1, 'a second image <path> goes to the same panel');
await line(a, 'image ../secret.png');
check(/outside the pages/.test(await recv(a)), 'a path outside the pages is refused');

await a.close();
await b.close();
done();
