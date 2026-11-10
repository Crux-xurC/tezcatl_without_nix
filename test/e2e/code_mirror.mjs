// test/e2e/code_mirror.mjs -- the copy of what code_editor edits
// (lib/relay/mirror.exs, lib/code/code-editor.js): a file opened gets a
// slot, the copy follows when editing rests, a language server that goes
// away leaves "lsp: disconnected ── :Reconnect" in the head, :Reconnect (copy ->
// open again -> replay) keeps the text and brings the diagnostics back
// (undo goes to the file as opened again), closing code_editor removes its slot,
// and a copy left behind is said when the file is opened and :Replay puts it
// in. Works in $E2E_DIR/fsroot/mr; uses typescript-language-server.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const RELAY = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '4101');
const ORIGIN = 'http://127.0.0.1:' + (process.env.PAGES_PORT || '4021');
const dir = path.join(E2E, 'fsroot', 'mr');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 1;\n');
fs.writeFileSync(path.join(dir, 'left.js'), 'const disk = 1;\n');

const slots = async () => (await (await fetch(RELAY + '/mirror/list')).json()).slots;
const copyOf = async (rel) => { const r = await fetch(RELAY + '/mirror?path=' + encodeURIComponent(rel)); return r.ok ? r.text() : null; };

const p = await openPage(PAGES + 'panels/resident/code_editor.html?path=mr/a.js');
const VIEW = `(() => { const c = document.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const doc = () => p.eval(`${VIEW}.state.doc.toString()`);
const msg = () => p.eval(`document.getElementById('msg').textContent`);
const dirty = () => p.eval(`!document.getElementById('dirty').hidden`);
const marks = () => p.eval(`document.querySelectorAll('.cm-lintRange, .cm-lint-marker').length`);
async function normal() { await p.eval(`document.querySelector('.cm-content').focus(); true`); await p.key('Escape', 'Escape', ''); await wait(100); }
async function ex(line, expect, ms = 15000) {
  await normal();
  await p.eval(`document.getElementById('msg').textContent = ''; true`);
  await p.key(':', 'Semicolon', ':', 8);
  await wait(100);
  await p.send('Input.insertText', { text: line });
  await p.key('Enter', 'Enter', '\r');
  if (expect) await p.waitFor(`${expect.toString()}.test(document.getElementById('msg').textContent)`, ms);
  return msg();
}

console.log('code_editor copy');
await p.waitFor(`document.getElementById('path').textContent === 'mr/a.js' && /lsp javascript/.test(document.getElementById('msg').textContent)`, 20000);
await wait(500);
check((await slots()).some((s) => s.path === 'mr/a.js'), 'opening a file enters its slot (the mirror directory)');

// edit (a syntax error, to see the diagnostics), then let editing rest
await p.eval(`(() => { const v = ${VIEW}; v.dispatch({ changes: { from: v.state.doc.length, insert: 'let b = ;\\n' } }); return true; })()`);
await p.waitFor(`document.querySelectorAll('.cm-lintRange, .cm-lint-marker').length > 0`, 15000);
check((await marks()) > 0, 'the language server reports the syntax error');
await wait(2600);
check((await copyOf('mr/a.js')) === 'const a = 1;\nlet b = ;\n', 'the copy follows the text when editing rests (2s)');

// the language server goes away
const servers = (await (await fetch(RELAY + '/lsp/servers')).json()).servers;
const js = servers.find((s) => s.serverId === 'javascript' && s.root.endsWith('fsroot'));
await fetch(RELAY + '/lsp/servers/' + js.key, { method: 'DELETE', headers: { origin: ORIGIN } });
await p.waitFor(`/lsp: disconnected ── :Reconnect/.test(document.getElementById('msg').textContent)`, 10000);
check(/lsp: disconnected ── :Reconnect connects again/.test(await msg()), 'a language server that went away leaves "lsp: disconnected ── :Reconnect" in the head');
await wait(2000);
check(/:Reconnect/.test(await msg()), '...and it stays');

// :Reconnect -- copy, open again, replay
await ex('Reconnect', /opened again/);
check((await doc()) === 'const a = 1;\nlet b = ;\n' && (await dirty()), ':Reconnect keeps the text (replayed from the copy), still unsaved');
await p.waitFor(`document.querySelectorAll('.cm-lintRange, .cm-lint-marker').length > 0`, 20000);
check((await marks()) > 0, '...and the language server is attached again (the diagnostics are back)');
check(fs.readFileSync(path.join(dir, 'a.js'), 'utf8') === 'const a = 1;\n', '...the file on disk untouched');
await normal();
await p.key('u', 'KeyU', 'u');
await wait(300);
check((await doc()) === 'const a = 1;\n', 'u takes the replay back: the file as opened again');
check(/the same as the text now|was applied/.test(await ex('Replay', /the same as|was applied/)) && (await doc()) === 'const a = 1;\nlet b = ;\n', ':Replay puts the copy in again');
check(/the same as the text now/.test(await ex('Replay', /the same as/)), ':Replay when the text is the copy says so');

// closing code_editor with unsaved edits (the replayed text) keeps its slot, marked
// (never refused, the copy stays; a clean close removes it -- code_closed.mjs)
await p.close();
await wait(1500);
const kept = (await slots()).find((s) => s.path === 'mr/a.js');
check(kept && typeof kept.unsaved_closed === 'number', 'closing the code_editor with unsaved edits keeps its slot, marked unsaved_closed');
if (kept) await fetch(RELAY + '/mirror/close?path=mr/a.js&owner=' + encodeURIComponent(kept.owner), { method: 'POST', headers: { origin: PAGES.replace(/\/$/, '') } });

// a copy left behind (a crash): said when the file is opened, :Replay puts it in
await fetch(RELAY + '/mirror?path=mr/left.js&owner=crashed&mode=open', { method: 'PUT', headers: { origin: ORIGIN, 'content-type': 'text/plain' }, body: 'const disk = 1;\n' });
await fetch(RELAY + '/mirror?path=mr/left.js&owner=crashed&mode=write', { method: 'PUT', headers: { origin: ORIGIN, 'content-type': 'text/plain' }, body: 'const disk = 1;\nconst unsaved = 2;\n' });
const q = await openPage(PAGES + 'panels/resident/code_editor.html?path=mr/left.js');
await q.waitFor(`/a copy is left/.test(document.getElementById('msg').textContent)`, 15000);
check(/a copy is left.*:Replay/.test(await q.eval(`document.getElementById('msg').textContent`)), 'a copy left behind is said when the file is opened');
await q.eval(`document.querySelector('.cm-content').focus(); true`);
await q.key('Escape', 'Escape', '');
await q.key(':', 'Semicolon', ':', 8);
await wait(100);
await q.send('Input.insertText', { text: 'Replay' });
await q.key('Enter', 'Enter', '\r');
await q.waitFor(`/the copy was applied/.test(document.getElementById('msg').textContent)`, 8000);
check((await q.eval(`${VIEW}.state.doc.toString()`)) === 'const disk = 1;\nconst unsaved = 2;\n', ':Replay puts the copy left behind into the text');
check((await slots()).find((s) => s.path === 'mr/left.js').owner !== 'crashed', '...the slot is this code_editor\'s now (it goes when this one closes)');

const errs = [...p.logs, ...q.logs].filter((l) => /exception/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await q.close();
done();
