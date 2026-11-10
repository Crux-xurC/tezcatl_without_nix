// -- a mark replaced with ids ------------------------------
//
// `:Replace <mark> <list>`: every `<mark>` in the text (lib/code/marks.js
// find) gets an id of the relay's list `<list>` (POST /ids/take,
// lib/relay/id_pool.exs -- an id is never handed out twice), as one change
// (u takes all of it back). `:w replace <mark> <list>` does that, then the
// usual save (checked against the disk). What was put in is said in the head
// and on the receiving side (recv.say). Ids handed out stay handed out when
// the save stops (a conflict): they are never handed out again.
export function createReplace(ed) {
  const { st, view, bus, T } = ed;
  const K = T.marks;

  function take(list, n) {
    return ed.relay.httpBase().then((base) => {
      if (!base) throw new Error("config.json has no relay URL");
      const q = "list=" + encodeURIComponent(list) + "&n=" + n + "&path=" + encodeURIComponent(st.baselinePath || "");
      return fetch(base + "/ids/take?" + q, { method: "POST" }).then((r) => r.json().catch(() => null).then((b) => {
        if (!r.ok || !b || !Array.isArray(b.ids)) throw new Error((b && b.error) || ("HTTP " + r.status));
        return b.ids;
      }));
    });
  }

  function said(text, err) {
    ed.flash(text, err);
    if (bus) bus.post("recv.say", { text, cls: err ? "err" : null });
  }

  // {mark, list} -> Promise<{ok, n}>
  function replace(a) {
    if (!K) { said("! :Replace ── lib/code/marks.js is not loaded", true); return Promise.resolve({ ok: false, n: 0 }); }
    if (st.readOnly || !ed.editable) { said("! :Replace ── read-only", true); return Promise.resolve({ ok: false, n: 0 }); }
    const n = K.find(view.state.doc.toString(), a.mark).length;
    if (!n) { ed.flash("no " + a.mark + " in the text"); return Promise.resolve({ ok: true, n: 0 }); }
    return take(a.list, n).then((ids) => {
      // the text may have changed while asking: the marks found again, as many as there are ids
      const changes = K.changes(view.state.doc.toString(), a.mark, ids);
      view.dispatch({ changes, userEvent: "input.replace" });
      said("put " + changes.length + " id(s) of " + a.list + " in place of " + a.mark + ": " + ids.slice(0, changes.length).join(", ") + " (u takes them out)");
      return { ok: true, n: changes.length };
    }).catch((e) => {
      said("! :Replace ── no ids from " + a.list + ": " + ((e && e.message) || e), true);
      return { ok: false, n: 0 };
    });
  }

  // :Replace <mark> <list>
  function run(arg) {
    const a = K ? K.parseArgs(arg) : { error: "lib/code/marks.js is not loaded" };
    if (a.error) { said("! :Replace ── " + a.error, true); return Promise.resolve(false); }
    return replace(a).then((r) => r.ok);
  }

  // :w [replace <mark> <list>] -- the replace first, then the save (not when it failed)
  function write(arg, bang, req) {
    const w = K ? K.parseWrite(arg) : { replace: null };
    if (w.error) { ed.flash("! " + w.error, true); return; }
    if (!w.replace) { ed.files.requestSave(bang, req); return; }
    replace(w.replace).then((r) => { if (r.ok) ed.files.requestSave(bang, req); });
  }

  return { run, write };
}
