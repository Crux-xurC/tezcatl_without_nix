// test/e2e/db_intents.mjs -- intents on database window 1 (D-db-session), against
// nix/db (tezcatl_e2e): an intent's `sql` (command/intents/db.json db.tables) run
// from the frame's `intent` line through the input panel's resolver. Window 1 not
// open, and open but logged out: the intent stops with what is needed. With
// TEZCATL_E2E_DB_PASSWORD also: logged in, `intent db.tables like=e2e_int%` finds
// a table window 2 made, `table db.tables` draws it in a decode_emacs, window 1's
// band and table say which intent ran what, and window 1's own command line still
// refuses a statement.
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = process.env.TEZCATL_E2E_DB_PASSWORD || '';

// pages left open by earlier scenarios may hold window 1, or answer intent.run: close them all
const CDP = 'http://127.0.0.1:' + (process.env.CDP_PORT || '9223');
for (const t of await (await fetch(CDP + '/json/list')).json()) {
  if (t.type === 'page') await fetch(CDP + '/json/close/' + t.id);
}

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
await p.eval(`sessionStorage.clear(); true`);
await p.send('Page.reload', {});
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
const lastRecv = () => p.eval(`(() => { const r = document.getElementById('recv'); return r.lastElementChild ? r.lastElementChild.textContent : ''; })()`);
async function line(text, ms = 500) {
  await p.send('Runtime.evaluate', { expression: `document.getElementById('line').focus(); true`, userGesture: true });
  await p.send('Input.insertText', { text });
  await p.key('Enter', 'Enter', '\r');
  await wait(ms);
  return lastRecv();
}
// what the frame says of an intent: its own line (the answer comes later than the echo)
const said = (id, ms = 8000) => p.waitFor(`(() => { const r = [...document.getElementById('recv').children].map((d) => d.textContent).reverse().find((t) => /intent ── ${id.replace('.', '\\.')}/.test(t)); return r || false; })()`, ms);
const inner = (place, k) => `window.frameSkin.innerAt('${place}', ${k})`;
const bar = (place) => `${inner(place, 0)}.contentWindow.dbBar`;
const band = (place) => p.eval(`(() => { const f = window.frameSkin.frameAt('${place}'); const t = f && f.parentNode.parentNode.querySelector('iframe.thema'); return t ? t.contentDocument.getElementById('text').textContent : null; })()`);
const placeOf = (own) => p.eval(`(() => { const s = window.frameSkin.state(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][4] && s.columns[c][r][4].synthesis === ${JSON.stringify(own)}) return '' + (c + 1) + (r + 1); return null; })()`);

// the input panel (its resolver runs the intents)
const ip = await openPage(PAGES + 'panels/resident/input.html');
await ip.waitFor(`!!document.querySelector('.kbd')`, 10000);
await wait(1000);

console.log('window 1 not open');
await line('intent db.tables', 100);
const none = await said('db.tables');
check(/^! intent ── db\.tables: This operation requires database window 1, logged in: `database id=1`$/.test(none), 'no window 1: the intent stops and says what is needed: ' + none);

console.log('window 1 open, logged out');
await line('database id=1', 800);
const one = await placeOf('database_1');
check(!!await p.waitFor(`${bar(one)} && ${bar(one)}.number() === 1 && ${bar(one)}.state() === 'logged out'`, 15000), 'window 1 placed (' + one + '), logged out');
await p.eval(`document.getElementById('recv').textContent = ''; true`);
await line('intent db.tables', 100);
const out = await said('db.tables');
check(/^! intent ── db\.tables: This operation requires database window 1, logged in: `database id=1` \(window 1 is logged out\)$/.test(out), 'logged out: the same, with its state: ' + out);
const trace = await ip.eval(`document.querySelector('.log').textContent`);
check(!/M-:.*show tables/.test(trace), 'nothing of it went to Emacs');

if (!PASSWORD) {
  console.log('\nNOT RUN: an intent on a logged-in window 1 -- set TEZCATL_E2E_DB_PASSWORD');
} else {
  console.log('logged in');
  async function login(place) {
    await p.eval(`${inner(place, 0)}.focus(); ${inner(place, 0)}.contentDocument.getElementById('password').focus(); true`);
    await p.send('Input.insertText', { text: PASSWORD });
    await p.key('Enter', 'Enter', '\r');
    return p.waitFor(`${bar(place)}.state() === 'waiting'`, 15000);
  }
  check(!!await login(one), 'window 1 logged in');
  // window 2 makes a table to find
  await line('skin add line', 300);
  await line('database', 800);
  const two = await placeOf('database_2');
  await p.waitFor(`${bar(two)} && ${bar(two)}.state() === 'logged out'`, 15000);
  check(!!await login(two), 'window 2 logged in (' + two + ')');
  async function statement(place, text) {
    await p.eval(`(() => { const f = ${inner(place, 2)}; f.focus(); f.contentWindow.focus(); f.contentDocument.querySelector('.cm-content').focus(); return true; })()`);
    await p.send('Input.insertText', { text });
    await p.key('Enter', 'Enter', '\r', 2);
    await wait(800);
  }
  await statement(two, 'create table if not exists e2e_intents (a int)');
  check(/row\(s\) changed/.test(await p.eval(`${bar(two)}.said()`)), 'window 2: create table');

  await p.eval(`document.getElementById('recv').textContent = ''; true`);
  await line('intent db.tables like=e2e_int%', 100);
  const ok = await said('db.tables');
  check(/^intent ── db\.tables ok .*"rows":\[\["e2e_intents"\]\]/.test(ok), 'intent db.tables like=e2e_int%: window 1 ran it: ' + ok);
  check(/db\.tables ── select table_name from information_schema\.tables/.test(await band(one)), 'window 1\'s band says which intent ran what: ' + await band(one));
  const label = await p.eval(`${inner(one, 1)}.contentDocument.body.innerText`);
  check(/db\.tables ── select table_name from information_schema\.tables/.test(label) && /e2e_intents/.test(label), 'window 1\'s table shows the answer under the intent\'s name');

  await line('table db.tables like=e2e_int%', 2500);
  const td = `[...document.querySelectorAll('iframe')].find((f) => /decode_emacs/.test(f.src) && new URL(f.src).searchParams.get('intent') === 'db.tables')`;
  check(!!await p.waitFor(`${td} && [...${td}.contentDocument.querySelectorAll('table.mx-grid tbody tr')].some((r) => /e2e_intents/.test(r.textContent))`, 10000),
    'table db.tables: a decode_emacs draws the tables');

  // window 1's own command line: still no statements. Sent as Mod-Enter sends it (cmd.input from the
  // command line itself): after a decode_emacs is added here, keys typed through CDP into a database
  // window's command line are sometimes not taken (2026-10-23; not seen without logging in) -- an open item
  const post = (place, text) => p.eval(`(() => { ${inner(place, 2)}.contentWindow.Tezcatl.bus.post('cmd.input', { text: ${JSON.stringify(text)} }); return true; })()`);
  await post(one, 'select 1');
  await wait(800);
  const refused = await p.eval(`${bar(one)}.said()`);
  check(/database window 1 runs the intents' statements/.test(refused), 'window 1\'s command line refuses a statement: ' + refused);

  await post(two, 'drop table e2e_intents');
  await wait(800);
  check(/row\(s\) changed/.test(await p.eval(`${bar(two)}.said()`)), 'window 2: drop table');
}

await ip.close();
await p.close();
done();
