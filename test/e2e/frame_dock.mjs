// test/e2e/frame_dock.mjs -- the frame's dock (D-unified-dock): the input form is
// a lead-key form that sends through the dock's input_target. Its first
// destination is tezcatl, so the frame's lines run as before (they come back as
// runLine); ;i goes to the input_target, a letter picks and the keyboard comes
// back; to emacs-vent the keys go as kind:"input" (caught at ws.send: nothing
// answers behind the test relay); tezcatl refuses a key with a modifier; the
// dock's virtual keyboard lights what is typed in the frame's form; a line sent
// as soon as the dock's input_target is up is not lost; the dock's side, size
// and grid (dock side / size / rows / reset, kept by the skin, ?dock=). The
// suggestions in the dock: test/e2e/frame_suggest.mjs.
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const C = (s) => JSON.stringify(s);

const f = await openPage(PAGES + 'panels/skins/frame.html');
await f.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
const TW = `window.frameSkin.target().contentWindow`;
const VW = `window.frameSkin.vkbd().contentWindow`;
await f.waitFor(`(() => { try { return /t\\s*tezcatl/.test(${TW}.document.getElementById('list').textContent)
  && ${VW}.document.querySelectorAll('#kb span').length === 87; } catch (_) { return false; } })()`, 15000);
const rows = () => f.eval(`${TW}.document.getElementById('list').textContent`);
const head = () => f.eval(`${TW}.document.getElementById('head').textContent`);
check(/t\s*tezcatl/.test(await rows()) && /e\s*emacs-vent/.test(await rows()), 'the dock lists the destinations: ' + C(await rows()));
check(await head() === '→ tezcatl', 'tezcatl is chosen at first');

const recvText = () => f.eval(`document.getElementById('recv').textContent`);
const noteText = () => f.eval(`document.getElementById('lnote').textContent`);
const lineValue = () => f.eval(`document.getElementById('line').value`);
async function typeLine(text, enter = true) {
  await f.eval(`document.getElementById('line').focus(); true`);
  for (const ch of text) await f.key(ch, '', ch);
  if (enter) { await f.key('Enter', 'Enter', '\r'); await wait(500); }
}

console.log('the frame\'s lines, through tezcatl');
await typeLine('skin main 1,1');
check(await f.waitFor(`JSON.parse(JSON.stringify(window.frameSkin.state())).ratio.length === 2`, 5000), 'skin main 1,1 ran (via input_target -> runLine)');
check(/> skin main 1,1/.test(await recvText()), 'the receiving side echoes it');
check(await lineValue() === '', 'the form is emptied');
const lit = await f.eval(`[...${VW}.document.querySelectorAll('#kb span[data-shade]')].length`);
check(lit > 0, 'the dock\'s virtual keyboard lit what was typed (' + lit + ' keys)');
await typeLine(';cx');
await wait(300);
check(/tezcatl takes a line of chars/.test(await noteText()), 'tezcatl refuses a key with a modifier: ' + C(await noteText()));
// a line pasted with its newline (lead.escape makes it ;e): the Return at the end is the line's end
async function paste(text) {
  await f.eval(`(() => { const el = document.getElementById('line'); el.focus(); el.value = '';
    const dt = new DataTransfer(); dt.setData('text/plain', ${C(text)});
    el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', dataTransfer: dt, cancelable: true, bubbles: true })); return true; })()`);
}
await paste('skin main 1,2,1\n');
check(await lineValue() === 'skin main 1,2,1;e', 'a pasted newline is ;e in the form');
await f.key('Enter', 'Enter', '\r');
check(await f.waitFor(`JSON.parse(JSON.stringify(window.frameSkin.state())).ratio.length === 3`, 5000), '...and the line runs: the Return at its end is dropped');
await paste('skin main 1\nx');
await f.key('Enter', 'Enter', '\r');
await wait(500);
check(/tezcatl takes a line of chars, not <return>/.test(await noteText()), 'a Return inside the line is still refused: ' + C(await noteText()));

console.log(';i and a letter');
await f.eval(`document.getElementById('line').value = ''; true`);
await typeLine(';i', false);
await wait(300);
check(await f.eval(`document.activeElement === window.frameSkin.target()`), ';i: the keyboard is in the dock\'s input_target');
check(await lineValue() === '', '...and ;i left nothing in the form');
await f.key('e', '', 'e');
await wait(300);
check(await head() === '→ emacs-vent', 'e picks emacs-vent');
check(await f.eval(`document.activeElement && document.activeElement.id === 'line'`), 'the keyboard is back in the input form');

console.log('to emacs-vent');
await f.waitFor(`/emacs-vent\\s*connected/.test(${TW}.document.getElementById('list').textContent)`, 10000);
await f.eval(`(() => { const w = ${TW}; w.__sent = []; const o = w.Tezcatl.ws.send; w.Tezcatl.ws.send = (m) => { w.__sent.push(m); return o(m); }; return true; })()`);
await typeLine(';cx;cf');
const sent = await f.eval(`JSON.stringify(${TW}.__sent.filter((m) => m.kind === 'input'))`).then(JSON.parse);
check(sent.length === 1 && C(sent[0].sequence) === C([{ key: 'x', modifiers: ['control'] }, { key: 'f', modifiers: ['control'] }]),
  ';cx;cf goes to emacs-vent as C-x C-f: ' + C(sent[0] && sent[0].sequence));
check(/→ emacs-vent/.test(await noteText()), 'the answer is shown: ' + C(await noteText()));

console.log('back to tezcatl');
await typeLine(';i', false);
await wait(300);
await f.key('t', '', 't');
await wait(300);
check(await head() === '→ tezcatl', 't picks tezcatl again');
await typeLine('skin main 1,1,1');
check(await f.waitFor(`JSON.parse(JSON.stringify(window.frameSkin.state())).ratio.length === 3`, 5000), 'and the frame\'s lines run again');

console.log('the first line, right as the dock\'s input_target is up');
// till every destination is in, the frame runs a line itself; after, it goes through
// the input_target (a line sent between the two was lost: "no destination")
let lost = 0;
for (let i = 0; i < 3; i++) {
  const g = await openPage(PAGES + 'panels/skins/frame.html');
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try { if (await g.eval(`!!window.frameSkin.dock().targetId()`)) break; } catch (_) {}
  }
  await g.eval(`(() => { const el = document.getElementById('line'); el.focus(); el.value = 'skin main 1,1'; return true; })()`);
  await g.key('Enter', 'Enter', '\r');
  if (!(await g.waitFor(`window.frameSkin.state().ratio.length === 2`, 3000))) lost++;
  await g.close();
}
check(lost === 0, 'a line sent at once runs (' + lost + ' of 3 lost)');

console.log('the dock: its side, size and grid (D-dock)');
const rect = (sel) => f.eval(`JSON.stringify(document.querySelector('${sel}').getBoundingClientRect())`).then(JSON.parse);
const side = () => f.eval(`document.getElementById('skin').getAttribute('data-dock')`);
const lastRecv = () => f.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-2).map((d) => d.textContent).join('\\n'); })()`);
async function dockLine(text) {
  await f.eval(`(() => { const el = document.getElementById('line'); el.focus(); el.value = ${C(text)}; return true; })()`);
  await f.key('Enter', 'Enter', '\r');
  await wait(500);
  return lastRecv();
}
check(await side() === 'b', 'the dock stands below at first (docks/standard.json)');
check(await f.eval(`document.querySelectorAll('#dock .dock-empty').length === 0`), 'every part of the standard dock is made now (no empty box)');
const partText = (panel) => f.eval(`(() => { const el = window.frameSkin.dock().partOf(${C(panel)}); return el ? el.contentDocument.body.innerText : ''; })()`);
await f.waitFor(`(() => { const el = window.frameSkin.dock().partOf('How_to_use'); return el && /;i/.test(el.contentDocument.body.innerText); })()`, 10000);
const hu = await partText('How_to_use');
check(/;c\s+Ctrl on the next key/.test(hu) && /;i\s+dock\.target ── frame: to the input_target/.test(hu) && /skin add \{panel\}/.test(hu),
  'How_to_use: the keys, the shortcuts with their command, the lines (from the lead table and command_map.json)');
await f.waitFor(`(() => { const el = window.frameSkin.dock().partOf('clock'); return el && /\\d\\d:\\d\\d:\\d\\d/.test(el.contentDocument.body.innerText); })()`, 10000);
check(/\d\d:\d\d:\d\d/.test(await partText('clock')), 'clock: the time, HH:MM:SS');
// the frames are marked: a reload would lose the mark
await f.eval(`(() => { for (const el of document.querySelectorAll('#dock iframe')) el.contentWindow.__mark = 1; return true; })()`);
check(/dock size 16em \(bottom\)/.test(await dockLine('dock size 16em')), 'dock size 16em: said');
check(await f.eval(`document.getElementById('dock').style.flexBasis`) === '16em', '...the dock is 16em high');
check(/the dock on the left/.test(await dockLine('dock side l')), 'dock side l: said');
let d = await rect('#dock'), st = await rect('#stage');
check(await side() === 'l' && d.x + d.width <= st.x + 1 && d.height > st.height * 0.9, '...the dock left of the lines, as tall: ' + C([d.x, d.width, st.x]));
await dockLine('skin add 1 tree');
await f.waitFor(`window.frameSkin.frameAt('11')`, 10000);
const p11 = await f.eval(`JSON.stringify(window.frameSkin.frameAt('11').getBoundingClientRect())`).then(JSON.parse);
check(p11.x >= st.x - 1 && p11.x + p11.width <= st.x + st.width + 1, '...a panel of the lines stays in their room');
check(await f.eval(`[...document.querySelectorAll('#dock iframe')].every((el) => el.contentWindow.__mark === 1)`), '...the dock\'s frames were not reloaded');
check(/has 8 rows on the left, got 2/.test(await dockLine('dock rows 1,1')), 'dock rows that do not fit: refused');
check(/dock rows 1,1,1,1,1,1,2,1 \(left\)/.test(await dockLine('dock rows 1,1,1,1,1,1,2,1')), 'dock rows on the left: said');
check(await f.eval(`document.getElementById('dock').style.gridTemplateRows`) === '1fr 1fr 1fr 1fr 1fr 1fr 2fr 1fr', '...the grid has them');
await dockLine('dock side r');
d = await rect('#dock'); st = await rect('#stage');
check(await side() === 'r' && d.x >= st.x + st.width - 1, 'dock side r: the dock right of the lines');
check(await f.eval(`document.getElementById('dock').style.gridTemplateRows`) === '2fr 4fr 3fr 1fr 1fr 1fr 6fr 1fr', '...the right has the file\'s rows (the left\'s change stays with the left)');
const saved = await f.eval(`JSON.stringify(window.frameSkin.state().dock)`).then(JSON.parse);
check(C(saved) === C({ side: 'r', size: { b: '16em' }, rows: { l: [1, 1, 1, 1, 1, 1, 2, 1] } }), 'the skin keeps what was changed: ' + C(saved));
check(/the side stays: right/.test(await dockLine('dock reset')), 'dock reset: the side stays');
check(C(await f.eval(`JSON.stringify(window.frameSkin.state().dock)`).then(JSON.parse)) === C({ side: 'r' }), '...only the side is left');
check(/dock side l\|b\|r/.test(await dockLine('dock up')), 'dock <anything else>: what there is');
await dockLine('dock side l');
await dockLine('skin save dockt');
const g = await openPage(PAGES + 'panels/skins/frame.html?skin=dockt');
await g.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
check(await g.eval(`document.getElementById('skin').getAttribute('data-dock')`) === 'l', 'a saved skin opens with its dock where it was (left)');
await g.close();
const h = await openPage(PAGES + 'panels/skins/frame.html?dock=r');
await h.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
check(await h.eval(`document.getElementById('skin').getAttribute('data-dock')`) === 'r', 'frame.html?dock=r: a new frame with its dock on the right');
await h.close();
await f.eval(`Tezcatl.store.update('tezcatl:frame:skins', (m) => { m = m || {}; delete m.dockt; return m; }).then(() => true)`);

done();
