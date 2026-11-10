// lib/code/markdown-page.js -- the page script of the markdown panel
// (panels/resident/markdown.html). A page is what it looks like; what it
// does is here. The page loads it after the scripts it needs.
// The markdown panel: a note drawn, read only. Which note: ?path= when it is
// opened (a skin's `markdown <path>`). Two ways to read it:
//   the saved text (by default) -- /fs/read; read again when something says
//     the file changed (code.saved, fs.changed, file.changed) and on `r`
//   following a code_editor -- `markdown follow` (markdown.follow {on} to this
//     panel) or `f`: the code_editor of the same skin that has the same path; its
//     unsaved text (code.get), asked again when its cursor moves (an edit
//     moves it too); the block under its cursor is marked. It stops when that
//     code_editor opens another file or is closed (said on the receiving side).
// The note is parsed by @lezer/markdown + GFM (lib/vendor/codemirror/markdown.bundle.js)
// and drawn with DOM calls from lib/code/markdown.js layout -- never as HTML:
// raw HTML in a note stays text. Links: a path opens (code.open-at), http(s) in
// a new window, anything else is text. Images are not shown: their path is said.
// Enter: the line of the block selected -- in the code_editor followed, else opened.
// t on a table with a caption: a task_table panel for it (lib/task/task-table-page.js).
import { parser } from "../vendor/codemirror/markdown.bundle.js";

const T = window.Tezcatl;
const bus = T.bus;
const M = T.markdown;
const D = T.codeDiff;
const L = T.codeLocate;
const params = new URLSearchParams(location.search);
const NAME = params.get("name") || "markdown";
const pathEl = document.getElementById("path");
const modeEl = document.getElementById("mode");
const docEl = document.getElementById("doc");
const footEl = document.getElementById("foot");
const HINT = footEl.textContent;
T.panelFrame.init({ role: "markdown", name: NAME });
if (T.panelFrame.setFocusTarget) T.panelFrame.setFocusTarget(docEl);
const env = L.pageEnv(window);

const path = (params.get("path") || "").replace(/^\/+/, "") || null;
let blocks = [];
let els = [];          // the element of each top block
let sel = -1;          // the block selected here
let here = -1;         // the block under the followed code_editor's cursor
let cursorLine = 0;
let target = null;     // the code_editor followed: {id, name}
let seq = 0;

function say(text, err) {
  footEl.textContent = text || HINT;
  footEl.className = err ? "err" : "";
}
// to the skin's receiving side too
function tell(text, err, ref) {
  say(text, err);
  bus.post("recv.say", { text, cls: err ? "err" : null, ref: ref || null });
}

const baseP = T.config.load().then((cfg) => {
  const u = cfg && cfg.connections && cfg.connections[0] && cfg.connections[0].url;
  if (!u) return null;
  const x = new URL(u);
  return (x.protocol === "wss:" ? "https:" : "http:") + "//" + x.host;
}).catch(() => null);

// -- drawing ------------------------------------------------------------------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function inlineInto(parent, kids) {
  (kids || []).forEach((k) => {
    switch (k.t) {
      case "text": parent.appendChild(document.createTextNode(k.s)); break;
      case "em": inlineInto(parent.appendChild(el("em")), k.kids); break;
      case "strong": inlineInto(parent.appendChild(el("strong")), k.kids); break;
      case "del": inlineInto(parent.appendChild(el("del")), k.kids); break;
      case "code": parent.appendChild(el("code", null, k.s)); break;
      case "br": parent.appendChild(el("br")); break;
      case "raw": parent.appendChild(el("span", "raw", k.s)); break;
      case "img": parent.appendChild(el("span", "img", "(" + M.IMAGE_SAID + (k.src || "?") + (k.alt ? " ── " + k.alt : "") + ")")); break;
      case "link": {
        if (k.kind === "none") { inlineInto(parent, k.kids); break; }
        const a = el("a");
        a.title = k.href;
        inlineInto(a, k.kids);
        a.addEventListener("click", (e) => { e.preventDefault(); follow_link(k); });
        parent.appendChild(a);
        break;
      }
      default: parent.appendChild(document.createTextNode(""));
    }
  });
}
function blockEl(b) {
  switch (b.t) {
    case "h": { const e = el("h" + Math.min(6, Math.max(1, b.level))); inlineInto(e, b.kids); return e; }
    case "p": { const e = el("p"); inlineInto(e, b.kids); return e; }
    case "pre": {
      const e = el("pre");
      if (b.lang) e.appendChild(el("span", "lang", b.lang));
      e.appendChild(el("code", null, b.s));
      return e;
    }
    case "raw": return el("div", "raw", b.s);
    case "hr": return el("hr");
    case "quote": { const e = el("blockquote"); b.kids.forEach((k) => e.appendChild(blockEl(k))); return e; }
    case "ul": case "ol": {
      const e = el(b.t);
      if (b.t === "ol" && b.start != null && b.start !== 1) e.start = b.start;
      b.items.forEach((it) => {
        const li = el("li", it.task == null ? null : "task");
        if (it.task != null) {
          const box = el("input");
          box.type = "checkbox";
          box.checked = it.task;
          box.disabled = true;
          li.appendChild(box);
        }
        it.kids.forEach((k, i) => {
          // a tight item's paragraph reads inline beside its box
          if (k.t === "p" && i === 0) inlineInto(li, k.kids);
          else li.appendChild(blockEl(k));
        });
        e.appendChild(li);
      });
      return e;
    }
    case "table": {
      const e = el("table");
      if (b.caption != null) e.appendChild(el("caption", null, b.caption));
      const row = (cells, tag) => {
        const tr = el("tr");
        cells.forEach((c, i) => {
          const td = el(tag);
          if (b.align[i]) td.style.textAlign = b.align[i];
          inlineInto(td, c);
          tr.appendChild(td);
        });
        return tr;
      };
      if (b.head.length) e.appendChild(el("thead")).appendChild(row(b.head, "th"));
      const body = e.appendChild(el("tbody"));
      b.rows.forEach((r) => body.appendChild(row(r, "td")));
      return e;
    }
    default: return el("div");
  }
}

function draw(text) {
  const keepTop = docEl.scrollTop;
  blocks = M.layout(parser.parse(text), text).blocks;
  docEl.textContent = "";
  els = blocks.map((b, i) => {
    const wrap = el("div", "blk");
    wrap.appendChild(blockEl(b));
    wrap.addEventListener("click", () => { sel = i; mark(); });
    docEl.appendChild(wrap);
    return wrap;
  });
  if (!blocks.length) docEl.appendChild(el("div", "empty", "(an empty note)"));
  if (sel >= blocks.length) sel = blocks.length - 1;
  docEl.scrollTop = keepTop;
  here = target ? M.blockAt(blocks, cursorLine) : -1;
  mark();
}

function mark() {
  els.forEach((e, i) => {
    e.classList.toggle("sel", i === sel);
    e.classList.toggle("here", i === here);
  });
  // follow the code_editor's cursor, but never move under the person reading here
  if (here >= 0 && target && !document.hasFocus() && els[here]) els[here].scrollIntoView({ block: "nearest" });
}

function showHead(stat) {
  pathEl.textContent = path || "";
  if (target) {
    modeEl.textContent = "following code_editor " + (target.name || "") + (target.dirty ? " ●" : "");
    modeEl.className = "follow";
  } else {
    const t = stat && stat.exists !== false ? D.stamp(stat.mtime) : "";
    modeEl.textContent = stat && stat.exists === false ? "not on the disk" : "disk" + (t ? " · " + t : "");
    modeEl.className = "";
  }
}

// -- reading ------------------------------------------------------------------
function readDisk() {
  const mine = ++seq;
  if (!path) { docEl.textContent = ""; docEl.appendChild(el("div", "empty", "No note ── markdown <path> in a skin, or ?path=")); showHead(null); return Promise.resolve(); }
  return baseP.then((base) => {
    if (!base) throw new Error("config.json has no relay URL");
    const q = encodeURIComponent(path);
    return Promise.all([
      fetch(base + "/fs/read?path=" + q, { cache: "no-store" }).then((r) => {
        if (r.status === 404) return null;
        if (!r.ok) return r.text().then((t) => { let j = null; try { j = JSON.parse(t); } catch (_) {} throw new Error((j && j.error) || ("HTTP " + r.status)); });
        return r.text();
      }),
      fetch(base + "/fs/stat?path=" + q, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
  }).then(([text, stat]) => {
    if (mine !== seq || target) return;
    showHead(stat || (text == null ? { exists: false } : null));
    draw(text == null ? "" : text);
  }).catch((e) => {
    if (mine !== seq) return;
    say("! could not read " + path + ": " + ((e && e.message) || e), true);
  });
}

// the followed code_editor's text (code.get -> code.text)
function readFollowed() {
  if (!target) return;
  const mine = ++seq;
  const who = target.id;
  const off = bus.on("code.text", (p, meta) => {
    if (!meta || !meta.from || meta.from.id !== who) return;
    off();
    if (mine !== seq || !target || target.id !== who) return;
    if (p.path !== path) { stop("the code_editor now has " + (p.path || "no file")); return; }
    target.dirty = !!p.dirty;
    showHead(null);
    draw(typeof p.text === "string" ? p.text : "");
  });
  bus.post("code.get", {}, { to: who });
  setTimeout(off, 5000);
}
let timer = null;
function soon(ms) { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; readFollowed(); }, ms); }

// -- following ----------------------------------------------------------------
function ours(id) { const s = T.skinPort.siblings(window); return !s || s.some((x) => x.id === id); }

function follow() {
  if (!path) { tell("! markdown follow ── this panel has no note", true); return Promise.resolve(false); }
  return L.query(env).then((list) => {
    const hit = L.find(list, path).filter((c) => ours(c.id))[0];
    if (!hit) { tell("! markdown follow ── no code_editor of this skin has " + path + " (open it there first)", true); return false; }
    target = { id: hit.id, name: hit.name, dirty: hit.dirty };
    showHead(null);
    readFollowed();
    tell("markdown ── " + path + " follows the code_editor " + hit.name + " (its unsaved text, its cursor)", false, { kind: "bus", id: hit.id, name: hit.name });
    return true;
  });
}
function stop(why) {
  if (!target) return;
  const was = target;
  target = null;
  here = -1;
  tell("markdown ── " + path + " no longer follows " + (was.name || "the code_editor") + (why ? " (" + why + ")" : "") + " ── the saved text again", false);
  readDisk();
}

bus.on("cursor", (p, meta) => {
  if (!target || !meta || !meta.from || meta.from.id !== target.id || !p) return;
  if (p.cell && typeof p.cell.y === "number") cursorLine = p.cell.y;
  here = M.blockAt(blocks, cursorLine);
  mark();
  soon(300);   // the text may have changed: ask again once it rests
});
bus.on("code.opened", (p, meta) => {
  if (target && meta && meta.from && meta.from.id === target.id && p && p.path !== path) stop("it opened " + (p.path || "another file"));
});
bus.on("code.closed", (_p, meta) => {
  if (target && meta && meta.from && meta.from.id === target.id) stop("it was closed");
});
bus.on("code.dirty", (p, meta) => {
  if (target && meta && meta.from && meta.from.id === target.id) { target.dirty = !!(p && p.dirty); showHead(null); }
});
// the saved text changed: read again (not while following -- the code_editor's text is shown)
["code.saved", "fs.changed", "file.changed"].forEach((type) => {
  bus.on(type, (p) => { if (!target && path && D.concerns(type, p, path, null)) readDisk(); });
});
// markdown.follow {on} (to this one; a skin's `markdown follow` / `unfollow`)
bus.onMine("markdown.follow", (p) => {
  if (p && p.on) { if (!target) follow(); else tell("markdown ── " + path + " already follows " + target.name); }
  else if (target) stop(null);
  else tell("markdown ── " + (path || "this panel") + " follows nothing (the saved text)");
});

// -- keys -----------------------------------------------------------------------
function follow_link(k) {
  if (k.kind === "web") {
    const w = window.open(k.href, "_blank", "noopener");
    say(w ? "opened " + k.href + " in a new window" : "! could not open a new window (the pop-up was blocked)", !w);
    return;
  }
  const file = k.href.replace(/[#?].*$/, "");
  const r = T.codeFiles.resolve(path || "", file);
  if (r.error) { say("! " + r.error, true); return; }
  L.openAt(env, { path: r.path, line: null, col: null }).then((x) => say((x && x.message) || r.path, !(x && x.ok)));
}
// t on a table with a caption: a task_table for it (in a skin, the skin adds
// it -- task_table.open; alone, a new window)
function takeTable() {
  const b = blocks[sel];
  if (!b || b.t !== "table") { say("t takes a table ── select one (j / k)"); return; }
  if (b.caption == null) { say("! this table has no name ── a `Table: <name>` line just before or after it", true); return; }
  if (T.skinPort && T.skinPort.inSkin(window)) {
    bus.post("task_table.open", { path, table: b.caption });
    say("task_table ── \"" + b.caption + "\" (asked the skin)");
    return;
  }
  const w = env.open(env.sibling("panels/resident/task_table.html") + "?path=" + encodeURIComponent(path) + "&table=" + encodeURIComponent(b.caption), "tezcatl-task-table-" + Date.now().toString(36));
  say(w ? "task_table ── \"" + b.caption + "\" in a new window" : "! could not open a new window (the pop-up was blocked)", !w);
}
function go() {
  const b = blocks[sel];
  if (!b) return;
  if (target) {
    bus.post("code.goto", { line: b.line, col: 0 }, { to: target.id });
    L.reveal(env, target.id);
    say("to line " + b.line + " in " + target.name);
    return;
  }
  L.openAt(env, { path, line: b.line, col: null }).then((x) => say((x && x.message) || path, !(x && x.ok)));
}
docEl.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const n = blocks.length;
  if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); if (n) { sel = Math.min(n - 1, sel + 1); mark(); els[sel].scrollIntoView({ block: "nearest" }); } }
  else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); if (n) { sel = Math.max(0, sel - 1); mark(); els[sel].scrollIntoView({ block: "nearest" }); } }
  else if (e.key === "Enter") { e.preventDefault(); go(); }
  else if (e.key === "f") { e.preventDefault(); if (target) stop(null); else follow(); }
  else if (e.key === "t") { e.preventDefault(); takeTable(); }
  else if (e.key === "r") { e.preventDefault(); if (target) readFollowed(); else readDisk().then(() => say("read again")); }
});

readDisk();
