// lib/recv/output-log-page.js -- the output_log (panels/invisible/output_log.html;
// D-run-table, stage 4): a hidden panel of a frame that writes down what the
// output says, while it is there -- `log start [<path>]` adds it, `log stop`
// writes the last and takes it away. A run_table row can start and stop it.
//   ?path=&bang=1    where (the FS root or ~work); bang: over a file that is there
//   what it keeps    the frame's own lines (recv.out), what the xterms of the same
//                    skin print (terminal.data, as lines), emacs-vent (its own
//                    connection: the context and the events), and what a run_table
//                    of the skin says of its rows (run.mark) -- one line each
//                    (lib/recv/output-log.js format)
// Kept in memory and written whole every WRITE_MS when it changed, and at log stop
// (the relay has no append). Over MAX_BYTES it stops and says so.
// Answers: log.started {ok, path, error} once the file is first written;
// log.stopped {ok, path, lines, error} to log.stop.
import { hashText } from "../code/code-editor/relay.js";

const T = window.Tezcatl;
const bus = T.bus;
const OL = T.outputLog;
const params = new URLSearchParams(location.search);
const PATH = (params.get("path") || "").trim() || OL.defaultPath(new Date());
const BANG = params.get("bang") === "1";
const WRITE_MS = 2000;
const MAX_BYTES = 5 * 1024 * 1024;
bus.identify({ role: "output_log", name: params.get("name") || "output_log" });

let text = "";
let lines = 0;
let dirty = false;
let base = BANG ? null : "absent";   // the first write: a new file unless bang
let stopped = false;
let failed = null;

const skin = () => T.skinPort.id(window);
const sib = () => T.skinPort.siblings(window) || [];
function add(src, what) {
  if (stopped) return;
  text += OL.format(new Date(), src, what);
  lines++;
  dirty = true;
  if (text.length > MAX_BYTES) {
    stopped = true;
    failed = "over " + (MAX_BYTES >> 20) + " MB: stopped writing";
    write().then(() => bus.post("recv.say", { text: "! log ── " + PATH + " " + failed + " (log stop)", cls: "err" }));
  }
}

const baseP = T.config.load().then((c) => {
  const u = c && c.connections && c.connections[0] && c.connections[0].url;
  if (!u) return null;
  const x = new URL(u);
  return (x.protocol === "wss:" ? "https:" : "http:") + "//" + x.host;
}).catch(() => null);
let writing = Promise.resolve();
function write() {
  writing = writing.then(() => {
    if (!dirty && base !== "absent") return;
    const out = text;
    dirty = false;
    return baseP.then((b) => {
      if (!b) throw new Error("config.json has no relay URL");
      const headers = { "content-type": "text/plain; charset=utf-8" };
      if (base) headers["x-tezcatl-base"] = base;
      return fetch(b + "/fs/write?path=" + encodeURIComponent(PATH), { method: "PUT", headers, body: out, cache: "no-store" });
    }).then((r) => r.text().then((t) => {
      if (r.status === 409) throw new Error(PATH + " is there ── log start! " + PATH + " writes over it");
      if (!r.ok) { let j = null; try { j = JSON.parse(t); } catch (_) {} throw new Error((j && j.error) || ("HTTP " + r.status)); }
      return hashText(out).then((h) => { base = h; });
    }));
  });
  return writing;
}

// -- what is kept -------------------------------------------------------------------
bus.on("recv.out", (p, meta) => {
  if (!p || !meta || !meta.from || meta.from.id !== skin()) return;
  add("tezcatl", p.text);
});
const terms = {};
bus.on("terminal.data", (p, meta) => {
  const id = meta && meta.from && meta.from.id;
  if (!id || !p || !p.bytes || !sib().some((x) => x.id === id && x.role === "xterm")) return;
  const t = terms[id] || (terms[id] = { text: T.termText.create(200), dec: new TextDecoder("utf-8") });
  t.text.write(t.dec.decode(p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes), { stream: true }));
  t.text.take().forEach((l) => add("xterm:" + id, l));
});
bus.on("run.mark", (p, meta) => {
  if (!p || !meta || !meta.from || !sib().some((x) => x.id === meta.from.id)) return;
  add("run", OL.markText(p));
});
T.ws.connectFromConfig({
  onMessage: (m) => {
    if (!m) return;
    if (m.kind === "context") add("emacs-vent", "context  " + m["buffer-name"] + "  " + m.window + "  " + m.frame);
    else if (m.kind === "event") add("emacs-vent", "[" + (m.source === null ? "null" : m.source) + "] " + m.type + (m.content !== undefined ? " " + JSON.stringify(m.content) : ""));
    else add("emacs-vent", JSON.stringify(m).slice(0, 500));
  },
  onState: (s) => { if (s === "open") T.ventInit.requestContext(T.ws.send); },
});

// -- start, stop ----------------------------------------------------------------------
add("log", "# output_log " + PATH + " started " + new Date().toISOString());
write().then(() => bus.post("log.started", { ok: true, path: PATH }),
  (e) => { stopped = true; failed = e.message; bus.post("log.started", { ok: false, path: PATH, error: e.message }); });
setInterval(() => { if (dirty && !stopped) write().catch(() => {}); }, WRITE_MS);
// the frame takes the last lines before it asks (a stop row's own echo)
bus.onMine("log.stop", (p, meta) => {
  if (!failed) add("log", "# output_log stopped " + new Date().toISOString());
  stopped = true;
  const done = failed && base === "absent" ? Promise.reject(new Error(failed)) : write();
  done.then(() => bus.post("log.stopped", { ok: !failed, path: PATH, lines, error: failed }, { to: meta.from.id }),
    (e) => bus.post("log.stopped", { ok: false, path: PATH, lines, error: e.message }, { to: meta.from.id }));
});
