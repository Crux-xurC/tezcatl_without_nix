// lib/task/run-table-page.js -- the page script of the run_table panel
// (panels/resident/run_table.html; D-run-table). A book of lines, sent one by
// one to their input (a destination of input_target), the smallest id whose
// status is empty first; the status says what came of each.
//   ?template=&book=   the template (a name of tasks/run/, or the path of a book
//                      saved with run save) and the book's name (the template's
//                      when not given). Its book (~work/books/run/<book>.json) is
//                      read when there is one made from that template; &fresh=1
//                      makes it again
//   ?intent=&args=     run from: the book made from the answer of the intent (asked
//                      through the input panel: intent.run -> intent.ran, with the
//                      intent's result.book -- the template, and the column each
//                      item's value goes to; lib/vent/decode-table.js bookRows). Its
//                      book is read when there is one of that intent; &fresh=1 asks again
//   the grid           lib/xipe/matrix-grid.js as it is: hjkl, v, sort, / filter
//   i / Enter          a cell; o a row (the defaults, the next id); d d a row;
//                      x a row's status and note emptied (it goes again), - a
//                      row left out (status `-`)
//   R / S              run start / run stop (every empty status `stop`)
//   run insert-if      a row's line to tezcatl: when the row above it has a status,
//                      a copy of another row just under it (the frame asks which
//                      run_table is going: run_table.ask)
// Every change is written to the book at once.
//
// A row going: its line with the variables in (lib/task/run-table.js expand)
// is read as the input form reads a line (lib/core/lead.js), sent as lead.send
// {id, events, target: <input>} to the input_target of this skin, and marked
// `sent`. Then, for its wait, the output of that destination is watched (from
// just before the keys go: tezcatl answers before lead.sent comes back): the
// frame's own lines (recv.out) for tezcatl, what the terminal prints
// (terminal.data) for an xterm -- a line beginning with a key's prefix
// (tasks/run_keys.json, then the template's keys) is that key's status, the
// line its note. No key in the wait: `done`. Other destinations (emacs-vent,
// code_editor) are not watched yet: `done` when the wait goes by.
// What happens to each row is also said as run.mark {book, id, what: send | sent
// | not-sent | status, ...} -- an output_log recording keeps it (D-run-table, stage 4).
import { hashText } from "../code/code-editor/relay.js";

const T = window.Tezcatl;
const bus = T.bus;
const RT = T.runTable;
const params = new URLSearchParams(location.search);
const NAME = params.get("name") || "run_table";
const templateArg = (params.get("template") || "").trim() || null;
const intentArg = (params.get("intent") || "").trim() || null;
const intentArgs = (() => { try { return JSON.parse(params.get("args") || "{}") || {}; } catch (_) { return {}; } })();
const ANSWER_MS = 6000;
const fresh = params.get("fresh") === "1";
const gridEl = document.getElementById("grid-wrap");
const footEl = document.getElementById("foot");
const HINT = footEl.textContent;
const editEl = document.getElementById("edit");
const editLabel = document.getElementById("edit-label");
const editInput = document.getElementById("edit-input");
const stateEl = document.getElementById("state");
T.panelFrame.init({ role: "run_table", name: NAME });
if (T.panelFrame.setFocusTarget) T.panelFrame.setFocusTarget(gridEl);

const SENT_MS = 3000;     // how long input_target has to answer lead.sent
let cfg = RT.settings(null, null);
let globalKeys = null;
let leadTable = T.lead.DEFAULTS;
let book = null;
let bookBase = "absent";
let keys = [];
let seq = 0;
let editing = null;
let running = false;
let going = null;         // the row going now: {index, watch: {off()}}

function say(text, err) { footEl.textContent = text || HINT; footEl.className = err ? "err" : ""; }
function tell(text, err) { say(text, err); bus.post("recv.say", { text, cls: err ? "err" : null }); }
function showState() {
  stateEl.textContent = running ? (going ? "▶ #" + RT.cell(book, book.rows[going.index], "id") : "▶") : "";
}

const baseP = T.config.load().then((c) => {
  const k = (c && c.ui && c.ui.keys) || {};
  leadTable = T.lead.configure({ lead: k.lead, fnRow: k.fnRow, bindings: k.leadBindings }).table;
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
function pageJson(path) {
  return fetch(T.config.sibling(path), { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(path + ": HTTP " + r.status);
    return r.json();
  });
}

// -- the book -----------------------------------------------------------------------
function readBook(name) {
  return relay("GET", "/fs/read", { path: RT.bookPath(name) }).then((r) => {
    if (r.status === 404) return null;
    if (!r.ok) throw failed(r);
    let b = null;
    try { b = JSON.parse(r.text); } catch (_) { throw new Error(RT.bookPath(name) + " is not JSON ── run new! makes it again"); }
    return hashText(r.text).then((h) => { bookBase = h; return b; });
  });
}
// writes one after another (a status written while the last is on its way waits for it)
let writing = Promise.resolve();
function writeBook() {
  writing = writing.then(() => {
    const text = JSON.stringify(RT.toJson(book), null, 1) + "\n";
    return relay("PUT", "/fs/write", { path: RT.bookPath(book.name) }, text, { "x-tezcatl-base": bookBase }).then((r) => {
      if (r.status === 409) throw new Error("the book " + RT.bookPath(book.name) + " changed meanwhile (another run_table?) ── run new! makes it again");
      if (!r.ok) throw failed(r);
      return hashText(text).then((h) => { bookBase = h; });
    });
  }).catch((e) => { tell("! run ── the book not written: " + ((e && e.message) || e), true); });
  return writing;
}
function readTemplate(arg) {
  const t = RT.templatePath(arg);
  if (t.from === "page") return pageJson(t.path);
  return relay("GET", "/fs/read", { path: t.path }).then((r) => {
    if (!r.ok) throw failed(r);
    try { return JSON.parse(r.text); } catch (_) { throw new Error(t.path + " is not JSON"); }
  });
}

// -- the grid -----------------------------------------------------------------------
const grid = T.matrixGrid.create({ el: gridEl, bus });
function show() {
  document.getElementById("name").textContent = book ? book.name : "";
  document.getElementById("from").textContent = !book ? "" : book.intent ? "from the answer of " + book.intent + " (" + book.template + ")" : book.template ? "from " + book.template : "";
  grid.setColumns(book.columns.map((label, i) => ({ key: "c" + i, label })));
  grid.setRows(book.rows.map((r, i) => ({ id: keys[i], cells: Object.fromEntries(r.map((v, ci) => ["c" + ci, v])) })));
  grid.render();
  showState();
}
function freshKeys() { keys = book.rows.map(() => "r" + (++seq)); }
function patch(bi) {
  grid.patchRow(keys[bi], Object.fromEntries(book.rows[bi].map((v, ci) => ["c" + ci, v])));
  grid.render();
}
function here() {
  const g = grid.getState();
  if (g.cursor.rowIndex == null) return null;
  const bi = keys.indexOf(g.order[g.cursor.rowIndex]);
  return bi < 0 ? null : { bi, ci: g.cursor.col };
}
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
  if (going && going.index === h.bi) { say("this row is going ── wait for its status", true); return; }
  editing = h;
  editLabel.textContent = book.columns[h.ci] + ":";
  editInput.value = book.rows[h.bi][h.ci];
  editEl.hidden = false;
  editInput.focus();
}
function endEdit(commit) {
  if (editing && commit && book.rows[editing.bi]) {
    const v = RT.oneLine(editInput.value);
    if (v !== book.rows[editing.bi][editing.ci]) {
      book.rows[editing.bi][editing.ci] = v;
      patch(editing.bi);
      writeBook();
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
function addRow() {
  book.rows.push(RT.blankRow(book));
  keys.push("r" + (++seq));
  show();
  cursorTo(book.rows.length - 1);
  writeBook();
  say("#" + book.rows[book.rows.length - 1][0] + " added ── i to write its line");
}
function deleteRow() {
  const h = here();
  if (!h) return;
  if (going && going.index === h.bi) { say("this row is going ── wait for its status", true); return; }
  if (going && going.index > h.bi) going.index--;
  const id = book.rows[h.bi][0];
  book.rows.splice(h.bi, 1);
  grid.removeRow(keys[h.bi]);
  keys.splice(h.bi, 1);
  grid.render();
  writeBook();
  say("deleted #" + id);
}
// -: a row left out (its status `-`: filled, so it is not sent); x takes it back
function leaveOut() {
  const h = here();
  if (!h) return;
  if (going && going.index === h.bi) { say("this row is going ── wait for its status", true); return; }
  RT.mark(book, h.bi, "-", "");
  patch(h.bi);
  writeBook();
  say("#" + book.rows[h.bi][0] + " left out (x takes it back)");
}
function clearRow() {
  const h = here();
  if (!h) return;
  if (going && going.index === h.bi) { say("this row is going ── wait for its status", true); return; }
  RT.mark(book, h.bi, "", "");
  patch(h.bi);
  writeBook();
  say("#" + book.rows[h.bi][0] + " goes again" + (running ? "" : " (R)"));
}

// -- going ----------------------------------------------------------------------------
function inputTarget() {
  const sib = T.skinPort.siblings(window) || [];
  const t = sib.find((x) => x.role === "input_target");
  if (t) return t.id;
  const port = T.skinPort.of(window);
  return port && typeof port.dockTarget === "function" ? port.dockTarget() : null;
}
// lead.send, and its answer -> {ok, error, dest, key}
const waiting = {};
bus.onMine("lead.sent", (p) => {
  const w = p && waiting[p.id];
  if (!w) return;
  delete waiting[p.id];
  clearTimeout(w.timer);
  w.resolve(p);
});
function sendKeys(to, events, target) {
  return new Promise((resolve) => {
    const id = "run-" + Date.now().toString(36) + (++seq);
    waiting[id] = { resolve, timer: setTimeout(() => { delete waiting[id]; resolve({ ok: false, error: "no answer from input_target" }); }, SENT_MS) };
    bus.post("lead.send", target ? { id, events, target } : { id, events }, { to });
  });
}

// the output, from before the keys go (tezcatl answers before lead.sent does):
// the frame's own lines (recv.out) and what each terminal prints (terminal.data),
// kept until the answer says which destination it was -> {only(dest, key, hit), last(), off()}
function watch() {
  const skin = T.skinPort.id(window);
  const kept = [];          // [{dest, key, line}] until only()
  let want = null;          // {dest, key, hit}
  const terms = {};         // xterm panel id -> {text, dec}
  function got(dest, key, line) {
    if (!want) { kept.push({ dest, key, line }); return; }
    if (want.dest === dest && (dest !== "xterm" || want.key === key)) want.hit(line);
  }
  const offs = [
    bus.on("recv.out", (p, meta) => {
      if (!meta || !meta.from || meta.from.id !== skin || !p) return;
      got("tezcatl", null, String(p.text));
    }),
    bus.on("terminal.data", (p, meta) => {
      const id = meta && meta.from && meta.from.id;
      if (!id || !p || !p.bytes) return;
      const t = terms[id] || (terms[id] = { text: T.termText.create(50), dec: new TextDecoder("utf-8") });
      t.text.write(t.dec.decode(p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes), { stream: true }));
      t.text.take().forEach((line) => got("xterm", id, line));
    }),
  ];
  return {
    only(dest, key, hit) {
      want = { dest, key, hit };
      kept.splice(0).forEach((k) => got(k.dest, k.key, k.line));
    },
    // at the end of the wait, the line a terminal is still printing is looked at too (a prompt)
    last() {
      if (!want || want.dest !== "xterm" || !terms[want.key]) return;
      const r = terms[want.key].text.rest();
      if (r) want.hit(r);
    },
    off() { offs.forEach((f) => f()); },
  };
}

// what happens to a row, said for an output_log that is recording (run.mark: its `run` lines)
function markRow(index, what, more) {
  bus.post("run.mark", Object.assign({ book: book.name, id: RT.cell(book, book.rows[index], "id"), what }, more || {}));
}
function finish(index, status, note) {
  if (status !== "sent") markRow(index, "status", { status, note: note || "" });
  RT.mark(book, index, status, note);
  patch(index);
  return writeBook();
}

function step() {
  if (!running || !book) return;
  const n = RT.next(book);
  if (!n) {
    running = false;
    going = null;
    showState();
    tell("run ── " + book.name + ": no row with an empty status left");
    return;
  }
  const row = book.rows[n.index];
  const id = RT.cell(book, row, "id");
  if (n.skip) { finish(n.index, "skip", "auto F: #" + n.because + " failed").then(step); return; }
  // index follows the row (d d above it); dest once lead.sent says; end once it can end;
  // preset: an end asked for before then (run insert-if, answered before lead.sent)
  going = { index: n.index, watch: null, dest: null, end: null, preset: null };
  const g = going;
  showState();
  const fail = (why) => finish(g.index, "send-failed", why).then(() => { going = null; step(); });
  const x = RT.expand(book, n.index, (v) => T.lead.escape(v, leadTable));
  if (x.error) { fail(x.error); return; }
  const w = RT.waitOf(book, n.index, cfg.wait);
  if (w.error) { fail(w.error); return; }
  const parsed = T.lead.parse(x.text, leadTable);
  if (parsed.error) { fail("the line cannot be read: " + parsed.error); return; }
  if (!parsed.events.length) { fail("nothing to send"); return; }
  const to = inputTarget();
  if (!to) { fail("no input_target in this skin"); return; }
  const input = RT.cell(book, row, "input");
  let watcher = null;
  finish(g.index, "sent", "").then(() => {
    tell("▶ run " + book.name + " #" + id + " → " + (input || "(input_target's choice)"));
    watcher = watch();
    going.watch = watcher;
    markRow(g.index, "send", { input: input || "-", line: x.text });
    return sendKeys(to, parsed.events, input);
  }).then((r) => {
    if (!r.ok) { markRow(g.index, "not-sent", { error: r.error || "not sent" }); watcher.off(); fail(r.error || "not sent"); return; }
    g.dest = r.dest;
    markRow(g.index, "sent", { dest: r.dest, key: r.key });
    let done = false;
    let timer = null;
    const end = (status, note) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      watcher.off();
      finish(g.index, status, note).then(() => { going = null; step(); });
    };
    g.end = end;
    timer = setTimeout(() => { watcher.last(); end("done", ""); }, w.sec * 1000);
    watcher.only(r.dest, r.key, (line) => {
      const m = RT.match(cfg.keys, line);
      if (m) end(m.key, line);
    });
    if (g.preset) end(g.preset[0], g.preset[1]);
  });
}

function start() {
  if (!book) { tell("! run ── no book here", true); return; }
  if (running) { say("running already ── S stops it"); return; }
  if (!RT.next(book)) { tell("run ── " + book.name + ": no row with an empty status (x on a row empties it)"); return; }
  running = true;
  tell("run ── " + book.name + " started");
  step();
}
function stop() {
  if (!book) return;
  const n = RT.stopAll(book);
  show();
  writeBook();
  tell("run ── " + book.name + ": stop in " + n + " row(s)" + (going ? " (the row going ends with its wait)" : ""));
  if (!going) { running = false; showState(); }
}

// run save[!] <path>: the book as a file of the FS root (a template for run new)
function saveAs(path, bang) {
  if (!book) { tell("! run ── no book here", true); return; }
  const text = JSON.stringify(RT.toJson(book), null, 1) + "\n";
  relay("PUT", "/fs/write", { path }, text, bang ? {} : { "x-tezcatl-base": "absent" }).then((r) => {
    if (r.status === 409) throw new Error(path + " is there ── run save! " + path + " writes over it");
    if (!r.ok) throw failed(r);
    bus.post("fs.changed", { op: "write", paths: [path] });
    tell("run ── " + book.name + " saved to " + path + " (run new " + path + " makes a book of it)");
  }).catch((e) => tell("! run ── not saved: " + ((e && e.message) || e), true));
}

// -- keys -------------------------------------------------------------------------------
let pendingD = false;
gridEl.addEventListener("keydown", (e) => {
  if (!book || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  const ours = { i: startEdit, Enter: startEdit, o: addRow, x: clearRow, "-": leaveOut, R: start, S: stop };
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

// run insert-if, from the frame: is a row going now that tezcatl may be running
// (run_table.ask -> run_table.going)? Then the copy put under it (run_table.do
// insert-if -> run_table.inserted), and the row going ends at once: done, with what
// came of it -- the runner knows, nothing is read from the output
bus.onMine("run_table.ask", (p, meta) => {
  const yes = !!(book && going && (going.dest == null || going.dest === "tezcatl"));
  bus.post("run_table.going", { req: p && p.req, going: yes, row: yes ? RT.cell(book, book.rows[going.index], "id") : null, book: book ? book.name : null }, { to: meta.from.id });
});
function insertIf(p, from) {
  const reply = (r) => bus.post("run_table.inserted", Object.assign({ req: p.req }, r), { to: from });
  if (!book || !going) { reply({ ok: false, error: "no row of this run_table is going" }); return; }
  const r = RT.insertIf(book, going.index, String(p.status || ""), String(p.from || ""));
  if (r.error) { reply({ ok: false, error: r.error }); return; }
  if (r.inserted) {
    keys.splice(r.at, 0, "r" + (++seq));
    show();
    writeBook();
  }
  reply({ ok: true, note: r.note });
  if (going.end) going.end("done", r.note); else going.preset = ["done", r.note];
}

// run_table.do {op: start | stop | save, path, bang} (to this one; a skin's `run start` / `stop` / `save`)
bus.onMine("run_table.do", (p, meta) => {
  if (!book) { tell("! run ── no book here", true); return; }
  if (p && p.op === "start") start();
  else if (p && p.op === "stop") stop();
  else if (p && p.op === "save" && p.path) saveAs(p.path, !!p.bang);
  else if (p && p.op === "insert-if") insertIf(p, meta.from.id);
});

// -- start ------------------------------------------------------------------------------
// run new <template>: the book of that template, or a new one
function fromTemplateArg() {
  if (!templateArg) throw new Error("no template ── run new <template> in a skin, or ?template=");
  return readTemplate(templateArg).then((tpl) => {
    const name = (params.get("book") || "").trim() || RT.templatePath(templateArg).path.replace(/^.*\//, "").replace(/\.json$/, "");
    return readBook(name).then((b) => {
      if (b && b.template === templateArg && !b.intent && !fresh) return readIt(b, name);
      if (b && !fresh) throw new Error("the book " + RT.bookPath(name) + " is of " + (b.intent ? "the intent " + b.intent : b.template || "?") + ", not " + templateArg + " ── run new! " + templateArg + " " + name + " makes it again");
      const f = RT.fromTemplate(tpl, name, templateArg);
      if (f.error) throw new Error(templateArg + ": " + f.error);
      book = f.book;
      return writeBook().then(() => ({ what: "made " + RT.bookPath(name) + " from " + templateArg + " (" + book.rows.length + " rows)" }));
    });
  });
}
function readIt(b, name) {
  const f = RT.fromTemplate(b, b.name, b.template);
  if (f.error) throw new Error(RT.bookPath(name) + ": " + f.error);
  book = f.book;
  return { what: "read the book " + RT.bookPath(name) };
}
// run from <intent>: the book of that intent, or one made from its answer
function askIntent(id, args) {
  return new Promise((resolve, reject) => {
    const req = "rf-" + Date.now().toString(36) + "-" + (++seq);
    let done = false;
    const off = bus.on("intent.ran", (p) => {
      if (done || !p || p.req !== req) return;
      done = true; off(); offTook(); clearTimeout(timer);
      if (p.ok) resolve(p); else reject(new Error(id + ": " + (p.error || "failed")));
    });
    // a later intent's process started (D-intent-later): no time limit from now
    const offTook = bus.on("intent.took", (p) => { if (!done && p && p.req === req) clearTimeout(timer); });
    bus.post("intent.run", { req, id, args });
    const timer = setTimeout(() => {
      if (done) return;
      done = true; off(); offTook();
      reject(new Error("no answer for " + id + " ── is an input panel open (it runs the intents)?"));
    }, ANSWER_MS);
  });
}
function fromIntent() {
  const name = (params.get("book") || "").trim() || intentArg;
  return readBook(name).then((b) => {
    if (b && b.intent === intentArg && !fresh) return readIt(b, name);
    if (b && !fresh) throw new Error("the book " + RT.bookPath(name) + " is of " + (b.intent ? "the intent " + b.intent : b.template || "?") + ", not the intent " + intentArg + " ── run from! " + intentArg + " " + name + " makes it again");
    return askIntent(intentArg, intentArgs).then((p) => {
      if (!p.book) throw new Error("the intent " + intentArg + " has no result.book (docs/extending/intents.md) ── its answer cannot be made a book");
      const got = T.decodeTable.bookRows(p.book, p.payload);
      if (got.error) throw new Error(intentArg + ": " + got.error);
      return readTemplate(p.book.template).then((tpl) => {
        const f = RT.fromTemplate(tpl, name, p.book.template);
        if (f.error) throw new Error(p.book.template + ": " + f.error);
        book = f.book;
        book.intent = intentArg;
        const a = RT.addAnswer(book, got.rows);
        if (a.error) throw new Error(intentArg + " → " + p.book.template + ": " + a.error);
        return writeBook().then(() => ({ what: "made " + RT.bookPath(name) + " from the answer of " + intentArg + " (" + a.n + " rows, the template " + p.book.template + ")" }));
      });
    });
  });
}


pageJson("tasks/run_keys.json").catch(() => null)
  .then((g) => { globalKeys = g; })
  .then(() => (intentArg ? fromIntent() : fromTemplateArg()))
  .then((r) => {
    cfg = RT.settings(globalKeys, book);
    if (cfg.errors.length) tell("! run ── keys: " + cfg.errors.join("; "), true);
    freshKeys();
    show();
    gridEl.focus();
    tell("run ── " + r.what);
  })
  .catch((e) => {
    gridEl.textContent = "";
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = (e && e.message) || String(e);
    gridEl.appendChild(d);
    tell("! run ── " + ((e && e.message) || e), true);
  });
