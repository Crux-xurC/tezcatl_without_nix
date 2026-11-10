// languages/build.mjs -- turn an npm grammar into a tezcatl grammar plugin
//
//   mkdir /tmp/lang && cd /tmp/lang && npm init -y && npm i esbuild <grammar package>
//   node <tezcatl>/languages/build.mjs <src.js> [<out.js>]
//
// <src.js> is a short entry whose default export is `(kit) => Extension`,
// e.g. languages/src/elixir.js. Packages resolve from the current directory
// (where you ran npm i). <out.js> defaults to <tezcatl>/languages/<name>.js.
//
// The shared CodeMirror / Lezer packages (the bundle's `languageKit.packages`)
// are NOT bundled: each import of them becomes a read from the editor's own
// lib/vendor/codemirror/cm.bundle.js, so the plugin and the editor use the
// same instance (two copies of @codemirror/language = no highlighting).
// Everything else the grammar needs is bundled into the one output file.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHARED = [
  '@codemirror/state', '@codemirror/view', '@codemirror/language', '@codemirror/commands',
  '@codemirror/autocomplete', '@codemirror/lint',
  '@lezer/common', '@lezer/lr', '@lezer/highlight',
];

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(here, '..', 'lib', 'vendor', 'codemirror', 'cm.bundle.js');

const [src, outArg] = process.argv.slice(2);
if (!src) {
  console.error('usage: node languages/build.mjs <src.js> [<out.js>]');
  process.exit(2);
}
const out = path.resolve(outArg || path.join(here, path.basename(src)));
const req = createRequire(path.join(process.cwd(), 'package.json'));

let esbuild;
try { esbuild = req('esbuild'); } catch (_) {
  console.error('esbuild not found here: run `npm i esbuild` in this directory first');
  process.exit(2);
}

// the plugin imports the bundle by a path relative to itself, so it resolves
// to the very URL lib/code/code-editor.js imports
let rel = path.relative(path.dirname(out), BUNDLE).split(path.sep).join('/');
if (!rel.startsWith('.')) rel = './' + rel;

// the names a shared package exports, from the copy installed here
async function exportNames(spec) {
  const mod = await import(pathToFileURL(req.resolve(spec)).href);
  return Object.keys(mod).filter((k) => k !== 'default' && /^[A-Za-z_$][\w$]*$/.test(k));
}

const shared = {
  name: 'tezcatl-shared',
  setup(b) {
    b.onResolve({ filter: /^@(codemirror|lezer)\// }, (a) =>
      SHARED.includes(a.path) ? { path: a.path, namespace: 'tz-shared' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'tz-shared' }, async (a) => {
      const names = await exportNames(a.path);
      return {
        loader: 'js',
        contents:
          `import { languageKit } from ${JSON.stringify(rel)};\n` +
          `const m = languageKit.packages[${JSON.stringify(a.path)}];\n` +
          (names.length ? `export const { ${names.join(', ')} } = m;\n` : ''),
      };
    });
  },
};

try {
  await esbuild.build({
    entryPoints: [path.resolve(src)],
    nodePaths: [path.join(process.cwd(), 'node_modules')],   // packages from where npm i ran
    bundle: true,
    format: 'esm',
    minify: true,
    legalComments: 'none',
    target: 'es2020',
    outfile: out,
    external: [rel],
    plugins: [shared],
    logLevel: 'warning',
  });
} catch (_) {
  process.exit(1);   // esbuild has already printed why
}
const size = fs.statSync(out).size;
console.log(`${out}  ${size} bytes  (shared packages from ${rel})`);
