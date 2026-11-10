// test/e2e/lsp_langs.mjs -- the language servers lsp_paths.mjs does not
// cover: OCaml (ocamllsp), Haskell (efm + ghc), Elixir
// (efm, a syntax check outside a mix project) and CSS give a syntax error
// its diagnostics in code_editor; HTML attaches. Then what had not been checked:
// OCaml without dune referring to another file's module, Haskell importing a
// module of its own -- said as found (`info`), not checked, since what the
// server knows there is the server's. And the fonts: Senobi Gothic is read
// (lib/core/fonts.css), PlemolJP Console draws full width as two half widths
// (the terminal's columns). Works in $E2E_DIR/fsroot/ll; the servers on the
// dev shell's PATH.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'll');
fs.rmSync(dir, { recursive: true, force: true });
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };

// one syntax error each
put('err/x.ml', 'let a = ;;\n');
put('err/x.hs', 'main = do\n  let a =\n');
put('err/x.ex', 'defmodule A do\n  def f(, do: 1\nend\n');
put('err/x.css', 'a { color: ; }\n');
put('err/x.html', '<!doctype html>\n<html><body><p>x</p></body></html>\n');
// another file's module, no build files
put('ml/b.ml', 'let f x = x + 1\n');
put('ml/a.ml', 'let () = print_int (B.f 1)\n');
put('hs/B.hs', 'module B where\nf :: Int -> Int\nf x = x + 1\n');
put('hs/A.hs', 'module A where\nimport B\ng :: Int\ng = f 1\n');

// code_editor on rel: its lint marks, after up to ~ms for the server
async function open(rel, ms = 30000) {
  const p = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent(rel));
  await p.waitFor(`!!document.querySelector('.cm-content')`, 15000);
  let attached = '';
  let n = 0;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = await p.eval(`document.getElementById('msg').textContent`);
    if (/^lsp /.test(m)) attached = m;
    n = await p.eval(`document.querySelectorAll('.cm-lintRange, .cm-lint-marker').length`);
    if (n > 0) break;
    await wait(300);
  }
  return { p, n, attached };
}
// the diagnostics of the code_editor on rel: asked from another page (a page's
// bus does not hear its own posts) -- code.query -> code.here {path, diagnostics}
let probe = null;
async function diagnostics(rel) {
  if (!probe) {
    probe = await openPage(PAGES + 'panels/tool/list.html?config=commands');
    await probe.waitFor(`!!(window.Tezcatl && Tezcatl.bus)`, 10000);
  }
  return JSON.parse(await probe.eval(`new Promise((res) => {
    const req = 'd' + Math.random().toString(36).slice(2);
    const off = Tezcatl.bus.on('code.here', (x) => { if (x && x.req === req && x.path === ${JSON.stringify(rel)}) { off(); res(JSON.stringify(x.diagnostics || [])); } });
    Tezcatl.bus.post('code.query', { req });
    setTimeout(() => res('null'), 3000);
  })`));
}

console.log('language servers');
for (const [rel, lang] of [['err/x.ml', 'ocaml'], ['err/x.hs', 'haskell'], ['err/x.ex', 'elixir'], ['err/x.css', 'css']]) {
  const r = await open('ll/' + rel);
  check(r.n > 0, lang + ': a syntax error gets its diagnostics (' + rel + ')');
  await r.p.close();
}
{
  // HTML: vscode-html-language-server has no diagnostics of its own -- attaching is what is checked
  const p = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent('ll/err/x.html'));
  await p.waitFor(`!!document.querySelector('.cm-content')`, 15000);
  let seen = '';
  for (let i = 0; i < 100 && !seen; i++) {
    const m = await p.eval(`document.getElementById('msg').textContent`);
    if (/^lsp /.test(m)) seen = m;
    else await wait(200);
  }
  check(/^lsp /.test(seen), 'html: the language server attaches (' + (seen || 'no "lsp" note') + ')');
  await p.close();
}

console.log('not checked before -- as found');
for (const rel of ['ml/a.ml', 'hs/A.hs']) {
  const r = await open('ll/' + rel, 25000);
  const ds = await diagnostics('ll/' + rel);
  console.log('  info ' + rel + ': ' + (ds == null ? 'the code_editor did not answer' : ds.length ? ds.map((d) => d.line + ':' + d.col + ' ' + d.severity + ' ' + d.message.split('\n')[0]).join(' | ') : 'no diagnostics (the other module is known)'));
  await r.p.close();
}

console.log('fonts');
{
  const p = await openPage(PAGES + 'panels/resident/code_editor.html');
  await p.waitFor(`!!document.querySelector('.cm-content')`, 15000);
  const senobi = await p.eval(`document.fonts.load('16px "Senobi Gothic"').then((fs) => fs.length > 0 && fs.every((f) => f.status === 'loaded'))`);
  check(senobi === true, 'Senobi Gothic is read from lib/core/fonts.css' + (senobi ? '' : ' (fonts/ is local only: missing here?)'));
  const ratio = await p.eval(`(() => { const c = document.createElement('canvas').getContext('2d'); c.font = '15px "PlemolJP Console"';
    const a = c.measureText('a').width, z = c.measureText('あ').width; c.font = '15px monospace';
    return JSON.stringify({ a, z, fallback: c.measureText('あ').width }); })()`);
  const w = JSON.parse(ratio);
  check(Math.abs(w.z - 2 * w.a) < 0.01 && w.a > 0, 'PlemolJP Console: full width is two half widths (' + w.z.toFixed(2) + ' = 2 × ' + w.a.toFixed(2) + ')');
  await p.close();
}
if (probe) await probe.close();
done();
