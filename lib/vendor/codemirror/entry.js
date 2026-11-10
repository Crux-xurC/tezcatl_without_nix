// Tezcatl -- CodeMirror 6 bundle entry.
//
// CM6 ships no UMD/global build: it is ESM split across ~20 packages. This
// file names exactly what panels/code.html imports; esbuild rolls it up into
// lib/vendor/codemirror/cm.bundle.js (one ESM file, loaded with
// <script type="module">). See lib/vendor/codemirror/README.md for versions
// and the rebuild step. Runtime stays zero-build: the browser reads one file.

import {
  EditorState, EditorSelection, Compartment, Prec,
} from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor, rectangularSelection,
  crosshairCursor, highlightActiveLine,
  Decoration, gutter, GutterMarker,
} from "@codemirror/view";
import {
  defaultKeymap, history, historyKeymap, indentWithTab,
} from "@codemirror/commands";
// history is NOT in basicSetup(): code.html keeps it in a Compartment so a
// code.set (load a new doc) can reconfigure it and drop stale undo history.
import {
  StreamLanguage, syntaxHighlighting, defaultHighlightStyle, indentOnInput,
  bracketMatching, foldGutter, foldKeymap, indentUnit,
} from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { lintKeymap, lintGutter } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { vim, Vim, getCM } from "@replit/codemirror-vim";
import { emacs } from "@replit/codemirror-emacs";
import { LSPClient, languageServerSupport, serverDiagnostics } from "@codemirror/lsp-client";

import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { cpp } from "@codemirror/lang-cpp";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { erlang } from "@codemirror/legacy-modes/mode/erlang";
import { oCaml } from "@codemirror/legacy-modes/mode/mllike";
import { haskell } from "@codemirror/legacy-modes/mode/haskell";
import { nix } from "@replit/codemirror-lang-nix";

// The language kit (D-language-plugins): whole packages a grammar plugin needs,
// handed over as namespaces so a plugin never carries its own copy of them
// (two copies of @codemirror/language = no highlighting). Hand-written
// plugins get it as their default export's argument; npm grammars built by
// languages/build.mjs import these specifiers and are rewired to `packages`.
import * as cmState from "@codemirror/state";
import * as cmView from "@codemirror/view";
import * as cmLanguage from "@codemirror/language";
import * as cmCommands from "@codemirror/commands";
import * as cmAutocomplete from "@codemirror/autocomplete";
import * as cmLint from "@codemirror/lint";
import * as lezerCommon from "@lezer/common";
import * as lezerLr from "@lezer/lr";
import * as lezerHighlight from "@lezer/highlight";

// id -> () => Extension. The id set matches lib/code-languages.js (which
// resolves a filename/name to one of these ids). ocaml / haskell are legacy
// stream modes; nix (@replit) is a community Lezer grammar. Languages outside
// this table are grammar plugins loaded at run time (code.json `languages`,
// lib/code-languages.js) -- elixir is one (languages/elixir.js).
const LANGS = {
  javascript: () => javascript({ jsx: true, typescript: true }),
  json: () => json(),
  html: () => html(),
  css: () => css(),
  markdown: () => markdown(),
  yaml: () => yaml(),
  python: () => python(),
  rust: () => rust(),
  cpp: () => cpp(),
  sql: () => sql(),
  xml: () => xml(),
  shell: () => StreamLanguage.define(shell),
  lua: () => StreamLanguage.define(lua),
  toml: () => StreamLanguage.define(toml),
  diff: () => StreamLanguage.define(diff),
  dockerfile: () => StreamLanguage.define(dockerFile),
  ruby: () => StreamLanguage.define(ruby),
  erlang: () => StreamLanguage.define(erlang),
  ocaml: () => StreamLanguage.define(oCaml),
  haskell: () => StreamLanguage.define(haskell),
  nix: () => nix(),
};

export const languageKit = Object.freeze({
  state: cmState, view: cmView, language: cmLanguage, commands: cmCommands,
  autocomplete: cmAutocomplete, lint: cmLint,
  common: lezerCommon, lr: lezerLr, highlight: lezerHighlight,
  packages: Object.freeze({
    "@codemirror/state": cmState,
    "@codemirror/view": cmView,
    "@codemirror/language": cmLanguage,
    "@codemirror/commands": cmCommands,
    "@codemirror/autocomplete": cmAutocomplete,
    "@codemirror/lint": cmLint,
    "@lezer/common": lezerCommon,
    "@lezer/lr": lezerLr,
    "@lezer/highlight": lezerHighlight,
  }),
});

export function languageExtension(id) {
  const f = id && Object.prototype.hasOwnProperty.call(LANGS, id) ? LANGS[id] : null;
  return f ? f() : [];
}
export function languageIds() {
  return Object.keys(LANGS);
}

// The editing basics -- everything except theme, language, readOnly,
// updateListener and vim, which panels/code.html adds itself.
export function basicSetup() {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
  ];
}

export {
  EditorState, EditorSelection, Compartment, Prec,
  EditorView, keymap,
  history, historyKeymap,
  syntaxHighlighting, defaultHighlightStyle,
  oneDark, vim, Vim, getCM,
  // keymap adapters (lib/code-editor.js) + the indent-unit facet (code.json)
  emacs, indentUnit,
  // webLSP: the editor opens a /lsp WebSocket, wraps it as an LSPClient
  // Transport, and adds languageServerSupport(client, fileUri) -- completion,
  // hover and signature help. serverDiagnostics() is a *client* extension (not
  // an editor one) that languageServerSupport omits: without it the server's
  // textDocument/publishDiagnostics is received but never shown. code-editor.js
  // passes it in `new LSPClient({ extensions: [serverDiagnostics()] })`.
  // lintGutter draws the margin markers those diagnostics land in.
  LSPClient, languageServerSupport, serverDiagnostics, lintGutter,
  // decoration surface -- lib/code-editor.js builds code.mark / code.gutter
  // layers (diff +/- lines, search matches) from these.
  Decoration, gutter, GutterMarker,
};
