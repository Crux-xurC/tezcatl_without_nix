// test/e2e/input_leadkey.mjs -- the lead-key input form with its input_target
// and virtual keyboard in one frame (D-lead-key): the second line reads what
// is typed, Enter sends it through the input_target (caught at Tezcatl.ws.send:
// nothing answers behind the test relay), each key typed lights the virtual
// keyboard, ;z is said and not put in, ;: goes to the map and leaves nothing,
// a line that does not read is not sent, Up brings the last line back; the
// same through an IME composition (fcitx sends even ASCII that way).
// (Paste is not driven here: headless Chromium does not make insertFromPaste;
// lead.escape is in test/lead.test.js.)
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const C = (s) => JSON.stringify(s);

const f = await openPage(PAGES + 'panels/skins/frame.html');
await f.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await f.eval(`document.getElementById('line').focus(); true`);
  await f.send('Input.insertText', { text });
  await f.key('Enter', 'Enter', '\r');
  await wait(400);
}
await line('skin main 3');
await line('skin add input_target');
await line('skin add virtual_keyboard');
await line('skin add input_leadkey');
const W = (name) => `[...document.querySelectorAll('iframe')].find((i) => /${name}\\.html/.test(i.src)).contentWindow`;
const IL = W('input_leadkey');
const IT = W('input_target');
const VK = W('virtual_keyboard');
await f.waitFor(`(() => { try { return /connected/.test(${IT}.document.getElementById('list').textContent)
  && ${VK}.document.querySelectorAll('#kb span').length === 87 && !!${IL}.document.getElementById('form'); } catch (_) { return false; } })()`, 15000);
await wait(500);
await f.eval(`(() => { const w = ${IT}; w.__sent = []; const o = w.Tezcatl.ws.send;
  w.Tezcatl.ws.send = (m) => { w.__sent.push(m); return o(m); }; return true; })()`);

// in a skin the first destination is tezcatl: pick emacs-vent (e)
await f.eval(`(() => { const w = ${IT}; w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'e' })); return true; })()`);
await f.waitFor(`${IT}.document.getElementById('head').textContent === '→ emacs-vent'`, 5000);
const focusForm = () => f.eval(`${IL}.document.getElementById('form').focus(); true`);
async function type(text) {
  await focusForm();
  for (const ch of text) await f.key(ch, '', ch);
  await wait(150);
}
const formValue = () => f.eval(`${IL}.document.getElementById('form').value`);
const sends = () => f.eval(`${IL}.document.getElementById('sends').textContent`);
const noteText = () => f.eval(`${IL}.document.getElementById('note').textContent`);
const lit = () => f.eval(`JSON.stringify([...${VK}.document.querySelectorAll('#kb span[data-shade]')]
  .map((e) => e.textContent.replace(/^\\[\\s*|\\s*\\]$/g, '') + ':' + e.getAttribute('data-shade')))`).then(JSON.parse);

console.log('typing');
await type('ls ;cd x');
check(await formValue() === 'ls ;cd x', 'the first line is what was typed');
check(await sends() === 'l s SPC C-d SPC x', 'the second line reads it: ' + C(await sends()));
check(await f.eval(`${IL}.document.querySelector('#sends .mod').textContent`) === 'C-d', 'the key with a modifier is marked');
const l1 = await lit();
check(l1.includes('X:0') && l1.includes('Space:1') && l1.includes('D:2') && l1.includes('Ctl:3'),
  'each key typed lights the virtual keyboard, newest first: ' + C(l1));

console.log('Enter sends');
await f.key('Enter', 'Enter', '\r');
await f.waitFor(`/emacs-vent/.test(${IL}.document.getElementById('note').textContent)`, 5000);
const sent = await f.eval(`JSON.stringify(${IT}.__sent.filter((m) => m.kind === 'input'))`).then(JSON.parse);
check(sent.length === 1 && C(sent[0].sequence.map((e) => [e.key, e.modifiers])) ===
  C([['l', []], ['s', []], [' ', []], ['d', ['control']], [' ', []], ['x', []]]),
  'through the input_target, as kind:"input": ' + C(sent[0] && sent[0].sequence));
check(/→ emacs-vent/.test(await noteText()), 'the answer is shown: ' + C(await noteText()));
check(await formValue() === '', 'the form is emptied');

console.log('keys for the destination');
await type(';c;h;e;f5;;');
check(await sends() === 'C-<left> <return> <f5> ;', ';c;h ;e ;f5 ;; -> ' + C(await sends()));
const l2 = await lit();
check(l2.includes(';:0') && l2.includes('F5:1') && l2.includes('Enter:2') && l2.includes('<:3'),
  'the keyboard lights the keys the destination gets (arrow, Enter, F5, ;), not h / e / f: ' + C(l2));
await f.eval(`${IL}.document.getElementById('form').value = ''; true`);

console.log('what is not put in');
await type('a;z');
check(await formValue() === 'a;', ';z: the z is not put in');
check(/means nothing/.test(await noteText()), '...and it is said: ' + C(await noteText()));
check(await sends() === 'a … waiting for the key after ;', 'a half-written line is waiting, not wrong: ' + C(await sends()));
await f.key('Enter', 'Enter', '\r');
await wait(300);
check(/not sent: the line stops half-way/.test(await noteText()), 'a line that does not read is not sent: ' + C(await noteText()));
check(await f.eval(`${IT}.__sent.filter((m) => m.kind === 'input').length`) === 1, '...nothing more went out');
await f.eval(`${IL}.document.getElementById('form').value = ''; true`);

console.log('a shortcut');
await type('ab;:');
await wait(800);
check(await formValue() === 'ab', ';: leaves nothing in the form');
check(await f.eval(`document.activeElement === window.frameSkin.abs()`), ';: went to the map (skin.focus abs)');

console.log('through an IME (fcitx and the like: even ASCII comes as a composition)');
async function typeIme(text) {
  await focusForm();
  for (const ch of text) {
    await f.send('Input.imeSetComposition', { text: ch, selectionStart: 1, selectionEnd: 1 });
    await f.send('Input.insertText', { text: ch });
  }
  await wait(150);
}
await f.eval(`${IL}.document.getElementById('form').value = ''; ${IL}.document.getElementById('form').dispatchEvent(new Event('click')); true`);
await wait(2500);
await typeIme(';cq');
check(await sends() === 'C-q', 'the second line reads it: ' + C(await sends()));
const l3 = await lit();
const shadeOf = (l, k) => Number((l.find((x) => x.startsWith(k + ':')) || ':9').split(':')[1]);
check(shadeOf(l3, 'Q') < 9 && shadeOf(l3, 'Q') + 1 === shadeOf(l3, 'Ctl'),
  'and the virtual keyboard lights q, ctrl just before it (a 2 s tick may have stepped both down): ' + C(l3));
await typeIme(';z');
check(await formValue() === ';cq;', ';z through an IME: the z is taken back out');
await f.eval(`${IL}.document.getElementById('form').value = 'ab'; ${IL}.document.getElementById('form').dispatchEvent(new Event('click')); true`);
await typeIme(';:');
await wait(800);
check(await formValue() === 'ab', ';: through an IME leaves nothing in the form');

console.log('to an xterm of the skin');
await line('skin add xterm');
const XT = W('xterm');
const rowsOf = () => f.eval(`${IT}.document.getElementById('list').textContent`);
await f.waitFor(`/x\\s*xterm[^]*connected/.test(${IT}.document.getElementById('list').textContent.replace(/emacs-vent\\s*connected/, ''))`, 15000);
check(/x\s*xterm/.test(await rowsOf()), 'input_target lists the xterm (x): ' + C(await rowsOf()));
await f.eval(`${IT}.document.body.focus(); true`);
await f.eval(`(() => { const w = ${IT}; w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'x' })); return true; })()`);
await wait(200);
check(/xterm/.test(await f.eval(`${IT}.document.getElementById('head').textContent`)), 'x chooses it');
await f.eval(`${IL}.document.getElementById('form').value = ''; ${IL}.document.getElementById('form').dispatchEvent(new Event('click')); true`);
await type('echo lead;cu;cy-ok;e');
await f.key('Enter', 'Enter', '\r');
await f.waitFor(`/→ xterm/.test(${IL}.document.getElementById('note').textContent)`, 5000);
check(/→ xterm/.test(await noteText()), 'sent to the xterm: ' + C(await noteText()));
// C-u kills "echo lead", C-y yanks it back: the shell gets "echo lead-ok" and runs it
const screen = () => f.eval(`${XT}.document.querySelector('.xterm-rows') ? ${XT}.document.querySelector('.xterm-rows').textContent : ''`);
await f.waitFor(`/^lead-ok$/m.test([...${XT}.document.querySelectorAll('.xterm-rows > div')].map((d) => d.textContent.trim()).join('\\n'))`, 8000);
check(/lead-ok/.test(await screen()), 'the shell ran it: C-u C-y went as control codes, ;e as Return');

console.log('history');
await f.eval(`${IL}.document.getElementById('form').value = ''; true`);
await focusForm();
await f.key('ArrowUp', 'ArrowUp');
await wait(150);
check(await formValue() === 'echo lead;cu;cy-ok;e', 'Up brings back the last line sent');

done();
