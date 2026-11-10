// test/e2e/xipe_cards.mjs -- several matrix.html?kind=xipe cards opened at
// once must each show their own card: /xipe broadcasts every response to
// every consumer, so request ids must be unique (fixed
//  in lib/xipe/xipe-client.js). Also the relay's error paths.
import { openPage, PAGES, check, done } from './cdp.mjs';

const refs = ['module=Calc&name=add&arity=2', 'module=Calc&name=square&arity=1', 'module=Calc&name=average&arity=1', 'module=Nope&name=x'];
const base = PAGES + 'panels/resident/matrix.html?kind=xipe&root=.&ref=';
const pages = await Promise.all(refs.map((r) => openPage(base + encodeURIComponent(r))));
const settled = `document.getElementById('grid-wrap').innerText.trim().length > 0 || /no match/.test(document.getElementById('msg').textContent) || !document.getElementById('placeholder').hidden`;
await Promise.all(pages.map((p) => p.waitFor(settled, 60000)));
const label = (p) => p.eval(`document.getElementById('ref-label').textContent`);
check((await label(pages[0])).startsWith('Calc.add/2'), 'card 1 is Calc.add/2');
check((await label(pages[1])).startsWith('Calc.square/1'), 'card 2 is Calc.square/1');
check((await label(pages[2])).startsWith('Calc.average/1'), 'card 3 is Calc.average/1');
check(/eval_error/.test(await pages[2].eval(`document.getElementById('grid-wrap').innerText`)) &&
      /error/.test(await pages[2].eval(`document.querySelector('table.mx-grid thead').innerText`)), 'card 3 has an error column');
check(/no match/.test(await pages[3].eval(`document.getElementById('msg').textContent`)), 'an unknown address says "no match"');
await Promise.all(pages.map((p) => p.close()));

const bad = await openPage(PAGES + 'panels/resident/matrix.html?kind=xipe&root=zzz&ref=x');
await bad.waitFor(`!document.getElementById('placeholder').hidden`, 10000);
const ph = await bad.eval(`document.getElementById('placeholder').textContent`);
check(/^\(xipe: no Xipe Totec project configured for "zzz"/.test(ph) && !/xipe: xipe:/.test(ph), 'an unknown root is reported once, readably: ' + ph);
await bad.close();
done();
