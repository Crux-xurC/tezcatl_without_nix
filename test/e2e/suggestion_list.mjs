// test/e2e/suggestion_list.mjs -- the suggestion shell alone in a window
// (panels/extra/suggestion_list.html?config=<id>; D-suggestions): the words that can
// follow the line from suggestion/line.json, a grid of 5 x 2 filled top to
// bottom, digits / Enter pick, hjkl ^ - move, a pick says suggest.pick and
// (alone) adds to its own line, Backspace drops a word; suggest.filter and
// suggest.shape only when addressed to it; Shift+arrows say suggest.leave;
// ?in= narrows; the intent and dict sources.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const SHIFT = 8;

const view = (p) => p.eval(`JSON.stringify({
  line: document.getElementById('line').textContent,
  src: document.getElementById('src').textContent,
  words: [...document.querySelectorAll('#grid .cell .word')].map((e) => e.textContent),
  keys: [...document.querySelectorAll('#grid .cell .key')].map((e) => e.textContent),
  on: (document.querySelector('#grid .cell.on .word') || {}).textContent || null,
  hints: document.getElementById('hints').textContent,
  next: document.getElementById('next').className, prev: document.getElementById('prev').className,
  rows: getComputedStyle(document.getElementById('grid')).gridTemplateRows.split(' ').length,
  note: document.getElementById('note').textContent,
})`).then(JSON.parse);
const press = async (p, key, code, text, mods = 0) => { await p.key(key, code, text, mods); await wait(120); };

console.log('the lines (alone)');
const s = await openPage(PAGES + 'panels/extra/suggestion_list.html?config=line');
await s.waitFor(`document.querySelectorAll('#grid .cell').length > 0`, 10000);
let v = await view(s);
check(v.src === 'lines', 'the source by its label -- ' + v.src);
check(v.words[0] === 'skin' && v.words.length === 10 && v.keys.join('') === '1234567890', 'the first words, 10 cells numbered 1..0 -- ' + v.words.join(' '));
check(v.on === 'skin' && v.next.includes('can') && !v.prev.includes('can'), 'the cursor on the first; the next page can be turned to');

// another page listens to what the shell says
const other = await openPage(PAGES + 'panels/extra/color.html');
await other.waitFor(`!!(window.Tezcatl && Tezcatl.bus)`, 8000);
await other.eval(`window.said = []; ['suggest.pick', 'suggest.leave'].forEach((t) => Tezcatl.bus.on(t, (p) => window.said.push([t, p]))); true`);
const said = () => other.eval(`JSON.stringify(window.said)`).then(JSON.parse);

await s.eval(`document.body.focus(); true`);
await press(s, '1', 'Digit1', '1');
v = await view(s);
check(v.line === 'skin ' && v.words[0] === 'add', '1 picks "skin": the line grows, the next words -- ' + v.words.join(' '));
let got = await said();
check(got.length === 1 && got[0][1].word === 'skin' && got[0][1].text === 'skin ' && got[0][1].source === 'line', 'suggest.pick {word, text, source} -- ' + JSON.stringify(got));

await press(s, 'j', 'KeyJ', 'j');
await press(s, 'l', 'KeyL', 'l');
v = await view(s);
const third = v.words[0 + 1 + 5] || null;
check(v.on === third, 'j then l: one down, one column right -- ' + v.on);
await press(s, 'Enter', 'Enter', '\r');
v = await view(s);
check(v.line === 'skin ' + third + ' ', 'Enter picks the cursor -- ' + v.line);
await press(s, 'Backspace', 'Backspace', '');
v = await view(s);
check(v.line === 'skin ', 'Backspace drops the last word (alone) -- "' + v.line + '"');

// skin main, by its word: its place moves when line.json gains a line (was: Digit3)
const mainKey = v.keys[v.words.indexOf('main')];
check(!!mainKey, '"main" is among the words after "skin" -- ' + v.words.join(' '));
await press(s, mainKey, 'Digit' + mainKey, mainKey);
v = await view(s);
check(v.words.length === 0 && /<ratios>/.test(v.hints), 'an argument: no word, its hint -- ' + v.hints);

await press(s, 'ArrowLeft', 'ArrowLeft', '', SHIFT);
got = await said();
check(got.some(([t, p]) => t === 'suggest.leave' && p.key === 'ArrowLeft'), 'Shift+← says suggest.leave {key}');

console.log('the filter and the shape');
const sid = await s.eval(`Tezcatl.bus.self.id`);
await other.eval(`Tezcatl.bus.post('suggest.filter', { text: 'dock s' }); true`);
await wait(200);
v = await view(s);
check(v.line !== 'dock s', 'an unaddressed filter from another page is not taken (alone)');
await other.eval(`Tezcatl.bus.post('suggest.filter', { text: 'dock s' }, { to: ${JSON.stringify(sid)} }); true`);
await wait(200);
v = await view(s);
check(v.line === 'dock s' && v.words.join(' ') === 'side size', 'one addressed to it is: narrowed by the word being typed -- ' + v.words.join(' '));
await press(s, '2', 'Digit2', '2');
got = await said();
check(got.some(([t, p]) => t === 'suggest.pick' && p.text === 'dock size '), 'picking replaces the word being typed -- ' + JSON.stringify(got[got.length - 1]));
await other.eval(`Tezcatl.bus.post('suggest.filter', { text: '' }, { to: ${JSON.stringify(sid)} }); true`);
await other.eval(`Tezcatl.bus.post('suggest.shape', { rows: 4, cols: 3 }, { to: ${JSON.stringify(sid)} }); true`);
await wait(200);
v = await view(s);
check(v.rows === 4 && v.words.length === 12 && v.keys[10] === '' && v.keys[9] === '0', 'shape 4 x 3: 12 cells, the 11th and 12th without a number -- ' + v.words.length);
await press(s, 'Backspace', 'Backspace', '');
v = await view(s);
check(v.line === '', 'driven by a filter, Backspace does not edit the line -- "' + v.line + '"');

const shot = await s.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(E2E, 'suggestion_list.png'), Buffer.from(shot.result.data, 'base64'));
console.log('  (screenshot: ' + path.join(E2E, 'suggestion_list.png') + ')');
await s.close();

console.log('?in= narrows');
const f = await openPage(PAGES + 'panels/extra/suggestion_list.html?config=line&in=tree');
await f.waitFor(`document.querySelectorAll('#grid .cell').length > 0`, 10000);
v = await view(f);
check(v.words.join(' ') === ':find :grep tree', 'in=tree: its lines only -- ' + v.words.join(' '));
await f.close();

console.log('intents and the dictionary');
const it = await openPage(PAGES + 'panels/extra/suggestion_list.html?config=intent');
await it.waitFor(`document.querySelectorAll('#grid .cell').length > 0`, 10000);
v = await view(it);
check(v.src === 'intents' && v.words[0] === 'magit.changed-files', 'the intent ids, in the order of binding_map.json -- ' + v.words[0]);
await it.close();

const dictFile = path.join(E2E, 'fsroot', 'dict.json');
const before = fs.existsSync(dictFile) ? fs.readFileSync(dictFile) : null;
const doc = before ? JSON.parse(before) : { lists: {} };
doc.lists.e2e_suggest = [{ word: 'row/add', note: 'a calc row' }, { word: 'card', note: '' }];
fs.writeFileSync(dictFile, JSON.stringify(doc));
try {
  const d = await openPage(PAGES + 'panels/extra/suggestion_list.html?config=dict&list=e2e_suggest');
  await d.waitFor(`document.querySelectorAll('#grid .cell').length > 0 || /dict/.test(document.getElementById('note').textContent)`, 10000);
  v = await view(d);
  check(v.words.join(' ') === 'row/add card', 'the words of the list -- ' + v.words.join(' ') + ' ' + v.note);
  const did = await d.eval(`Tezcatl.bus.self.id`);
  await other.eval(`Tezcatl.bus.post('suggest.filter', { text: 'eval r' }, { to: ${JSON.stringify(did)} }); true`);
  await wait(200);
  v = await view(d);
  check(v.words.join(' ') === 'row/add', 'at any place of the line: only the word being typed narrows -- ' + v.words.join(' '));
  await d.close();
} finally {
  if (before) fs.writeFileSync(dictFile, before); else fs.unlinkSync(dictFile);
}

await other.close();
done();
