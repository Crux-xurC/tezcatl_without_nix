import { EditorView } from "../../vendor/codemirror/cm.bundle.js";

// -- the language server: definition, references, rename, format, hover --
//
// Asked with the client the editor already holds (ed.st.lspClient.request,
// after sync() so the server has the text as it is now; lib/code/code-editor/
// lsp-attach.js holds it); no bundle rebuilt. A place in another file is
// opened with lib/code/code-locate.js (the code_editor that has it, or a new one);
// references go to a list (list.html?config=locations&from=<id>, asked back
// over the bus) or the skin's lsp_log. A rename that reaches another file
// opens each in a code_editor and applies it there, unsaved.
//
// The operations are said on the bus for the lsp_log panel
// the panel holds them -- the record, Enter on a line, lsp.back /
// lsp.forward). lsp.event {kind, name, path, line, col, ...}: jump {from, to},
// refs {symbol, items}, rename {symbol, n, files}, format {n}, hover {text}.
export function createLspActions(ed) {
  const { st, view, bus, NAME, T } = ed;

  // the FS root's absolute path (GET /fs says it) -> Promise<string | null>
  let fsRootP = null;
  function fsRoot() {
    if (!fsRootP) {
      fsRootP = ed.relay.httpBase().then((base) => (base ? fetch(base + "/fs?path=", { cache: "no-store" }) : null))
        .then((r) => (r && r.ok ? r.json() : null)).then((d) => (d && d.root) || null).catch(() => null);
    }
    return fsRootP;
  }
  // a file:// URI -> {path from the FS root | null, abs}
  function uriToPath(uri) {
    let abs = null;
    try { abs = decodeURIComponent(new URL(uri).pathname); } catch (_) { return Promise.resolve({ path: null, abs: String(uri) }); }
    return fsRoot().then((root) => ({
      abs,
      path: root && abs.startsWith(root.replace(/\/+$/, "") + "/") ? abs.slice(root.replace(/\/+$/, "").length + 1) : null,
    }));
  }
  function isThisFile(uri) {
    return uri === st.lspUri || !!(ed.codeFiles() && ed.codeFiles().sameFileUri(uri, st.lspUri));
  }
  function toLspPos(offset) {
    const l = view.state.doc.lineAt(offset);
    return { line: l.number - 1, character: offset - l.from };
  }
  function fromLspPos(p) {
    const doc = view.state.doc;
    const l = doc.line(Math.max(1, Math.min(doc.lines, (p && p.line || 0) + 1)));
    return Math.min(l.from + Math.max(0, (p && p.character) || 0), l.to);
  }
  // a Location or a LocationLink -> {uri, range}
  function locOf(x) {
    return x && x.targetUri ? { uri: x.targetUri, range: x.targetSelectionRange || x.targetRange } : { uri: x.uri, range: x.range };
  }
  function lspReady(capability, what) {
    if (!st.lspClient || !st.lspUri) { ed.flash("! not connected to lsp (" + what + ") ── :Reconnect", true); return false; }
    if (st.lspClient.hasCapability(capability) === false) { ed.flash("! this language server cannot do " + what, true); return false; }
    try { st.lspClient.sync(); } catch (_) {}
    return true;
  }
  // A request the person asked for. The client gives up after its
  // `timeout` without a word to the server; a slow answer (a first build, a
  // large project) is not a failure, so it is asked again with the wait
  // doubled, up to code.json's lsp.maxTimeoutMs, and the raised wait stays
  // for this connection. The server is not told to stop the one that ran
  // out: its late answer is dropped by the client.
  // The request is said on the bus -- lsp.request {req, name, path, method}
  // when it starts, lsp.response {req, ok, message} when it is over (asked
  // again or not): a pair of work.json, so it shows in the work list. And
  // lsp.cancel {req} to this code_editor stops it: $/cancelRequest to the server
  // (the relay gives it the server's id), and it is not asked again.
  const asking = new Map();   // req -> {client, params, cancelled}
  let askSeq = 0;
  function ask(method, params) {
    const client = st.lspClient;
    askSeq += 1;
    const req = "lsp-" + NAME + "-" + Date.now().toString(36) + "-" + askSeq;
    const mine = { client, params, cancelled: false };
    asking.set(req, mine);
    if (bus) bus.post("lsp.request", { req, name: NAME, path: st.baselinePath, method });
    const over = (ok, message) => {
      asking.delete(req);
      if (bus) bus.post("lsp.response", { req, name: NAME, ok, message: message || null });
    };
    const attempt = () => client.request(method, params).catch((e) => {
      if (mine.cancelled) throw new Error("stopped (work cancel)");
      if (!e || e.message !== "Request timed out" || client !== st.lspClient) throw e;
      const sec = (ms) => Math.round(ms / 100) / 10;
      const waited = client.timeout;
      const max = Math.max(ed.cfg.lsp.maxTimeoutMs, ed.cfg.lsp.timeoutMs);
      if (waited >= max) throw new Error("no answer after " + sec(waited) + " s (the limit is lsp.maxTimeoutMs in code.json)");
      client.timeout = Math.min(waited * 2, max);
      ed.flash("lsp: no answer in " + sec(waited) + " s; asking again and waiting up to " + sec(client.timeout) + " s…", true);
      // done beside what was asked: said on the skin's receiving side (`go on` comes here)
      if (bus) bus.post("recv.say", { text: "lsp: no answer in " + sec(waited) + " s for " + method + " ── asked again, waiting up to " + sec(client.timeout) + " s", ref: { kind: "bus", id: bus.self.id, name: NAME } });
      return attempt();
    });
    return attempt().then(
      (res) => { over(true); return res; },
      (e) => { over(false, String((e && e.message) || e)); throw e; },
    );
  }
  if (bus) {
    bus.onMine("lsp.cancel", (p) => {
      const a = p && asking.get(p.req);
      if (!a) return;
      a.cancelled = true;
      try { a.client.cancelRequest(a.params); } catch (_) {}
      ed.flash("lsp: asked the server to stop this request…");
    });
  }
  const MOVED = "! the text changed while waiting, so nothing was applied ── try again";
  function locateEnv() {
    return T.codeLocate ? T.codeLocate.pageEnv(window) : null;
  }

  function here() {
    const h = view.state.selection.main.head;
    const l = view.state.doc.lineAt(h);
    return { path: st.baselinePath, line: l.number, col: h - l.from + 1 };
  }
  function lspEvent(kind, extra) {
    if (bus) bus.post("lsp.event", Object.assign({ kind, name: NAME }, here(), extra || {}));
  }

  // :LspDef -- the definition of what is under the cursor
  function definition() {
    if (!lspReady("definitionProvider", "go to definition")) return Promise.resolve(false);
    const from = here();
    const params = { textDocument: { uri: st.lspUri }, position: toLspPos(view.state.selection.main.head) };
    return ask("textDocument/definition", params).then((res) => {
      const list = (Array.isArray(res) ? res : res ? [res] : []).map(locOf).filter((l) => l.uri && l.range);
      if (!list.length) { ed.flash("no definition found"); return false; }
      const l = list[0];
      if (isThisFile(l.uri)) {
        const pos = fromLspPos(l.range.start);
        view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }), userEvent: "select.definition" });
        ed.flash("to the definition (line " + (l.range.start.line + 1) + ")" + (list.length > 1 ? ", " + (list.length - 1) + " more" : ""));
        lspEvent("jump", { from, to: { path: st.baselinePath, line: l.range.start.line + 1, col: l.range.start.character + 1 } });
        return true;
      }
      return uriToPath(l.uri).then((u) => {
        if (!u.path) { ed.flash("! the definition is outside the FS root: " + u.abs, true); return false; }
        const env = locateEnv();
        if (!env) { ed.flash("! lib/code/code-locate.js is missing: " + u.path, true); return false; }
        const to = { path: u.path, line: l.range.start.line + 1, col: l.range.start.character + 1 };
        return T.codeLocate.openAt(env, to)
          .then((r) => {
            ed.flash((r.ok ? "to the definition: " : "! ") + r.message, !r.ok);
            if (r.ok && bus) bus.post("lsp.event", Object.assign({ kind: "jump", name: NAME }, from, { from, to }));
            return r.ok;
          });
      });
    }).catch((e) => { ed.flash("! could not ask for the definition: " + ((e && e.message) || e), true); return false; });
  }

  // :LspRefs -- every use of what is under the cursor, in a list
  const served = new Map();   // id -> {title, items}: what lists opened from here ask for
  if (bus) {
    bus.on("locations.query", (p) => {
      const got = p && served.get(p.id);
      if (got) bus.post("locations.items", { id: p.id, title: got.title, items: got.items });
    });
  }
  // a panel of this role among this page's siblings (the same skin's iframes)
  // (through the skin port, lib/core/panel-frame.js)
  function siblingRole(role) { return !!(T.skinPort && T.skinPort.hasRole(window, role)); }
  function references() {
    if (!lspReady("referencesProvider", "list references")) return Promise.resolve(false);
    const head = view.state.selection.main.head;
    const word = view.state.wordAt(head);
    const name = word ? view.state.sliceDoc(word.from, word.to) : "";
    const params = { textDocument: { uri: st.lspUri }, position: toLspPos(head), context: { includeDeclaration: true } };
    return ask("textDocument/references", params).then((res) => {
      const locs = (Array.isArray(res) ? res : []).map(locOf).filter((l) => l.uri && l.range);
      if (!locs.length) { ed.flash("no references found"); return false; }
      return Promise.all(locs.map((l) => (isThisFile(l.uri)
        ? Promise.resolve({ path: st.baselinePath, abs: null, here: true })
        : uriToPath(l.uri)).then((u) => ({ l, u })))).then((rows) => {
        let outside = 0;
        const items = [];
        rows.forEach(({ l, u }) => {
          if (!u.path) { outside += 1; return; }
          const text = u.here ? view.state.doc.line(Math.min(view.state.doc.lines, l.range.start.line + 1)).text.trim() : "";
          items.push({ path: u.path, line: l.range.start.line + 1, col: l.range.start.character + 1, text });
        });
        const id = "refs-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const title = "references " + (name || "") + (outside ? " (" + outside + " outside the FS root left out)" : "");
        served.set(id, { title, items });
        lspEvent("refs", { symbol: name, items });
        // a skin with an lsp_log has them there already: no list window
        //  -- opening one is for the person to do)
        if (siblingRole("lsp_log")) {
          ed.flash(items.length + " reference(s) ── written to lsp_log (Enter goes there)");
          return true;
        }
        const env = locateEnv();
        const w = env ? env.open(env.sibling("panels/tool/list.html") + "?config=locations&from=" + encodeURIComponent(id), "tezcatl-" + id) : null;
        ed.flash(w ? items.length + " reference(s) ── in the list window (Enter opens)" : "! could not open the list window (the pop-up was blocked)", !w);
        return !!w;
      });
    }).catch((e) => { ed.flash("! could not ask for the references: " + ((e && e.message) || e), true); return false; });
  }

  // TextEdits of this file, applied as one change (one undo step)
  function applyTextEdits(edits, userEvent) {
    return applyTextEditsUndoable(edits, userEvent).n;
  }
  // the same -> {n, undo}: undo() takes the change back while the text is as
  // it left it (true), and refuses once it was edited again (false)
  function applyTextEditsUndoable(edits, userEvent) {
    const changes = edits.map((e) => ({ from: fromLspPos(e.range.start), to: fromLspPos(e.range.end), insert: e.newText || "" }))
      .sort((a, b) => a.from - b.from || a.to - b.to);
    if (!changes.length) return { n: 0, undo: () => true };
    const tr = view.state.update({ changes, userEvent });
    view.dispatch(tr);
    const after = view.state.doc;
    const inverse = tr.changes.invert(tr.startState.doc);
    return {
      n: changes.length,
      undo() {
        if (view.state.doc !== after) return false;
        view.dispatch({ changes: inverse, userEvent: "input.rename.undo" });
        return true;
      },
    };
  }

  // A rename reaching other files: each file is
  // opened in a code_editor (in the frame a panel is added, else a new window --
  // lib/code/code-locate.js ensureOpen) and its edits applied there, unsaved: the
  // person looks and saves each (:w). All or nothing: a file op in the edit
  // (create / rename / delete), a file outside the FS root, one open with
  // unsaved edits, or one that cannot be opened -> nothing is changed (half a
  // rename breaks the code). The files are all opened before any edit.
  // A file whose copy was left by a code_editor closed unsaved is refused too:
  // opening and editing it would overwrite the
  // copy -- the file_changes panel lists it again with how to tidy up
  // (mirror.left). And the edits themselves are all or nothing:
  // this file is changed only when every other code_editor applied its part;
  // when one did not (it refused, or never answered), the ones that did take
  // theirs back (code.edits.undo) -- and a late one takes it back as it comes,
  // the undo being sent after the edits.
  function renameAcross(name, byUri, others, asked) {
    const L = T.codeLocate;
    const env = locateEnv();
    const fileOps = others.filter((u) => u.charAt(0) === "(");
    if (fileOps.length) { ed.flash("! the rename includes file operations (" + fileOps.join(", ") + ") ── not applied. Nothing was changed", true); return Promise.resolve(false); }
    if (!L || !env) { ed.flash("! lib/code/code-locate.js is missing ── nothing was changed", true); return Promise.resolve(false); }
    return Promise.all(others.map((u) => uriToPath(u).then((x) => ({ uri: u, path: x.path, abs: x.abs }))))
      .then((files) => {
        const outside = files.filter((f) => !f.path);
        if (outside.length) throw new Error("files outside the FS root (" + outside.map((f) => f.abs || f.uri).join(", ") + ")");
        return ed.mirror.leftPaths().then((left) => {
          const hit = files.filter((f) => left.has(f.path)).map((f) => f.path);
          if (hit.length) {
            if (bus) bus.post("mirror.left", { paths: hit, why: "rename" });
            throw new Error(hit.join(", ") + ": a copy closed unsaved is left (opening and applying would overwrite it) ── in file_changes press Enter (open, :Replay, :w) or d d (drop the copy), or tidy up with mirror.list / mirror.drop first");
          }
          return L.query(env);
        }).then((list) => {
          const busy = files.filter((f) => L.find(list, f.path).some((c) => c.dirty));
          if (busy.length) throw new Error(busy.map((f) => f.path).join(", ") + ": unsaved edits ── save or discard them first");
          // open them all first, one after another (the frame adds a panel each)
          return files.reduce((p, f) => p.then((acc) => L.ensureOpen(env, f.path).then((r) => {
            if (!r.ok) throw new Error("could not open " + f.path + " (" + r.message + ")");
            return acc.concat([Object.assign({ id: r.id }, f)]);
          })), Promise.resolve([]));
        });
      })
      .then((opened) => Promise.all(opened.map((f) => editElsewhere(f.id, f.path, byUri.get(f.uri))
        .then((r) => Object.assign({ path: f.path, id: f.id }, r)))))
      .then((done) => {
        // this file typed over while the others were opened and edited: as if one had failed
        if (asked && view.state.doc !== asked) done.push({ path: st.baselinePath + " (this file)", ok: false, reason: "the text changed while waiting" });
        const failed = done.filter((d) => !d.ok);
        if (failed.length) {
          // all or nothing: what was applied is taken back; this file is not touched
          return Promise.all(done.map((d) => (d.id ? undoElsewhere(d.id, d.req) : Promise.resolve({ ok: true })))).then((undone) => {
            const stuck = done.filter((d, i) => d.ok && !undone[i].ok);
            const e = new Error("could not apply to: " + failed.map((d) => d.path + " (" + d.reason + ")").join(", ") +
              (stuck.length ? ". Could not take back: " + stuck.map((d) => d.path).join(", ") + " (edited after it was applied ── undo there with u)" : ". The files it was applied to were taken back"));
            e.stuck = stuck.length > 0;
            throw e;
          });
        }
        const ownKey = [...byUri.keys()].find((u) => isThisFile(u));
        const at = here();
        const own = ownKey ? applyTextEdits(byUri.get(ownKey), "input.rename") : 0;
        if (bus) bus.post("lsp.event", Object.assign({ kind: "rename", name: NAME }, at,
          { symbol: name, n: own, files: done.map((d) => ({ path: d.path, n: d.n || 0, ok: true, reason: null })) }));
        const n = done.reduce((a, d) => a + (d.n || 0), 0);
        try { view.focus(); } catch (_) {}
        ed.flash("renamed: " + name + " (" + own + " place(s) in this file, " + n + " in " + done.length + " other file(s) ── unsaved. Check each code_editor and :w)");
        return true;
      })
      .catch((e) => {
        ed.flash("! the rename reaches other files ── " + ((e && e.message) || e) + (e && e.stuck ? ". This file was not changed" : ". Nothing was changed"), true);
        return false;
      });
  }
  // edits for the code_editor `id` (code.edits {req, path, edits}) -> {ok, n, reason, req}
  function editElsewhere(id, path, edits) {
    const req = "ed-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return answered("code.edited", req, () => bus.post("code.edits", { req, path, edits }, { to: id }), 5000)
      .then((p) => (p ? { ok: !!p.ok, n: p.n || 0, reason: p.reason || null, req } : { ok: false, n: 0, reason: "no answer", req }));
  }
  // take back the edits `req` in the code_editor `id` (code.edits.undo {req}) -> {ok}. Sent to
  // every one, the ones that never answered too: one that applies late finds the undo after.
  function undoElsewhere(id, req) {
    return answered("code.edits.undone", req, () => bus.post("code.edits.undo", { req }, { to: id }), 3000)
      .then((p) => ({ ok: !p || !!p.ok }));   // no answer: nothing was applied there to take back
  }
  // post, then the first `type` answer carrying `req` -> payload | null (after `ms`)
  function answered(type, req, post, ms) {
    return new Promise((resolve) => {
      let done = false;
      const off = bus.on(type, (p) => {
        if (done || !p || p.req !== req) return;
        done = true; off();
        resolve(p);
      });
      post();
      setTimeout(() => { if (!done) { done = true; off(); resolve(null); } }, ms);
    });
  }

  // code.edits {req, path, edits: LSP TextEdit[]} (to this one; a rename made in
  // another code_editor) -> code.edited {req, ok, n, reason}. Applied as one
  // undo step, unsaved; refused when the path is not this one's, or over unsaved edits.
  // code.edits.undo {req} takes them back (the rename failed elsewhere)
  // -> code.edits.undone {req, ok}: ok when there was nothing of `req` here, or
  // it was taken back; not ok once the text was edited after it.
  const appliedEdits = new Map();   // req -> undo()
  const undoneEdits = new Set();    // reqs taken back before they came (the edits are then refused)
  function receiveUndo(payload) {
    const req = payload && payload.req;
    const undo = appliedEdits.get(req);
    appliedEdits.delete(req);
    let ok = true;
    if (undo) {
      ok = undo();
      if (ok) ed.flash("the rename was taken back (it could not be applied in another file)");
      else ed.flash("! could not take the rename back (edited after it was applied) ── undo with u", true);
    } else undoneEdits.add(req);
    bus.post("code.edits.undone", { req, ok });
  }
  function receiveEdits(payload) {
    const p = payload || {};
    const norm = (x) => String(x || "").replace(/^\/+/, "");
    let reason = null;
    if (!st.baselinePath || norm(p.path) !== norm(st.baselinePath)) reason = "another file is open";
    else if (st.readOnly) reason = "read-only";
    else if (st.dirty) reason = "unsaved edits";
    else if (!Array.isArray(p.edits)) reason = "no edits";
    else if (undoneEdits.has(p.req)) reason = "already taken back";
    if (reason) { bus.post("code.edited", { req: p.req, ok: false, n: 0, reason }); return; }
    let n = 0;
    try {
      const r = applyTextEditsUndoable(p.edits, "input.rename");
      n = r.n;
      appliedEdits.set(p.req, r.undo);
    } catch (e) { reason = (e && e.message) || String(e); }
    if (!reason) ed.flash("a rename was applied (" + n + " place(s), from another code_editor ── u undoes it. :w saves)");
    bus.post("code.edited", { req: p.req, ok: !reason, n, reason });
  }

  // :LspRename <name> -- the symbol under the cursor, everywhere in this file
  function rename(newName) {
    const name = String(newName || "").trim();
    if (!name) { ed.flash("! :LspRename needs the new name", true); return Promise.resolve(false); }
    if (st.readOnly) { ed.flash("! read-only", true); return Promise.resolve(false); }
    if (!lspReady("renameProvider", "rename")) return Promise.resolve(false);
    const params = { textDocument: { uri: st.lspUri }, position: toLspPos(view.state.selection.main.head), newName: name };
    // the edits are places in the text as it is now: typed over while waiting, they would land astray
    const asked = view.state.doc;
    return ask("textDocument/rename", params).then((we) => {
      if (view.state.doc !== asked) { ed.flash(MOVED + " (rename)", true); return false; }
      // WorkspaceEdit: {changes: {uri: TextEdit[]}} or {documentChanges: [TextDocumentEdit | create/rename/delete]}
      const byUri = new Map();
      if (we && we.documentChanges) {
        for (const dc of we.documentChanges) {
          if (!dc.textDocument) { byUri.set("(" + (dc.kind || "file op") + ")", []); continue; }
          byUri.set(dc.textDocument.uri, (byUri.get(dc.textDocument.uri) || []).concat(dc.edits || []));
        }
      } else if (we && we.changes) {
        Object.keys(we.changes).forEach((u) => byUri.set(u, we.changes[u] || []));
      }
      if (!byUri.size) { ed.flash("nothing to rename here"); return false; }
      const others = [...byUri.keys()].filter((u) => !isThisFile(u));
      if (others.length) return renameAcross(name, byUri, others, asked);
      const at = here();
      const n = applyTextEdits([...byUri.values()][0], "input.rename");
      ed.flash("renamed: " + name + " (" + n + " place(s); u undoes it. :w saves)");
      if (bus) bus.post("lsp.event", Object.assign({ kind: "rename", name: NAME }, at, { symbol: name, n, files: [] }));
      return true;
    }).catch((e) => { ed.flash("! could not rename: " + ((e && e.message) || e), true); return false; });
  }

  // :LspFormat -- the whole file, as the language server formats it
  function format() {
    if (st.readOnly) { ed.flash("! read-only", true); return Promise.resolve(false); }
    if (!lspReady("documentFormattingProvider", "format")) return Promise.resolve(false);
    const params = { textDocument: { uri: st.lspUri }, options: { tabSize: ed.cfg.tabSize, insertSpaces: ed.cfg.indentUnit.indexOf("\t") < 0 } };
    const asked = view.state.doc;
    return ask("textDocument/formatting", params).then((edits) => {
      if (view.state.doc !== asked) { ed.flash(MOVED + " (format)", true); return false; }
      const n = applyTextEdits(Array.isArray(edits) ? edits : [], "input.format");
      ed.flash(n ? "formatted (" + n + " place(s); u undoes it)" : "nothing to format");
      lspEvent("format", { n });
      return n > 0;
    }).catch((e) => { ed.flash("! could not format: " + ((e && e.message) || e), true); return false; });
  }

  // code.lsp-hover: the language server's description of what is under the cursor
  function hover() {
    if (!lspReady("hoverProvider", "hover")) return Promise.resolve(false);
    const head = view.state.selection.main.head;
    return ask("textDocument/hover", { textDocument: { uri: st.lspUri }, position: toLspPos(head) }).then((res) => {
      const text = hoverText(res && res.contents);
      if (!text) { ed.flash("no description"); return false; }
      lspEvent("hover", { text });
      ed.flash(text.split("\n").filter((l) => l.trim() && !/^```/.test(l))[0] || text);
      return true;
    }).catch((e) => { ed.flash("! could not ask for the description: " + ((e && e.message) || e), true); return false; });
  }
  // MarkupContent | MarkedString | MarkedString[] -> text
  function hoverText(c) {
    if (!c) return "";
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.map(hoverText).filter(Boolean).join("\n\n");
    if (typeof c.value === "string") return c.language ? "```" + c.language + "\n" + c.value + "\n```" : c.value;
    return "";
  }

  return { definition, references, rename, format, hover, receiveEdits, receiveUndo };
}
