// lib/task/task-table-page.js -- the page script of the task_table panel
// (panels/resident/task_table.html). A page is what it looks like; what it
// does is here. The page loads it after the scripts it needs.
// The task_table panel (D-task-table): a note's table, taken by its name
// (`Table: <name>`), edited as a table, saved to its book and put back.
//   ?path=&name=     the note and the table; its book (~work/books/<name>.json)
//                    is read when there is one for that note, else the table is
//                    taken (&fresh=1: taken again, the book written over)
//   the grid         lib/xipe/matrix-grid.js as it is: hjkl, v, sort (a header's
//                    click), / filter, c colors, y yank
//   the edits here   i / Enter a cell (an id set is not edited), o / O a sibling /
//                    a child row (numbered: lib/task/task-table.js newRow), d d a
//                    row, J / K a row down / up (not while sorted)
//   w                to the book: every row (a filter hides none from it), in the
//                    order shown; the rows whose id is empty or the mark get ids
//                    of the relay's list (POST /ids/take)
//   L                w, then the rows shown (filter and order: the rank) into the
//                    task list (~work/books/task_list.json, the agenda: D-task-list)
//   W                w, then into the note: the table and its caption replaced
//                    -- refused when the note's table changed since it was taken
//                    (task_table put! does it anyway). A code_editor that has the note
//                    gets it as an unsaved edit (code.edits; it refuses when it has
//                    unsaved edits); else the file is written, checked against the disk
// The note is read from the code_editor that has it (its text now), else from the disk.
// What came of it is said in the foot and on the skin's receiving side.
import { parser } from "../vendor/codemirror/markdown.bundle.js";
import { hashText } from "../code/code-editor/relay.js";

const T = window.Tezcatl;
const bus = T.bus;
const M = T.markdown;
const TT = T.taskTable;
const TL = T.taskList;
const L = T.codeLocate;
const params = new URLSearchParams(location.search);
const NAME = params.get("name") || "task_table";
const notePath = (params.get("path") || "").replace(/^\/+/, "") || null;
const tableName = (params.get("table") || "").trim() || null;
const fresh = params.get("fresh") === "1";
const gridEl = document.getElementById("grid-wrap");
const footEl = document.getElementById("foot");
const HINT = footEl.textContent;
const editEl = document.getElementById("edit");
const editLabel = document.getElementById("edit-label");
const editInput = document.getElementById("edit-input");
T.panelFrame.init({ role: "task_table", name: NAME });
if (T.panelFrame.setFocusTarget) T.panelFrame.setFocusTarget(gridEl);
const env = L.pageEnv(window);

let cfg = TT.settings(null);
let book = null;
let bookBase = "absent";   // what the book file was when read or written (x-tezcatl-base)
let keys = [];             // the grid's row id of each book row
let seq = 0;
let editing = null;        // {bi, ci}

function say(text, err) { footEl.textContent = text || HINT; footEl.className = err ? "err" : ""; }
function tell(text, err, ref) { say(text, err); bus.post("recv.say", { text, cls: err ? "err" : null, ref: ref || null }); }
let dirty = false;
function setDirty(d) { dirty = d; document.getElementById("dirty").hidden = !d; }

const baseP = T.config.load().then((c) => {
  const u = c && c.connections && c.connections[0] && c.connections[0].url;
  if (!u) return null;
  const x = new URL(u);
  return (x.protocol === "wss:" ? "https:" : "http:") + "//" + x.host;
}).catch(() => null);
function relay(method, route, q, body, headers) {
  return baseP.then((base) => {
    if (!base) throw new Error("config.json has no relay URL");
    const qs = Object.keys(q).map((k) => k + "=" + encodeURIComponent(q[k])).join("&");
    const init = { method, cache: "no-store", headers: Object.assign({}, headers || {}) };
    if (body != null) { init.headers["content-type"] = "text/plain; charset=utf-8"; init.body = body; }
    return fetch(base + route + "?" + qs, init).then((r) => r.text().then((text) => {
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      return { status: r.status, ok: r.ok, text, json };
    }));
  });
}
function failed(r) { return new Error((r.json && r.json.error) || ("HTTP " + r.status)); }

// -- the note: the code_editor that has it (its text now), else the disk ----------
function noteText(path) {
  return L.query(env).then((list) => {
    const hit = L.find(list, path)[0];
    if (!hit) {
      return relay("GET", "/fs/read", { path }).then((r) => {
        if (!r.ok) throw failed(r);
        return { text: r.text, code: null };
      });
    }
    return new Promise((resolve, reject) => {
      const off = bus.on("code.text", (p, meta) => {
        if (!meta || !meta.from || meta.from.id !== hit.id) return;
        off(); clearTimeout(tm);
        resolve({ text: typeof p.text === "string" ? p.text : "", code: hit });
      });
      const tm = setTimeout(() => { off(); reject(new Error("the code_editor of " + path + " did not answer")); }, 5000);
      bus.post("code.get", {}, { to: hit.id });
    });
  });
}
function findIn(text, name) { return M.findTable(M.tables(parser.parse(text), text), name); }

// -- the book ---------------------------------------------------------------------
function readBook(name) {
  return relay("GET", "/fs/read", { path: TT.bookPath(name) }).then((r) => {
    if (r.status === 404) return null;
    if (!r.ok) throw failed(r);
    let b = null;
    try { b = JSON.parse(r.text); } catch (_) { throw new Error(TT.bookPath(name) + " is not JSON ── fix it or take the table again (task_table take!)"); }
    return hashText(r.text).then((h) => { bookBase = h; return b; });
  });
}
function writeBook() {
  const text = JSON.stringify(book, null, 1) + "\n";
  return relay("PUT", "/fs/write", { path: TT.bookPath(book.name) }, text, { "x-tezcatl-base": bookBase }).then((r) => {
    if (r.status === 409) throw new Error("the book " + TT.bookPath(book.name) + " changed meanwhile (another task_table?) ── take it again");
    if (!r.ok) throw failed(r);
    return hashText(text).then((h) => { bookBase = h; });
  });
}

function take() {
  return noteText(notePath).then((n) => {
    const f = findIn(n.text, tableName);
    if (f.error) throw new Error(f.error);
    return hashText(n.text.slice(f.table.from, f.table.to)).then((h) => {
      const t = TT.take(f.table, notePath, h, cfg);
      if (t.error) throw new Error(t.error);
      return t.book;
    });
  });
}

// -- the grid -----------------------------------------------------------------------
const grid = T.matrixGrid.create({ el: gridEl, bus });
function show() {
  document.getElementById("name").textContent = book ? book.name : "";
  document.getElementById("from").textContent = book ? "from " + book.path : "";
  grid.setColumns(book.columns.map((label, i) => ({ key: "c" + i, label })));
  grid.setRows(book.rows.map((r, i) => ({ id: keys[i], cells: Object.fromEntries(r.map((v, ci) => ["c" + ci, v])) })));
  grid.render();
}
function freshKeys() { keys = book.rows.map(() => "r" + (++seq)); }
// the book row under the cursor -> {bi, ci} | null
function here() {
  const g = grid.getState();
  if (g.cursor.rowIndex == null) return null;
  const bi = keys.indexOf(g.order[g.cursor.rowIndex]);
  return bi < 0 ? null : { bi, ci: g.cursor.col };
}
// the cursor onto book row `bi` (through the grid's own keys: it has no setter)
function cursorTo(bi) {
  const g = grid.getState();
  const want = g.order.indexOf(keys[bi]);
  if (want < 0 || g.cursor.rowIndex == null) return;
  const d = want - g.cursor.rowIndex;
  for (let i = 0; i < Math.abs(d); i++) grid.handleKey({ key: d > 0 ? "j" : "k", modifiers: [] });
  grid.render();
}

// -- editing ------------------------------------------------------------------------
function startEdit() {
  const h = here();
  if (!h || h.ci < 0) { say("a cell first (h / l off the row number)"); return; }
  const why = TT.locked(book, h.ci, book.rows[h.bi][h.ci], cfg);
  if (why) { say(why, true); return; }
  editing = h;
  editLabel.textContent = book.columns[h.ci] + ":";
  editInput.value = book.rows[h.bi][h.ci];
  editEl.hidden = false;
  editInput.focus();
}
function endEdit(commit) {
  if (editing && commit) {
    const v = TT.cellText(editInput.value);
    if (v !== book.rows[editing.bi][editing.ci]) {
      book.rows[editing.bi][editing.ci] = v;
      grid.patchRow(keys[editing.bi], { ["c" + editing.ci]: v });
      setDirty(true);
    }
  }
  editing = null;
  editEl.hidden = true;
  grid.render();
  gridEl.focus();
}
editInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") { e.preventDefault(); endEdit(true); }
  else if (e.key === "Escape") { e.preventDefault(); endEdit(false); }
});

function addRow(child) {
  const h = here();
  const at = h ? h.bi : -1;
  const n = TT.newRow(book, at, child, cfg);
  book.rows.splice(n.index, 0, TT.blankRow(book, n.no, cfg));
  keys.splice(n.index, 0, "r" + (++seq));
  setDirty(true);
  show();
  cursorTo(n.index);
  say(n.no + " added" + (child ? " (a child)" : "") + " ── i to write its " + cfg.columns.task);
}
function deleteRow() {
  const h = here();
  if (!h) return;
  const no = book.rows[h.bi][book.columns.indexOf(cfg.columns.no)];
  book.rows.splice(h.bi, 1);
  grid.removeRow(keys[h.bi]);
  keys.splice(h.bi, 1);
  setDirty(true);
  grid.render();
  say("deleted " + (no || "the row") + " (w saves it so)");
}
function moveRow(d) {
  const h = here();
  if (!h) return;
  if (grid.getState().sort.key) { say("J / K move rows in the book's order ── stop sorting first (click the header till ▲▼ goes)", true); return; }
  const to = h.bi + d;
  if (to < 0 || to >= book.rows.length) return;
  [book.rows[h.bi], book.rows[to]] = [book.rows[to], book.rows[h.bi]];
  [keys[h.bi], keys[to]] = [keys[to], keys[h.bi]];
  setDirty(true);
  show();
  cursorTo(to);
}

// -- w / W ------------------------------------------------------------------------
function save() {
  if (!book) return Promise.resolve(false);
  const g = grid.getState();
  const order = TT.sorted(book, g.sort.key ? Number(g.sort.key.slice(1)) : -1, g.sort.dir);
  book = Object.assign({}, book, { rows: order.map((i) => book.rows[i]) });
  keys = order.map((i) => keys[i]);
  const need = TT.needIds(book, cfg);
  const ids = need.length
    ? relay("POST", "/ids/take", { list: cfg.list, n: need.length, path: book.path }).then((r) => {
      if (!r.ok || !r.json || !Array.isArray(r.json.ids)) throw failed(r);
      return r.json.ids;
    })
    : Promise.resolve([]);
  return ids.then((got) => {
    book = TT.putIds(book, need, got, cfg);
    return writeBook().then(() => {
      setDirty(false);
      show();
      tell("task_table ── saved " + book.name + " to " + TT.bookPath(book.name) + (got.length ? " (" + got.length + " id(s): " + got.join(", ") + ")" : ""));
      return true;
    });
  }).catch((e) => { tell("! task_table ── not saved: " + ((e && e.message) || e), true); return false; });
}

function put(bang) {
  return save().then((ok) => {
    if (!ok) return false;
    return noteText(book.path).then((n) => {
      const f = findIn(n.text, book.name);
      if (f.error) throw new Error(book.path + ": " + f.error);
      return hashText(n.text.slice(f.table.from, f.table.to)).then((now) => {
        if (now !== book.hash && !bang) {
          throw new Error("the table in " + book.path + " changed since it was taken ── task_table take! takes it again; task_table put! puts this one over it");
        }
        const edit = TT.putEdit(f, book);
        const done = n.code ? toCode(n.code, TT.asTextEdit(n.text, edit)) : toDisk(n.text, edit);
        return done.then((how) => hashText(edit.insert).then((h) => {
          book.hash = h;
          return writeBook().then(() => {
            tell("task_table ── " + book.name + " put into " + book.path + " " + how, false, n.code ? { kind: "bus", id: n.code.id, name: n.code.name } : null);
            return true;
          });
        }));
      });
    });
  }).catch((e) => { tell("! task_table ── not put: " + ((e && e.message) || e), true); return false; });
}
// into the code_editor that has the note, unsaved (code.edits -> code.edited)
function toCode(code, textEdit) {
  return new Promise((resolve, reject) => {
    const req = "tt-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const off = bus.on("code.edited", (p) => {
      if (!p || p.req !== req) return;
      off(); clearTimeout(tm);
      if (p.ok) resolve("(the code_editor " + code.name + ", unsaved ── :w there)");
      else reject(new Error("the code_editor " + code.name + " did not take it: " + (p.reason || "?") + (p.reason === "unsaved edits" ? " ── :w there first" : "")));
    });
    const tm = setTimeout(() => { off(); reject(new Error("the code_editor " + code.name + " did not answer")); }, 5000);
    bus.post("code.edits", { req, path: book.path, edits: [textEdit] }, { to: code.id });
  });
}
// the file, checked against what was read
function toDisk(text, edit) {
  const out = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  return hashText(text).then((base) => relay("PUT", "/fs/write", { path: book.path }, out, { "x-tezcatl-base": base })).then((r) => {
    if (r.status === 409) throw new Error(book.path + " changed on the disk meanwhile ── W again");
    if (!r.ok) throw failed(r);
    bus.post("fs.changed", { op: "write", paths: [book.path] });
    return "(the file)";
  });
}

// L: w, then the rows shown (this filter, this order: the rank) cut into the task
// list (~work/books/task_list.json, written over -- the agenda shows it)
function cutList() {
  return save().then((ok) => {
    if (!ok) return false;
    const order = grid.getState().order.map((k) => keys.indexOf(k)).filter((i) => i >= 0);
    const c = TL.cut(book, order, cfg);
    if (c.error) throw new Error(c.error);
    return relay("PUT", "/fs/write", { path: TL.PATH }, JSON.stringify(c.list, null, 1) + "\n").then((r) => {
      if (!r.ok) throw failed(r);
      bus.post("fs.changed", { op: "write", paths: [TL.PATH] });
      tell("task_table ── " + c.list.rows.length + " row(s) of " + book.name + " cut into the task list (" + TL.PATH + ", the agenda)");
      return true;
    });
  }).catch((e) => { tell("! task_table ── no task list: " + ((e && e.message) || e), true); return false; });
}

// the book written by another (the task list's changes): read again -- not
// over edits here (w would be refused: take it again, or reopen)
bus.on("fs.changed", (p, meta) => {
  if (!book || !p || !Array.isArray(p.paths) || p.paths.indexOf(TT.bookPath(book.name)) < 0) return;
  if (meta && meta.from && T.bus.self && meta.from.id === T.bus.self.id) return;
  if (dirty) { say("! the book was changed by another (the task list) ── w would be refused: task_table take! or reopen this table", true); return; }
  readBook(book.name).then((b) => {
    if (!b) return;
    book = b;
    freshKeys();
    show();
    say("read the book again (changed by the task list)");
  }).catch((e) => say("! " + ((e && e.message) || e), true));
});

// -- keys -------------------------------------------------------------------------------
let pendingD = false;
gridEl.addEventListener("keydown", (e) => {
  if (!book || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  const ours = { i: () => startEdit(), Enter: () => startEdit(), o: () => addRow(false), O: () => addRow(true), J: () => moveRow(1), K: () => moveRow(-1), w: () => save(), W: () => put(false), L: () => cutList() };
  if (k === "d") {
    e.preventDefault();
    if (pendingD) { pendingD = false; deleteRow(); } else { pendingD = true; say("d again deletes the row"); setTimeout(() => { pendingD = false; }, 1500); }
    return;
  }
  pendingD = false;
  if (ours[k] && !(grid.getState().filterPrompt)) { e.preventDefault(); ours[k](); return; }
  const n = T.keymap.normalize(e);
  if (n && grid.handleKey(n)) { e.preventDefault(); grid.render(); }
});

// task_table.do {op: save | put | list, bang} (to this one; a skin's `task_table save` / `put[!]` / `list`)
bus.onMine("task_table.do", (p) => {
  if (!book) { tell("! task_table ── no table here", true); return; }
  if (p && p.op === "put") put(!!p.bang); else if (p && p.op === "list") cutList(); else save();
});

// -- start ------------------------------------------------------------------------------
fetch(T.config.sibling("tasks/task_table.json"), { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null)
  .then((c) => { cfg = TT.settings(c); })
  .then(() => {
    if (!notePath || !tableName) throw new Error("no table ── task_table take <path> <name> in a skin, or ?path=&table=");
    // read even when taken again: its hash is what writing over it is checked with
    return readBook(tableName).then((b) => {
      if (b && b.path === notePath && !fresh) { book = b; return "read the book " + TT.bookPath(tableName); }
      if (b && !fresh) throw new Error("the book " + TT.bookPath(tableName) + " is of " + b.path + ", not " + notePath + " ── task_table take! " + notePath + " " + tableName + " takes this one over it");
      return take().then((t) => { book = t; return writeBook().then(() => "took " + tableName + " from " + notePath + " (" + book.rows.length + " rows) into " + TT.bookPath(tableName)); });
    });
  })
  .then((what) => { freshKeys(); show(); gridEl.focus(); tell("task_table ── " + what); })
  .catch((e) => {
    gridEl.textContent = "";
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = (e && e.message) || String(e);
    gridEl.appendChild(d);
    tell("! task_table ── " + ((e && e.message) || e), true);
  });
