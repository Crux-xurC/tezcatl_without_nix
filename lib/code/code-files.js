// lib/code/code-files.js -- the file commands of code_editor (lib/code/code-editor.js), the
// pure parts: reading an ex command's argument and resolving a path
//
//   :w   :w!            save (! = without the "is the disk still what I opened" check)
//   :e <path>  :e!      open <path> (a new file when it does not exist); :e! drops unsaved edits
//   :Delete  :Delete!   delete the file on disk (the text stays in the editor, :w makes it again)
//   :Rename <name>      rename in the same directory          (vim-eunuch's names)
//   :Move <path>        move to <path>
//   :Scratch            write this text over the scratch (~work/scratch); the file here is untouched
//
// A path starting with ~work/ is in the work place: tezcatl's
// own temporary files, the relay's second root -- a file like any other here,
// but no language server is attached to it (isWork).
//
// Paths are from the FS root (what tree shows). One starting with ./ or ../
// is from the current file's directory. They never leave the root.
//
// The same commands typed in a skin's input form as ":<command>" go to that
// skin's code_editor (lib/skin/skin-ex.js, `code.file {op, arg, bang}`), and `:#` in
// code_editor moves to that input form (Vim's ways, through the
// input form; the symbol is code.json "inputFormEx"). parseEx reads such a line.
// eolOf / toDisk keep a file's line ending (CRLF) through an edit; sameFileUri
// matches a server's URI to the editor's.

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).codeFiles = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // codemirror-vim hands `:w!` to `w` with "!" leading the argument string
  function exArgs(argString) {
    const s = String(argString == null ? '' : argString);
    const bang = /^!/.test(s);
    return { bang: bang, arg: (bang ? s.slice(1) : s).trim() };
  }

  function dirname(p) {
    const i = String(p || '').lastIndexOf('/');
    return i < 0 ? '' : p.slice(0, i);
  }

  // -> {path} | {error}
  function resolve(current, arg) {
    let s = String(arg == null ? '' : arg).trim();
    if (!s) return { error: 'no path' };
    let base = '';
    if (/^\.\.?(\/|$)/.test(s)) base = dirname(current);
    else s = s.replace(/^\/+/, '');
    const out = base ? base.split('/') : [];
    for (const seg of s.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') {
        if (!out.length) return { error: 'outside the FS root: ' + arg };
        out.pop();
      } else out.push(seg);
    }
    if (!out.length) return { error: 'not a file path: ' + arg };
    return { path: out.join('/') };
  }

  // :Rename <name>: the same directory as current
  function sibling(current, name) {
    const n = String(name == null ? '' : name).trim();
    if (!n) return { error: 'no name' };
    if (n.indexOf('/') >= 0) return { error: ':Rename takes a name only (:Move changes the directory)' };
    if (n === '.' || n === '..') return { error: 'not a name: ' + n };
    const d = dirname(current);
    return { path: d ? d + '/' + n : n };
  }

  // ex command names (and their short forms) -> code.file's op
  const OPS = {
    w: 'write', write: 'write',
    e: 'edit', edit: 'edit',
    Delete: 'delete',
    Rename: 'rename',
    Move: 'move',
    Scratch: 'scratch',
    Replace: 'replace',
    // the copy
    Mirror: 'mirror',
    Replay: 'replay',
    Reconnect: 'reconnect',
    // the language server
    LspDef: 'lsp-definition',
    LspRefs: 'lsp-references',
    LspRename: 'lsp-rename',
    LspFormat: 'lsp-format',
  };
  // (the input form also takes :line[:col] and :find path[:line[:col]], lib/skin/skin-ex.js)
  const EX_USAGE = ':w[!] [replace mark list] / :e[!] [path] / :Delete[!] / :Rename name / :Move path / :Scratch / :Replace mark list / :Mirror / :Replay / :Reconnect / :LspDef / :LspRefs / :LspRename name / :LspFormat / :grep pattern [path] / :line[:col] / :find path[:line[:col]]';

  // ":e! lib/a.ex" -> {op: 'edit', bang: true, arg: 'lib/a.ex'} | {error}
  function parseEx(line) {
    const m = /^\s*:\s*([A-Za-z]+)(.*)$/.exec(String(line == null ? '' : line));
    if (!m) return { error: 'not a command starting with :' };
    const op = Object.prototype.hasOwnProperty.call(OPS, m[1]) ? OPS[m[1]] : null;
    if (!op) return { error: 'no such command: :' + m[1] + ' (' + EX_USAGE + ')' };
    const a = exArgs(m[2].replace(/^\s+(?=!)/, ''));
    if ((op === 'rename' || op === 'move' || op === 'lsp-rename') && !a.arg) return { error: ':' + m[1] + ' needs ' + (op === 'move' ? 'a path' : op === 'lsp-rename' ? 'the new name' : 'a name') };
    if (op === 'replace' && !/^\S+\s+\S+$/.test(a.arg)) return { error: ':Replace needs a mark and a list (:Replace #mark list)' };
    // :w takes one argument: replace <mark> <list> (lib/code/marks.js)
    if (op === 'write' && a.arg && !/^replace\s+\S+\s+\S+$/.test(a.arg)) return { error: ':w takes no path (:w replace <mark> <list>)' };
    if (['delete', 'scratch', 'mirror', 'replay', 'reconnect', 'lsp-definition', 'lsp-references', 'lsp-format'].indexOf(op) >= 0 && a.arg) return { error: ':' + m[1] + ' takes no arguments' };
    return { op: op, bang: a.bang, arg: a.arg };
  }

  // the work place (the relay's second root, lib/relay/fs_validate.exs) and its scratch
  const WORK = '~work';
  const SCRATCH = WORK + '/scratch';
  function isWork(path) {
    const p = String(path == null ? '' : path).replace(/^\/+/, '');
    return p === WORK || p.indexOf(WORK + '/') === 0;
  }

  // The line ending of a file as read. CodeMirror keeps "\n" inside (it reads
  // "\r\n", "\r" and "\n" alike), so what it saves must be turned back with
  // toDisk -- else a CRLF file is written as LF, every line a change.
  // Mixed endings cannot be kept: the saved file has the one
  // that was more common, and `mixed` says so.
  function eolOf(text) {
    const s = String(text == null ? '' : text);
    const crlf = (s.match(/\r\n/g) || []).length;
    const lf = (s.match(/\n/g) || []).length - crlf;
    const cr = (s.match(/\r(?!\n)/g) || []).length;
    const kinds = (crlf > 0) + (lf > 0) + (cr > 0);
    return { eol: crlf > lf ? '\r\n' : '\n', mixed: kinds > 1 || cr > 0 };
  }

  // the editor's text ("\n" lines) as it goes to disk
  function toDisk(text, eol) {
    const s = String(text == null ? '' : text);
    return eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s;
  }

  // Whether two file:// URIs name the same file. The
  // relay writes them percent-encoded as vscode-uri does, but servers differ
  // on the characters in between (nil leaves `(` `)` `!` `+` ... as they are,
  // vscode-uri encodes them), so they are compared decoded.
  function sameFileUri(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a === b) return true;
    function dec(u) { try { return decodeURIComponent(u); } catch (_) { return u; } }
    return dec(a) === dec(b);
  }

  return { exArgs: exArgs, resolve: resolve, sibling: sibling, dirname: dirname, parseEx: parseEx, eolOf: eolOf, toDisk: toDisk, sameFileUri: sameFileUri, isWork: isWork, WORK: WORK, SCRATCH: SCRATCH, OPS: OPS, EX_USAGE: EX_USAGE };
});
