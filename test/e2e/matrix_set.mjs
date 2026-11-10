// test/e2e/matrix_set.mjs -- the synthesis matrix_set (D-synthesis; it was the
// matrix skin) in a frame of its own (frame.html?synthesis=matrix_set): the
// table (matrix.html) and the command line, matrix_bar saying the table. `matrix update` fetches the
// table again (a row added behind its back shows up only then -- the table
// is not updated by notifications), `matrix get <path>`
// fetches another, `matrix pwd` prints the path `get` takes back. Against the
// real xipe_totec copy (root "."); the row it adds is removed at the end.
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await openPage(PAGES + 'panels/skins/frame.html?synthesis=matrix_set');
const F = (part) => `[...document.querySelectorAll('iframe')].find(f => (f.src||'').includes(${JSON.stringify(part)}))`;
const doc = (part) => `${F(part)}.contentDocument`;
const S = `${F('matrix_bar.html')}.contentDocument.getElementById('status')`;
const status = () => p.eval(`${S}.textContent`);
const rowTexts = () => p.eval(`[...${doc('panels/resident/matrix.html')}.querySelectorAll('table.mx-grid tbody tr')].map(tr => tr.innerText)`);

const cmd = async (line, ms = 20000) => {
  await p.eval(`${F('code_cmd_in')}.contentWindow.focus(); ${doc('code_cmd_in')}.querySelector('.cm-content').focus(); true`);
  await p.send('Input.insertText', { text: line });
  await p.key('Enter', 'Enter', '\r', 2);
  const esc = line.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await p.waitFor(`new RegExp(${JSON.stringify(esc)} + ' ── ').test(${S}.textContent) || ${S}.textContent === ${JSON.stringify('__pwd__')}`, ms);
  return status();
};
const pwd = async () => {
  await p.eval(`${S}.textContent = '__pwd__'; true`);
  await p.eval(`${F('code_cmd_in')}.contentWindow.focus(); ${doc('code_cmd_in')}.querySelector('.cm-content').focus(); true`);
  await p.send('Input.insertText', { text: 'matrix pwd' });
  await p.key('Enter', 'Enter', '\r', 2);
  await p.waitFor(`${S}.textContent !== '__pwd__'`, 5000);
  return status();
};
// a request to Xipe Totec from the matrix pane's own client (not through the skin)
const xipe = (method, params) => p.eval(`${F('panels/resident/matrix.html')}.contentWindow.Tezcatl.xipeClient.request(${F('panels/resident/matrix.html')}.contentWindow.Tezcatl.config, '.', ${JSON.stringify(method)}, ${JSON.stringify(params)})`);

console.log('matrix_set');
await p.waitFor(`!!${F('matrix_bar.html')} && !!${F('matrix_bar.html')}.contentDocument.getElementById('status')`, 15000);
await p.waitFor(`${F('panels/resident/matrix.html')} && ${doc('panels/resident/matrix.html')}.querySelectorAll('table.mx-grid tbody tr').length > 0`, 60000);
const before = await rowTexts();
check(before.some((r) => r.includes('Calc.add/2 (1, 2) → 3')), 'the first table is the calc rows (xipe_rows, root .): ' + before.length + ' rows');
await p.waitFor(`/xipe_rows:all/.test(${S}.textContent)`, 5000);
check(/xipe_rows:all ── \d+ rows/.test(await status()), 'the bar says which table and how many rows: ' + await status());
check((await pwd()) === 'xipe_rows:all', 'matrix pwd -> xipe_rows:all');

// a row added behind the table's back: not shown until `matrix update`
const node = await xipe('node/resolve', { module: 'Calc', name: 'mul', arity: '2' });
const added = await xipe('row/add', { node: node.id, args: ['6', '7'] });
await wait(1000);
check(!(await rowTexts()).some((r) => r.includes('Calc.mul/2 (6, 7)')), 'a row added elsewhere is not shown by itself');
check(/^matrix update ── xipe_rows:all  \d+ rows$/.test(await cmd('matrix update')), 'matrix update answers with the path and the row count');
check((await rowTexts()).some((r) => r.includes('Calc.mul/2 (6, 7) → (not evaluated)')), 'after matrix update the new row is there');
check((await rowTexts()).length === before.length + 1, 'one more row than before');

// another table, then back by the path pwd printed
check(/^get xipe:module=Calc&name=add&arity=2 ── xipe:module=Calc&name=add&arity=2  1 rows$/.test(await cmd('get xipe:module=Calc&name=add&arity=2')),
  'matrix get <card path> (leading "matrix" left out) fetches that card');
check(/Calc\.add\/2/.test(await p.eval(`${doc('panels/resident/matrix.html')}.getElementById('ref-label').textContent`)), 'the matrix pane shows the card Calc.add/2');
check((await pwd()) === 'xipe:module=Calc&name=add&arity=2', 'pwd follows: ' + await status());
check(/kind=xipe&/.test(await p.eval(`${F('panels/resident/matrix.html')}.contentWindow.location.search`)), 'the pane\'s URL follows too (a reload keeps the table)');
check(/xipe_rows:all  \d+ rows$/.test(await cmd('matrix get kind=xipe_rows&root=.&ref=all')), 'matrix get with the query form');

// what is refused
check(/^! matrix get nope:x ── nope:x  no adapter for kind="nope"$/.test(await cmd('matrix get nope:x')), 'an unknown kind says so');
check(/^! matrix get xipe_rows:all@nowhere ── /.test(await cmd('matrix get xipe_rows:all@nowhere')), 'an unknown root says so: ' + await status());
check(/^! matrix set ── no such command: set/.test(await cmd('matrix set')), 'an unknown command says so');
check(/^! matrix get ── get: one path/.test(await cmd('matrix get')), 'get without a path says how to write it');
check(/xipe_rows:all  \d+ rows$/.test(await cmd('matrix get xipe_rows:all')), 'and back to the calc rows');

// clean up the row this scenario added
await xipe('row/remove', { id: added.id });
check(/^matrix update ── xipe_rows:all  \d+ rows$/.test(await cmd('matrix update')) && (await rowTexts()).length === before.length, 'removed again (matrix update shows it gone)');

const errs = p.logs.filter((l) => /exception|console.error/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
