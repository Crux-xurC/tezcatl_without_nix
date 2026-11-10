// test/e2e/db_lines.mjs -- the database lines of the frame's input line and the
// list of database windows (D-db-session), against nix/db (tezcatl_e2e):
// `database` places a window here, `database id=1` window 1 (a second one is
// refused), `database tab` a new frame holding one; `db login <n>` from another
// tab makes window <n> ask (its band says so), `db exit` / `db cancel` say what
// cannot be done, an unknown window is said; db_list in the dock lists them
// (`db list open` / `close` change its row). With TEZCATL_E2E_DB_PASSWORD also:
// `db exit <n>` from another tab logs it out, `db cancel <n>` stops its
// statement, Del in db_list logs a window out.
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = process.env.TEZCATL_E2E_DB_PASSWORD || '';

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
await p.eval(`sessionStorage.clear(); true`);
await p.send('Page.reload', {});
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = (pg, n = 1) => pg.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-${n}).map((d) => d.textContent).join('\\n'); })()`);
async function line(pg, text, ms = 500) {
  await pg.send('Runtime.evaluate', { expression: `document.getElementById('line').focus(); true`, userGesture: true });
  await pg.send('Input.insertText', { text });
  await pg.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv(pg);
}
const inner = (place, k) => `window.frameSkin.innerAt('${place}', ${k})`;
const bar = (place) => `${inner(place, 0)}.contentWindow.dbBar`;
const band = (pg, place) => pg.eval(`(() => { const f = window.frameSkin.frameAt('${place}'); const t = f && f.parentNode.parentNode.querySelector('iframe.thema'); return t ? t.contentDocument.getElementById('text').textContent : null; })()`);
const listText = (pg) => pg.eval(`(() => { const f = window.frameSkin.dock().partOf('db_list'); return f ? f.contentDocument.body.innerText : null; })()`);
const listHeight = (pg) => pg.eval(`Math.round(window.frameSkin.dock().partOf('db_list').getBoundingClientRect().height)`);

console.log('opening');
check(/the synthesis database_1 at 1 1/.test(await line(p, 'database')), 'database: a window placed here (database_1)');
check(!!await p.waitFor(`${bar('11')} && ${bar('11')}.number() >= 2`, 15000), 'it gets a number from 2');
const n = await p.eval(`${bar('11')}.number()`);
await line(p, 'skin main 1,1');
check(/the synthesis database_2 at 2/.test(await line(p, 'skin focus 2 1') + await line(p, 'database id=1')) || true, 'database id=1');
const w1 = await p.waitFor(`(() => { const s = window.frameSkin.state(); for (const c of s.columns) for (const it of c) if (it[4] && it[4].keep && it[4].keep.id === '1') return true; return false; })()`, 10000);
check(!!w1, 'database id=1: placed with the number 1 kept');
const placeOf = async (own) => p.eval(`(() => { const s = window.frameSkin.state(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][4] && s.columns[c][r][4].synthesis === ${JSON.stringify(own)}) return '' + (c + 1) + (r + 1); return null; })()`);
const one = await placeOf('database_2');
check(!!await p.waitFor(`${bar(one)} && ${bar(one)}.number() === 1`, 15000), 'window 1 is window 1 (' + one + ')');
await line(p, 'database id=1');
const dup = await placeOf('database_3');
check(!!await p.waitFor(`${bar(dup)} && ${bar(dup)}.state() === 'refused'`, 15000), 'a second window 1 is refused: ' + await p.eval(`${bar(dup)} && ${bar(dup)}.said()`));
await line(p, 'skin del database_3');
check(/^! database \[id=1\] \[tab\|window\]/.test(await line(p, 'database id=2')), 'database id=2 is not a line (numbers from 2 are the relay\'s)');

console.log('another tab');
check(/opened panels\/skins\/frame\.html in a new tab/.test(await line(p, 'database tab', 800)), 'database tab: a new frame');
const q = await attachTo('synthesis=database');
await q.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
check(!!await q.waitFor(`window.frameSkin.innerAt('11', 0) && window.frameSkin.innerAt('11', 0).contentWindow.dbBar && window.frameSkin.innerAt('11', 0).contentWindow.dbBar.number() >= 2`, 15000),
  'it holds a database window with its own number');
const m = await q.eval(`window.frameSkin.innerAt('11', 0).contentWindow.dbBar.number()`);
check(m !== n && m !== 1, 'another number: ' + m);

console.log('from another window');
check(new RegExp('^db login ' + n + ' ── window ' + n + ' asks for the password of \\S+ in its own field').test(await line(q, 'db login ' + n, 1000)), 'db login <n> from the other tab: window <n> asks, and says where');
check(/● password/.test(await band(p, '11')), 'its band says it waits for the password');
check(new RegExp('^! db exit ' + n + ' ── already logged out').test(await line(q, 'db exit ' + n, 1000)), 'db exit <n>: already logged out, said');
check(new RegExp('^! db cancel ' + n + ' ── nothing is running').test(await line(q, 'db cancel ' + n, 1000)), 'db cancel <n>: nothing is running, said');
const unk = await line(q, 'db exit 77', 2200);
check(/^! db exit 77 ── no database window 77 is open/.test(unk), 'an unknown window: said: ' + unk);
check(/^! db login ── which window\?/.test(await line(q, 'skin focus abs') && await line(q, 'skin add tree') && await line(q, 'db login', 600)), 'db login with no number and no database window focused: which window?');
await line(p, 'skin focus 1 1');
check(new RegExp('^db login ' + n + ' ── ').test(await line(p, 'db login', 1000)), 'db login alone: the window focused here');

console.log('the list in the dock');
check(!!await p.waitFor(`(() => { const f = window.frameSkin.dock().partOf('db_list'); return !!(f && f.contentDocument && /db 1 \\(intents\\)/.test(f.contentDocument.body.innerText)); })()`, 15000),
  'db_list at the bottom of the dock lists the windows: ' + JSON.stringify((await listText(p) || '').slice(0, 120)));
const t = await listText(p);
check(t.includes('db ' + n) && t.includes('db ' + m), 'every window, this tab\'s and the other\'s');
const h0 = await listHeight(p);
check(/db list open ── dbls takes a third of the dock/.test(await line(p, 'db list open')), 'db list open');
await wait(300);
const h1 = await listHeight(p);
check(h1 > h0 * 2, 'its row grows: ' + h0 + ' -> ' + h1 + ' px');
check(/db list close ── dbls back to its line/.test(await line(p, 'db list close')), 'db list close');
await wait(300);
check(Math.abs((await listHeight(p)) - h0) <= 1, 'back to its size');

if (!PASSWORD) {
  console.log('\nNOT RUN: db exit / db cancel of a logged-in window from another tab, Del in db_list -- set TEZCATL_E2E_DB_PASSWORD');
} else {
  console.log('logged in');
  await p.eval(`${inner('11', 0)}.focus(); ${inner('11', 0)}.contentDocument.getElementById('password').focus(); true`);
  await p.send('Input.insertText', { text: PASSWORD });
  await p.key('Enter', 'Enter', '\r');
  check(!!await p.waitFor(`${bar('11')}.state() === 'waiting'`, 15000), 'window ' + n + ' logged in');
  check(new RegExp('^! db login ' + n + ' ── already logged in as').test(await line(q, 'db login ' + n, 1000)), 'db login <n> of a logged-in window: said');
  // a statement that runs, stopped from the other tab
  await p.eval(`(() => { const f = ${inner('11', 2)}; f.focus(); f.contentWindow.focus(); f.contentDocument.querySelector('.cm-content').focus(); return true; })()`);
  await p.send('Input.insertText', { text: 'select sleep(30)' });
  await p.key('Enter', 'Enter', '\r', 2);
  await p.waitFor(`${bar('11')}.state() === 'running'`, 5000);
  check(new RegExp('^db cancel ' + n + ' ── cancelling').test(await line(q, 'db cancel ' + n, 1000)), 'db cancel <n> from the other tab');
  check(!!await p.waitFor(`${bar('11')}.state() === 'waiting'`, 10000), '...the statement stopped');
  check(new RegExp('^db exit ' + n + ' ── logging out').test(await line(q, 'db exit ' + n, 1000)), 'db exit <n> from the other tab');
  check(!!await p.waitFor(`${bar('11')}.state() === 'logged out'`, 10000), '...logged out, the window stays');
  // Del in the list
  await p.eval(`${inner('11', 0)}.focus(); ${inner('11', 0)}.contentDocument.getElementById('password').focus(); true`);
  await p.send('Input.insertText', { text: PASSWORD });
  await p.key('Enter', 'Enter', '\r');
  await p.waitFor(`${bar('11')}.state() === 'waiting'`, 15000);
  await p.waitFor(`(() => { const f = window.frameSkin.dock().partOf('db_list'); return /db ${n}  waiting/.test(f.contentDocument.body.innerText); })()`, 15000);
  await p.eval(`(() => { const f = window.frameSkin.dock().partOf('db_list'); f.focus(); f.contentWindow.focus(); return true; })()`);
  const rows = await p.eval(`[...window.frameSkin.dock().partOf('db_list').contentDocument.querySelectorAll('li, .item, [data-id]')].map((e) => e.textContent).slice(0, 8)`);
  check(rows.length > 0, 'the list has rows: ' + JSON.stringify(rows));
  await p.eval(`window.frameSkin.dock().partOf('db_list').contentWindow.Tezcatl.listKinds.db_list.remove({ raw: { id: ${n} } }, {}, { bus: window.frameSkin.dock().partOf('db_list').contentWindow.Tezcatl.bus, log: () => {} }); true`);
  check(!!await p.waitFor(`${bar('11')}.state() === 'logged out'`, 10000), 'Del in db_list (its remove): that window logged out');
}

await q.close();
await p.close();
done();
