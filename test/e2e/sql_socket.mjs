// test/e2e/sql_socket.mjs -- the relay's /sql against Tezcatl's MariaDB (D-db-session),
// from a page of the stack (its Origin): numbered windows, logging in with the
// server's own refusal, a session per window (a temporary table stays in its
// window only), window 1 taking no statements, cancelling, logging out, the
// ledger GET /sql/windows, a number taken back after the window goes.
//
// Needs nix/db running (Poca's box row mariadb; nix/db init once) and the
// password of local.env's TEZCATL_DB_USER (E2E_DB_USER: another account) in TEZCATL_E2E_DB_PASSWORD -- the
// test logs in as a person would. Database tezcatl_e2e.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');

const PASSWORD = process.env.TEZCATL_E2E_DB_PASSWORD || '';
const ACCOUNT = process.env.E2E_DB_USER || process.env.TEZCATL_DB_USER || 'tezcatl';
const R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
if (!PASSWORD) { console.log('sql_socket.mjs: set TEZCATL_E2E_DB_PASSWORD (the password of ' + ACCOUNT + ')'); process.exit(2); }

const p = await openPage(PAGES + 'panels/resident/output.html');
await p.waitFor('!!window.Tezcatl && !!Tezcatl.config', 10000);

// sockets live in the page: w.<name> = {ws, got: [frames]}
await p.eval(`window.w = {};
  window.sock = (name) => new Promise((res) => {
    const ws = new WebSocket(${JSON.stringify(R.replace('http', 'ws') + '/sql')});
    const s = { ws, got: [] };
    ws.onmessage = (e) => s.got.push(JSON.parse(e.data));
    ws.onclose = () => s.got.push({ kind: 'closed' });
    ws.onopen = () => { w[name] = s; res(true); };
    ws.onerror = () => res(false);
  });
  window.send = (name, m) => { w[name].ws.send(JSON.stringify(m)); return true; };
  // the next frame of a kind (taken, so the next ask gets the one after)
  window.next = (name, kinds, ms = 20000) => new Promise((res) => {
    const end = Date.now() + ms;
    (function look() {
      const g = w[name].got, i = g.findIndex((f) => kinds.includes(f.kind));
      if (i >= 0) return res(g.splice(i, 1)[0]);
      if (Date.now() > end) return res({ kind: 'timeout' });
      setTimeout(look, 50);
    })();
  }); true`);
const sock = (n) => p.eval(`sock(${JSON.stringify(n)})`);
const send = (n, m) => p.eval(`send(${JSON.stringify(n)}, ${JSON.stringify(m)})`);
const next = (n, kinds, ms) => p.eval(`next(${JSON.stringify(n)}, ${JSON.stringify(kinds)}, ${ms || 20000})`);
const ask = async (n, m, kinds) => { await send(n, m); return next(n, kinds); };
// a statement's answer (state frames of what ran before are dropped first)
const drop = (n) => p.eval(`w[${JSON.stringify(n)}].got = w[${JSON.stringify(n)}].got.filter((f) => f.kind !== 'state'); true`);
const run = async (n, statement, req = 'r') => {
  await drop(n);
  await send(n, { kind: 'run', req, statement });
  return next(n, ['answer', 'said']);
};
// the first state frame that is `state` (others passed over)
const stateIs = async (n, state, ms = 10000) => {
  const end = Date.now() + ms;
  for (;;) {
    const f = await next(n, ['state'], Math.max(100, end - Date.now()));
    if (f.kind === 'timeout' || f.state === state) return f;
  }
};
const ledger = () => p.eval(`fetch(${JSON.stringify(R + '/sql/windows')}).then((r) => r.json()).then((j) => j.windows)`);

check(await sock('a') && await sock('b') && await sock('one'), 'three sockets to /sql');
const na = await ask('a', { kind: 'hello', id: null }, ['number', 'refused']);
check(na.kind === 'number' && na.id >= 2 && na.database === 'tezcatl_e2e', 'hello: a number from 2, the database tezcatl_e2e -- ' + JSON.stringify(na));
const nb = await ask('b', { kind: 'hello', id: null }, ['number']);
check(nb.id > na.id, 'a second window: the next number');
const n1 = await ask('one', { kind: 'hello', id: 1 }, ['number', 'refused']);
check(n1.id === 1, 'window 1 when asked for');
await sock('one2');
const r1 = await ask('one2', { kind: 'hello', id: 1 }, ['number', 'refused']);
check(r1.kind === 'refused' && /window 1 is open elsewhere/.test(r1.error), 'a second window 1 is refused');

check((await run('a', 'select 1')).error === 'logged out (db login ' + na.id + ')', 'a statement before logging in: said');
const bad = await ask('a', { kind: 'login', account: ACCOUNT, password: PASSWORD + 'x' }, ['state', 'login_failed', 'said']);
check(bad.kind === 'login_failed' && /Access denied/.test(bad.error), "a wrong password: the server's refusal as it is -- " + bad.error);
const li = await ask('a', { kind: 'login', account: ACCOUNT, password: PASSWORD }, ['state', 'login_failed', 'said']);
check(li.kind === 'state' && li.state === 'waiting' && li.account === ACCOUNT && li.connection_id > 0, 'logged in: waiting, with its connection id');
const lb = await ask('b', { kind: 'login', account: ACCOUNT, password: PASSWORD }, ['state', 'login_failed']);
check(lb.connection_id && lb.connection_id !== li.connection_id, 'the other window: a session of its own');

const a1 = await run('a', 'select 1 as n, null as z, \'日本語\' as t');
check(a1.ok && JSON.stringify(a1.columns) === '["n","z","t"]' && JSON.stringify(a1.rows) === '[[1,null,"日本語"]]', 'a statement as it is, the answer -- ' + JSON.stringify(a1));
check((await next('a', ['state'])).state === 'running' && (await next('a', ['state'])).state === 'waiting', 'its state: running, then waiting');
await run('a', 'create temporary table t as select 42 as v');
const a2 = await run('a', 'select v from t');
check(a2.ok && a2.rows[0][0] === 42, 'a temporary table is there for the next statement of the same window');
const b2 = await run('b', 'select v from t');
check(b2.ok === false && b2.code === 'ER_NO_SUCH_TABLE', "... and not in another window's session -- " + b2.error);
const two = await run('a', "select 'a;b' as x; select 2");
check(two.ok === false && two.code === 'several_statements', 'two statements in one text: said (nothing split here) -- ' + two.error);
const ended = await stateIs('a', 'logged out');
check(ended.state === 'logged out' && /session ended/.test(ended.why), '... the session ended with it, said -- never made again quietly');
await ask('a', { kind: 'login', account: ACCOUNT, password: PASSWORD }, ['state']);
check(!(await run('a', 'select v from t')).ok, 'logged in again: a new session (the temporary table is gone)');
const bad2 = await run('a', 'select nope from nowhere');
check(bad2.ok === false && bad2.code === 'ER_NO_SUCH_TABLE', "a statement the server refuses: its message as it is");

await ask('one', { kind: 'login', account: ACCOUNT, password: PASSWORD }, ['state']);
check(/window 1 runs the intents' statements/.test((await run('one', 'select 1')).error), 'window 1 takes no statement');

await drop('a');
await send('a', { kind: 'run', req: 'long', statement: 'select sleep(30)' });
check((await next('a', ['state'])).state === 'running', 'a long statement: running');
await send('a', { kind: 'run', req: 'busy', statement: 'select 1' });
const busy = await next('a', ['said', 'answer']);
check(/a statement is running/.test(busy.error || ''), 'a second statement while one runs: said');
const t0 = Date.now();
await send('a', { kind: 'cancel' });
const killed = await next('a', ['answer'], 15000);
check(killed.req === 'long' && Date.now() - t0 < 5000, 'cancel: the long statement stops (KILL QUERY on the second connection) -- ' + JSON.stringify(killed).slice(0, 120));
const l1 = await ledger();
const row = l1.find((x) => x.id === na.id);
check(row && row.account === ACCOUNT && row.state === 'waiting' && l1.some((x) => x.id === 1), 'GET /sql/windows: the ledger -- ' + JSON.stringify(l1));
check(!JSON.stringify(l1).includes(PASSWORD), '... with no password in it');

await drop('a');
const out = await ask('a', { kind: 'exit' }, ['state']);
check(out.state === 'logged out', 'exit: logged out');
check(/logged out/.test((await run('a', 'select 1')).error), '... and statements are refused; the number stays');
check((await ledger()).find((x) => x.id === na.id).state === 'logged out', 'the ledger says logged out');

await p.eval(`w.a.ws.close(); true`);
await new Promise((r) => setTimeout(r, 300));
check(!(await ledger()).some((x) => x.id === na.id), 'a window that goes frees its number');
await sock('a2');
check((await ask('a2', { kind: 'hello', id: na.id }, ['number', 'refused'])).id === na.id, 'a reload asks for its number and gets it back');

await p.eval(`Object.values(w).forEach((s) => s.ws.close()); true`);
await p.close();
const logs = fs.readdirSync(E2E).filter((f) => f.endsWith('.log'));
check(logs.length > 0 && logs.every((f) => !fs.readFileSync(path.join(E2E, f), 'utf8').includes(PASSWORD)),
  'the password is in no log of the stack (' + logs.join(' ') + ')');
done();
