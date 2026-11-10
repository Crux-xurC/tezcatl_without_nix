// test/e2e/xipe_rows.mjs -- matrix.html?kind=xipe_rows against the real
// xipe_totec copy (root "."): one sentence per calc row, ⟦id⟧ shown by
// label, long values clamped to one line, the cursor cell's full text below.
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await openPage(PAGES + 'panels/resident/matrix.html?kind=xipe_rows&root=.&ref=all');
await p.waitFor(`document.getElementById('grid-wrap').innerText.includes('→') || !document.getElementById('placeholder').hidden`, 60000);

const rows = await p.eval(`[...document.querySelectorAll('table.mx-grid tbody tr')].map(tr => tr.children[1].textContent)`);
console.log('xipe_rows:\n' + rows.map((r) => '    ' + r.slice(0, 90)).join('\n'));
check(rows.some((r) => r === 'Calc.add/2 (1, 2) → 3'), 'add(1,2) as one sentence');
check(rows.some((r) => /^Calc\.square\/1 \(⟦Calc\.add\/2#\w{4}⟧\) → 9$/.test(r)), '⟦id⟧ argument shown by the referenced row\'s label');
check(rows.some((r) => r === 'Calc.average/1 ([]) → (error)'), 'an eval_error row reads "(error)"');
const nodes = await p.eval(`(() => { const ths = [...document.querySelectorAll('table.mx-grid thead th')]; const i = ths.findIndex(th => th.textContent === 'node'); return i < 0 ? null : [...document.querySelectorAll('table.mx-grid tbody tr')].map(tr => tr.children[i].textContent); })()`);
check(nodes && nodes.length && nodes.every((v) => v === 'ok'), 'node column (row/list linked): every row\'s function exists -> ok');

const wide = await p.eval(`document.querySelector('table.mx-grid').scrollWidth <= document.getElementById('grid-wrap').clientWidth`);
check(wide, 'long values (4x4 matrix, stack trace) do not stretch the grid past the view');
const cut = await p.eval(`[...document.querySelectorAll('table.mx-grid td')].some(td => td.scrollWidth > td.clientWidth)`);
check(cut, 'at least one long cell is clamped');

await p.eval(`document.getElementById('grid-wrap').focus(); true`);
const n = await p.eval(`[...document.querySelectorAll('table.mx-grid tbody tr')].findIndex(tr => tr.textContent.includes('Calc.mat/0'))`);
for (let i = 0; i < n; i++) await p.key('j', 'KeyJ', 'j');
await p.key('l', 'KeyL', 'l');
await wait(200);
const detail = await p.eval(`document.getElementById('detail').hidden ? '' : document.getElementById('detail').textContent`);
check(/Calc\.mat\/0 \(\) → \[\[1, 2, 3, 4\]/.test(detail), 'the cursor cell\'s full text is shown under the grid');

const errs = p.logs.filter((l) => /exception|console.error/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
