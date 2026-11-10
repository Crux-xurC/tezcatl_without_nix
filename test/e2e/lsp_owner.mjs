// test/e2e/lsp_owner.mjs -- one owner per document on a shared language server
// (D-lsp-owner, 2026-10-15). Two code_editor on one file (as a frame's tree
// Enter can make across windows): the second only holds it -- told, given no
// diagnostics, its edits never reach the server (before, they were applied to
// the first one's text: one text out of two). When the first closes, the
// second is attached again and owns it.
// Works in $E2E_DIR/fsroot/lo; typescript-language-server from the dev shell.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'lo');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
// long enough that diagnostics of a mixed-up text still land inside the first one's lines
fs.writeFileSync(path.join(dir, 'x.js'), 'let a = 1;\n' + '// pad\n'.repeat(20));

const VIEW = `(() => { const c = document.querySelector('.cm-content'); return c && ((c.cmView && c.cmView.view) || (c.cmTile && c.cmTile.view)); })()`;
const marks = (p) => p.eval(`document.querySelectorAll('.cm-lintRange, .cm-lint-marker').length`);
const msg = (p) => p.eval(`(document.getElementById('msg') || {}).textContent || ''`);
async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await wait(300); }
  return false;
}

console.log('lsp owner');
const a = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent('lo/x.js'));
await a.waitFor(`!!document.querySelector('.cm-content')`, 15000);
// the first is attached (the server is shown working at the end: the second gets diagnostics)
await wait(5000);
check((await marks(a)) === 0, 'the first code_editor has no diagnostics (its file is clean)');

// a second code_editor given the same file, as the frame does (code.set with a filename)
const b = await openPage(PAGES + 'panels/resident/code_editor.html');
await b.waitFor(`!!(window.Tezcatl && window.Tezcatl.bus && document.querySelector('.cm-content'))`, 15000);
const bId = await b.eval(`window.Tezcatl.bus.self.id`);
await a.eval(`window.Tezcatl.bus.post('code.set', { text: '\\n\\n\\nlet a = 1;\\n', filename: 'lo/x.js' }, { to: ${JSON.stringify(bId)} }); true`);
check(await until(async () => /open in another code_editor/.test(await msg(b))), 'the second is told the file is open in another code_editor');
await wait(2500);
check((await marks(b)) === 0, 'the second gets no diagnostics (they were made from the first one\'s text)');

// an error typed in the second must not reach the server: the first stays clean
// (before, the second's didChange went on and the first got its diagnostics)
await b.eval(`${VIEW}.dispatch({ changes: { from: 0, insert: 'zzz zzz zzz\\n' } }); true`);
await wait(4000);
check((await marks(a)) === 0, 'the first stays clean: the second one\'s edit never reached the server');

// the first closes: the second is attached again with its own text, and owns it
await a.close();
check(await until(async () => /language server is here now/.test(await msg(b))), 'when the first closes, the second is told the server is here now');
check(await until(async () => (await marks(b)) > 0), 'and gets the diagnostics of its own text');

const errs = b.logs.filter((l) => l.startsWith('[exception]'));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close();
done();
