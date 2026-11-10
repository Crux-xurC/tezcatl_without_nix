import { EditorView, languageKit } from "../../vendor/codemirror/cm.bundle.js";

// ---- what the editor knows about the text: diagnostics, definitions, the
// syntax tree, and moving by them (tezcatl-commands
// first, keys only name them). Split out of
// lib/code/code-editor.js.
export function createSyntaxNav(ed) {
  const { st, view, T } = ed;

  // The language server's diagnostics shown in this editor (@codemirror/lint's
  // state), for the problems list: code.here carries them,
  // so whoever asks every code_editor (code.query) gets them too -- only the files
  // open in a code_editor, which is what language servers diagnose anyway.
  // [{line, col (1-based), severity, message, source}], at most DIAG_MAX.
  const DIAG_MAX = 200;
  function diagnostics() {
    const lint = languageKit && languageKit.lint;
    if (!lint || typeof lint.forEachDiagnostic !== "function") return [];
    const out = [];
    try {
      lint.forEachDiagnostic(view.state, (d, from) => {
        if (out.length >= DIAG_MAX) return;
        const line = view.state.doc.lineAt(Math.min(from, view.state.doc.length));
        out.push({ line: line.number, col: from - line.from + 1, severity: d.severity || "error",
          message: String(d.message || ""), source: d.source || null });
      });
    } catch (_) {}
    return out;
  }

  // The definitions of this file, for the outline panel
  // definitions only): read off the Lezer syntax tree when the
  // grammar has one (lib/code/code-outline.js), else asked of the language server
  // (textDocument/documentSymbol -- OCaml's legacy mode has no tree).
  // -> Promise<{via: "tree"|"lsp"|null, items, reason?}>
  function outline() {
    const O = T.codeOutline;
    const L = languageKit && languageKit.language;
    if (!O || !L) return Promise.resolve({ via: null, items: [], reason: "lib/code/code-outline.js is missing" });
    let items = [];
    try {
      const s = view.state;
      const tree = (L.ensureSyntaxTree && L.ensureSyntaxTree(s, s.doc.length, 500)) || L.syntaxTree(s);
      const lineOf = (pos) => { const l = s.doc.lineAt(Math.min(pos, s.doc.length)); return { line: l.number, col: pos - l.from + 1 }; };
      items = O.fromTree(tree.cursor(), (a, b) => s.sliceDoc(a, b), lineOf);
    } catch (_) { items = []; }
    if (items.length) return Promise.resolve({ via: "tree", items });
    const client = st.lspClient;
    if (!client || !st.lspUri || client.hasCapability("documentSymbolProvider") === false) {
      return Promise.resolve({ via: null, items: [], reason: client ? "no definitions found" : "no definitions from the syntax tree, and not connected to lsp" });
    }
    try { client.sync(); } catch (_) {}
    return client.request("textDocument/documentSymbol", { textDocument: { uri: st.lspUri } })
      .then((res) => ({ via: "lsp", items: O.fromSymbols(res) }))
      .catch((e) => ({ via: null, items: [], reason: "documentSymbol: " + ((e && e.message) || e) }));
  }

  function moveTo(pos, note) {
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }), userEvent: "select" });
    if (note) ed.flash(note);
  }

  // code.diag-next / code.diag-prev: the next / previous diagnostic in this file (wraps around)
  function diagMove(dir) {
    const lint = languageKit && languageKit.lint;
    const all = [];
    try { lint.forEachDiagnostic(view.state, (d, from) => all.push({ from, d })); } catch (_) {}
    if (!all.length) { ed.flash("no diagnostics"); return false; }
    all.sort((a, b) => a.from - b.from);
    const head = view.state.selection.main.head;
    const hit = dir > 0 ? (all.find((x) => x.from > head) || all[0]) : ([...all].reverse().find((x) => x.from < head) || all[all.length - 1]);
    const i = all.indexOf(hit) + 1;
    moveTo(hit.from, "(" + i + "/" + all.length + ") " + (hit.d.severity || "error") + ": " + String(hit.d.message || "").split("\n")[0]);
    return true;
  }

  // code.def-next / code.def-prev: the next / previous definition (the outline's)
  function defMove(dir) {
    return outline().then((r) => {
      const items = (r.items || []).map((it) => {
        const l = view.state.doc.line(Math.min(Math.max(it.line, 1), view.state.doc.lines));
        return { pos: l.from + Math.min(Math.max((it.col || 1) - 1, 0), l.length), it };
      }).sort((a, b) => a.pos - b.pos);
      if (!items.length) { ed.flash(r.reason || "no definitions"); return false; }
      const head = view.state.selection.main.head;
      const hit = dir > 0 ? items.find((x) => x.pos > head) : [...items].reverse().find((x) => x.pos < head);
      if (!hit) { ed.flash(dir > 0 ? "no definition after this" : "no definition before this"); return false; }
      moveTo(hit.pos, hit.it.kind + " " + hit.it.name);
      return true;
    });
  }

  // the syntax tree (Lezer) at a position: the innermost named node -- a
  // capitalized node name; keywords and punctuation are lowercase or symbols
  function syntaxAt(pos, side) {
    const L = languageKit && languageKit.language;
    if (!L) return null;
    const tree = (L.ensureSyntaxTree && L.ensureSyntaxTree(view.state, view.state.doc.length, 500)) || L.syntaxTree(view.state);
    let n = tree.resolveInner(pos, side);
    while (n && n.parent && !/^[A-Z]/.test(n.name)) n = n.parent;
    return n && n.parent ? n : null;   // the top node alone: no tree for this language
  }
  function named(n) { return !!n && /^[A-Z]/.test(n.name); }

  // code.node-select: select the node under the cursor; again, its parent (grows the selection)
  function nodeSelect() {
    const sel = view.state.selection.main;
    let n = syntaxAt(sel.empty ? sel.head : sel.from, 1);
    if (!n) { ed.flash("no syntax tree (this language has no Lezer grammar)"); return false; }
    while (n.parent && n.parent.parent && (n.from > sel.from || n.to < sel.to || (n.from === sel.from && n.to === sel.to && !sel.empty))) n = n.parent;
    view.dispatch({ selection: { anchor: n.from, head: n.to }, effects: EditorView.scrollIntoView(n.from), userEvent: "select" });
    ed.flash(n.name + " (line " + (view.state.doc.lineAt(n.from).number) + ")");
    return true;
  }
  // code.node-parent / node-next / node-prev: the cursor to the start of the parent / next / previous sibling node
  function nodeMove(where) {
    const head = view.state.selection.main.head;
    const n = syntaxAt(head, 1);
    if (!n) { ed.flash("no syntax tree (this language has no Lezer grammar)"); return false; }
    let t = null;
    if (where === "parent") {
      t = n.parent;
      while (t && t.parent && (!named(t) || t.from === n.from && t.to === n.to)) t = t.parent;
      if (t && !t.parent) t = null;
    } else {
      // from the node that holds the cursor at its own level
      t = where === "next" ? n.nextSibling : n.prevSibling;
      while (t && !named(t)) t = where === "next" ? t.nextSibling : t.prevSibling;
    }
    if (!t) { ed.flash({ parent: "no parent", next: "no next sibling", prev: "no previous sibling" }[where]); return false; }
    moveTo(t.from, t.name + " (line " + view.state.doc.lineAt(t.from).number + ")");
    return true;
  }

  return { diagnostics, outline, diagMove, defMove, nodeSelect, nodeMove };
}
