'use strict';
// lib/code/code-editor/relay.js: the hash a save is checked with. Without
// crypto.subtle (a page opened by another host name) it is computed in the
// page (sha256Hex) and must be the relay's -- the same as node's.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('sha256Hex is SHA-256: empty, short, UTF-8, block edges, a large text (2026-10-09)', async () => {
  const { sha256Hex } = await import('../lib/code/code-editor/relay.js');
  const texts = ['', 'abc', '日本語のテキスト\r\n', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(119), 'z'.repeat(200000)];
  for (const t of texts) {
    const b = new TextEncoder().encode(t);
    assert.equal(sha256Hex(b), crypto.createHash('sha256').update(b).digest('hex'), JSON.stringify(t.slice(0, 20)) + ' (' + b.length + ' bytes)');
  }
});
