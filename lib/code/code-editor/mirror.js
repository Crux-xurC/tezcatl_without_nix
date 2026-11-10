import { EditorView } from "../../vendor/codemirror/cm.bundle.js";
import { fsError } from "./relay.js";

// `text` over the editor's text as one change (undo takes it back): the
// smallest one -- what the two share at either end stays, so the cursor keeps
// its place. -> false when the text is that already. (:Replay, and a
// juncture's point put in -- lib/code/code-editor/juncture.js)
export function applyText(view, text, userEvent) {
  const cur = view.state.doc.toString();
  if (text === cur) return false;
  let a = 0;
  const n = Math.min(cur.length, text.length);
  while (a < n && cur.charCodeAt(a) === text.charCodeAt(a)) a++;
  let b = 0;
  while (b < n - a && cur.charCodeAt(cur.length - 1 - b) === text.charCodeAt(text.length - 1 - b)) b++;
  view.dispatch({ changes: { from: a, to: cur.length - b, insert: text.slice(a, text.length - b) }, userEvent });
  return true;
}

// -- the copy ------------------------------
//
// A file editor (opts.files: code_editor) keeps a copy of its text in the
// relay's mirror (lib/relay/mirror.exs, ~/.local/state/tezcatl/mirror): an
// insurance, not something to rely on. Its slot is entered when a file is
// opened, written when editing rests (cfg.mirror.idleMs), and closed with
// this editor (pagehide) -- unless the text has unsaved edits: then the
// slot is kept, marked (unsaved=1), and code.closed {dirty: true} tells the
// file_changes panel (closing is never refused; the copy
// stays and the person, told, opens the file and replays it -- the edits
// since the copy was last written, under idleMs, are not kept). `:Replay` puts the copy into the text (one undo
// step); `:Reconnect` -- for a language server that went away -- writes the
// copy, opens the file again (the server is attached again; undo starts
// over, as in most IDEs) and replays the copy: `:Mirror` -> `:e!` -> `:Replay`.
export function createMirror(ed) {
  const { st, view, cfg, bus, NAME } = ed;
  const MIRROR = ed.opts.files === true;
  const owner = "o-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let mirrorPath = null;        // the path whose slot this editor holds
  let timer = null;
  let enterP = Promise.resolve(null);
  let quiet = false;            // :Reconnect replays the copy itself; no "a copy is left" notice
  let relayBaseNow = null;      // the relay's base once known (pagehide cannot wait for a promise)
  let notWritten = false;       // the last copy could not be written (said once)

  function url(base, route, query) {
    return base + route + "?" + Object.keys(query).map((k) => k + "=" + encodeURIComponent(query[k])).join("&");
  }

  // the text into the slot of the file open now -> the relay's answer | null
  function put(mode) {
    if (!MIRROR || !st.baselinePath) return Promise.resolve(null);
    const path = st.baselinePath;
    const text = view.state.doc.toString();
    return ed.relay.httpBase().then((base) => {
      if (!base) return null;
      relayBaseNow = base;
      return fetch(url(base, "/mirror", { path, owner, mode, slots: cfg.mirror.slots }), {
        method: "PUT", headers: { "content-type": "text/plain; charset=utf-8" }, body: text,
      }).then((r) => (r.ok ? r.json() : null));
    }).catch(() => null);
  }

  // leaving: the page is going (a beacon is still sent); unsaved: keep the slot, marked.
  // An unsaved close carries the text as it is now: the slot gets
  // it -- made again when it was pushed out while this was open -- and the
  // edits since the copy was last written are kept too. A beacon refused for
  // its size goes without the text (the copy as last written)
  function close(path, leaving, unsaved) {
    if (!MIRROR || !path) return;
    if (leaving) {
      if (!relayBaseNow || !navigator.sendBeacon) return;
      if (unsaved) {
        const withText = url(relayBaseNow, "/mirror/close", { path, owner, unsaved: "1", text: "1", slots: cfg.mirror.slots });
        let sent = false;
        try { sent = navigator.sendBeacon(withText, view.state.doc.toString()); } catch (_) {}
        if (!sent) navigator.sendBeacon(url(relayBaseNow, "/mirror/close", { path, owner, unsaved: "1" }));
      } else {
        navigator.sendBeacon(url(relayBaseNow, "/mirror/close", { path, owner }));
      }
      return;
    }
    ed.relay.httpBase().then((base) => {
      if (base) return fetch(url(base, "/mirror/close", { path, owner }), { method: "POST" });
    }).catch(() => {});
  }

  // a file is open (opened, set, moved): its slot is this editor's
  function enter() {
    if (!MIRROR) return;
    if (timer) { clearTimeout(timer); timer = null; }
    if (mirrorPath && mirrorPath !== st.baselinePath) close(mirrorPath);
    mirrorPath = st.baselinePath;
    if (!st.baselinePath) return;
    enterP = put("open").then((r) => {
      if (r && r.left && !quiet) {
        const t = new Date(r.left.updated);
        ed.flash("a copy is left (as of " + t.toLocaleString() + ") ── :Replay applies it. Editing on overwrites the copy", true);
      }
      return r;
    });
  }

  // editing rested: the copy follows (only while there are unsaved edits)
  function maybe() {
    if (!MIRROR || !st.baselinePath) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!st.dirty) return;
      // a copy that could not be written is said once (not at every rest), till one is again
      put("write").then((r) => {
        if (r) { notWritten = false; return; }
        if (notWritten || !relayBaseNow) return;
        notWritten = true;
        ed.flash("! the copy could not be written (the relay's log says why) ── the edits here have no copy until it can", true);
      });
    }, cfg.mirror.idleMs);
  }

  // saved: the copy follows the file (also
  // on a save). Else a copy older than the file stayed, and a code_editor gone
  // before it was told to close (`t`'s Ctrl+C) left "a copy is left" for a
  // file already saved
  function saved() {
    if (!MIRROR || !st.baselinePath) return;
    if (timer) { clearTimeout(timer); timer = null; }
    put("write");
  }

  // :Mirror -- the copy written now
  function write() {
    put("write").then((r) => ed.flash(r ? "written to the copy (" + st.baselinePath + ")" : "! could not write the copy", !r));
  }

  // :Replay -- the copy into the text, as one change (undo takes it back)
  function replay(silent) {
    if (!MIRROR) return Promise.resolve(false);
    if (!st.baselinePath) { ed.flash("! no copy (a text with no path)", true); return Promise.resolve(false); }
    const path = st.baselinePath;
    return ed.relay.httpBase().then((base) => {
      if (!base) throw new Error("config.json has no relay URL");
      return fetch(url(base, "/mirror", { path }), { cache: "no-store" });
    }).then((r) => {
      if (r.status === 404) return null;
      if (!r.ok) return r.text().then((t) => { throw fsError(r.status, t); });
      return r.text();
    }).then((text) => {
      if (st.baselinePath !== path) return false;
      if (text == null) { ed.flash("! there is no copy of " + path, true); return false; }
      if (!applyText(view, text, "input.replay")) { if (!silent) ed.flash("the copy is the same as the text now"); return true; }
      if (!silent) ed.flash("the copy was applied (u undoes it. :w writes the file)");
      return true;
    }).catch((e) => { ed.flash("! could not read the copy: " + ((e && e.message) || e), true); return false; });
  }

  // :Reconnect -- :Mirror -> :e! -> :Replay. Nothing is dropped when the copy
  // cannot be written: the file is not opened again then.
  function reconnect() {
    if (!MIRROR || !st.baselinePath) { ed.flash("! no file to open again (a text with no path)", true); return Promise.resolve(false); }
    const path = st.baselinePath;
    const head = view.state.selection.main.head;
    if (timer) { clearTimeout(timer); timer = null; }
    ed.flash("writing the copy and opening again…");
    return put("write").then((r) => {
      if (!r) { ed.flash("! could not write the copy ── not opened again (the text is as it was)", true); return false; }
      quiet = true;
      ed.lsp.detach();   // attached again by the open, even when the old socket looked alive
      return ed.files.openPath(path, true)
        .then((ok) => (ok ? enterP.then(() => replay(true)) : false))
        .then((ok) => {
          if (!ok) return false;
          const pos = Math.min(head, view.state.doc.length);
          view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
          ed.flash("opened again (the copy applied; u goes back to the file as opened) ── reconnecting to lsp");
          return true;
        })
        .finally(() => { quiet = false; });
    });
  }

  // the paths whose copy was left by a code_editor closed with unsaved edits (the
  // relay's slots marked unsaved_closed) -> Promise<Set<path>> (empty when the
  // relay cannot be asked). A rename that would edit one of them is refused:
  // opening the file and editing it overwrites that copy.
  function leftPaths() {
    return ed.relay.httpBase()
      .then((base) => (base ? fetch(base + "/mirror/list", { cache: "no-store" }) : null))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((doc) => new Set(((doc && doc.slots) || []).filter((x) => x && x.unsaved_closed != null && x.path).map((x) => x.path)))
      .catch(() => new Set());
  }

  // the code_editor is closed (pagehide): its slot goes -- kept when the text has
  // unsaved edits, and said on the bus (code.closed; the file_changes panel lists it)
  function leave() {
    const unsaved = ed.editable && st.dirty;
    close(mirrorPath, true, unsaved && mirrorPath === st.baselinePath);
    if (bus && MIRROR) bus.post("code.closed", { name: NAME, path: st.baselinePath, dirty: unsaved, copy: !!(unsaved && relayBaseNow && mirrorPath === st.baselinePath) });
  }

  return { enter, maybe, write, replay, reconnect, leave, leftPaths, saved };
}
