'use strict';
// lib/code/code-outline.js: the definitions of a file
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../lib/code/code-outline.js');

// a tiny tree cursor over [name, from, to, ...children] arrays
function cursor(tree) {
  const stack = [{ node: tree, kids: [tree], i: 0 }];
  const top = () => stack[stack.length - 1];
  const cur = {
    get name() { return top().kids[top().i][0]; },
    get from() { return top().kids[top().i][1]; },
    get to() { return top().kids[top().i][2]; },
    firstChild() { const n = top().kids[top().i]; const k = n.slice(3); if (!k.length) return false; stack.push({ kids: k, i: 0 }); return true; },
    nextSibling() { if (top().i + 1 >= top().kids.length) return false; top().i += 1; return true; },
    parent() { if (stack.length < 2) return false; stack.pop(); return true; },
  };
  return cur;
}
function run(src, tree) {
  const lineOf = (pos) => { const before = src.slice(0, pos).split('\n'); return { line: before.length, col: before[before.length - 1].length + 1 }; };
  return O.fromTree(cursor(tree), (a, b) => src.slice(a, b), lineOf).map((x) => [x.kind, x.name, x.line, x.depth]);
}

test('JS: functions, classes and their methods, top-level arrow functions; not plain variables or nested ones', () => {
  const src = 'function top(a) {}\nconst arrow = (b) => b;\nconst n = 1;\nclass K { m() {} }\n';
  const tree = ['Script', 0, src.length,
    ['FunctionDeclaration', 0, 18, ['function', 0, 8], ['VariableDefinition', 9, 12]],
    ['VariableDeclaration', 19, 42, ['VariableDefinition', 25, 30], ['ArrowFunction', 33, 41]],
    ['VariableDeclaration', 43, 55, ['VariableDefinition', 49, 50], ['Number', 53, 54]],
    ['ClassDeclaration', 56, 74, ['VariableDefinition', 62, 63],
      ['ClassBody', 64, 74, ['MethodDeclaration', 66, 72, ['PropertyDefinition', 66, 67]]]]];
  assert.deepEqual(run(src, tree), [
    ['function', 'top', 1, 0], ['function', 'arrow', 2, 0], ['class', 'K', 4, 0], ['method', 'm', 4, 1]]);
});

test('Elixir: defmodule nests def / defp / defmacro', () => {
  const src = 'defmodule Calc do\n  def add(a, b), do: a + b\n  defp sub(a), do: a\nend\n';
  const i1 = src.indexOf('def add'), i2 = src.indexOf('defp');
  const tree = ['Source', 0, src.length,
    ['KernelCall', 0, src.length - 1, ['Identifier', 0, 9], ['Arguments', 10, 14, ['Alias', 10, 14]],
      ['DoBlock', 15, src.length - 1,
        ['FunctionDefinitionCall', i1, i1 + 24, ['Identifier', i1, i1 + 3], ['Arguments', i1 + 4, i1 + 24]],
        ['FunctionDefinitionCall', i2, i2 + 18, ['Identifier', i2, i2 + 4], ['Arguments', i2 + 5, i2 + 18]]]]];
  assert.deepEqual(run(src, tree), [['module', 'Calc', 1, 0], ['def', 'add', 2, 1], ['defp', 'sub', 3, 1]]);
});

test('Nix bindings of the file only; Markdown headings by level; JSON top-level keys', () => {
  const nix = '{ a = 1; b = f { c = 2; }; }';
  assert.deepEqual(run(nix, ['Program', 0, nix.length, ['AttrSet', 0, nix.length,
    ['Bind', 2, 8, ['AttrPath', 2, 3]],
    ['Bind', 9, 26, ['AttrPath', 9, 10], ['App', 13, 25, ['AttrSet', 15, 25, ['Bind', 17, 23, ['AttrPath', 17, 18]]]]]]]),
  [['binding', 'a', 1, 0], ['binding', 'b', 1, 0]]);
  const md = '# T\n\n## S\n';
  assert.deepEqual(run(md, ['Document', 0, md.length, ['ATXHeading1', 0, 3, ['HeaderMark', 0, 1]], ['ATXHeading2', 5, 9, ['HeaderMark', 5, 7]]]),
    [['h1', 'T', 1, 0], ['h2', 'S', 3, 1]]);
  const js = '{"a": 1, "b": {"c": 2}}';
  assert.deepEqual(run(js, ['JsonText', 0, js.length, ['Object', 0, js.length,
    ['Property', 1, 7, ['PropertyName', 1, 4]],
    ['Property', 9, 22, ['PropertyName', 9, 12], ['Object', 14, 22, ['Property', 15, 21, ['PropertyName', 15, 18]]]]]]),
  [['key', 'a', 1, 0], ['key', 'b', 1, 0]]);
});

test('fromSymbols: DocumentSymbol (nested) and SymbolInformation (flat); definitions only', () => {
  const r = (l, c) => ({ start: { line: l, character: c }, end: { line: l + 2, character: 0 } });
  const doc = [
    { name: 'M', kind: 2, range: r(0, 0), selectionRange: r(0, 7), children: [
      { name: 'f', kind: 12, range: r(1, 2), selectionRange: r(1, 6) },
      { name: 'x', kind: 13, range: r(3, 2), selectionRange: r(3, 6) },
    ] },
    { name: 'g', kind: 12, range: r(4, 0), selectionRange: r(4, 4), children: [
      { name: 'local', kind: 13, range: r(4, 8), selectionRange: r(4, 8) },
    ] },
    { name: 'top', kind: 13, range: r(5, 0), selectionRange: r(5, 4) },
    { name: 'field', kind: 8, range: r(6, 0) },
  ];
  assert.deepEqual(O.fromSymbols(doc).map((x) => [x.kind, x.name, x.line, x.col, x.depth]),
    // a variable in a module stays (OCaml's lets), a function's local does not
    [['module', 'M', 1, 8, 0], ['function', 'f', 2, 7, 1], ['variable', 'x', 4, 7, 1], ['function', 'g', 5, 5, 0], ['variable', 'top', 6, 5, 0]]);
  const flat = [{ name: 'g', kind: 12, location: { uri: 'file:///a.ml', range: r(4, 4) } }];
  assert.deepEqual(O.fromSymbols(flat).map((x) => [x.name, x.line, x.col]), [['g', 5, 5]]);
  assert.deepEqual(O.fromSymbols(null), []);
});

test('around: the innermost definition holding a line', () => {
  const items = [
    { name: 'M', line: 1, depth: 0, end: 10 },
    { name: 'f', line: 2, depth: 1, end: 4 },
    { name: 'g', line: 6, depth: 1, end: 9 },
    { name: 'h1', line: 12, depth: 0, end: null },
  ];
  assert.equal(O.around(items, 3), 1);
  assert.equal(O.around(items, 5), 0);
  assert.equal(O.around(items, 7), 2);
  assert.equal(O.around(items, 11), -1);
  assert.equal(O.around(items, 50), 3);
});
