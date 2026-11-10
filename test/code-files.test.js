'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { exArgs, resolve, sibling } = require('../lib/code/code-files.js');

test('exArgs: a leading ! is the bang, the rest is the argument', () => {
  assert.deepEqual(exArgs(''), { bang: false, arg: '' });
  assert.deepEqual(exArgs(undefined), { bang: false, arg: '' });
  assert.deepEqual(exArgs('!'), { bang: true, arg: '' });
  assert.deepEqual(exArgs(' lib/a.ex'), { bang: false, arg: 'lib/a.ex' });
  assert.deepEqual(exArgs('! lib/a.ex'), { bang: true, arg: 'lib/a.ex' });
});

test('resolve: from the FS root, or from the current file with ./ ../', () => {
  assert.deepEqual(resolve('proj/lib/a.ex', 'proj/x.ex'), { path: 'proj/x.ex' });
  assert.deepEqual(resolve('proj/lib/a.ex', '/proj/x.ex'), { path: 'proj/x.ex' });
  assert.deepEqual(resolve('proj/lib/a.ex', './b.ex'), { path: 'proj/lib/b.ex' });
  assert.deepEqual(resolve('proj/lib/a.ex', '../test/a_test.exs'), { path: 'proj/test/a_test.exs' });
  assert.deepEqual(resolve(null, './b.ex'), { path: 'b.ex' });
  assert.deepEqual(resolve('a.ex', 'x//y/./z.txt'), { path: 'x/y/z.txt' });
});

test('resolve: what is refused', () => {
  assert.match(resolve('a.ex', '').error, /no path/);
  assert.match(resolve('a.ex', '../x').error, /outside the FS root/);
  assert.match(resolve('p/a.ex', 'p/../..').error, /outside the FS root/);
  assert.match(resolve('a.ex', '.').error, /not a file path/);
});

test('sibling: :Rename stays in the directory', () => {
  assert.deepEqual(sibling('proj/lib/a.ex', 'b.ex'), { path: 'proj/lib/b.ex' });
  assert.deepEqual(sibling('a.ex', 'b.ex'), { path: 'b.ex' });
  assert.match(sibling('proj/a.ex', 'x/b.ex').error, /:Move/);
  assert.match(sibling('proj/a.ex', '').error, /no name/);
  assert.match(sibling('proj/a.ex', '..').error, /not a name/);
});

test('parseEx: a ":" line typed in the input form', () => {
  const { parseEx } = require('../lib/code/code-files.js');
  assert.deepEqual(parseEx(':w'), { op: 'write', bang: false, arg: '' });
  assert.deepEqual(parseEx(' :write!'), { op: 'write', bang: true, arg: '' });
  assert.deepEqual(parseEx(':e lib/a.ex'), { op: 'edit', bang: false, arg: 'lib/a.ex' });
  assert.deepEqual(parseEx(':e! ./b.ex'), { op: 'edit', bang: true, arg: './b.ex' });
  assert.deepEqual(parseEx(':e'), { op: 'edit', bang: false, arg: '' });
  assert.deepEqual(parseEx(':Delete!'), { op: 'delete', bang: true, arg: '' });
  assert.deepEqual(parseEx(':Rename b.ex'), { op: 'rename', bang: false, arg: 'b.ex' });
  assert.deepEqual(parseEx(':Move x/y.ex'), { op: 'move', bang: false, arg: 'x/y.ex' });
  assert.match(parseEx('tree add').error, /not a command starting with :/);
  assert.match(parseEx(':ls').error, /no such command: :ls/);
  assert.match(parseEx(':Rename').error, /needs a name/);
  assert.match(parseEx(':w x').error, /takes no path/);
  assert.deepEqual(parseEx(':w replace #eigenvalue 8degit-list'), { op: 'write', bang: false, arg: 'replace #eigenvalue 8degit-list' });
  assert.match(parseEx(':w replace #e').error, /takes no path/);
  assert.deepEqual(parseEx(':Replace #eigenvalue ids'), { op: 'replace', bang: false, arg: '#eigenvalue ids' });
  assert.match(parseEx(':Replace #e').error, /needs a mark and a list/);
});

test('eolOf / toDisk: a CRLF file goes back to disk as CRLF (CodeMirror holds "\\n")', () => {
  const { eolOf, toDisk } = require('../lib/code/code-files.js');
  assert.deepEqual(eolOf('a\nb\n'), { eol: '\n', mixed: false });
  assert.deepEqual(eolOf('a\r\nb\r\n'), { eol: '\r\n', mixed: false });
  assert.deepEqual(eolOf(''), { eol: '\n', mixed: false });
  assert.deepEqual(eolOf('one line'), { eol: '\n', mixed: false });
  // mixed: the more common one wins, and it is said
  assert.deepEqual(eolOf('a\r\nb\r\nc\n'), { eol: '\r\n', mixed: true });
  assert.deepEqual(eolOf('a\r\nb\nc\n'), { eol: '\n', mixed: true });
  assert.deepEqual(eolOf('a\rb\r'), { eol: '\n', mixed: true });   // old Mac CR: not kept
  assert.equal(toDisk('a\nb\n', '\r\n'), 'a\r\nb\r\n');
  assert.equal(toDisk('a\nb\n', '\n'), 'a\nb\n');
  assert.equal(toDisk('x', '\r\n'), 'x');
});

test('eolOf + toDisk + CodeMirror: an unedited CRLF file is written back byte for byte', async () => {
  const { eolOf, toDisk } = require('../lib/code/code-files.js');
  const { EditorState } = await import('../lib/vendor/codemirror/cm.bundle.js');
  const disk = 'line 1\r\nline 2\r\n\r\nend';
  const held = EditorState.create({ doc: disk }).doc.toString();
  assert.equal(held, 'line 1\nline 2\n\nend');   // what CodeMirror does to it
  assert.equal(toDisk(held, eolOf(disk).eol), disk);
});

test('sameFileUri: the same file however the server encodes the URI (A8)', () => {
  const { sameFileUri } = require('../lib/code/code-files.js');
  // the relay's form (vscode-uri) and nil's (leaves "(" ")" as they are)
  assert.equal(sameFileUri('file:///a%20b/%28x%29.nix', 'file:///a%20b/(x).nix'), true);
  assert.equal(sameFileUri('file:///%E6%97%A5%E6%9C%AC/x.js', 'file:///日本/x.js'), true);
  assert.equal(sameFileUri('file:///a/x.js', 'file:///a/x.js'), true);
  assert.equal(sameFileUri('file:///a/x.js', 'file:///a/y.js'), false);
  // %2541 is "%41", not "A"
  assert.equal(sameFileUri('file:///p%2541.js', 'file:///pA.js'), false);
  // a malformed escape is compared as it is, not thrown
  assert.equal(sameFileUri('file:///a%zz', 'file:///a%zz'), true);
  assert.equal(sameFileUri(null, 'file:///a'), false);
});

test('parseEx: the copy\'s commands take no argument', () => {
  const { parseEx } = require('../lib/code/code-files.js');
  assert.deepEqual(parseEx(':Mirror'), { op: 'mirror', bang: false, arg: '' });
  assert.deepEqual(parseEx(':Replay'), { op: 'replay', bang: false, arg: '' });
  assert.deepEqual(parseEx(':Reconnect'), { op: 'reconnect', bang: false, arg: '' });
  assert.match(parseEx(':Replay x').error, /takes no arguments/);
});

test('parseEx: the language server\'s commands', () => {
  const { parseEx } = require('../lib/code/code-files.js');
  assert.deepEqual(parseEx(':LspDef'), { op: 'lsp-definition', bang: false, arg: '' });
  assert.deepEqual(parseEx(':LspRefs'), { op: 'lsp-references', bang: false, arg: '' });
  assert.deepEqual(parseEx(':LspRename total'), { op: 'lsp-rename', bang: false, arg: 'total' });
  assert.deepEqual(parseEx(':LspFormat'), { op: 'lsp-format', bang: false, arg: '' });
  assert.match(parseEx(':LspRename').error, /needs the new name/);
  assert.match(parseEx(':LspDef x').error, /takes no arguments/);
});

test('the work place: :Scratch, and which paths are in it', () => {
  const F = require('../lib/code/code-files.js');
  assert.deepEqual(F.parseEx(':Scratch'), { op: 'scratch', bang: false, arg: '' });
  assert.match(F.parseEx(':Scratch x').error, /takes no arguments/);
  assert.equal(F.SCRATCH, '~work/scratch');
  assert.equal(F.isWork('~work/scratch'), true);
  assert.equal(F.isWork('/~work/clone/lib/a.ex'), true);
  assert.equal(F.isWork('~work'), true);
  assert.equal(F.isWork('~workbench/a.ex'), false);
  assert.equal(F.isWork('lib/~work/a.ex'), false);
  assert.equal(F.isWork(null), false);
  // a path in the work place is resolved as any other
  assert.deepEqual(F.resolve('lib/a.ex', '~work/scratch'), { path: '~work/scratch' });
});
