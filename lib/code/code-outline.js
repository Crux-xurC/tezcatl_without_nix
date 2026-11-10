// lib/code/code-outline.js -- the definitions of a file, for the outline panel
// (show the syntax tree as a list of definitions
// only -- functions, modules, classes ...). Pure: lib/code/code-editor.js hands
// it a Lezer tree cursor (or a language server's documentSymbol answer) and
// panels/resident/code_outline.html shows the result.
//
//   fromTree(cursor, text, lineOf) -> [{name, kind, line, col, depth, from, to, end}]  (end: its last line)
//     cursor: anything with name / from / to / firstChild() / nextSibling() /
//     parent() -- a Lezer TreeCursor; text(from, to); lineOf(pos) -> {line, col} (1-based)
//   fromSymbols(result) -> the same shape from textDocument/documentSymbol
//     (DocumentSymbol[] or SymbolInformation[]), for the languages whose
//     grammar has no tree to read (legacy modes: OCaml ...)
//   around(items, line) -> the index of the innermost definition holding `line`, or -1
//
// The rules go by node name. The grammars' names barely overlap, so one
// table serves every language: JS/TS, Python, Rust, Elixir, Nix (the
// bindings of the file's own set / let), Markdown (headings), JSON and YAML
// (the top-level keys), CSS (rule sets, @media). A language with none of
// these names gives [] (and the caller asks the language server).

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).codeOutline = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // a node's direct children, as {name, from, to} (the cursor is left where it was)
  function children(cur) {
    const out = [];
    if (!cur.firstChild()) return out;
    do out.push({ name: cur.name, from: cur.from, to: cur.to }); while (cur.nextSibling());
    cur.parent();
    return out;
  }
  function child(kids, names) { return kids.find((k) => names.indexOf(k.name) >= 0) || null; }
  function oneLine(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  const JS_FN = ['ArrowFunction', 'FunctionExpression', 'ClassExpression'];

  // node name -> (cur, kids, text, ancestors) -> {name, kind} | null
  const RULES = {
    // JS / TS
    FunctionDeclaration: (c, k, t) => named(k, t, ['VariableDefinition'], 'function'),
    ClassDeclaration: (c, k, t) => named(k, t, ['VariableDefinition', 'TypeDefinition'], 'class'),
    MethodDeclaration: (c, k, t) => named(k, t, ['PropertyDefinition', 'PrivatePropertyDefinition'], 'method'),
    InterfaceDeclaration: (c, k, t) => named(k, t, ['TypeDefinition'], 'interface'),
    TypeAliasDeclaration: (c, k, t) => named(k, t, ['TypeDefinition'], 'type'),
    EnumDeclaration: (c, k, t) => named(k, t, ['TypeDefinition'], 'enum'),
    // `const f = (x) => ...` at the top of the file (or exported)
    VariableDeclaration: (c, k, t, anc) => {
      const top = anc.length && ['Script', 'ExportDeclaration'].indexOf(anc[anc.length - 1]) >= 0;
      return top && child(k, JS_FN) ? named(k, t, ['VariableDefinition'], 'function') : null;
    },
    // Python
    FunctionDefinition: (c, k, t) => named(k, t, ['VariableName'], 'function'),
    ClassDefinition: (c, k, t) => named(k, t, ['VariableName'], 'class'),
    // Rust
    FunctionItem: (c, k, t) => named(k, t, ['BoundIdentifier'], 'function'),
    StructItem: (c, k, t) => named(k, t, ['TypeIdentifier'], 'struct'),
    EnumItem: (c, k, t) => named(k, t, ['TypeIdentifier'], 'enum'),
    TraitItem: (c, k, t) => named(k, t, ['TypeIdentifier'], 'trait'),
    TypeItem: (c, k, t) => named(k, t, ['TypeIdentifier'], 'type'),
    ModItem: (c, k, t) => named(k, t, ['BoundIdentifier'], 'module'),
    ImplItem: (c, k, t) => {
      const n = child(k, ['TypeIdentifier', 'GenericType', 'ScopedTypeIdentifier']);
      return n ? { name: 'impl ' + oneLine(t(n.from, n.to)), kind: 'impl' } : null;
    },
    // Elixir: def / defp / defmacro ... and defmodule
    FunctionDefinitionCall: (c, k, t) => {
      const id = child(k, ['Identifier']);
      const args = child(k, ['Arguments']);
      if (!id || !args) return null;
      const m = /^\s*([A-Za-z_][\w?!]*)/.exec(t(args.from, args.to));
      return m ? { name: m[1], kind: t(id.from, id.to) } : null;
    },
    KernelCall: (c, k, t) => {
      const id = child(k, ['Identifier']);
      const args = child(k, ['Arguments']);
      if (!id || !args || t(id.from, id.to) !== 'defmodule') return null;
      return { name: oneLine(t(args.from, args.to)), kind: 'module' };
    },
    // Nix: a binding of the file's own set / let, not one inside another binding's value
    Bind: (c, k, t, anc) => {
      if (anc.indexOf('Bind') >= 0) return null;
      const p = child(k, ['AttrPath']);
      return p ? { name: oneLine(t(p.from, p.to)), kind: 'binding' } : null;
    },
    // CSS
    RuleSet: (c, k, t) => {
      const b = child(k, ['Block']);
      return { name: oneLine(t(c.from, b ? b.from : c.to)), kind: 'rule' };
    },
    MediaStatement: (c, k, t) => {
      const b = child(k, ['Block']);
      return { name: oneLine(t(c.from, b ? b.from : c.to)), kind: 'media' };
    },
    // JSON / YAML: the top-level keys
    Property: (c, k, t, anc) => {
      if (anc.indexOf('Property') >= 0) return null;
      const n = child(k, ['PropertyName']);
      return n ? { name: t(n.from, n.to).replace(/^"|"$/g, ''), kind: 'key' } : null;
    },
    Pair: (c, k, t, anc) => {
      if (anc.indexOf('Pair') >= 0) return null;
      const n = child(k, ['Key']);
      return n ? { name: oneLine(t(n.from, n.to)), kind: 'key' } : null;
    },
  };
  function named(kids, text, names, kind) {
    const n = child(kids, names);
    return n ? { name: oneLine(text(n.from, n.to)), kind } : null;
  }
  // Markdown headings: ATXHeading1..6, SetextHeading1..2 (the level is the depth)
  function heading(cur, text) {
    const m = /^(?:ATX|Setext)Heading(\d)$/.exec(cur.name);
    if (!m) return null;
    const s = text(cur.from, cur.to).split('\n')[0].replace(/^#+\s*/, '').replace(/\s*#+\s*$/, '');
    return { name: oneLine(s), kind: 'h' + m[1], level: Number(m[1]) };
  }

  function fromTree(cur, text, lineOf) {
    const out = [];
    const anc = [];   // the node names above
    function visit(depth) {
      do {
        const kids = RULES[cur.name] ? children(cur) : null;
        const hit = (RULES[cur.name] && RULES[cur.name](cur, kids, text, anc)) || heading(cur, text);
        let inner = depth;
        if (hit && hit.name) {
          const at = lineOf(cur.from);
          out.push({ name: hit.name, kind: hit.kind, line: at.line, col: at.col,
            depth: hit.level ? hit.level - 1 : depth, from: cur.from, to: cur.to,
            // a heading's section runs to the next heading (around() finds it)
            end: hit.level ? null : lineOf(cur.to).line });
          inner = depth + 1;
        }
        anc.push(cur.name);
        if (cur.firstChild()) { visit(inner); cur.parent(); }
        anc.pop();
      } while (cur.nextSibling());
    }
    visit(0);
    return out;
  }

  // LSP SymbolKind -> a word; definitions only. Variables and constants count
  // at the top and inside a container (module, class ...) -- OCaml's `let`s
  // are variables to ocaml-lsp -- but not inside a function (its locals)
  const KINDS = { 2: 'module', 3: 'namespace', 4: 'package', 5: 'class', 6: 'method', 9: 'constructor',
    10: 'enum', 11: 'interface', 12: 'function', 13: 'variable', 14: 'constant', 23: 'struct', 26: 'type' };
  const CONTAINERS = [2, 3, 4, 5, 10, 11, 23];
  function fromSymbols(result) {
    const out = [];
    function add(s, depth, parentKind) {
      const kind = KINDS[s.kind];
      const range = s.selectionRange || s.range || (s.location && s.location.range);
      const local = (s.kind === 13 || s.kind === 14) && parentKind != null && CONTAINERS.indexOf(parentKind) < 0;
      const keep = kind && range && !local;
      if (keep) {
        out.push({ name: oneLine(s.name), kind, line: range.start.line + 1, col: range.start.character + 1,
          depth, from: null, to: null, end: s.range ? s.range.end.line + 1 : null });
      }
      (Array.isArray(s.children) ? s.children : []).forEach((c) => add(c, keep ? depth + 1 : depth, s.kind));
    }
    (Array.isArray(result) ? result : []).forEach((s) => s && add(s, 0, null));
    return out.sort((a, b) => a.line - b.line || a.col - b.col);
  }

  // the innermost definition holding `line` (items in file order; `end` when known, else up to the next one at its depth)
  function around(items, line) {
    let best = -1;
    (items || []).forEach((it, i) => {
      if (it.line > line) return;
      let end = it.end;
      if (end == null) {
        const next = items.slice(i + 1).find((x) => x.depth <= it.depth);
        end = next ? next.line - 1 : Infinity;
      }
      if (line <= end && (best < 0 || it.depth >= items[best].depth)) best = i;
    });
    return best;
  }

  return { fromTree, fromSymbols, around, RULES };
});
