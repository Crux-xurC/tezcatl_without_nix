// lib/code/code-diff-page.js -- the page script of the code_diff panel
// (panels/resident/code_diff.html). A page is what it looks like; what it
// does is here. The page loads it after the scripts it needs.
// The code_diff panel: two files saved on disk, side by side
// (@codemirror/merge), read only -- no copy, no language server. Which two:
// ?a=&b= when it is opened (a skin's `diff -n A,B`), diff.set {a, b} to this
// panel later (`diff -f A,B`). Each side's header is its path and when it was
// last saved (GET /fs/stat). Both are read again when something says one of
// them changed -- code.saved, fs.changed, file.changed -- and on `r`; nothing
// watches the disk. What is not saved yet is compared through the scratch
// (`:Scratch`, then ~work/scratch against the file -- `:Diff` in a skin).
import { EditorState, EditorView, oneDark, languageExtension, basicSetup } from "../vendor/codemirror/cm.bundle.js";
import { MergeView, goToNextChunk, goToPreviousChunk } from "../vendor/codemirror/merge.bundle.js";

const T = window.Tezcatl;
const bus = T.bus;
const D = T.codeDiff;
const params = new URLSearchParams(location.search);
const NAME = params.get("name") || "code_diff";
const haEl = document.getElementById("ha");
const hbEl = document.getElementById("hb");
const viewEl = document.getElementById("view");
const footEl = document.getElementById("foot");
const HINT = footEl.textContent;
T.panelFrame.init({ role: "code_diff", name: NAME });
if (T.panelFrame.setFocusTarget) T.panelFrame.setFocusTarget(viewEl);

let pair = { a: null, b: null };
let merge = null;
let font = { family: "monospace", size: 13 };
let seq = 0;   // the load asked last: an answer of an earlier one is dropped

function say(text, err) {
  footEl.textContent = text || HINT;
  footEl.className = err ? "err" : "";
}

const baseP = T.config.load().then((cfg) => {
  const u = cfg && cfg.connections && cfg.connections[0] && cfg.connections[0].url;
  if (!u) return null;
  const x = new URL(u);
  return (x.protocol === "wss:" ? "https:" : "http:") + "//" + x.host;
}).catch(() => null);
// the editor's font (code.json), so both sides read as code_editor does
const fontP = fetch(T.config.sibling("code.json"), { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : null))
  .then((doc) => {
    if (doc && typeof doc.fontFamily === "string") font.family = doc.fontFamily;
    if (doc && typeof doc.fontSize === "number") font.size = doc.fontSize;
    if (doc && doc.languages && T.codeLanguages && T.codeLanguages.configure) T.codeLanguages.configure(doc.languages);
  })
  .catch(() => {});

function clear() {
  if (merge) { try { merge.destroy(); } catch (_) {} merge = null; }
  viewEl.textContent = "";
}
function empty() {
  clear();
  const d = document.createElement("div");
  d.className = "empty";
  d.textContent = D.EMPTY;
  viewEl.appendChild(d);
  haEl.textContent = "";
  hbEl.textContent = "";
}

// one file: its text and its stat -> {text, stat} (a file that is not there reads as empty)
function read(base, path) {
  const q = "?path=" + encodeURIComponent(path);
  return Promise.all([
    fetch(base + "/fs/read" + q, { cache: "no-store" }).then((r) => {
      if (r.status === 404) return "";
      if (!r.ok) return r.text().then((t) => { let j = null; try { j = JSON.parse(t); } catch (_) {} throw new Error(path + ": " + ((j && j.error) || "HTTP " + r.status)); });
      return r.text();
    }),
    fetch(base + "/fs/stat" + q, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([text, stat]) => ({ text, stat }));
}

function side(path, text) {
  const id = (T.codeLanguages && T.codeLanguages.resolve(path)) || null;
  return {
    doc: text,
    extensions: [
      basicSetup(),
      oneDark,
      languageExtension(id),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.theme({
        "&": { fontSize: font.size + "px" },
        ".cm-content": { fontFamily: font.family },
        ".cm-gutters": { fontFamily: font.family },
      }),
    ],
  };
}

// read both and show them; `why`: said in the foot (what made it read again)
function load(why) {
  const mine = ++seq;
  const { a, b } = pair;
  if (!a || !b) { empty(); say(""); return Promise.resolve(false); }
  return Promise.all([baseP, fontP]).then(([base]) => {
    if (!base) throw new Error("config.json has no relay URL");
    return Promise.all([read(base, a), read(base, b)]);
  }).then(([ra, rb]) => {
    if (mine !== seq) return false;
    // where the left side was scrolled to: kept over a reading again
    const top = merge ? merge.a.scrollDOM.scrollTop : 0;
    clear();
    merge = new MergeView({ a: side(a, ra.text), b: side(b, rb.text), parent: viewEl, highlightChanges: true, gutter: true });
    if (top) viewEl.scrollTop = top;
    haEl.textContent = D.head(a, ra.stat);
    hbEl.textContent = D.head(b, rb.stat);
    const n = merge.chunks.length;
    say((why ? why + " ── " : "") + (n ? n + " change" + (n === 1 ? "" : "s") + " (n / p: next / previous)" : "no difference"));
    bus.post("diff.shown", { name: NAME, a, b, changes: n });
    return true;
  }).catch((e) => {
    if (mine !== seq) return false;
    clear();
    haEl.textContent = a;
    hbEl.textContent = b;
    say("! " + ((e && e.message) || e), true);
    bus.post("diff.failed", { name: NAME, a, b, reason: String((e && e.message) || e) });
    return false;
  });
}

function set(a, b) {
  pair = { a: a || null, b: b || null };
  return load("");
}

// diff -f A,B (and a skin that puts two files here)
bus.onMine("diff.set", (p) => { if (p) set(p.a, p.b); });
// the two files shown, for who asks
bus.onMine("diff.get", (_p, meta) => { T.panelFrame.replyTo(meta, "diff.pair", { name: NAME, a: pair.a, b: pair.b }); });
// something says one of the two changed: read both again
["code.saved", "fs.changed", "file.changed"].forEach((type) => {
  bus.on(type, (p) => { if (D.concerns(type, p, pair.a, pair.b)) load("read again (" + type + ")"); });
});

viewEl.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const line = font.size * 1.5;
  if (e.key === "n" || e.key === "p") {
    e.preventDefault();
    if (merge) (e.key === "n" ? goToNextChunk : goToPreviousChunk)(merge.b);
  } else if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); viewEl.scrollTop += line * 3; }
  else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); viewEl.scrollTop -= line * 3; }
  else if (e.key === "r") { e.preventDefault(); load("read again"); }
});
// a click into either side keeps the keys here
viewEl.addEventListener("mouseup", () => { const s = window.getSelection(); if (!s || s.isCollapsed) viewEl.focus(); });

set(params.get("a"), params.get("b"));
bus.post("diff.ready", { name: NAME });
