import { applyText } from "./mirror.js";

// -- the junctures ------------------------------
//
// The points kept of the file open here, as a tree (D-juncture; the relay's
// lib/relay/juncture.exs keeps them in ~work/juncture, the pure parts are
// lib/code/juncture.js). Asked by code.juncture {req, op, [to]} (the frame's
// `juncture ...` lines, the juncture_tree panel), answered by
// code.juncture.done {req, name, path, ok, op, id, message, notes}.
//   set      the file into the index, the text now its start (j0)
//   point    the text now as a point, a child of the current one
//   back     the parent of the current point into the text
//   forward  the child taken last into the text
//   go       the point `to` into the text
// A point goes into the text as one unsaved change (u undoes it, :w writes
// the file), as :Replay does; nothing here writes the file. Before back,
// forward or go, the text now is kept as a point when it is not the current
// one already, so no edit is lost by moving about the tree. What the relay
// pushed out comes back as notes; a tree that changed is said on the bus
// (juncture.changed {path}).
export function createJuncture(ed) {
  const { st, view, cfg, bus, T } = ed;
  const J = T.juncture;

  function query(q) {
    return Object.keys(q).map((k) => k + "=" + encodeURIComponent(q[k])).join("&");
  }
  // -> {status, ok, body (the JSON answer | null), text}
  function call(method, route, q, body) {
    return ed.relay.httpBase().then((base) => {
      if (!base) throw new Error("config.json has no relay URL");
      const init = { method, cache: "no-store" };
      if (body != null) { init.headers = { "content-type": "text/plain; charset=utf-8" }; init.body = body; }
      return fetch(base + route + "?" + query(q), init).then((r) => r.text().then((text) => {
        let j = null;
        try { j = JSON.parse(text); } catch (_) {}
        return { status: r.status, ok: r.ok, body: j, text };
      }));
    });
  }
  function failed(r) { return new Error((r.body && r.body.error) || ("HTTP " + r.status)); }

  function limits() { return J.limits(cfg.juncture); }

  function tree(path) {
    return call("GET", "/juncture/tree", { path }).then((r) => {
      if (r.status === 404 && r.body && r.body.code === "not_set") return null;
      if (!r.ok || !r.body) throw failed(r);
      return r.body;
    });
  }

  function keep(route, path) {
    const l = limits();
    return call("POST", route, { path, files: l.files, slots: l.slots }, view.state.doc.toString()).then((r) => {
      if (!r.ok || !r.body) throw failed(r);
      return r.body;
    });
  }

  function readPoint(fsPath) {
    return call("GET", "/fs/read", { path: fsPath }).then((r) => {
      if (!r.ok) throw failed(r);
      return r.text;
    });
  }

  function changed(path) { if (bus) bus.post("juncture.changed", { path }); }

  // set / point -> {ok, id, message, notes}
  function set(path) {
    return keep("/juncture/set", path).then((a) => {
      if (a.created) changed(path);
      return {
        ok: true, id: a.id, notes: J.dropped(path, a, limits()),
        message: a.created ? path + ": set ── j0 is the text now" : path + ": already set (current " + a.id + ")",
      };
    });
  }

  function point(path) {
    return keep("/juncture/point", path).then((a) => {
      if (!a.same) changed(path);
      return {
        ok: true, id: a.id, notes: J.dropped(path, a, limits()),
        message: a.created ? path + ": set ── j0 is the text now"
          : a.same ? path + ": the text is " + a.id + " already (no new point)"
          : path + ": " + a.id,
      };
    });
  }

  // back / forward / go -> {ok, id, message, notes}
  function move(path, op, to) {
    let notes = [];
    let kept = null;
    return tree(path).then((t) => {
      if (!t) return { ok: false, message: path + " is not set ── juncture set" };
      // the text now, kept first (none when it is the current point already)
      return keep("/juncture/point", path).then((a) => {
        notes = J.dropped(path, a, limits());
        if (!a.same) { kept = a.id; changed(path); }
        return kept ? tree(path) : t;
      }).then((t) => {
        const from = t.current;
        const dest = op === "back" ? J.backOf(t) : op === "forward" ? J.forwardOf(t) : to;
        const past = kept ? " (the edits were kept as " + kept + ")" : "";
        if (!dest) {
          return { ok: false, id: from, notes, message: path + ": " + (op === "back" ? "at the start, j0" : "no point ahead of " + from) + past };
        }
        if (!t.nodes[dest]) return { ok: false, id: from, notes, message: path + ": no point " + dest };
        if (dest === from) return { ok: true, id: from, notes, message: path + ": at " + from + " already" + past };
        return readPoint(t.nodes[dest].text).then((text) => {
          if (st.baselinePath !== path) throw new Error("the file here changed meanwhile");
          applyText(view, text, "input.juncture");
          return call("POST", "/juncture/current", { path, to: dest });
        }).then((r) => {
          if (!r.ok) throw failed(r);
          changed(path);
          return { ok: true, id: dest, notes, message: path + ": " + from + " → " + dest + past + " (u undoes it. :w writes the file)" };
        });
      });
    });
  }

  // code.juncture {op, to} -> Promise<{ok, op, path, id, message, notes}>
  function run(p) {
    const op = p && p.op;
    const path = st.baselinePath;
    const out = (r) => Object.assign({ op, path, id: null, notes: [] }, r);
    let why = null;
    if (!J) why = "lib/code/juncture.js is not loaded";
    else if (J.SUBS.indexOf(op) < 0 && op !== "go") why = "no juncture " + op;
    else if (!path) why = "a text with no path";
    else if (ed.codeFiles() && ed.codeFiles().isWork(path)) why = "a file of the work place has no junctures";
    else if (op !== "set" && op !== "point" && (st.readOnly || !ed.editable)) why = "read-only";
    else if (op === "go" && !(p && typeof p.to === "string" && p.to)) why = "no point to go to";
    if (why) return Promise.resolve(out({ ok: false, message: why }));
    const job = op === "set" ? set(path) : op === "point" ? point(path) : move(path, op, p.to);
    return job.then(out, (e) => out({ ok: false, message: path + ": " + ((e && e.message) || e) })).then((r) => {
      ed.flash((r.ok ? "juncture " : "! juncture ") + op + " ── " + r.message, !r.ok);
      return r;
    });
  }

  return { run };
}
