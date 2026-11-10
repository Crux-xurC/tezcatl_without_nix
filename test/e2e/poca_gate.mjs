// test/e2e/poca_gate.mjs -- tezcatl in Poca itself (D-poca-secret).
//
// secret_gate.mjs stands in for Poca with CDP's Fetch, which adds the header
// after Chromium's CORS check; Poca adds it before, so every fetch from the
// pages is preflighted. Only Poca shows that. Here a test Poca (its own
// config and runtime directories, CDP on POCA_CDP_PORT) starts the stack's
// pages and relay from its box (poca_tezcatl.sh), with its own secret.
//
//   ./test/e2e/stack.sh up            # for the pages' copy, the fake Xipe server and Chromium
//   node test/e2e/poca_gate.mjs       # stops the stack's pages and relay first; Poca starts them
//   ./test/e2e/stack.sh down          # afterwards (the pages and relay are gone with Poca)
//
// Needs a built Poca (`poca` on PATH, or POCA=<its build/Release/poca>)
// and a display (Poca's window shows while it runs).
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, PAGES, check, done } from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const POCA = process.env.POCA || 'poca';   // a Poca on PATH, else POCA=<its binary>
const POCA_CDP = process.env.POCA_CDP_PORT || '9333';
const PAGES_PORT = new URL(PAGES).port, RELAY_PORT = process.env.RELAY_PORT || '4101';
const R = `http://127.0.0.1:${RELAY_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    try { const v = await f(); if (v) return v; } catch {}
    if (Date.now() > end) return null;
    await sleep(300);
  }
}
const up = async (port) => { try { await fetch(`http://127.0.0.1:${port}/`); return true; } catch { return false; } };

if (!fs.existsSync(POCA)) { console.log(`poca_gate.mjs: no Poca at ${POCA} (set POCA)`); process.exit(2); }

// the stack's own pages and relay make way for Poca's
for (const line of fs.readFileSync(path.join(E2E, 'pids'), 'utf8').split('\n')) {
  const [pid, name] = line.split(' ');
  if (name === 'pages' || name === 'relay') { try { process.kill(-Number(pid), 'SIGTERM'); } catch {} }
}
await until(async () => !(await up(PAGES_PORT)) && !(await up(RELAY_PORT)), 20000);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tezcatl-poca-gate-'));
fs.mkdirSync(path.join(tmp, 'config/poca'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'runtime'), { mode: 0o700 });
fs.writeFileSync(path.join(tmp, 'config/poca/box.json'), JSON.stringify({ programs: [{
  name: 'tezcatl', ports: [Number(PAGES_PORT), Number(RELAY_PORT)], auth: true,
  run: [path.join(here, 'poca_tezcatl.sh')], env: { E2E_DIR: E2E, PAGES_PORT, RELAY_PORT },
  log: path.join(tmp, 'tezcatl.log'),
}] }));

// --no-first-run: no first-run dialog of Chromium (terms of service) in a fresh profile
const poca = spawn(POCA, [`--remote-debugging-port=${POCA_CDP}`, '--url=poca://box/', '--no-first-run'], {
  env: { ...process.env, XDG_CONFIG_HOME: path.join(tmp, 'config'), XDG_RUNTIME_DIR: path.join(tmp, 'runtime') },
  stdio: 'ignore',
});
const pocaExit = new Promise((res) => poca.on('exit', res));

// Poca's windows (WM_CLASS poca.poca) of this run, through wmctrl
const windows = () => execFileSync('/usr/bin/wmctrl', ['-lpx']).toString().split('\n')
  .map((l) => l.trim().split(/\s+/)).filter((f) => f[3] === 'poca.poca' && Number(f[2]) === poca.pid).length;

// a tab of Poca, over its own CDP
async function pocaTab(prefix) {
  const t = await until(async () => (await (await fetch(`http://127.0.0.1:${POCA_CDP}/json/list`)).json())
    .find((x) => x.type === 'page' && x.url.startsWith(prefix)));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id;
    const h = (e) => { const m = JSON.parse(e.data); if (m.id === i) { ws.removeEventListener('message', h); res(m.result); } };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
  // as from a key press (Chromium's pop-up blocker wants one)
  const gesture = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }))?.result?.value;
  return {
    send, eval: ev, gesture,
    async open(url) { await send('Page.navigate', { url }); await sleep(500); },
    waitFor: (expr, ms = 20000) => until(() => ev(expr), ms),
  };
}

try {
  const tab = await pocaTab('poca://box');
  const started = await tab.eval(`fetch('start?name=tezcatl', {method: 'POST'}).then((r) => r.json())`);
  check(started && started.error === '', 'Poca starts tezcatl from its box');
  check(!!await until(async () => (await up(PAGES_PORT)) && (await up(RELAY_PORT)), 180000), 'the pages and the relay come up');
  const relayLog = () => fs.readFileSync(path.join(E2E, 'poca-relay.log'), 'utf8');
  check(/authentication on/.test(relayLog()), "the relay runs with Poca's secret");

  // Page.navigate from the box tab: as the person opening it
  await tab.open(PAGES + 'panels/resident/input.html');
  check(!!await tab.waitFor('Tezcatl.ws.isOpen()', 15000), "in Poca: the input panel's WebSocket opens (ws.js; /ticket preflighted)");
  check(await tab.eval(`fetch('${R}/windows').then((r) => r.status, (e) => e.message)`) === 200, 'in Poca: HTTP to the relay works');

  await tab.open(PAGES + 'panels/resident/xterm.html');
  check(!!await tab.waitFor(`/^connected/.test(document.getElementById('status').textContent)`, 15000), 'in Poca: xterm connects (/pty)');

  await tab.open(PAGES + 'panels/tool/list.html');
  await tab.waitFor('!!(window.Tezcatl && Tezcatl.xipeClient && Tezcatl.ticket)', 10000);
  const xr = await tab.eval(`Tezcatl.xipeClient.request(Tezcatl.config, 'fake', 'input', {text: 'help'})
    .then(() => 'ok', (e) => 'error: ' + e.message)`);
  check(xr === 'ok', 'in Poca: the xipe client gets an answer (/xipe) -- ' + xr);

  const dir = path.join(E2E, 'fsroot', 'gate');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'b.js'), 'const b = 2;\nexport default b;\n');
  await tab.open(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent('gate/b.js'));
  check(!!await tab.waitFor(`document.getElementById('path').textContent === 'gate/b.js'`, 20000), 'in Poca: code_editor reads its file (/fs)');
  check(!!await tab.waitFor(`/lsp javascript/.test(document.getElementById('msg').textContent)`, 25000),
    'in Poca: the language server attaches (/lsp)');

  // the stack's headless Chromium: an ordinary browser
  const plain = await openPage(PAGES + 'panels/resident/input.html');
  await sleep(4000);
  check(!await plain.eval('Tezcatl.ws.isOpen()'), 'in another browser: no WebSocket');
  check(await plain.eval(`fetch('${R}/windows').then((r) => r.status, (e) => e.message)`) === 401, 'in another browser: HTTP is 401');
  await plain.close();

  // D-open-page: the frame's `open` -- a window keeps the secret as a tab does
  await tab.open(PAGES + 'panels/skins/frame.html');
  await tab.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
  const recvText = () => tab.eval(`document.getElementById('recv').textContent`);
  const before = windows();
  await tab.gesture(`window.frameSkin.run('open input window'); true`);
  const win = await pocaTab(PAGES + 'panels/resident/input.html?name=');
  check(!!await until(async () => windows() === before + 1, 8000), 'in Poca: open input window -- a new Poca window');
  check(!!await win.waitFor('Tezcatl.ws.isOpen()', 15000), "in Poca: the input panel's WebSocket opens in that window (the secret kept)");
  check(/opened panels\/resident\/input\.html in a new window/.test(await recvText()), 'the frame says what it opened');
  await tab.gesture(`window.frameSkin.run('open xterm'); true`);
  const xt = await pocaTab(PAGES + 'panels/resident/xterm.html');
  check(!!await xt.waitFor(`/^connected/.test(document.getElementById('status').textContent)`, 15000) && windows() === before + 1,
    'in Poca: open xterm -- a tab (no new window), and it connects');

  check(!/ticket=/.test(relayLog()), 'no ticket in the relay log');
  await tab.send('Browser.close').catch(() => {});
} catch (e) {
  check(false, 'the run: ' + (e.stack || e));
  try { console.log('tabs:', (await (await fetch(`http://127.0.0.1:${POCA_CDP}/json/list`)).json()).map((t) => t.url).join(' ')); } catch {}
  poca.kill('SIGTERM');
}

const code = await Promise.race([pocaExit, sleep(20000).then(() => 'timeout')]);
check(code !== 'timeout', 'Poca exits when its window closes');
if (code === 'timeout') poca.kill('SIGKILL');
check(!!await until(async () => !(await up(PAGES_PORT)) && !(await up(RELAY_PORT)), 20000), 'closing Poca stops the pages and the relay');
fs.rmSync(tmp, { recursive: true, force: true });
console.log('(the stack has no pages or relay now: ./test/e2e/stack.sh down, then up)');
done();
