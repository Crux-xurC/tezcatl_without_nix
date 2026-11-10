'use strict';
// lib/code/editor-keys.js: the file editor's keys per keymap and whether the
// input line's ":" lines are taken (D-code-editor)
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../lib/code/editor-keys.js');

test('mergeKeys: per keymap over the defaults; "" unmaps; the flat form is vim\'s', async () => {
  const K = await load();
  const m = K.mergeKeys({ emacs: { 'M-.': '', 'C-c d': 'code.diag-next' } });
  assert.equal(m.vim.gd, 'code.lsp-definition');
  assert.equal(m.emacs['C-c d'], 'code.diag-next');
  assert.deepEqual(Object.keys(K.keysOf(m, 'emacs')).includes('M-.'), false);
  const flat = K.mergeKeys({ gd: '', 'gD': 'code.lsp-references' });
  assert.equal(K.keysOf(flat, 'vim').gd, undefined);
  assert.equal(K.keysOf(flat, 'vim').gD, 'code.lsp-references');
  assert.equal(K.keysOf(flat, 'emacs')['M-.'], 'code.lsp-definition');
  // a keymap with no defaults
  assert.deepEqual(K.keysOf(K.mergeKeys({ kak: { gd: 'code.lsp-definition' } }), 'kak'), { gd: 'code.lsp-definition' });
  assert.deepEqual(K.mergeKeys(null).vim, K.DEFAULT_KEYS.vim);
});

test('toCm: Emacs\' notation and CodeMirror\'s; strokes kept; unreadable is null', async () => {
  const K = await load();
  assert.equal(K.toCm('C-M-e'), 'Ctrl-Alt-e');
  assert.equal(K.toCm('M-g n'), 'Alt-g n');
  assert.equal(K.toCm('C-h .'), 'Ctrl-h .');
  assert.equal(K.toCm('C--'), 'Ctrl--');
  assert.equal(K.toCm('s-RET'), 'Meta-Enter');
  assert.equal(K.toCm('Ctrl-Alt-e'), 'Ctrl-Alt-e');
  assert.equal(K.toCm('Mod-k'), 'Mod-k');
  assert.equal(K.toCm('X-q'), null);
  assert.equal(K.toCm(''), null);
  const b = K.bindings({ 'M-.': 'code.lsp-definition', 'Q-z': 'x' });
  assert.deepEqual(b.bindings, [{ key: 'Alt-.', command: 'code.lsp-definition', as: 'M-.' }]);
  assert.deepEqual(b.bad, ['Q-z']);
});

test('inputLineEx: as code.json says, else only vim', async () => {
  const K = await load();
  assert.equal(K.inputLineEx(null, 'vim'), true);
  assert.equal(K.inputLineEx(null, 'emacs'), false);
  assert.equal(K.inputLineEx(true, 'emacs'), true);
  assert.equal(K.inputLineEx(false, 'vim'), false);
});

test('every default key of a keymap other than vim can be read', async () => {
  const K = await load();
  Object.keys(K.DEFAULT_KEYS).filter((id) => id !== 'vim').forEach((id) => {
    assert.deepEqual(K.bindings(K.DEFAULT_KEYS[id]).bad, [], id);
  });
});
