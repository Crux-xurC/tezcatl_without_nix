// test/e2e/secret_gate.mjs -- the relay with Poca's secret (D-poca-secret).
//
// Needs the stack started with a secret:
//   ./test/e2e/stack.sh down; E2E_SECRET=$(openssl rand -hex 32) ./test/e2e/stack.sh up
//   E2E_SECRET=<the same> node test/e2e/secret_gate.mjs
//
// Poca is stood in for by CDP's Fetch domain: X-Poca-Secret on the pages'
// HTTP requests to the relay and nothing else (Fetch, like Poca's handler,
// never sees a WebSocket). Then:
//   - without the header the relay refuses HTTP (401) and tickets; with it,
//     a ticket opens one handshake (a used or made-up one, or none, is 403
//     for a browser's Origin); a WebSocket with no Origin (Xipe Totec's
//     /lsp) goes through
//   - "Poca's" pages work: ws.js (the input panel), xterm's /pty, the
//     xipe client's /xipe (the fake Xipe server), code_editor's /fs and /lsp
//   - an ordinary browser's page (no header) gets nothing: no socket, 401
//   - the relay's log names what it refused, never a ticket
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const SECRET = process.env.E2E_SECRET;
if (!SECRET) {
  console.log('secret_gate.mjs: the stack must run with E2E_SECRET (see the head of this file)');
  process.exit(2);
}
const RELAY_PORT = Number(process.env.RELAY_PORT || '4101');
const R = `http://127.0.0.1:${RELAY_PORT}`;
const PAGE_ORIGIN = new URL(PAGES).origin;
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const H = { 'X-Poca-Secret': SECRET };

// a raw WebSocket handshake: the status the relay answers, headers exactly these
function handshake(pathQs, headers = {}) {
  return new Promise((resolve, reject) => {
    const s = net.connect(RELAY_PORT, '127.0.0.1', () => {
      const hs = Object.entries({
        Host: `127.0.0.1:${RELAY_PORT}`, Upgrade: 'websocket', Connection: 'Upgrade',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13', ...headers,
      }).map(([k, v]) => `${k}: ${v}\r\n`).join('');
      s.write(`GET ${pathQs} HTTP/1.1\r\n${hs}\r\n`);
    });
    s.once('data', (d) => { resolve(Number(String(d).split(' ')[1])); s.destroy(); });
    s.once('error', reject);
  });
}
const ticket = async () => (await (await fetch(`${R}/ticket`, { headers: H })).json()).ticket;

// --- the relay alone ---------------------------------------------------------

check((await fetch(`${R}/windows`)).status === 401, 'HTTP without the header: 401');
check((await fetch(`${R}/windows`, { headers: { 'X-Poca-Secret': 'wrong' } })).status === 401, 'HTTP with a wrong secret: 401');
check((await fetch(`${R}/windows`, { headers: H })).status === 200, 'HTTP with the secret: 200');
check((await fetch(`${R}/ticket`)).status === 401, 'a ticket without the header: 401');

// Poca adds the header before Chromium's CORS check, so a page's fetch to the
// relay is preflighted for it (Fetch below adds it after: poca_gate.mjs checks
// it in Poca itself)
const pre = await fetch(`${R}/fs/read`, { method: 'OPTIONS', headers: {
  Origin: PAGE_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-poca-secret' } });
check(pre.status === 204 && pre.headers.get('access-control-allow-origin') === PAGE_ORIGIN &&
  /x-poca-secret/.test(pre.headers.get('access-control-allow-headers') || ''),
  'a preflight for X-Poca-Secret from the pages: allowed');
const preEvil = await fetch(`${R}/fs/read`, { method: 'OPTIONS', headers: {
  Origin: 'http://evil.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-poca-secret' } });
check(!preEvil.headers.get('access-control-allow-origin'), 'a preflight from another origin: not allowed');

const origin = { Origin: PAGE_ORIGIN };
const t1 = await ticket();
check(typeof t1 === 'string' && t1.length === 32, 'a ticket with the header');
check(await handshake(`/?ticket=${t1}`, origin) === 101, "a browser's WebSocket with the ticket: 101");
check(await handshake(`/?ticket=${t1}`, origin) === 403, 'the same ticket again: 403');
check(await handshake('/', origin) === 403, "a browser's WebSocket without a ticket: 403");
check(await handshake('/pty?ticket=made-up', origin) === 403, 'a made-up ticket: 403');
check(await handshake('/lsp') === 101, 'a WebSocket with no Origin (Xipe Totec on /lsp): through');

// --- pages as Poca opens them --------------------------------------------------

// Poca's part: the header on HTTP requests to the relay, nothing else
const asPoca = async ({ send, on }) => {
  on('Fetch.requestPaused', (p) => {
    const headers = Object.entries(p.request.headers).map(([name, value]) => ({ name, value }));
    headers.push({ name: 'X-Poca-Secret', value: SECRET });
    send('Fetch.continueRequest', { requestId: p.requestId, headers });
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: `${R}/*`, requestStage: 'Request' }] });
};

const input = await openPage(PAGES + 'panels/resident/input.html', asPoca);
check(!!await input.waitFor('Tezcatl.ws.isOpen()', 15000), "Poca's input panel: its WebSocket (ws.js) opens");
check(await input.eval(`fetch('${R}/windows').then((r) => r.status)`) === 200, "Poca's page: HTTP to the relay works");
await input.close();

const xterm = await openPage(PAGES + 'panels/resident/xterm.html', asPoca);
check(!!await xterm.waitFor(`/^connected/.test(document.getElementById('status').textContent)`, 15000),
  "Poca's xterm: /pty connects");
await xterm.close();

const list = await openPage(PAGES + 'panels/tool/list.html', asPoca);
await list.waitFor('!!(window.Tezcatl && Tezcatl.xipeClient && Tezcatl.ticket)', 10000);
const xr = await list.eval(`Tezcatl.xipeClient.request(Tezcatl.config, 'fake', 'input', {text: 'help'})
  .then(() => 'ok', (e) => 'error: ' + e.message)`);
check(xr === 'ok', "Poca's xipe client: /xipe answers (the fake Xipe server) -- " + xr);
await list.close();

const dir = path.join(E2E, 'fsroot', 'gate');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 1;\nexport default a;\n');
const rel = 'gate/a.js';
const code = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent(rel), asPoca);
check(!!await code.waitFor(`document.getElementById('path').textContent === ${JSON.stringify(rel)}`, 20000),
  "Poca's code_editor: the file is read (/fs)");
check(!!await code.waitFor(`/lsp javascript/.test(document.getElementById('msg').textContent)`, 25000),
  "Poca's code_editor: the language server attaches (/lsp with a ticket)");
await code.close();

// --- an ordinary browser -------------------------------------------------------

const plain = await openPage(PAGES + 'panels/resident/input.html');
await new Promise((r) => setTimeout(r, 4000));
check(!await plain.eval('Tezcatl.ws.isOpen()'), "an ordinary browser's input panel: no WebSocket");
check(await plain.eval(`fetch('${R}/windows').then((r) => r.status)`) === 401, "an ordinary browser's page: HTTP 401");
check(await plain.eval(`fetch('${R}/ticket').then((r) => r.status)`) === 401, "an ordinary browser's page: no ticket");
// every route the pages use, and every socket
const routes = ['/fs?path=', '/fs/read?path=gate/a.js', '/fs/stat?path=gate/a.js', '/mirror/list', '/juncture/list',
  '/lsp/servers', '/windows'];
const statuses = await plain.eval(`Promise.all(${JSON.stringify(routes)}.map((p) =>
  fetch('${R}' + p).then((r) => r.status, () => 'failed')))`);
check(statuses.every((x) => x === 401), "an ordinary browser's page: every HTTP route 401 -- " + statuses.join(' '));
const write = await plain.eval(`fetch('${R}/fs/write?path=gate/x.txt', {method: 'PUT', body: 'x'}).then((r) => r.status, () => 'failed')`);
check(write === 401 || write === 'failed', "an ordinary browser's page: no write (" + write + ')');
check(!fs.existsSync(path.join(E2E, 'fsroot', 'gate', 'x.txt')), '...and nothing was written');
const sockets = await plain.eval(`Promise.all(['/', '/pty', '/lsp', '/xipe'].map((p) => new Promise((res) => {
  const ws = new WebSocket('ws://127.0.0.1:${RELAY_PORT}' + p);
  ws.onopen = () => { res('open'); ws.close(); };
  ws.onerror = () => res('refused');
})))`);
check(sockets.every((x) => x === 'refused'), "an ordinary browser's page: every WebSocket refused -- " + sockets.join(' '));
await plain.close();

// --- the log ----------------------------------------------------------------------

const log = fs.readFileSync(path.join(E2E, 'relay.log'), 'utf8');
check(/authentication on/.test(log), "the relay's log says authentication is on");
check(/refusing \/ \(403\)/.test(log) && !/ticket=/.test(log), "the log names refusals, never a ticket");

done();
