// test/e2e/code_keys.mjs -- vim keys in code_editor name tezcatl-commands:
// gd / K / ]d [d / ]] [[ run this code_editor's
// own code.* (the nearest); the syntax-tree commands (code.node-*) move and
// select by the Lezer tree; C-o (lsp.back, a panel's) says nobody took it
// when no panel is there; and the frame's input form reaches the same
// commands through the code_editor meant now. Real typescript-language-server.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'ky');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const SRC = [
  'function helper(x) {',          // 1
  '  return x + 1;',               // 2
  '}',                             // 3
  'const bad = ;',                 // 4  (error)
  'function main() {',             // 5
  '  const v = helper(2);',        // 6
  '  return [v, (1 + 2)];',        // 7
  '}',                             // 8
  'let worse = (;',                // 9  (error)
  '',
].join('\n');
fs.writeFileSync(path.join(dir, 'a.js'), SRC);

const VIEW = `(() => { const c = document.querySelector('.cm-content'); return (c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view); })()`;
const p = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent('ky/a.js'));
await p.waitFor(`document.getElementById('path').textContent === 'ky/a.js' && /lsp javascript/.test(document.getElementById('msg').textContent)`, 25000);
await p.waitFor(`document.querySelectorAll('.cm-lintRange').length >= 2`, 15000);
await wait(500);
const msg = () => p.eval(`document.getElementById('msg').textContent`);
const cursor = () => p.eval(`(() => { const v = ${VIEW}; const h = v.state.selection.main.head; const l = v.state.doc.lineAt(h); return JSON.stringify([l.number, h - l.from + 1]); })()`);
const selText = () => p.eval(`(() => { const v = ${VIEW}; const s = v.state.selection.main; return v.state.sliceDoc(s.from, s.to); })()`);
const at = (line, col) => p.eval(`(() => { const v = ${VIEW}; const l = v.state.doc.line(${line}); v.dispatch({ selection: { anchor: l.from + ${col} - 1 } }); v.focus(); return true; })()`);
async function keys(...ks) {
  await p.eval(`document.querySelector('.cm-content').focus(); true`);
  for (const k of ks) { await p.key(k.key, k.code, k.text ?? k.key, k.mod || 0); await wait(60); }
  await wait(400);
}
const K = (ch, code, mod) => ({ key: ch, code, text: ch, mod });
const invoke = (name) => p.eval(`(window.Tezcatl.commands.invoke(${JSON.stringify(name)}, {}, { local: true }), true)`);

console.log('code_editor keys -> tezcatl-commands');
await keys(K('Escape', 'Escape', 0));

// gd: the definition (same file)
await at(6, 13);
await keys(K('g', 'KeyG'), K('d', 'KeyD'));
await p.waitFor(`/to the definition/.test(document.getElementById('msg').textContent)`, 8000);
check(await cursor() === '[1,10]', 'gd on helper (6:13) goes to its definition (1:10): ' + await cursor());

// K: the description, said in the header
await at(6, 13);
await keys(K('K', 'KeyK', 8));
await p.waitFor(`/helper/.test(document.getElementById('msg').textContent)`, 8000);
check(/function helper\(x: any\): any|helper/.test(await msg()), 'K shows the language server\'s description of helper: ' + await msg());

// ]d [d: the diagnostics, wrapping around
await at(1, 1);
await keys(K(']', 'BracketRight'), K('d', 'KeyD'));
check((await cursor()).startsWith('[4,') && /\(1\/\d\) error/.test(await msg()), ']d goes to the first error (line 4): ' + await cursor() + ' ' + await msg());
await keys(K(']', 'BracketRight'), K('d', 'KeyD'));
check((await cursor()).startsWith('[9,'), '...]d again: the next one (line 9)');
await keys(K(']', 'BracketRight'), K('d', 'KeyD'));
check((await cursor()).startsWith('[4,'), '...and wraps around to line 4');
await keys(K('[', 'BracketLeft'), K('d', 'KeyD'));
check((await cursor()).startsWith('[9,'), '[d goes back (wrapping to line 9)');

// ]] [[: the definitions (the outline's)
await at(2, 3);
await keys(K(']', 'BracketRight'), K(']', 'BracketRight'));
check(await cursor() === '[5,1]', ']] goes to the next definition (main, its start 5:1): ' + await cursor());
await keys(K('[', 'BracketLeft'), K('[', 'BracketLeft'));
check(await cursor() === '[1,1]', '[[ goes back to helper (1:1): ' + await cursor());

// the syntax tree: node-select grows, node-parent / node-next / node-prev move
await at(7, 15);   // inside (1 + 2)
await invoke('code.node-select');
const s1 = await selText();
await invoke('code.node-select');
const s2 = await selText();
await invoke('code.node-select');
const s3 = await selText();
check(s1.length < s2.length && s2.length < s3.length && s2.includes(s1) && s3.includes(s2), 'code.node-select grows the selection node by node: ' + JSON.stringify([s1, s2, s3]));
await keys(K('Escape', 'Escape'));
await at(6, 9);    // on v of `const v = helper(2)`
await invoke('code.node-parent');
check((await cursor()).startsWith('[6,'), 'code.node-parent moves to the start of the enclosing node: ' + await cursor() + ' ' + await msg());
await at(5, 1);    // `function main` ...
await invoke('code.node-prev');
check(await cursor() === '[4,1]', 'code.node-prev from main goes to the statement before (4:1): ' + await cursor());
await invoke('code.node-next');
check(await cursor() === '[5,1]', 'code.node-next comes back (5:1): ' + await cursor());

// C-o: lsp.back is a panel's; none here -> said so
await keys(K('o', 'KeyO', 2));
await p.waitFor(`/lsp\\.back ── nothing takes it/.test(document.getElementById('msg').textContent)`, 3000);
check(true, 'C-o (lsp.back) with no lsp_log panel says nobody took it');

// from the frame's side: the frame's palette runs code.diag-next on the code_editor meant now
const f = await openPage(PAGES + 'panels/skins/frame.html');
await f.waitFor(`/ready|empty\./.test(document.getElementById('recv').textContent)`, 15000);
await f.eval(`document.getElementById('line').focus(); true`);
await f.send('Input.insertText', { text: ':find ky/b.js' });
fs.writeFileSync(path.join(dir, 'b.js'), 'const ok = 1;\nconst no = ;\n');
await f.key('Enter', 'Enter', '\r');
const FV = `(() => { const fr = window.frameSkin.frameAt('11'); const c = fr && fr.contentDocument.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;
await f.waitFor(`${FV} && ${FV}.state.doc.toString().startsWith('const ok')`, 15000);
await f.waitFor(`window.frameSkin.frameAt('11').contentDocument.querySelectorAll('.cm-lintRange').length >= 1`, 20000);
await f.eval(`(window.Tezcatl.commands.invoke('code.diag-next', {}), true)`);
await f.waitFor(`(() => { const v = ${FV}; return v.state.doc.lineAt(v.state.selection.main.head).number === 2; })()`, 5000);
check(true, "the frame's palette: code.diag-next runs on the frame's code_editor (to line 2)");

const errs = [p, f].flatMap((pg) => pg.logs.filter((l) => /exception/.test(l)));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await f.close();
await p.close();
done();
