// test/e2e/matrix_commands.mjs -- the matrix.* tezcatl-commands sent from
// the palette page (command_map.json, lib/xipe/matrix-target.js): a matrix_set
// (its matrix_bar, a target of kind skin) takes them before any matrix.html open on its own; with no skin, the
// matrix.html focused (or opened) last; with nothing open, matrix.get opens a
// new matrix.html (the fallback). Against the real xipe_totec copy (root ".").
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CARD = 'xipe:module=Calc&name=add&arity=2';

const palette = await openPage(PAGES + 'panels/tool/list.html?config=commands');
await palette.waitFor(`!!(window.Tezcatl && Tezcatl.commands)`, 10000);
await palette.eval(`Tezcatl.commands.load().then(() => true)`);
// userGesture: as a key press in the palette would (the fallback's window.open needs it)
const invoke = (name, args) => palette.send('Runtime.evaluate', {
  expression: `(Tezcatl.commands.invoke(${JSON.stringify(name)}, ${JSON.stringify(args || {})}), true)`,
  userGesture: true, returnByValue: true,
});
const msg = (pg) => pg.eval(`document.getElementById('msg').textContent`);
const label = (pg) => pg.eval(`document.getElementById('ref-label').textContent`);
const focus = (pg) => pg.eval(`window.dispatchEvent(new Event('focus')); true`);
const F = (part) => `[...document.querySelectorAll('iframe')].find(f => (f.src||'').includes(${JSON.stringify(part)}))`;
const S = `${F('matrix_bar.html')}.contentDocument.getElementById('status')`;
const rowsShown = (pg) => pg.waitFor(`document.querySelectorAll('table.mx-grid tbody tr').length > 0`, 60000);

console.log('matrix commands');
check((await palette.eval(`Tezcatl.commands.list().filter(c => c.name.startsWith('matrix.')).map(c => c.name).join(' ')`)) === 'matrix.update matrix.get matrix.pwd',
  'command_map.json lists matrix.update / matrix.get / matrix.pwd');

// a matrix.html on its own, then a skin: the skin takes the command
const page = await openPage(PAGES + 'panels/resident/matrix.html?kind=xipe_rows&root=.&ref=all');
await rowsShown(page);
const skin = await openPage(PAGES + 'panels/skins/frame.html?synthesis=matrix_set');
await skin.waitFor(`/xipe_rows:all ── \\d+ rows/.test(${S}.textContent)`, 60000);
await focus(page);   // the page focused later still loses to the skin
await wait(300);
await invoke('matrix.get', { path: CARD });
await skin.waitFor(`/xipe:module=Calc&name=add&arity=2  1 rows/.test(${S}.textContent)`, 20000);
check(true, 'matrix.get from the palette went to the skin: ' + await skin.eval(`${S}.textContent`));
check(/xipe rows/.test(await label(page)), 'the matrix.html on its own did not take it (still the calc rows)');
await invoke('matrix.pwd');
await skin.waitFor(`${S}.textContent === ${JSON.stringify(CARD)}`, 5000);
check(true, 'matrix.pwd shows the skin\'s path on its bar');

// the skin closed: the matrix.html on its own takes it
await skin.close();
await wait(500);
await invoke('matrix.get', { path: 'demo:x' });
await page.waitFor(`/matrix get ── demo:x  3 rows/.test(document.getElementById('msg').textContent)`, 10000);
check(/^demo:x/.test(await label(page)), 'with no skin, the matrix.html on its own takes matrix.get (demo:x)');

// two on their own: the one opened (or focused) last
const page2 = await openPage(PAGES + 'panels/resident/matrix.html?kind=xipe_rows&root=.&ref=all');
await rowsShown(page2);
await wait(300);
await invoke('matrix.pwd');
await page2.waitFor(`document.getElementById('msg').textContent === 'xipe_rows:all'`, 5000);
check(!/xipe_rows:all$/.test(await msg(page)), 'matrix.pwd: the one opened last answers, the other does not');
await focus(page);
await wait(300);
await invoke('matrix.update');
await page.waitFor(`/matrix update ── demo:x  3 rows/.test(document.getElementById('msg').textContent)`, 10000);
check(true, 'after focusing the first one, matrix.update goes to it');
check(!/matrix update/.test(await msg(page2)), 'and not to the other');

// nothing open: matrix.get opens a new matrix.html (command_map.json fallback)
await page.close();
await page2.close();
await wait(500);
await invoke('matrix.get', { path: 'xipe_rows:all' });
const opened = await attachTo('path=xipe_rows', 10000);
await rowsShown(opened);
check(/xipe rows/.test(await label(opened)), 'with no matrix open, matrix.get opens matrix.html?path=xipe_rows%3Aall and shows it');
// ...which is a target itself now
await invoke('matrix.pwd');
await opened.waitFor(`document.getElementById('msg').textContent === 'xipe_rows:all'`, 5000);
check(true, 'the opened page answers the next command');

// one invocation, one action: matrix.update / pwd with a target do not open anything
const before = (await (await fetch('http://127.0.0.1:' + (process.env.CDP_PORT || '9223') + '/json/list')).json()).filter((x) => x.type === 'page').length;
await invoke('matrix.update');
await wait(1000);
const after = (await (await fetch('http://127.0.0.1:' + (process.env.CDP_PORT || '9223') + '/json/list')).json()).filter((x) => x.type === 'page').length;
check(before === after, 'a command a window takes opens no fallback page');

for (const pg of [palette, opened]) {
  const errs = pg.logs.filter((l) => /exception|console.error/.test(l));
  check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
}
await opened.close();
await palette.close();
done();
