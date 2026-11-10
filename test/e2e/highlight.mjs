// test/e2e/highlight.mjs -- syntax highlighting per language in the CM6
// bundle (lib/vendor/codemirror/entry.js `LANGS` + lib/code/code-languages.js).
// Loads a short sample into panels/resident/code.html with `code.set {text, filename}`
// and checks that tokens got the highlight style's classes. A .txt file
// stays plain. The message is posted raw on a second BroadcastChannel in the
// page: the page's own bus drops what it sent itself.
// Elixir comes from a grammar plugin (languages/elixir.js, built by
// languages/build.mjs); `demo` is a hand-written plugin registered at run time
// with code.configure {languages}.
import { openPage, PAGES, check, done } from './cdp.mjs';

const SAMPLES = {
  'calc.ex': 'defmodule Calc do\n  def add(a, b), do: a + b # sum\nend\n',
  'calc.exs': 'IO.puts("hi")\n:ok\n',
  'flake.nix': '{ pkgs, ... }:\nlet x = "s"; in { a = true; }\n',
  'main.ml': 'let rec f x = if x = 0 then "zero" else f (x - 1)\n',
  'Main.hs': 'module Main where\nmain :: IO ()\nmain = putStrLn "hi" -- c\n',
  'a.js': 'const x = "s"; // c\n',
};

const p = await openPage(PAGES + 'panels/resident/code.html');
await p.waitFor(`!!document.querySelector('.cm-content')`, 10000);

async function post(type, payload) {
  const msg = { v: 1, type, from: { id: 'e2e-highlight' }, to: null, payload, ts: Date.now() };
  await p.eval(`(() => { const c = new BroadcastChannel('tezcatl'); c.postMessage(${JSON.stringify(msg)}); c.close(); return true; })()`);
}

async function load(filename, text) {
  await post('code.set', { text, filename });
  await p.waitFor(`document.querySelector('.cm-content').innerText.startsWith(${JSON.stringify(text.split('\n')[0])})`, 5000);
  await new Promise((r) => setTimeout(r, 300));
  // tokens a highlight style styled: spans with a class inside the lines
  return p.eval(`[...document.querySelectorAll('.cm-line span[class]')].filter(s => s.className && !/cm-(matchingBracket|selectionMatch|lintRange|cursor)/.test(s.className)).map(s => s.textContent)`);
}

console.log('highlight');
for (const [file, text] of Object.entries(SAMPLES)) {
  const toks = await load(file, text);
  check(Array.isArray(toks) && toks.length >= 2, `${file}: tokens are highlighted ${JSON.stringify(toks)}`);
}
// a language that is not built in: plugin given by code.configure {languages}
await post('code.configure', { languages: { demo: { extensions: ['demo'], grammar: 'test/e2e/fixtures/demo-lang.js' } } });
const demo = await load('x.demo', 'let a = "s" in a # c\n');
check(JSON.stringify(demo) === JSON.stringify(['let', '"s"', 'in', '# c']), 'x.demo: hand-written plugin from code.configure {languages} ' + JSON.stringify(demo));
check(await p.eval(`document.body.innerText.includes('demo')`), 'the header shows the configured id "demo"');

// a broken plugin path: no highlighting, the editor keeps working
await post('code.configure', { languages: { demo: { extensions: ['demo'], grammar: 'test/e2e/fixtures/missing.js' } } });
const broken = await load('y.demo', 'let b in b\n');
check(Array.isArray(broken) && broken.length === 0, 'a missing plugin leaves the text plain ' + JSON.stringify(broken));
await post('code.configure', { languages: {} });
const after = await load('again.js', 'const y = 1; // c\n');
check(Array.isArray(after) && after.length >= 2, 'and the next file still highlights ' + JSON.stringify(after));

const plain = await load('notes.txt', 'def add(a, b) "s" -- c\n');
check(Array.isArray(plain) && plain.length === 0, 'notes.txt: plain text, no highlighted tokens ' + JSON.stringify(plain));

done();
