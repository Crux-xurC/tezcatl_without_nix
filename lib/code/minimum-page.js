// lib/code/minimum-page.js -- the page script of code_vi_minimum
// (panels/resident/code_vi_minimum.html). A page is what it looks like; what it
// does is here. The page loads it after the scripts it needs.
// code_vi_minimum (D-minimum): a small vim editor with no file -- a sentence (a
// commit message, a path, a line for a terminal) written, then sent with `:m`
// (lib/code/minimum.js says where). Opened by `minimum [purpose]` (a skin adds
// it at its end), or asked for by a panel: ?req=&from=<bus id>&purpose= --
// `:m` then answers minimum.done {req, text} to that panel, `:q` {req, cancel}.
// What was sent is cleared; the panel stays for the next one.
import { EditorView, EditorState, basicSetup, oneDark, vim, Vim, getCM } from "../vendor/codemirror/cm.bundle.js";

const T = window.Tezcatl;
const bus = T.bus;
const MN = T.minimum;
const L = T.codeLocate;
const params = new URLSearchParams(location.search);
const NAME = params.get("name") || "code_vi_minimum";
const asked = params.get("req") && params.get("from") ? { req: params.get("req"), from: params.get("from") } : null;
const footEl = document.getElementById("foot");
const HINT = footEl.textContent;
document.getElementById("purpose").textContent = params.get("purpose") || "";
T.panelFrame.init({ role: "code_vi_minimum", name: NAME });
const env = L.pageEnv(window);

function say(text, err) { footEl.textContent = text || HINT; footEl.className = err ? "err" : ""; }

const view = new EditorView({
  parent: document.getElementById("editor"),
  state: EditorState.create({
    doc: params.get("text") || "",
    extensions: [vim(), basicSetup(), oneDark, EditorView.lineWrapping],
  }),
});
if (T.panelFrame.setFocusTarget) T.panelFrame.setFocusTarget(() => view.contentDOM);
view.focus();

function text() { return view.state.doc.toString().replace(/\s+$/, ""); }
function clear() { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } }); }

// the xterm focused last (the cursor service's history) -> Promise<bus id | null>
function lastXterm() {
  return new Promise((resolve) => {
    let done = false;
    const off = bus.on("cursor.state", (p) => {
      if (done) return;
      done = true; off();
      const h = (p && p.focusHistory) || [];
      for (let i = h.length - 1; i >= 0; i--) if (h[i].role === "xterm") return resolve(h[i].id);
      resolve(null);
    });
    bus.post("cursor.query");
    setTimeout(() => { if (!done) { done = true; off(); resolve(null); } }, 400);
  });
}

function send(arg) {
  const t = text();
  if (!t) { say("! nothing written", true); return; }
  const where = MN.parse(arg, (a) => T.codeFiles.resolve("", a));
  if (where.error) { say("! " + where.error, true); return; }
  if (where.to === "back") {
    if (asked) { bus.post("minimum.done", { req: asked.req, text: t }, { to: asked.from }); say("sent back to who asked"); }
    else { bus.post("killring.add", { text: t, source: NAME }); say("into the kill ring (no one asked for it)"); }
    clear();
    return;
  }
  if (where.to === "input") {
    let answered = false;
    const off = bus.on("cmd.focused", (p) => { if (p && p.for === NAME) answered = true; });
    bus.post("cmd.focus", { name: NAME, text: t });
    setTimeout(() => {
      off();
      if (answered) clear();
      else say("! there is no input form next to this (open it in a skin that has one)", true);
    }, 400);
    return;
  }
  if (where.to === "xterm") {
    lastXterm().then((id) => {
      if (!id) { say("! no xterm focused yet ── focus one once", true); return; }
      bus.post("insert", { text: t }, { to: id });
      say("pasted into the xterm (not run)");
      clear();
    });
    return;
  }
  // code_editor <file>: at the end of the code_editor that has it
  L.query(env).then((list) => {
    const hit = L.find(list, where.path)[0];
    if (!hit) { say("! no code_editor has " + where.path + " ── open it first", true); return; }
    const req = "mn-" + Date.now().toString(36);
    let done = false;
    const off = bus.on("code.appended", (p) => {
      if (done || !p || p.req !== req) return;
      done = true; off();
      if (p.ok) { say("added at the end of " + where.path + " (unsaved ── :w there)"); clear(); }
      else say("! " + where.path + ": " + (p.reason || "not added"), true);
    });
    bus.post("code.append", { req, text: t }, { to: hit.id });
    setTimeout(() => { if (!done) { done = true; off(); say("! the code_editor of " + where.path + " did not answer", true); } }, 3000);
  });
}

function drop() {
  if (asked) bus.post("minimum.done", { req: asked.req, cancel: true }, { to: asked.from });
  clear();
  say("dropped");
}

// :m -- "mail" (w turned over: no file here, nothing is saved). It takes the
// place of vim's own :m (:move) in this editor only.
Vim.defineEx("m", "m", (cm, p) => { if (getCM(view) === cm) send(p && p.argString); });
Vim.defineEx("quit", "q", (cm) => { if (getCM(view) === cm) drop(); });
