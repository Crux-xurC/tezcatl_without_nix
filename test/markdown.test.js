'use strict';
// lib/code/markdown.js: the `markdown ...` lines and a note's layout (the
// real parser: lib/vendor/codemirror/markdown.bundle.js, @lezer/markdown + GFM)
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/code/markdown.js');
const F = require('../lib/code/code-files.js');

let parser = null;
const ready = import('../lib/vendor/codemirror/markdown.bundle.js').then((m) => { parser = m.parser; });
async function lay(src) { await ready; return M.layout(parser.parse(src), src).blocks; }
// the text of inline pieces, marks shown: em *x*, strong **x**, code `x`, link [x](href|kind)
function flat(kids) {
  return kids.map((k) => {
    if (k.t === 'text') return k.s;
    if (k.t === 'em') return '*' + flat(k.kids) + '*';
    if (k.t === 'strong') return '**' + flat(k.kids) + '**';
    if (k.t === 'del') return '~~' + flat(k.kids) + '~~';
    if (k.t === 'code') return '`' + k.s + '`';
    if (k.t === 'link') return '[' + flat(k.kids) + '](' + k.href + '|' + k.kind + ')';
    if (k.t === 'img') return '<img ' + k.src + '>';
    if (k.t === 'raw') return '{raw ' + k.s + '}';
    if (k.t === 'br') return '\n';
    return '?' + k.t;
  }).join('');
}

test('parse: markdown <path> / follow / unfollow; other lines are not its', () => {
  assert.equal(M.parse('skin add 1 tree'), null);
  assert.equal(M.parse('markdowns'), null);
  assert.deepEqual(M.parse('markdown notes/a.md'), { cmd: 'open', path: 'notes/a.md' });
  assert.deepEqual(M.parse('  markdown  /notes/my note.md '), { cmd: 'open', path: 'notes/my note.md' });
  assert.deepEqual(M.parse('markdown follow'), { cmd: 'follow' });
  assert.deepEqual(M.parse('markdown unfollow'), { cmd: 'unfollow' });
  assert.match(M.parse('markdown').error, /markdown <path>/);
  const resolve = (arg) => F.resolve('notes/a.md', arg);
  assert.deepEqual(M.parse('markdown ./b.md', resolve), { cmd: 'open', path: 'notes/b.md' });
  assert.match(M.parse('markdown ../../x.md', resolve).error, /outside the FS root/);
});

test('linkKind: the web in a new window, a path opened, anything else plain text', () => {
  assert.equal(M.linkKind('https://example.com/a'), 'web');
  assert.equal(M.linkKind('HTTP://x'), 'web');
  assert.equal(M.linkKind('./b.md'), 'file');
  assert.equal(M.linkKind('b.md#x'), 'file');
  assert.equal(M.linkKind('#anchor'), 'none');
  assert.equal(M.linkKind('javascript:alert(1)'), 'none');
  assert.equal(M.linkKind('mailto:a@b'), 'none');
  assert.equal(M.linkKind('//evil.example/x'), 'none');
  assert.equal(M.linkKind(''), 'none');
});

test('layout: headings, paragraphs and inline marks, with their lines', async () => {
  const b = await lay('# Title #\n\nSome *em* and **strong** `code` ~~gone~~\nnext line\\\nbroken\n\nSetext\n---\n');
  assert.deepEqual(b.map((x) => [x.t, x.line, x.endLine]), [['h', 1, 1], ['p', 3, 5], ['h', 7, 8]]);
  assert.equal(b[0].level, 1);
  assert.equal(flat(b[0].kids), 'Title');
  assert.equal(flat(b[1].kids), 'Some *em* and **strong** `code` ~~gone~~ next line\nbroken');
  assert.equal(b[2].level, 2);
  assert.equal(flat(b[2].kids), 'Setext');
});

test('layout: links (inline, reference, auto), an image said, raw HTML kept as text, entities', async () => {
  const b = await lay('[a](./b.md) [web](https://x.org) [js](javascript:alert(1)) [ref][r] <https://auto.org> ![pic](img/p.png) <b>x</b> &amp; &#65;\n\n[r]: other.md\n\n<div onclick="x()">hi</div>\n');
  assert.equal(flat(b[0].kids), '[a](./b.md|file) [web](https://x.org|web) [js](javascript:alert(1)|none) [ref](other.md|file) [https://auto.org](https://auto.org|web) <img img/p.png> {raw <b>}x{raw </b>} & A');
  assert.deepEqual(b.map((x) => x.t), ['p', 'raw']);
  assert.equal(b[1].s, '<div onclick="x()">hi</div>');
});

test('layout: lists with tasks, a quote, a fenced and an indented code block, a rule', async () => {
  const b = await lay('- [ ] open\n- [x] done\n- plain\n  - nested\n\n3. three\n4. four\n\n> q\n> r\n\n```js\nx = 1\n```\n\n    indented\n\n***\n');
  assert.deepEqual(b.map((x) => x.t), ['ul', 'ol', 'quote', 'pre', 'pre', 'hr']);
  assert.deepEqual(b[0].items.map((i) => i.task), [false, true, null]);
  assert.equal(flat(b[0].items[0].kids[0].kids), 'open');
  assert.equal(b[0].items[2].kids[1].t, 'ul');
  assert.equal(b[1].start, 3);
  assert.equal(flat(b[2].kids[0].kids), 'q r');
  assert.deepEqual([b[3].lang, b[3].s], ['js', 'x = 1']);
  assert.equal(b[4].s, 'indented');
});

test('layout: a GFM table, its alignment, and the pandoc caption before or after', async () => {
  const b = await lay('Table: tasks one\n\n| id | task |\n|:--|--:|\n| t-01 | **a** |\n| t-02 | b |\n\npara\n\n| x |\n|---|\n| 1 |\n\nTable: after\n');
  assert.deepEqual(b.map((x) => x.t), ['table', 'p', 'table']);
  assert.equal(b[0].caption, 'tasks one');
  assert.deepEqual([b[0].line, b[0].endLine], [1, 6]);
  assert.deepEqual(b[0].align, ['left', 'right']);
  assert.deepEqual(b[0].head.map(flat), ['id', 'task']);
  assert.deepEqual(b[0].rows.map((r) => r.map(flat)), [['t-01', '**a**'], ['t-02', 'b']]);
  assert.equal(b[2].caption, 'after');
  assert.equal(b[2].endLine, 14);
});

test('blockAt: the block that holds a line, else the last one before it', async () => {
  const b = await lay('# A\n\npara\nmore\n\n\n- x\n');
  assert.equal(M.blockAt(b, 1), 0);
  assert.equal(M.blockAt(b, 4), 1);
  assert.equal(M.blockAt(b, 5), 1);
  assert.equal(M.blockAt(b, 7), 2);
  assert.equal(M.blockAt([], 3), -1);
});

async function tabs(src) { await ready; return M.tables(parser.parse(src), src); }

test('tables: each GFM table with its name, cells as markdown source, lines and ranges', async () => {
  const src = '# Note\n\nTable: task matrix k3x9a2bq\n\n| id | task |\n|----|------|\n| t-01 | **first** |\n| t-02 | a \\| b |\n\ntext\n\n| x |\n|---|\n| 1 |\n\nTable:  after one  \n\n| plain |\n|---|\n';
  const t = await tabs(src);
  assert.equal(t.length, 3);
  assert.equal(t[0].name, 'task matrix k3x9a2bq');
  assert.deepEqual(t[0].head, ['id', 'task']);
  assert.deepEqual(t[0].rows, [['t-01', '**first**'], ['t-02', 'a \\| b']]);
  assert.deepEqual([t[0].captionLine, t[0].line, t[0].endLine], [3, 5, 8]);
  assert.ok(src.slice(t[0].from, t[0].to).startsWith('Table: task matrix') && src.slice(t[0].from, t[0].to).endsWith('| a \\| b |'));
  assert.ok(src.slice(t[0].tableFrom, t[0].tableTo).startsWith('| id |'));
  assert.equal(t[1].name, 'after one');
  assert.ok(src.slice(t[1].from, t[1].to).endsWith('Table:  after one  '));
  assert.equal(t[2].name, null);
  assert.equal(t[2].captionLine, null);
  assert.deepEqual(t[2].rows, []);
});

test('tables: a caption is used once; a table in a list is read; a Table: line far away is not a caption', async () => {
  const t = await tabs('Table: one\n\n| a |\n|---|\n\n| b |\n|---|\n\n- item\n\n  | c |\n  |---|\n\nTable: alone\n\npara\n');
  assert.deepEqual(t.map((x) => x.name), ['one', null, null]);
  assert.deepEqual(t[2].head, ['c']);
});

test('findTable: by name; none or two of the same name is an error, never a guess', async () => {
  const t = await tabs('Table: a\n\n| x |\n|---|\n\nTable: b\n\n| y |\n|---|\n\nTable: b\n\n| z |\n|---|\n');
  assert.deepEqual(M.findTable(t, ' a ').table.head, ['x']);
  assert.match(M.findTable(t, 'c').error, /no table named "c"/);
  assert.match(M.findTable(t, 'b').error, /2 tables are named "b" \(lines 8, 13\)/);
});

test('layout and tables: an empty cell keeps its column', async () => {
  const src = 'Table: e\n\n| a | b | c |\n|---|---|---|\n| 1 | | 3 |\n';
  const b = await lay(src);
  assert.deepEqual(b[0].rows[0].map(flat), ['1', '', '3']);
  assert.deepEqual((await tabs(src))[0].rows[0], ['1', '', '3']);
});
