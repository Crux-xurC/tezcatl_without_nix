// test/e2e/xipe_place.mjs -- from Xipe Totec's tables to the source (G5, G6),
// against the real xipe_totec copy (root "."), whose project is under the FS
// root (fsroot/xproj): the table's `g d` on a calc row opens its function's
// definition in a code_editor at the line (row/list's path and line, put under
// the FS root), and the cards list (card/list) shows every function with
// its place, effect and rows -- M-d goes to the definition, Enter opens the
// card in matrix.html.
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const view = `(() => { const c = document.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const lineOf = (page) => page.eval(`(() => { const v = ${view}; return v.state.doc.lineAt(v.state.selection.main.head).number; })()`);

console.log('the table: g d on a calc row');
const m = await openPage(PAGES + 'panels/resident/matrix.html?kind=xipe_rows&root=.&ref=all');
await m.waitFor(`document.getElementById('grid-wrap').innerText.includes('→') || !document.getElementById('placeholder').hidden`, 60000);
await m.eval(`document.getElementById('grid-wrap').focus(); true`);
const rowIndex = (text) => m.eval(`[...document.querySelectorAll('table.mx-grid tbody tr')].findIndex(tr => tr.textContent.includes(${JSON.stringify(text)}))`);
const n = await rowIndex('Calc.square/1');
check(n >= 0, 'the calc rows are listed (Calc.square/1 at row ' + n + ')');
for (let i = 0; i < n; i++) await m.key('j', 'KeyJ', 'j');
await m.key('g', 'KeyG', 'g');
await m.key('d', 'KeyD', 'd');
const C = await attachTo('code_editor.html?path=xproj%2Fcalc.exs');
await C.waitFor(`document.querySelector('.cm-content') && /def square/.test(${view}.state.doc.toString())`, 20000);
check(true, 'g d: no code_editor had the file, so a new one opened it (xproj/calc.exs, the path from the FS root)');
await C.waitFor(`${view}.state.doc.lineAt(${view}.state.selection.main.head).text.includes('def square')`, 10000).catch(() => {});
const sq = await C.eval(`${view}.state.doc.lineAt(${view}.state.selection.main.head).text`);
check(/def square\(x\)/.test(sq), '...at the line the function is defined: ' + JSON.stringify(sq.trim()) + ' (line ' + await lineOf(C) + ')');
await wait(300);
check(/xproj\/calc\.exs:\d+/.test(await m.eval(`document.getElementById('msg').textContent`)), 'the table says where it went: ' + await m.eval(`document.getElementById('msg').textContent`));

console.log('the cards list: card/list, M-d, Enter');
const L = await openPage(PAGES + 'panels/tool/list.html?config=xipe_cards&root=.');
await L.waitFor(`/Calc\\.add\\/2/.test(document.getElementById('list').innerText)`, 30000);
const text = await L.eval(`document.getElementById('list').innerText`);
check(/Calc\.add\/2\s*calc\.exs:2 · pure · 1 row/.test(text), 'a function with its place, effect and rows: ' + (text.match(/Calc\.add\/2[^\n]*\n?[^\n]*/) || [''])[0].replace(/\n/g, ' | '));
check(/Calc\.sub\/2\s*calc\.exs:3 · unknown · 0 rows/.test(text), 'a function nobody made a row for is there too (Calc.sub/2)');
const foot = await L.eval(`document.getElementById('foot').textContent`);
check(/^\d+ function\(s\)  root=\.$/.test(foot), 'the foot counts them, and says nothing is out of reach: ' + foot);
// to Calc.average/1 by the filter, then M-d
await L.eval(`document.getElementById('filter').focus(); true`);
await L.send('Input.insertText', { text: 'average' });
await wait(300);
await L.key('d', 'KeyD', 'd', 1);
await C.waitFor(`${view}.state.doc.lineAt(${view}.state.selection.main.head).text.includes('def average')`, 10000).catch(() => {});
const av = await C.eval(`${view}.state.doc.lineAt(${view}.state.selection.main.head).text`);
check(/def average\(list\)/.test(av), 'M-d: the code_editor that has the file goes to the definition: ' + JSON.stringify(av.trim()));
// Enter: the card in matrix.html
await L.key('Enter', 'Enter', '\r');
const K = await attachTo('matrix.html?kind=xipe&ref=module%3DCalc%26name%3Daverage%26arity%3D1');
await K.waitFor(`/Calc\\.average\\/1/.test(document.getElementById('ref-label').textContent)`, 30000);
check(true, 'Enter: the card opens in matrix.html (' + (await K.eval(`document.getElementById('ref-label').textContent`)).slice(0, 40) + ')');

for (const pg of [m, C, L, K]) {
  const errs = pg.logs.filter((l) => /exception|console.error/.test(l));
  check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await pg.close();
}
done();
