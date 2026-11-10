// test/e2e/cdp.mjs -- a minimal Chrome DevTools Protocol driver (node's
// built-in WebSocket, no dependencies) for the headless-Chromium checks in
// this directory.

const CDP = 'http://127.0.0.1:' + (process.env.CDP_PORT || '9223');
export const PAGES = 'http://127.0.0.1:' + (process.env.PAGES_PORT || '4021') + '/';

// setup(page): runs before the reload that catches early logs, e.g. to turn
// on Fetch interception for the page's first requests (secret_gate.mjs)
export async function openPage(url, setup) {
  const t = await (await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  return connect(t, true, setup);
}

// attach to a tab something else opened (window.open), matched by URL substring
export async function attachTo(urlPart, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const list = await (await fetch(`${CDP}/json/list`)).json();
    const t = list.find((x) => x.type === 'page' && x.url.includes(urlPart));
    if (t) return connect(t, false);
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('no tab matching ' + urlPart);
}

async function connect(t, reload, setup) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  const logs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    for (const f of listeners.get(m.method) || []) f(m.params);
    if (m.method === 'Runtime.consoleAPICalled')
      logs.push(`[console.${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown')
      logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded') logs.push(`[log.${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url || ''}`);
  };
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const on = (method, f) => listeners.set(method, [...(listeners.get(method) || []), f]);
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  if (setup) await setup({ send, on });
  // the page started loading before Runtime.enable; reload so early logs are caught
  if (reload) await send('Page.reload', { ignoreCache: true });
  const page = {
    logs, send, on,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed');
      return r.result.result.value;
    },
    async waitFor(expr, ms = 20000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        try { const v = await page.eval(expr); if (v) return v; } catch (_) {}
        await new Promise((r) => setTimeout(r, 200));
      }
      return null;
    },
    // modifiers: 1 Alt, 2 Ctrl, 4 Meta, 8 Shift
    async key(key, code, text, modifiers = 0) {
      const vk = { ArrowDown: 40, ArrowUp: 38, ArrowRight: 39, ArrowLeft: 37, Enter: 13, Escape: 27 }[key];
      const base = { key, code: code || key, text, unmodifiedText: text, modifiers,
        windowsVirtualKeyCode: vk || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0) };
      await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    async close() { ws.close(); await fetch(`${CDP}/json/close/${t.id}`); },
  };
  return page;
}

// tiny assertion collector: check() records, done() prints and sets the exit code
const failures = [];
export function check(ok, what) {
  console.log((ok ? '  ok   ' : '  FAIL ') + what);
  if (!ok) failures.push(what);
}
export function done() {
  if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
  console.log('\nall ok');
  process.exit(0);
}
