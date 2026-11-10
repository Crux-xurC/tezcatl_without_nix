// test/e2e/frame_synthesis.mjs -- a synthesis in the frame (D-synthesis), with the
// first one: matrix_set (syntheses/matrix_set.json -- matrix_bar, the table, a
// command line; the matrix skin as a synthesis). skin add places it as one
// panel with its own name, its main is the way in, `syn <word>` moves inside,
// its command line drives only its own table (two placed side by side), the band
// shows the main's status, the skin port tells a panel its synthesis,
// synthesis.keep is kept over a reload and in skin save (kept=saved when read
// back), skin del closes it whole, frame.html?synthesis= holds it alone even
// when opened from a frame (a copy of the opener's sessionStorage).
// Against the copy of the real Xipe Totec (root "."), as matrix_set.mjs.
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(300);
  return p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-1).map((d) => d.textContent).join('\\n'); })()`);
}
const inner = (place, k) => `window.frameSkin.innerAt('${place}', ${k})`;
const bar = (place) => `${inner(place, 0)}.contentWindow.matrixBar`;
const barStatus = (place) => p.eval(`${bar(place)} ? ${bar(place)}.status() : null`);
const rows = (place) => p.eval(`${inner(place, 1)}.contentDocument.querySelectorAll('table.mx-grid tbody tr').length`);
// a line typed into a synthesis' command line (its panel 2), sent with Mod-Enter
async function cmd(place, text) {
  await p.eval(`${inner(place, 2)}.focus(); ${inner(place, 2)}.contentWindow.focus(); ${inner(place, 2)}.contentDocument.querySelector('.cm-content').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r', 2);
}

console.log('a synthesis placed');
await p.eval(`sessionStorage.clear(); true`);
check(/the synthesis matrix_set_1 at 1 1/.test(await line('skin add matrix_set')), 'skin add matrix_set: the synthesis matrix_set_1 at 1 1');
let s = await st();
check(JSON.stringify(s.columns[0][0]) === JSON.stringify(['matrix_set', 1, 1, true, { synthesis: 'matrix_set_1' }]), 'one item in the skin: ' + JSON.stringify(s.columns[0][0]));
check(await p.eval(`${inner('11', 0)}.src.includes('matrix_bar.html') && ${inner('11', 1)}.src.includes('kind=xipe_rows') && ${inner('11', 2)}.src.includes('code_cmd_in.html')`),
  'its three panels, the table with the query its definition gives');
check(!!await p.waitFor(`${inner('11', 1)}.contentDocument.querySelectorAll('table.mx-grid tbody tr').length > 0`, 60000), 'the table shows the calc rows');
check(!!await p.waitFor(`/^xipe_rows:all ── \\d+ rows$/.test(${bar('11')}.status())`, 10000), 'the bar says the table: ' + await barStatus('11'));
const band = () => p.eval(`document.querySelector('.pane.synthesis iframe.thema').contentDocument.getElementById('text').textContent`);
check(!!await p.waitFor(`/^1 1 matrix_set_1 ── xipe_rows:all ── \\d+ rows$/.test(document.querySelector('.pane.synthesis iframe.thema').contentDocument.getElementById('text').textContent)`, 5000),
  'the band: its own name and its main\'s status (panel.status): ' + await band());
check(await p.eval(`document.activeElement === ${inner('11', 0)}`), 'skin add entered its main (matrix_bar)');
check(await p.eval(`(() => { const a = window.frameSkin.abs(); return !!a; })()`), 'the map is there');

console.log('the skin port');
const sp = await p.eval(`(() => { const w = ${inner('11', 1)}.contentWindow; const s = w.Tezcatl.skinPort.synthesis(w); return s && { own: s.own, self: s.self, main: s.main, panels: s.members.map((m) => m.panel + ':' + !!m.id) }; })()`);
check(sp && sp.own === 'matrix_set_1' && sp.self === 1 && sp.main === 0 && sp.panels.join(',') === 'matrix_bar:true,matrix_table:true,code_cmd_in:true',
  'a panel of it is told its synthesis: ' + JSON.stringify(sp));

console.log('moving inside');
check(/matrix_set_1 ── syn main \/ table \/ line \/ bar/.test(await line('syn')), 'syn alone says the words');
await line('syn line');
await wait(200);
check(await p.eval(`document.activeElement === ${inner('11', 2)}`), 'syn line: into its command line');
check(/! syn nope ── matrix_set_1 has syn main/.test(await line('syn nope')), 'an unknown word is said');
await line('skin focus 1 1');
await wait(200);
check(await p.eval(`document.activeElement === ${inner('11', 0)}`), 'skin focus on it: its main');

console.log('its command line drives its table');
const before = await rows('11');
await cmd('11', 'matrix update');
check(!!await p.waitFor(`/^matrix update ── xipe_rows:all  \\d+ rows$/.test(${bar('11')}.status())`, 20000), 'matrix update: ' + await barStatus('11'));
await cmd('11', 'get xipe:module=Calc&name=add&arity=2');
check(!!await p.waitFor(`/^get xipe:module=Calc&name=add&arity=2 ── xipe:module=Calc&name=add&arity=2  1 rows$/.test(${bar('11')}.status())`, 20000), 'get <card>: ' + await barStatus('11'));

console.log('two of them');
await line('skin main 1,1');
check(/the synthesis matrix_set_2 at 2 1/.test(await line('skin add 2 matrix_set')), 'a second: matrix_set_2');
check(!!await p.waitFor(`${bar('21')} && /^xipe_rows:all ── \\d+ rows$/.test(${bar('21')}.status())`, 30000), 'it shows its own first table');
await cmd('21', 'matrix pwd');
check(!!await p.waitFor(`${bar('21')}.status() === 'xipe_rows:all'`, 5000), 'pwd in the second: xipe_rows:all');
check(/^get xipe:module=Calc/.test(await barStatus('11')), 'the first is untouched: ' + await barStatus('11'));
check((await rows('11')) === 1 && before > 1, 'the first table still shows the card');

console.log('what the main keeps');
await p.eval(`${inner('11', 0)}.contentWindow.Tezcatl.bus.post('synthesis.keep', { id: 7, bad: { x: 1 } }); true`);
await wait(300);
s = await st();
check(JSON.stringify(s.columns[0][0][4]) === JSON.stringify({ synthesis: 'matrix_set_1', keep: { id: '7' } }), 'kept in its item (plain values only): ' + JSON.stringify(s.columns[0][0][4]));
await p.eval(`${inner('21', 1)}.contentWindow.Tezcatl.bus.post('synthesis.keep', { id: 9 }); true`);
await wait(300);
check(!(await st()).columns[1][0][4].keep, 'a panel that is not the main keeps nothing');
await p.send('Page.reload', {});
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
check(!!await p.waitFor(`${inner('11', 0)} && /[?&]id=7(&|$)/.test(${inner('11', 0)}.src) && !/kept=saved/.test(${inner('11', 0)}.src)`, 10000),
  'over a reload: the main gets it back as its query');
check(!!await p.waitFor(`${inner('21', 0)} && ${inner('21', 0)}.src.includes('matrix_bar.html')`, 10000), 'both are there again');
await line('skin save syn_e2e');
await line('skin read syn_e2e');
check(!!await p.waitFor(`${inner('11', 0)} && /[?&]id=7(&|$)/.test(${inner('11', 0)}.src) && /kept=saved/.test(${inner('11', 0)}.src)`, 10000),
  'read from a saved skin: kept=saved beside it');

console.log('closing');
check(/closed the synthesis matrix_set_1 at 1 1/.test(await line('skin del matrix_set_1')), 'skin del <own name>');
check(await p.eval(`document.querySelectorAll('.pane.synthesis').length`) === 1, 'its panels are gone with it');
check(/closed the synthesis matrix_set_2/.test(await line('skin del matrix_set')), 'skin del <synthesis name>');
check(/! no such panel: nope \(nor a synthesis/.test(await line('skin add nope')), 'neither a panel nor a synthesis: said');

console.log('a frame holding one synthesis');
await p.send('Runtime.evaluate', { expression: `window.open(${JSON.stringify(PAGES + 'panels/skins/frame.html?synthesis=matrix_set')}); true`, userGesture: true });
const q = await attachTo('frame.html?synthesis=matrix_set');
await q.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
const qs = await q.waitFor(`(() => { const j = window.frameSkin.state(); return j.columns.flat().length === 1 && j.columns[0][0][0] === 'matrix_set' ? JSON.stringify(j) : null; })()`, 10000);
check(!!qs, 'opened from a frame (a copy of its sessionStorage): it holds the synthesis alone');
await q.send('Page.reload', {});
await q.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
await wait(500);
check(await q.eval(`window.frameSkin.state().columns.flat().length`) === 1, 'a reload keeps it (not added twice)');
await q.close();

await p.eval(`Tezcatl.store.update('tezcatl:frame:skins', (m) => { if (m) delete m.syn_e2e; return m; }).then(() => true)`);
const errs = p.logs.filter((l) => /exception|error/i.test(l) && !/Failed to load resource/.test(l));
check(!errs.length, 'no exceptions in the frame: ' + errs.slice(0, 3).join(' | '));
// closed: its matrix_bar would stay a target of matrix.* for the scenarios after it
await p.close();
done();
