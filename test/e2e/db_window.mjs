// test/e2e/db_window.mjs -- the database window (D-db-session): the synthesis
// database (db_bar, the table, a command line) in the frame, against nix/db
// (database tezcatl_e2e). Without a login: the relay's number, kept by the frame
// over a reload; the password asked at once in a masked field; a wrong password
// gets the server's refusal and is asked again; a statement before a login is
// refused; window 1 opens; no password anywhere (bus, kill ring, the frame's
// state, URLs, the receiving side). With TEZCATL_E2E_DB_PASSWORD (the password
// of local.env's TEZCATL_DB_USER) also: logging in, a statement's table, a
// temporary table kept for the next statement, the server's refusal, the text
// staying in the command line, db cancel, db exit.
//
// Needs nix/db running (Poca's box row mariadb; nix/db init once).
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = process.env.TEZCATL_E2E_DB_PASSWORD || '';
const WRONG = 'not-the-password-' + Date.now().toString(36);
const R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
await p.eval(`sessionStorage.clear(); window.__bus = []; Tezcatl.bus.on('*', (x, m) => window.__bus.push(m.type + ' ' + JSON.stringify(x))); true`);
async function line(text) {
  await p.eval(`document.getElementById('line').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(400);
  return p.eval(`(() => { const r = document.getElementById('recv'); return [...r.children].slice(-1).map((d) => d.textContent).join('\\n'); })()`);
}
const inner = (place, k) => `window.frameSkin.innerAt('${place}', ${k})`;
const bar = (place) => `${inner(place, 0)}.contentWindow.dbBar`;
const barDoc = (place) => `${inner(place, 0)}.contentDocument`;
const ledger = async () => (await (await fetch(R + '/sql/windows')).json()).windows || [];
// typed into the window's masked field (as keys), then Enter
async function typePassword(place, text) {
  await p.eval(`${inner(place, 0)}.focus(); ${barDoc(place)}.getElementById('password').focus(); true`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
}
// the window's command line: the text, then Mod-Enter
async function cmd(place, text, clear = true) {
  await p.eval(`(() => { const f = ${inner(place, 2)}; f.focus(); f.contentWindow.focus(); const c = f.contentDocument.querySelector('.cm-content'); c.focus();
    if (${clear}) { const v = (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '' } }); } return true; })()`);
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r', 2);
}
const cmdText = (place) => p.eval(`${inner(place, 2)}.contentDocument.querySelector('.cm-content').innerText`);
const tableRows = (place) => p.eval(`[...${inner(place, 1)}.contentDocument.querySelectorAll('table.mx-grid tbody tr')].map((tr) => tr.innerText.trim())`);

console.log('the window, without a login');
check(/the synthesis database_1 at 1 1/.test(await line('skin add database')), 'skin add database: database_1');
check(!!await p.waitFor(`${bar('11')} && ${bar('11')}.number() >= 2`, 15000), 'the relay gives it a number from 2: ' + await p.eval(`${bar('11')}.number()`));
let n = await p.eval(`${bar('11')}.number()`);
check(!!await p.waitFor(`${bar('11')}.asking()`, 5000), 'it asks for the password at once');
check(await p.eval(`${barDoc('11')}.getElementById('password').type === 'password'`), 'the field is masked');
check(await p.eval(`${inner('11', 0)}.contentDocument.activeElement === ${barDoc('11')}.getElementById('password') && ${barDoc('11')}.getElementById('account').value !== ''`),
  'the account the relay offers is filled in, the keyboard is in the password field');
check(!!await p.waitFor(`/^1 1 database_1 ── db ${n} ● password/.test(document.querySelector('.pane.synthesis iframe.thema').contentDocument.getElementById('text').textContent)`, 5000),
  'the band says it waits for the password');
check(!!await p.waitFor(`JSON.stringify(window.frameSkin.state().columns[0][0][4]) === JSON.stringify({ synthesis: 'database_1', keep: { id: '${n}' } })`, 5000), 'the frame keeps the number');
check((await ledger()).some((w) => w.id === n && w.state === 'logged out'), 'the relay\'s ledger has it, logged out');

await typePassword('11', WRONG);
check(!!await p.waitFor(`/^! Access denied/.test(${bar('11')}.said())`, 15000), 'a wrong password: the server\'s refusal as it is: ' + await p.eval(`${bar('11')}.said()`));
check(await p.eval(`${bar('11')}.asking() && ${barDoc('11')}.getElementById('password').value === ''`), 'it asks again, the field emptied');

await cmd('11', 'select 1');
check(!!await p.waitFor(`/^! not logged in/.test(${bar('11')}.said())`, 5000), 'a statement before a login: refused, nothing sent');
check(!!await p.waitFor(`${inner('11', 2)}.contentDocument.getElementById('lang').textContent === 'mariadb'`, 5000), 'the command line is SQL in the MariaDB dialect');
check(!!await p.waitFor(`${inner('11', 2)}.contentDocument.querySelectorAll('.cm-content span[class]').length > 0`, 5000), '...highlighted (the grammar plugin languages/mariadb.js)');
check((await cmdText('11')).includes('select 1'), 'a statement stays in the command line (?keep=1)');

console.log('a reload, window 1');
await p.send('Page.reload', {});
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
check(!!await p.waitFor(`${bar('11')} && ${bar('11')}.number() === ${n}`, 15000), 'over a reload: the same number');
await p.eval(`window.__bus = []; Tezcatl.bus.on('*', (x, m) => window.__bus.push(m.type + ' ' + JSON.stringify(x))); true`);
await line('skin main 1,1');
await line('skin add 2 database');
check(!!await p.waitFor(`${bar('21')} && ${bar('21')}.number() > 0 && ${bar('21')}.number() !== ${n}`, 15000), 'a second window: another number');
check(/the synthesis database_3|database_2/.test(JSON.stringify(await p.eval(`window.frameSkin.state()`))), 'its own name');
// window 1 (the intents'): a window that kept 1 asks for it again
await p.eval(`${inner('21', 0)}.contentWindow.Tezcatl.bus.post('synthesis.keep', { id: 1 }); true`);
await wait(300);
await p.send('Page.reload', {});
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
check(!!await p.waitFor(`${bar('21')} && ${bar('21')}.number() === 1`, 15000), 'window 1: a window that kept 1 is window 1 again');
// (run directly: typed, an Enter right after a reload was sometimes lost and two lines ran as one)
await p.eval(`window.frameSkin.run('skin save db_e2e').then(() => true)`);
await p.eval(`window.frameSkin.run('skin read db_e2e').then(() => true)`);
check(!!await p.waitFor(`${bar('21')} && ${bar('21')}.number() > 1 && /kept=saved/.test(${inner('21', 0)}.src)`, 15000),
  'read from a saved skin: a new number, not the one saved (' + await p.eval(`${bar('21')} && ${bar('21')}.number()`) + ')');
check(!!await p.waitFor(`${bar('11')} && ${bar('11')}.number() > 1`, 15000), 'the first window too');

n = await p.eval(`${bar('11')}.number()`);
await p.waitFor(`${bar('11')}.asking()`, 5000);
console.log('no password anywhere');
await typePassword('11', WRONG);
await p.waitFor(`/^! Access denied/.test(${bar('11')}.said())`, 15000);
const seen = await p.eval(`JSON.stringify([window.__bus, sessionStorage.getItem('tezcatl:frame:work'), [...document.querySelectorAll('iframe')].map((f) => f.src), document.getElementById('recv').textContent])`);
check(!seen.includes(WRONG), 'not on the bus, in the frame\'s state, in a URL or on the receiving side');
const ring = await p.eval(`Tezcatl.store.load('tezcatl:killring').then((k) => JSON.stringify(k || null))`);
check(!ring.includes(WRONG), 'not in the kill ring');

if (!PASSWORD) {
  console.log('\nNOT RUN: logging in, statements, cancel, exit -- set TEZCATL_E2E_DB_PASSWORD (the password of local.env\'s TEZCATL_DB_USER)');
} else {
  console.log('logged in');
  await typePassword('11', PASSWORD);
  check(!!await p.waitFor(`${bar('11')}.state() === 'waiting' && !!${bar('11')}.account()`, 15000), 'logged in: waiting, as ' + await p.eval(`${bar('11')}.account()`));
  check(await p.eval(`!${bar('11')}.asking()`), 'the field is gone');
  await cmd('11', 'select 1 as a, null as b, \'x\' as a');
  check(!!await p.waitFor(`${inner('11', 1)}.contentDocument.querySelectorAll('table.mx-grid tbody tr').length === 1`, 15000), 'the answer is a table');
  // (the first cell is the table's row number)
  check(JSON.stringify(await tableRows('11')) === JSON.stringify(['1\t1\tNULL\tx']), 'its row, three columns (two named a), NULL shown: ' + JSON.stringify(await tableRows('11')));
  check((await cmdText('11')).includes('select 1 as a'), 'the statement stays in the command line');
  await cmd('11', 'create temporary table t_e2e (i int)');
  await p.waitFor(`/create temporary table t_e2e/.test(${bar('11')}.said())`, 10000);
  await cmd('11', 'insert into t_e2e values (7), (8)');
  await p.waitFor(`/2 row\\(s\\) changed/.test(${bar('11')}.said())`, 10000);
  check(/2 row\(s\) changed/.test(await p.eval(`${bar('11')}.said()`)), 'a statement without columns says what it changed');
  await cmd('11', 'select i from t_e2e order by i');
  check(!!await p.waitFor(`${inner('11', 1)}.contentDocument.querySelectorAll('table.mx-grid tbody tr').length === 2`, 10000), 'the temporary table is there for the next statement (one session)');
  await cmd('11', 'select * from no_such_table_e2e');
  check(!!await p.waitFor(`/ER_NO_SUCH_TABLE/.test(${bar('11')}.said())`, 10000), 'the server\'s refusal: ' + await p.eval(`${bar('11')}.said()`));
  await cmd('11', 'select sleep(30)');
  await p.waitFor(`${bar('11')}.state() === 'running'`, 5000);
  await cmd('11', 'db cancel');
  check(!!await p.waitFor(`${bar('11')}.state() === 'waiting'`, 10000), 'db cancel stops a running statement');
  check((await cmdText('11')).trim() === '', 'a db command empties the command line');
  await cmd('11', 'db exit');
  check(!!await p.waitFor(`${bar('11')}.state() === 'logged out'`, 10000), 'db exit: logged out, the window stays');
  check((await ledger()).some((w) => w.id === n && w.state === 'logged out'), 'the ledger says so');
}

await line('skin del database_1');
await wait(500);
check(!(await ledger()).some((w) => w.id === n), 'skin del: the window is gone from the relay\'s ledger');
await p.eval(`Tezcatl.store.update('tezcatl:frame:skins', (m) => { if (m) Object.keys(m).filter((k) => k.indexOf('db_e2e') === 0).forEach((k) => delete m[k]); return m; }).then(() => true)`);
const errs = p.logs.filter((l) => /exception|error/i.test(l) && !/Failed to load resource/.test(l));
check(!errs.length, 'no exceptions in the frame: ' + errs.slice(0, 3).join(' | '));
await p.close();
done();
