// test/e2e/lsp_paths.mjs -- diagnostics reach code_editor whatever the path:
// the relay writes file:// URIs percent-encoded
// (LspServer.file_uri/1), and code_editor matches a server's own spelling of
// them (lib/code/code-files.js sameFileUri). Before: a path with a space or a
// non-ASCII name got no diagnostics from a server that encodes its URIs
// (typescript-language-server, nil), and "(" differed between nil and the
// relay. JSON and efm hand back the URI they were given, so they cannot
// show the difference -- JS and Nix are the ones checked here (shell too).
// Works in $E2E_DIR/fsroot/lp (the isolated FS root); uses the language
// servers on the dev shell's PATH.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'lp');
fs.rmSync(dir, { recursive: true, force: true });

// one syntax error each
const files = { 'x.js': 'let a = ;\n', 'x.nix': '{ a = ; }\n', 'x.sh': '#!/bin/sh\nif [ x ]\n' };
const dirs = ['plain', 'a b', '日本', 'p(1)', 'h#1'];
for (const d of dirs) {
  fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(dir, d, f), t);
}

// the lint marks code_editor shows for rel, waiting up to ~20s for the server
async function marks(rel) {
  const p = await openPage(PAGES + 'panels/resident/code_editor.html?path=' + encodeURIComponent(rel));
  await p.waitFor(`!!document.querySelector('.cm-content')`, 15000);
  let n = 0;
  for (let i = 0; i < 50 && n === 0; i++) {
    n = await p.eval(`document.querySelectorAll('.cm-lintRange, .cm-lint-marker').length`);
    if (n === 0) await wait(400);
  }
  // closed: a second code_editor on a file still open elsewhere only holds it
  // and gets no diagnostics (D-lsp-owner)
  await p.close();
  return n;
}

console.log('lsp paths');
for (const f of Object.keys(files)) {
  for (const d of dirs) {
    const rel = 'lp/' + d + '/' + f;
    check((await marks(rel)) > 0, rel + ' gets its diagnostics');
  }
}
done();
