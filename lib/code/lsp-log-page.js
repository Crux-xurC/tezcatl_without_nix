// lib/code/lsp-log-page.js -- the page script of the lsp_log panel (panels/resident/lsp_log.html)
// (a page is what it looks like; what it does, its tezcatl-commands
// included, is here in lib/). The page loads it after the scripts it needs.
// The lsp_log panel: it holds the LSP operations
// of the code_editor in the same skin -- like emacs-vent's output, a read-only
// code_editor derivative (vim: move, / search, Enter). Each code_editor says what it
// did on the bus (lsp.event: a jump, references, a rename, a format, a
// description); this panel writes it down (lib/code/lsp-log.js), and Enter on a
// line goes to its place (lib/code/code-locate.js openAt: the code_editor that has
// the file, else -- in the frame -- a code_editor panel added). The jumps are its
// history: the tezcatl-commands lsp.back / lsp.forward (C-o / C-i in
// code_editor) go to where the last jump left from / went. Only the LSP
// operations are recorded (the other jumps have the copies and the logbook).
// Which panel takes lsp.back: the one in the invoker's
// skin; an invoker in no skin -> the lsp_log focused last. Nothing is kept
// across a reload.
import { createCodeEditor } from "./code-editor.js";
import { Vim, EditorView } from "../vendor/codemirror/cm.bundle.js";

const T = window.Tezcatl;
const bus = T.bus;
const LL = T.lspLog;
const L = T.codeLocate;
const whatEl = document.getElementById("what");
const footEl = document.getElementById("foot");
const env = L.pageEnv(window);

const ed = createCodeEditor({
  editable: false,
  focusable: true,
  surface: "lsp_log",
  role: "lsp_log",
  keymap: "vim",
  head: { msg: document.getElementById("msg") },
});
const MAX_LINES = 5000;
let locs = [null];   // line n (1-based) -> its place; line 1 is the first entry's
const hist = LL.history();
let count = 0;

// the skin page this panel is in (its bus id), null alone in a window
// (through the skin port, lib/core/panel-frame.js: the one place a panel looks at its skin)
function skinId() { return T.skinPort.id(window); }
// is `id` (a bus id) a panel of the same skin? (alone in a window: every one is ours)
function ours(id) { const s = T.skinPort.siblings(window); return !s || s.some((x) => x.id === id); }

function hhmmss(d) { return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => ("0" + n).slice(-2)).join(":"); }

const heads = [];   // the head line of each entry
function append(e) {
  const v = ed.view;
  const empty = v.state.doc.length === 0;
  const text = (empty ? "" : "\n") + e.lines.join("\n");
  const first = empty ? 1 : v.state.doc.lines + 1;
  v.dispatch({ changes: { from: v.state.doc.length, insert: text } });
  if (empty) locs = [null];
  e.locs.forEach((l) => locs.push(l));
  heads.push(first);
  // a long record: the oldest lines go
  if (v.state.doc.lines > MAX_LINES) {
    const cut = v.state.doc.line(v.state.doc.lines - MAX_LINES + 1).from;
    const gone = v.state.doc.lineAt(cut).number - 1;
    v.dispatch({ changes: { from: 0, to: cut } });
    locs = [null].concat(locs.slice(gone + 1));
    for (let i = heads.length - 1; i >= 0; i--) { heads[i] -= gone; if (heads[i] < 1) heads.splice(i, 1); }
  }
  ed.mark({ id: "heads", class: "cm-lsp-head", lines: heads.slice() });
  // follow the newest entry, unless the person is reading in here
  if (!document.hasFocus()) {
    const at = v.state.doc.line(Math.min(first, v.state.doc.lines)).from;
    v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: "start" }) });
  }
}

bus.on("lsp.event", (p, meta) => {
  if (!p || !meta || !meta.from || !ours(meta.from.id)) return;
  count += 1;
  append(LL.entry(p, hhmmss(new Date())));
  if (p.kind === "jump") hist.push(p);
  const s = hist.size();
  whatEl.textContent = count + " entries · jump " + s.at + "/" + s.jumps;
});

// a place: the code_editor that has the file (else opened -- in the frame, a code_editor panel)
function goTo(l, note) {
  if (!l) { footEl.textContent = note || "this line has no place"; return Promise.resolve(false); }
  return L.openAt(env, { path: l.path, line: l.line, col: l.col }).then((r) => {
    footEl.textContent = (r && r.ok ? "" : "! ") + (note ? note + " ── " : "") + ((r && r.message) || LL.where(l));
    return !!(r && r.ok);
  });
}

// Enter: the place of the line under the cursor (vim takes Enter first: map it in vim itself)
function enter() {
  const ln = ed.view.state.doc.lineAt(ed.view.state.selection.main.head).number;
  goTo(locs[ln]);
}
Vim.defineAction("tzLspLogGo", () => enter());
Vim.mapCommand("<CR>", "action", "tzLspLogGo", {}, { context: "normal" });

// lsp.back / lsp.forward: this panel takes the ones from its own skin (args.skin
// from a code_editor; or the skin page itself invoking it) -- only those: another
// skin's panel holds another skin's jumps; and, for an invoker in no skin,
// the lsp_log focused last
let active = true;
const me = Math.random().toString(36).slice(2, 8);
function claim() { active = true; bus.post("lsp_log.active", { id: me }); }
bus.on("lsp_log.active", (p) => { if (p && p.id !== me) active = false; });
window.addEventListener("focus", claim);
claim();
function mine(args, ctx) {
  if (ctx && ctx.local) return true;
  const sk = skinId();
  const a = args || {};
  const from = ctx && ctx.from && ctx.from.id;
  if (a.skin) return a.skin === sk;
  if (sk && from === sk) return true;
  return active;
}
function step(dir) {
  const l = dir < 0 ? hist.back() : hist.forward();
  const s = hist.size();
  whatEl.textContent = count + " entries · jump " + s.at + "/" + s.jumps;
  if (!l) { footEl.textContent = dir < 0 ? "no earlier jump" : "no later jump"; return; }
  goTo(l, dir < 0 ? "back" : "forward");
}
T.commands.register("lsp.back", (args, ctx) => { if (!mine(args, ctx)) return false; step(-1); return true; });
T.commands.register("lsp.forward", (args, ctx) => { if (!mine(args, ctx)) return false; step(1); return true; });
T.commands.load().catch(() => {});
T.commands.listenBus();

window.lspLog = {
  text: () => ed.view.state.doc.toString(),
  locs: () => locs,
  view: () => ed.view,
  size: () => hist.size(),
  cursorLine: () => ed.view.state.doc.lineAt(ed.view.state.selection.main.head).number,
};
