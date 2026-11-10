import { EditorView } from "../../vendor/codemirror/cm.bundle.js";
import { hashText, fsError } from "./relay.js";

// The file a code editor edits, through ③:
// save (checked against the disk), open, delete, move
// what the vim ex commands :w :e :Delete :Rename :Move do.
// The file's state is the editor's (ed.st): baseline, baselinePath,
// diskBaseP, eol, eolMixed, dirty, readOnly.
export function createFileOps(ed) {
  const { st, view, bus, NAME } = ed;

  // saves run one after another: each checks against the disk the one before
  // it left (a second :w while the first is in flight is not a conflict)
  let saveChain = Promise.resolve();

  // Save to baselinePath. Checked unless `force`: the relay refuses (409
  // "changed") when the file on disk is not the one opened -- someone else
  // changed or deleted it -- and nothing is lost: the person picks `:w!`
  // (write anyway) or `:e!` (read the disk again, dropping the edits).
  // `req` (code.file write from outside, compile.run): carried on the
  // code.saved / code.saveFailed of this save, so the asker waits for its own
  // answer, not an earlier save's. A save that cannot start answers too.
  function requestSave(force, req) {
    const refuse = (code) => {
      if (bus && req != null) bus.post("code.saveFailed", { name: NAME, path: st.baselinePath, code, req });
    };
    if (st.readOnly) { ed.flash("! read-only ── not saved"); refuse("read_only"); return; }
    if (!st.baselinePath) { ed.flash("nowhere to save (a text with no path)"); refuse("no_path"); return; }
    saveChain = saveChain.then(() => saveNow(force, req));
  }

  // one save; resolves when it is done (whatever the answer), so the next
  // queued one reads the diskBaseP this one left
  function saveNow(force, req) {
    const tag = req != null ? { req } : {};
    if (st.readOnly || !st.baselinePath) {
      if (bus && req != null) bus.post("code.saveFailed", { name: NAME, path: st.baselinePath, code: st.readOnly ? "read_only" : "no_path", req });
      return Promise.resolve();
    }
    const path = st.baselinePath;
    const docText = view.state.doc.toString();
    const text = ed.codeFiles() ? ed.codeFiles().toDisk(docText, st.eol) : docText;
    ed.flash("saving…");
    return Promise.all([ed.relay.httpBase(), force ? null : st.diskBaseP])
      .then(([base, diskBase]) => {
        if (!base) throw new Error("config.json has no relay URL");
        const headers = { "content-type": "text/plain; charset=utf-8" };
        if (diskBase) headers["x-tezcatl-base"] = diskBase;
        return fetch(base + "/fs/write?path=" + encodeURIComponent(path), {
          method: "PUT",
          headers,
          body: text,
        }).then((r) => (r.ok ? r.json().then(() => diskBase) : r.text().then((t) => { throw fsError(r.status, t); })));
      })
      .then((diskBase) => {
        // another file was set meanwhile: `path` is written all the same
        if (st.baselinePath !== path) { if (bus) bus.post("code.saved", { name: NAME, path, ...tag }); return; }
        // the text that was sent, not the live doc: edits made while the
        // write was in flight stay dirty
        st.baseline = docText;
        st.diskBaseP = hashText(text);
        st.eolMixed = false;
        const nd = view.state.doc.toString() !== st.baseline;
        if (nd !== st.dirty) ed.setDirty(nd);
        ed.flash("saved " + path + (st.eol === "\r\n" ? " (CRLF)" : ""));
        ed.mirror.saved();
        // a server that checks the file on disk (efm + ghc for haskell, or
        // elixir-ls building on save) learns the file changed from didSave
        if (st.lspClient && st.lspUri && st.lspAttachedPath === path) {
          try { st.lspClient.notification("textDocument/didSave", { textDocument: { uri: st.lspUri } }); } catch (_) {}
        }
        // a notice for whoever shows status (a skin); nothing waits for it
        if (bus) bus.post("code.saved", { name: NAME, path, ...tag });
        // a file that was not there before: the tree shows it
        if (bus && (force || diskBase === "absent")) bus.post("fs.changed", { op: "write", paths: [path] });
      })
      .catch((e) => {
        // a notice like code.saved (M-x compile waits for one of the two)
        if (bus) bus.post("code.saveFailed", { name: NAME, path, code: (e && e.code) || null, ...tag });
        if (e && e.code === "changed") {
          ed.flash(e.current === "absent"
            ? "! gone from the disk (deleted after it was opened) ── :w! makes it again"
            : "! the file on disk changed after it was opened ── :w! overwrites, :e! reads it again (the edits here are dropped)", true);
        } else if (e && e.code === "unreadable") {
          ed.flash("! the file on disk cannot be read (" + e.message + ") ── it cannot be compared, so nothing was saved. Fix the permissions, or :w! writes without comparing", true);
        } else if (e && e.code === "no_parent") {
          ed.flash("! " + e.message + " ── make the directory in a terminal, then save", true);
        } else {
          ed.flash("! could not save: " + ((e && e.message) || e), true);
        }
      });
  }

  // a clone (~work/clone/...) is shown with "#": not the file itself
  function isClone(path) {
    const cf = ed.codeFiles();
    return !!(cf && typeof path === "string" && path.indexOf(cf.WORK + "/clone/") === 0);
  }
  function showPath() {
    if (ed.head.path) ed.head.path.textContent = (isClone(st.baselinePath) ? "# " : "") + (st.baselinePath || "");
  }

  // The code_editor (not this one) that has `path` open -> {id, name, dirty} | null.
  // Every code_editor, in any window, answers code.query with code.here.
  const QUERY_MS = 200;
  function otherWith(path) {
    const cf = ed.codeFiles();
    if (!bus || !path || path === st.baselinePath || (cf && cf.isWork(path))) return Promise.resolve(null);
    return new Promise((resolve) => {
      const req = "cl-" + NAME + "-" + Date.now().toString(36);
      let found = null;
      const off = bus.on("code.here", (p, meta) => {
        if (!p || p.req !== req || !meta || !meta.from || p.path !== path || found) return;
        found = { id: meta.from.id, name: p.name || meta.from.name || null, dirty: !!p.dirty };
      });
      bus.post("code.query", { req });
      setTimeout(() => { off(); resolve(found); }, QUERY_MS);
    });
  }
  // `path` is open in `other`: the disk's version is copied into the work
  // place (POST /fs/clone) and that copy is what opens here -- a file of its
  // own, editable, never the other's unsaved edits. -> the clone's path
  function makeClone(path) {
    const cf = ed.codeFiles();
    const to = cf.WORK + "/clone/" + path;
    return ed.relay.httpBase().then((base) => {
      if (!base) throw new Error("config.json has no relay URL");
      return fetch(base + "/fs/clone?path=" + encodeURIComponent(path) + "&slots=" + ed.cfg.clone.slots, { method: "POST" });
    }).then((r) => {
      // not on the disk (the other holds a new file not saved yet): the clone opens as a new file
      if (r.status === 404) return to;
      if (!r.ok) return r.text().then((t) => { throw fsError(r.status, t); });
      return r.json().then((j) => j.to || to);
    });
  }

  // a file read from disk (or a new one) becomes this editor's document
  function loadFile(path, text, baseP) {
    ed.lsp.leaveFor(path);
    ed.applyLang(path);
    ed.setDoc(text);
    st.baselinePath = path;
    st.diskBaseP = baseP;
    ed.cancelAutosave();
    ed.lsp.attach(st.baselinePath, st.langId);
    showPath();
    ed.mirror.enter();
    if (bus) bus.post("code.opened", { name: NAME, path });
  }

  // :e <path> -- a path that does not exist opens empty, to be made by :w.
  // A file another code_editor has open is not opened a second time: its clone is
  // (said in the head, and to the skin's receiving side with that code_editor as
  // the reference -- `go on` goes there).
  function openPath(path, force) {
    if (st.dirty && !force) {
      ed.flash("! unsaved changes (" + (st.baselinePath || "no path") + ") ── :w saves, :e! drops them and opens", true);
      return Promise.resolve(false);
    }
    return otherWith(path).then((other) => {
      if (!other) return readInto(path);
      return makeClone(path).then((to) => readInto(to).then((ok) => {
        if (!ok) return false;
        const text = path + " is open in " + (other.name || "another code_editor") + " ── this is a clone (" + to + "), from the disk" +
          (other.dirty ? ": it does not have the edits not saved there" : "");
        ed.flash(text, true);
        if (bus) {
          bus.post("code.cloned", { name: NAME, path, clone: to, of: other });
          bus.post("recv.say", { text, ref: { kind: "bus", id: other.id, name: other.name } });
        }
        return true;
      })).catch((e) => {
        const why = "could not make a clone ── " + ((e && e.message) || e);
        ed.flash("! " + why + ": " + path, true);
        if (bus) bus.post("code.openFailed", { name: NAME, path, reason: why });
        return false;
      });
    });
  }
  function readInto(path) {
    return ed.relay.httpBase()
      .then((base) => {
        if (!base) throw new Error("config.json has no relay URL");
        return fetch(base + "/fs/read?path=" + encodeURIComponent(path), { cache: "no-store" });
      })
      .then((r) => {
        if (r.status === 404) return { isNew: true, text: "" };
        if (!r.ok) return r.text().then((t) => { throw fsError(r.status, t); });
        return r.text().then((text) => ({ isNew: false, text }));
      })
      .then((res) => {
        // the same file read again (:e, a change elsewhere): the cursor stays where it was
        const keep = path === st.baselinePath ? view.state.selection.main.head : null;
        loadFile(path, res.text, res.isNew ? Promise.resolve("absent") : hashText(res.text));
        if (keep != null) {
          const pos = Math.min(keep, view.state.doc.length);
          view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
        }
        ed.flash(res.isNew ? "[new] " + path + " ── :w makes it" : "opened " + path + ed.mixedNote(), res.isNew || st.eolMixed);
        return true;
      })
      .catch((e) => {
        const why = e && e.code === "not_utf8"
          ? "not UTF-8 text, so it is not opened (a binary, or another encoding)"
          : "could not open ── " + ((e && e.message) || e);
        ed.flash("! " + why + ": " + path, true);
        // whoever opened this code_editor for `path` (code-locate's openNew, the frame) hears why at once
        if (bus) bus.post("code.openFailed", { name: NAME, path, reason: why });
        return false;
      });
  }

  // fetch /fs/<route> for a change (delete / rename) -> parsed JSON, or throws fsError
  function fsChange(method, route, query, headers) {
    return ed.relay.httpBase().then((base) => {
      if (!base) throw new Error("config.json has no relay URL");
      const qs = Object.keys(query).map((k) => k + "=" + encodeURIComponent(query[k])).join("&");
      return fetch(base + route + "?" + qs, { method, headers: headers || {} });
    }).then((r) => (r.ok ? r.json() : r.text().then((t) => { throw fsError(r.status, t); })));
  }

  // :Delete -- the file goes from disk, its text stays here (dirty, :w makes it again)
  function deleteFile(force) {
    if (!st.baselinePath) { ed.flash("! no file to delete (a text with no path)", true); return; }
    const path = st.baselinePath;
    Promise.resolve(force ? null : st.diskBaseP)
      .then((diskBase) => fsChange("DELETE", "/fs/delete", { path }, diskBase ? { "x-tezcatl-base": diskBase } : {}))
      .then(() => {
        if (st.baselinePath !== path) return;
        st.diskBaseP = Promise.resolve("absent");
        st.baseline = "";
        ed.setDirty(view.state.doc.length > 0);
        ed.flash("deleted " + path + " ── its text stays here (:w makes it again)", true);
        if (bus) bus.post("fs.changed", { op: "delete", paths: [path] });
      })
      .catch((e) => {
        if (e && e.code === "changed") ed.flash("! the file on disk changed after it was opened ── :Delete! deletes it (check with :e! first)", true);
        else if (e && e.code === "unreadable") ed.flash("! the file on disk cannot be read (" + e.message + ") ── it cannot be compared, so it was not deleted (:Delete! deletes without comparing)", true);
        else if (e && e.status === 404) ed.flash("! not on the disk: " + path, true);
        else ed.flash("! could not delete: " + ((e && e.message) || e), true);
      });
  }

  // :Rename / :Move -- the file on disk moves; the text here (edits too) follows it
  function moveFile(to) {
    if (!st.baselinePath) { ed.flash("! no file to move (a text with no path)", true); return; }
    const from = st.baselinePath;
    if (to === from) { ed.flash("the same path: " + to); return; }
    fsChange("POST", "/fs/rename", { path: from, to })
      .then(() => {
        if (st.baselinePath !== from) return;
        st.baselinePath = to;
        ed.applyLang(to);
        ed.lsp.attach(to, st.langId);
        showPath();
        ed.mirror.enter();
        ed.flash("moved " + from + " → " + to);
        if (bus) {
          bus.post("code.opened", { name: NAME, path: to });
          bus.post("fs.changed", { op: "rename", paths: [from, to] });
        }
      })
      .catch((e) => {
        if (e && e.code === "exists") ed.flash("! already exists: " + to, true);
        else if (e && e.code === "no_parent") ed.flash("! " + e.message + " ── make the directory in a terminal first", true);
        else if (e && e.status === 404) ed.flash("! not on the disk: " + from + " (make it with :w first)", true);
        else ed.flash("! could not move: " + ((e && e.message) || e), true);
      });
  }

  // :Scratch -- this text written over the scratch (~work/scratch, the work
  // place), the file here untouched: what is not saved yet becomes a saved
  // file, to compare (diff) or to keep for a moment
  function scratch() {
    const cf = ed.codeFiles();
    if (!cf) { ed.flash("! lib/code/code-files.js is missing", true); return; }
    const to = cf.SCRATCH;
    if (st.baselinePath === to) { ed.flash("this is the scratch ── :w saves it"); return; }
    const text = cf.toDisk(view.state.doc.toString(), st.eol);
    ed.relay.httpBase()
      .then((base) => {
        if (!base) throw new Error("config.json has no relay URL");
        return fetch(base + "/fs/write?path=" + encodeURIComponent(to), {
          method: "PUT", headers: { "content-type": "text/plain; charset=utf-8" }, body: text,
        });
      })
      .then((r) => (r.ok ? r.json() : r.text().then((t) => { throw fsError(r.status, t); })))
      .then(() => {
        ed.flash("wrote this text over " + to + " (the file here is untouched) ── :e " + to + " opens it");
        if (bus) bus.post("fs.changed", { op: "write", paths: [to] });
      })
      .catch((e) => ed.flash("! could not write the scratch: " + ((e && e.message) || e), true));
  }

  // check update -- is the disk still what was opened? Asked only when a
  // person asks (GET /fs/stat; nothing polls). A file that is
  // not: file.changed on the bus, which the file_changes panel takes up as
  // any other change (a clean code_editor reads it again, an edited one is
  // listed). The answer goes to the asker as code.checked {req, name, path,
  // dirty, state: same | changed | gone | unreadable | no_path | error}.
  function checkDisk(req) {
    const answer = (state, more) => {
      if (bus) bus.post("code.checked", Object.assign({ req, name: NAME, path: st.baselinePath, dirty: st.dirty, state }, more || {}));
    };
    if (!st.baselinePath) { ed.flash("no file to check (a text with no path)"); answer("no_path"); return; }
    const path = st.baselinePath;
    Promise.all([ed.relay.httpBase(), st.diskBaseP])
      .then(([base, opened]) => {
        if (!base) throw new Error("config.json has no relay URL");
        return fetch(base + "/fs/stat?path=" + encodeURIComponent(path), { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : r.text().then((t) => { throw fsError(r.status, t); })))
          .then((s) => {
            if (st.baselinePath !== path) return;
            if (s.base == null) {
              ed.flash("! the file on disk cannot be compared (unreadable, or too large): " + path, true);
              answer("unreadable");
            } else if (s.base === opened) {
              ed.flash("the disk is what was opened: " + path);
              answer("same", { mtime: s.mtime });
            } else {
              const gone = s.base === "absent";
              ed.flash(gone
                ? "! gone from the disk (deleted after it was opened) ── :w! makes it again"
                : "! the file on disk changed after it was opened ── :e" + (st.dirty ? "! reads it again (the edits here are dropped)" : " reads it again"), true);
              answer(gone ? "gone" : "changed", { mtime: s.mtime });
              if (bus) bus.post("file.changed", { op: gone ? "delete" : "write", paths: [path], source: "check update" });
            }
          });
      })
      .catch((e) => {
        ed.flash("! could not check the disk: " + ((e && e.message) || e), true);
        answer("error", { message: String((e && e.message) || e) });
      });
  }

  return { requestSave, showPath, openPath, deleteFile, moveFile, scratch, checkDisk };
}
