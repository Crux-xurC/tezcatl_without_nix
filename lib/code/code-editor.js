import {
  EditorState, Compartment, EditorView, keymap,
  history, historyKeymap, basicSetup, languageExtension, languageKit, oneDark,
  Decoration, vim, Vim, getCM, emacs, indentUnit, Prec,
} from "../vendor/codemirror/cm.bundle.js";
import { mergeKeys, keysOf, bindings, inputLineEx } from "./editor-keys.js";
import { hashText, createRelay } from "./code-editor/relay.js";
import { createLspAttach } from "./code-editor/lsp-attach.js";
import { createLspActions } from "./code-editor/lsp-actions.js";
import { createFileOps } from "./code-editor/file-ops.js";
import { createMirror } from "./code-editor/mirror.js";
import { createJuncture } from "./code-editor/juncture.js";
import { createReplace } from "./code-editor/replace.js";
import { createSyntaxNav } from "./code-editor/syntax-nav.js";

// The CM6 core of every code surface (viewer / editor). Its parts are in
// lib/code/code-editor/: the relay's URLs (relay.js), the
// file through ③ (file-ops.js), the copy (mirror.js), the /lsp client
// (lsp-attach.js) and what is asked of it (lsp-actions.js), the diagnostics,
// definitions and syntax tree (syntax-nav.js). Each is made with `ed` -- this
// editor's view, its state `ed.st` and its helpers -- and they reach one
// another through `ed` when called (ed.mirror.enter(), ed.lsp.attach() ...).

// Tunable defaults. code.json (repo root) overrides these; a code.configure bus
// message overrides them at runtime. Kept small on purpose -- basicSetup() is
// used whole (no per-feature knobs), and indentUnit (spaces-vs-tab, count)
// needs the bundle rebuilt so it rides with the webLSP bundle work, not here.
// tabSize is only the render width of a literal tab.
const CFG_DEFAULTS = {
  tabSize: 2,
  indentUnit: "  ",        // what Tab / auto-indent inserts (indentWithTab stays
                           // baked into basicSetup, so this is the only knob)
  lineWrapping: false,
  keymap: "default",       // "default" | "vim" | "emacs"
  editorKeymap: "vim",     // the file editor's (code_editor, opts.files): code.json
                           // "editorKeymap"; every other pane takes "keymap"
  fontFamily: "monospace",
  fontSize: 13,
  autosave: false,         // false | <debounce ms>
  inputFormEx: "#",        // the ex command to the skin's input form (INPUT_FORM_EX)
  // keys -> tezcatl-commands, per keymap: a key only names a command; what it
  // does is the command's (this code_editor's own code.*, or a panel's).
  // code.json "keys" is merged over lib/code/editor-keys.js DEFAULT_KEYS ("" unmaps)
  keys: null,
  // whether the skin's input line takes ":" lines for this editor: null = only
  // with vim (lib/code/editor-keys.js inputLineEx); told as code.input-line-ex
  inputLineEx: null,
  // the copy of what a file editor edits: how many files keep one
  // (the oldest pushed out), and how long editing rests before it is written
  mirror: { slots: 10, idleMs: 2000 },
  // the clones (a second code_editor on a file another has open) the
  // relay keeps in the work place: the oldest go beyond this
  clone: { slots: 10 },
  // the junctures (D-juncture): files in the relay's index, points in a
  // file's tree -- past them the relay pushes the oldest out (1-100)
  juncture: { files: 10, slots: 20 },
  // how long a request to the language server waits for its answer.
  // One asked by the person (:LspDef, :LspRefs, :LspRename, :LspFormat, K)
  // that runs out is asked again with the wait doubled, up to maxTimeoutMs --
  // the raised wait stays for that connection (the server is slow: a first
  // build, a large project).
  lsp: { timeoutMs: 3000, maxTimeoutMs: 60000 },
};

// The file commands of a vim editor (lib/code/code-files.js):
// :w[!] :e[!] [<path>] :Delete[!] :Rename <name> :Move <path>. Vim's ex
// commands are one table for the page, so they are defined once here and
// find their editor by the `cm` they are called with.
const fileEditors = new Set();   // {view, ex: {write, edit, Delete, Rename, Move, Mirror, Replay, Reconnect}}
// :Scratch -- this text over ~work/scratch
// :Replace <mark> <list> -- the marks in the text replaced with ids (:w replace <mark> <list> saves after)
// :Mirror :Replay :Reconnect -- the copy
// :LspDef :LspRefs :LspRename <name> :LspFormat -- the language server
const FILE_EX = [["write", "w"], ["edit", "e"], ["Delete", "Delete"], ["Rename", "Rename"], ["Move", "Move"], ["Scratch", "Scratch"], ["Replace", "Replace"],
  ["Mirror", "Mirror"], ["Replay", "Replay"], ["Reconnect", "Reconnect"],
  ["LspDef", "LspDef"], ["LspRefs", "LspRefs"], ["LspRename", "LspRename"], ["LspFormat", "LspFormat"]];

// code.file's `op` (and a code.* command's, lib/skin/skin-ex.js COMMANDS) -> the
// fileEx entry that does it
const OP_EX = {
  write: "write", edit: "edit", delete: "Delete", rename: "Rename", move: "Move", scratch: "Scratch", replace: "Replace",
  // check update (a skin's input form): no ex command of its own
  check: "Check",
  mirror: "Mirror", replay: "Replay", reconnect: "Reconnect",
  "lsp-definition": "LspDef", "lsp-references": "LspRefs", "lsp-rename": "LspRename", "lsp-format": "LspFormat",
  "lsp-hover": "LspHover", "diag-next": "DiagNext", "diag-prev": "DiagPrev", "def-next": "DefNext", "def-prev": "DefPrev",
  "node-select": "NodeSelect", "node-parent": "NodeParent", "node-next": "NodeNext", "node-prev": "NodePrev",
};

// The ex command that moves to the skin's input form, where Vim's ways go on
// (lib/skin/skin-ex.js). One symbol, chosen in code.json
// "inputFormEx" (default "#": `:#`, `:# <text>`) -- people want `:!` or `:@`.
// Only the symbols codemirror-vim reads as a command name; `*` is a line
// range there (as in Vim).
const INPUT_FORM_EX = ["!", "#", "&", "<", "=", ">", "@", "~"];
const inputFormExDefined = new Set();
function defineInputFormEx(key) {
  if (inputFormExDefined.has(key)) return;
  inputFormExDefined.add(key);
  Vim.defineEx(key, key, (cm, params) => {
    const files = window.Tezcatl && window.Tezcatl.codeFiles;
    for (const ed of fileEditors) {
      if (getCM(ed.view) === cm) {
        const a = files ? files.exArgs(params && params.argString) : { bang: false, arg: "" };
        ed.inputForm(key, a.arg);
        return;
      }
    }
  });
}
let fileExDefined = false;
function defineFileEx() {
  if (fileExDefined) return;
  fileExDefined = true;
  FILE_EX.forEach(([name, prefix]) => {
    Vim.defineEx(name, prefix, (cm, params) => {
      const files = window.Tezcatl && window.Tezcatl.codeFiles;
      for (const ed of fileEditors) {
        if (getCM(ed.view) === cm) {
          const a = files ? files.exArgs(params && params.argString) : { bang: false, arg: "" };
          ed.ex[name](a);
          return;
        }
      }
    });
  });
}

// vim normal-mode keys -> tezcatl-commands (cfg.keys). Vim's maps are one
// table for the page, like the ex commands: mapped once per key, and the
// action finds its editor by `cm`. Read when code.json is (a change of the
// keys needs the page read again).
const keyMapped = new Map();   // key -> command
function defineKeys(keys) {
  Object.keys(keys || {}).forEach((key) => {
    const cmd = keys[key];
    if (typeof cmd !== "string" || !cmd || keyMapped.get(key) === cmd) return;
    const action = "tz:" + cmd;
    Vim.defineAction(action, (cm) => {
      for (const ed of fileEditors) {
        if (getCM(ed.view) === cm) { ed.command(cmd); return; }
      }
    });
    Vim.mapCommand(key, "action", action, {}, { context: "normal" });
    keyMapped.set(key, cmd);
  });
}

export function createCodeEditor(opts) {
  opts = opts || {};
  const T = window.Tezcatl || {};
  const bus = T.bus || null;
  const params = new URLSearchParams(location.search);
  const NAME = params.get("name") || opts.name || "code";
  const editable = opts.editable !== false;
  // focusable: a read-only text that still takes the keyboard (vim's moves and
  // search; the outline, lsp_log) -- the state is read-only, the view is not
  // made non-editable (that would keep the focus and the keys out)
  const focusable = editable || opts.focusable === true;
  const surface = opts.surface || "code";
  const parent = opts.parent || document.getElementById("editor");
  const head = opts.head || {};

  const langComp = new Compartment();
  const roComp = new Compartment();
  const editComp = new Compartment();
  const histComp = new Compartment();
  const markComp = new Compartment();
  const cfgComp = new Compartment();
  const keymapComp = new Compartment();
  const keysComp = new Compartment();   // the keys of code.json for a keymap other than vim
  const lspComp = new Compartment();
  const freshHistory = () => [history(), keymap.of(historyKeymap)];

  const marksById = new Map();
  const grammarCache = new Map();   // plugin URL -> Promise<Extension>

  // The editor's state, shared with its parts (lib/code/code-editor/*.js).
  const st = {
    baseline: "",
    baselinePath: null,
    // what the file on disk is believed to be: Promise<"sha256:..." | "absent" | null>
    // (null = unknown, save unchecked). Set when a file is opened or saved.
    diskBaseP: null,
    // the file's line ending, given back on save (lib/code/code-files.js eolOf);
    // eolMixed: it had more than one, and saving makes them one
    eol: "\n",
    eolMixed: false,
    dirty: false,
    readOnly: !editable,
    langId: null,
    // the /lsp client (lib/code-editor/lsp-attach.js)
    lspClient: null,
    lspUri: null,
    lspAttachedPath: null,
    lspServer: null,   // {key, serverId} of the server attached
  };
  let langHint = null;   // the last applyLang hint, re-applied when code.json's languages arrive
  let langSeq = 0;       // drops a grammar plugin that loads after the language changed again
  let settingDoc = false;
  let autosaveTimer = null;

  // Config: opts > ?keymap= pin the keymap; code.json fills the rest and, if the
  // keymap is not pinned, the keymap too -- a file editor's from "editorKeymap"
  // (D-code-editor), the other panes' from "keymap".
  const cfg = Object.assign({}, CFG_DEFAULTS);
  const keymapField = editable && opts.files === true ? "editorKeymap" : "keymap";
  cfg.keymap = CFG_DEFAULTS[keymapField];
  let keymapPinned = false;
  if (opts.keymap) { cfg.keymap = opts.keymap; keymapPinned = true; }
  else if (params.get("keymap")) { cfg.keymap = params.get("keymap"); keymapPinned = true; }

  // Per-keymap adapter: the one place a keymap's quirks live. `default` is
  // trivial; `vim` carries the modal extension + the vim-register <-> Tezcatl
  // kill-ring bridges.
  // Each one also maps code.json's keys (bindKeys: vim's own maps, or a
  // CodeMirror keymap above the keymap's own) and says its mode (mode,
  // watchMode: vim's NORMAL / INSERT ..., null for the others).
  function keymapAdapter(id) {
    if (id === "vim") {
      return {
        extensions: [vim({ status: true })],
        bindKeys(table) { defineKeys(table); return []; },
        mode: vimMode,
        watchMode: watchVimMode,
        yankExternal(text) {
          try {
            Vim.getRegisterController().getRegister('"').setText(text, /\n$/.test(text));
            Vim.handleKey(getCM(view), "p");
          } catch (_) {
            view.dispatch(view.state.replaceSelection(text));
          }
        },
        pollLocalYank(emit) {
          let last = "";
          return function () {
            try {
              const t = Vim.getRegisterController().getRegister('"').toString();
              if (t && t !== last) { last = t; emit(t); }
            } catch (_) {}
          };
        },
      };
    }
    if (id === "emacs") {
      // emacs bindings + its own kill ring. Bridging that ring to Tezcatl's is
      // a later nicety -- for now external yank is a plain insert and the
      // `copy` DOM listener still feeds the ring.
      return {
        extensions: [emacs()],
        bindKeys: cmKeys,
        mode() { return null; },
        watchMode() {},
        yankExternal(text) { view.dispatch(view.state.replaceSelection(text)); },
        pollLocalYank() { return function () {}; },
      };
    }
    return {
      extensions: [],
      bindKeys: cmKeys,
      mode() { return null; },
      watchMode() {},
      yankExternal(text) { view.dispatch(view.state.replaceSelection(text)); },
      pollLocalYank() { return function () {}; },
    };
  }
  // a keymap other than vim: its keys as a CodeMirror keymap, above the
  // keymap's own (so "M-x" is tezcatl's, not codemirror-emacs')
  function cmKeys(table) {
    const b = bindings(table);
    if (b.bad.length) flash("! keys in code.json that cannot be read: " + b.bad.join(", "), true);
    return [Prec.highest(keymap.of(b.bindings.map((x) => ({
      key: x.key, preventDefault: true, run: () => { runCommand(x.command); return true; },
    }))))];
  }
  let adapter = keymapAdapter(cfg.keymap);
  let localYankPoll = adapter.pollLocalYank(emitLocalYank);
  function emitLocalYank(t) {
    if (bus) bus.post("killring.add", { text: t, source: NAME });
  }

  function cfgExtensions() {
    return [
      EditorState.tabSize.of(cfg.tabSize),
      indentUnit.of(typeof cfg.indentUnit === "string" ? cfg.indentUnit : "  "),
      cfg.lineWrapping ? EditorView.lineWrapping : [],
      EditorView.theme({
        "&": { fontSize: (cfg.fontSize || 13) + "px" },
        ".cm-content": { fontFamily: cfg.fontFamily || "monospace" },
        ".cm-gutters": { fontFamily: cfg.fontFamily || "monospace" },
      }),
    ];
  }

  // Dictionary completion: the words a skin forwards from its own
  // dict pane (dict.words, lib/skin/skin-dict.js) are offered for the non-space
  // run before the cursor. basicSetup's autocompletion() collects every
  // languageData "autocomplete" source, so this sits beside LSP's own.
  let dictWords = [];
  function dictSource(ctx) {
    if (!dictWords.length) return null;
    const w = ctx.matchBefore(/[^\s]+/);
    if (!w && !ctx.explicit) return null;
    return {
      from: w ? w.from : ctx.pos,
      options: dictWords.map((e) => ({ label: e.word, detail: e.note || undefined, type: "keyword" })),
      validFor: /^[^\s]*$/,
    };
  }

  const extra = [].concat(opts.extraExtensions || []);
  if (bus) extra.push(EditorState.languageData.of(() => [{ autocomplete: dictSource }]));
  // No save key: saving is :w (and autosave). Mod-s was removed 2026-10-25
  // (crux: not wanted).

  const view = new EditorView({
    parent: parent,
    doc: "",
    extensions: [
      keymapComp.of(adapter.extensions),
      keysComp.of([]),
      ...extra,
      histComp.of(freshHistory()),
      basicSetup(),
      langComp.of([]),
      roComp.of(EditorState.readOnly.of(st.readOnly)),
      editComp.of(EditorView.editable.of(focusable)),
      markComp.of([]),
      lspComp.of([]),
      oneDark,
      cfgComp.of(cfgExtensions()),
      EditorView.updateListener.of(onUpdate),
    ],
  });

  // this editor, as its parts (lib/code/code-editor/*.js) see it
  const ed = {
    T, bus, NAME, opts, editable, head, view, cfg, st,
    comp: { lsp: lspComp },
    relay: createRelay(T),
    flash, note, setDirty, setDoc, applyLang, mixedNote, codeFiles,
    cancelAutosave() { if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; } },
  };
  ed.lsp = createLspAttach(ed);
  ed.files = createFileOps(ed);
  ed.mirror = createMirror(ed);
  ed.juncture = createJuncture(ed);
  ed.replace = createReplace(ed);
  ed.actions = createLspActions(ed);
  ed.nav = createSyntaxNav(ed);

  let curScheduled = false;

  function onUpdate(u) {
    if (u.docChanged && !settingDoc) {
      const nd = view.state.doc.toString() !== st.baseline;
      if (nd !== st.dirty) setDirty(nd);
      maybeAutosave();
      ed.mirror.maybe();
    }
    if (u.docChanged || u.selectionSet || u.focusChanged) {
      if (!curScheduled) {
        curScheduled = true;
        requestAnimationFrame(() => { curScheduled = false; reportCursor(); });
      }
    }
    localYankPoll();
    if (typeof opts.onUpdate === "function") {
      try { opts.onUpdate(u, view); } catch (e) {
        try { console.error("code-editor onUpdate threw", e); } catch (_) {}
      }
    }
  }

  function setDirty(d) {
    st.dirty = d;
    if (head.dirty) head.dirty.hidden = !d;
    if (bus) bus.post("code.dirty", { name: NAME, dirty: d });
  }

  // :# [text] (code.json inputFormEx) -- to the skin's input form (with `text` typed in). The skin
  // answers cmd.focused; with no skin around there is no input form.
  function toInputForm(text) {
    if (!bus) { flash("! there is no input form next to this", true); return; }
    let answered = false;
    const off = bus.on("cmd.focused", (p) => { if (p && p.for === NAME) answered = true; });
    bus.post("cmd.focus", { name: NAME, text: text || "" });
    setTimeout(() => {
      off();
      if (!answered) flash("! there is no input form next to this (use it inside a skin that has one)", true);
    }, 400);
  }

  const files = T.codeFiles || null;
  const fileEx = {
    // :w [replace <mark> <list>] (lib/code/code-editor/replace.js)
    write(a) { ed.replace.write(a.arg, a.bang, a.req); },
    Replace(a) { ed.replace.run(a.arg); },
    edit(a) {
      if (!a.arg) {
        if (!st.baselinePath) { flash("! no file to open (:e <path>)", true); return; }
        ed.files.openPath(st.baselinePath, a.bang);
        return;
      }
      const r = files ? files.resolve(st.baselinePath, a.arg) : { path: a.arg };
      if (r.error) { flash("! " + r.error, true); return; }
      ed.files.openPath(r.path, a.bang);
    },
    Delete(a) { ed.files.deleteFile(a.bang); },
    Scratch() { ed.files.scratch(); },
    Check(a) { ed.files.checkDisk(a.req); },
    Mirror() { ed.mirror.write(); },
    Replay() { ed.mirror.replay(false); },
    Reconnect() { ed.mirror.reconnect(); },
    LspDef() { ed.actions.definition(); },
    LspRefs() { ed.actions.references(); },
    LspRename(a) { ed.actions.rename(a.arg); },
    LspFormat() { ed.actions.format(); },
    LspHover() { ed.actions.hover(); },
    DiagNext() { ed.nav.diagMove(1); },
    DiagPrev() { ed.nav.diagMove(-1); },
    DefNext() { ed.nav.defMove(1); },
    DefPrev() { ed.nav.defMove(-1); },
    NodeSelect() { ed.nav.nodeSelect(); },
    NodeParent() { ed.nav.nodeMove("parent"); },
    NodeNext() { ed.nav.nodeMove("next"); },
    NodePrev() { ed.nav.nodeMove("prev"); },
    Rename(a) {
      const r = files ? files.sibling(st.baselinePath, a.arg) : { error: "lib/code/code-files.js is missing" };
      if (r.error) { flash("! " + r.error, true); return; }
      ed.files.moveFile(r.path);
    },
    Move(a) {
      const r = files ? files.resolve(st.baselinePath, a.arg) : { path: a.arg };
      if (r.error) { flash("! " + r.error, true); return; }
      ed.files.moveFile(r.path);
    },
  };

  function maybeAutosave() {
    const ms = typeof cfg.autosave === "number" ? cfg.autosave : 0;
    if (ms <= 0 || !st.baselinePath || st.readOnly) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      if (st.dirty && st.baselinePath) ed.files.requestSave();
    }, ms);
  }

  function reportCursor() {
    if (!T.panelFrame) return;
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.head);
    let co = null;
    try { co = view.coordsAtPos(sel.head); } catch (_) {}
    const selText = view.state.sliceDoc(sel.from, sel.to);
    T.panelFrame.reportCursor({
      surface: surface,
      target: NAME,
      cell: { x: sel.head - line.from, y: line.number },
      pixel: co ? { x: Math.round(co.left), y: Math.round(co.top),
                    h: Math.round(co.bottom - co.top) } : null,
      selection: selText.length > 2000 ? selText.slice(0, 2000) : selText,
      selectionLength: selText.length,
    });
  }

  // A grammar plugin: an ES module whose default export is
  // (languageKit) => Extension. Loaded once per URL for the page.
  function loadGrammar(rel) {
    const url = T.config && T.config.sibling ? T.config.sibling(rel) : rel;
    if (!grammarCache.has(url)) {
      grammarCache.set(url, import(url).then((mod) => {
        if (typeof mod.default !== "function") throw new Error(rel + ": no default export function");
        return mod.default(languageKit);
      }));
    }
    return grammarCache.get(url);
  }

  function applyLang(hint) {
    langHint = hint;
    const id = (T.codeLanguages && T.codeLanguages.resolve(hint)) || null;
    st.langId = id;
    showLang();
    const seq = ++langSeq;
    const plugin = T.codeLanguages && T.codeLanguages.grammar ? T.codeLanguages.grammar(id) : null;
    if (!plugin) {
      view.dispatch({ effects: langComp.reconfigure(languageExtension(id)) });
      return;
    }
    view.dispatch({ effects: langComp.reconfigure([]) });
    loadGrammar(plugin).then((ext) => {
      if (seq === langSeq) view.dispatch({ effects: langComp.reconfigure(ext) });
    }).catch((e) => {
      grammarCache.delete(T.config && T.config.sibling ? T.config.sibling(plugin) : plugin);
      if (seq === langSeq) flash("grammar " + plugin + ": " + (e && e.message || e));
      try { console.error("tezcatl: grammar plugin", plugin, e); } catch (_) {}
    });
  }

  // code.json `languages` / code.configure {languages}: the user's language
  // table (lib/code/code-languages.js). Re-resolves the open document, and
  // attaches its LSP if it only now got an id.
  function applyLanguages(table) {
    if (!T.codeLanguages || !T.codeLanguages.configure) return;
    const problems = T.codeLanguages.configure(table);
    if (problems.length) {
      flash(problems[0]);
      try { console.warn("tezcatl: code.json languages", problems); } catch (_) {}
    }
    if (langHint == null) return;
    const before = st.langId;
    applyLang(langHint);
    if (st.langId !== before && st.baselinePath) ed.lsp.attach(st.baselinePath, st.langId);
  }

  function applyReadOnly(ro) {
    st.readOnly = !!ro;
    if (head.ro) head.ro.hidden = !st.readOnly;
    view.dispatch({ effects: [
      roComp.reconfigure(EditorState.readOnly.of(st.readOnly)),
      editComp.reconfigure(EditorView.editable.of(!st.readOnly || opts.focusable === true)),
    ]});
  }

  // code.configure / code.json tuning knobs. Live-reconfigures the compartments;
  // the keymap swap also re-arms the local-yank poll for the new adapter.
  function applyEditorCfg(obj) {
    let touchedCfg = false;
    let touchedKeymap = false;
    if (typeof obj.tabSize === "number") { cfg.tabSize = obj.tabSize; touchedCfg = true; }
    if (typeof obj.indentUnit === "string") { cfg.indentUnit = obj.indentUnit; touchedCfg = true; }
    if (typeof obj.lineWrapping === "boolean") { cfg.lineWrapping = obj.lineWrapping; touchedCfg = true; }
    if (typeof obj.fontFamily === "string") { cfg.fontFamily = obj.fontFamily; touchedCfg = true; }
    if (typeof obj.fontSize === "number") { cfg.fontSize = obj.fontSize; touchedCfg = true; }
    if ("inputLineEx" in obj) cfg.inputLineEx = typeof obj.inputLineEx === "boolean" ? obj.inputLineEx : null;
    if ("autosave" in obj) cfg.autosave = obj.autosave;
    if (obj.clone && typeof obj.clone === "object" && Number.isInteger(obj.clone.slots) && obj.clone.slots > 0) {
      cfg.clone = { slots: obj.clone.slots };
    }
    if (obj.juncture && typeof obj.juncture === "object") {
      cfg.juncture = T.juncture ? T.juncture.limits(Object.assign({}, cfg.juncture, obj.juncture)) : cfg.juncture;
    }
    if (obj.mirror && typeof obj.mirror === "object") {
      const m = obj.mirror;
      cfg.mirror = {
        slots: Number.isInteger(m.slots) && m.slots > 0 ? m.slots : cfg.mirror.slots,
        idleMs: typeof m.idleMs === "number" && m.idleMs >= 0 ? m.idleMs : cfg.mirror.idleMs,
      };
    }
    if (obj.lsp && typeof obj.lsp === "object") {
      const l = obj.lsp;
      const t = typeof l.timeoutMs === "number" && l.timeoutMs > 0 ? l.timeoutMs : cfg.lsp.timeoutMs;
      const m = typeof l.maxTimeoutMs === "number" && l.maxTimeoutMs > 0 ? l.maxTimeoutMs : cfg.lsp.maxTimeoutMs;
      cfg.lsp = { timeoutMs: t, maxTimeoutMs: Math.max(t, m) };
      // the client attached now waits so from its next request
      if (st.lspClient) st.lspClient.timeout = cfg.lsp.timeoutMs;
    }
    if ("inputFormEx" in obj) {
      if (INPUT_FORM_EX.indexOf(obj.inputFormEx) >= 0) {
        cfg.inputFormEx = obj.inputFormEx;
        if (editable) defineInputFormEx(cfg.inputFormEx);
      } else {
        flash("! inputFormEx is one of " + INPUT_FORM_EX.join(" ") + " (" + JSON.stringify(obj.inputFormEx) + " cannot be used, so it stays :" + cfg.inputFormEx + ")", true);
      }
    }
    if (typeof obj.keymap === "string" && obj.keymap !== cfg.keymap) {
      cfg.keymap = obj.keymap;
      touchedKeymap = true;
    }
    const effects = [];
    if (touchedCfg) effects.push(cfgComp.reconfigure(cfgExtensions()));
    if (touchedKeymap) {
      adapter = keymapAdapter(cfg.keymap);
      localYankPoll = adapter.pollLocalYank(emitLocalYank);
      effects.push(keymapComp.reconfigure(adapter.extensions));
    }
    if (effects.length) view.dispatch({ effects });
    if (touchedKeymap && keysRead) applyKeys();
    if (touchedKeymap && bus && opts.files === true) setTimeout(() => adapter.watchMode(), 0);
    if (touchedKeymap || "inputLineEx" in obj) tellInputLineEx();
  }

  function applyCodeJson(doc) {
    if (!doc || typeof doc !== "object") return;
    const obj = {};
    if (typeof doc.tabSize === "number") obj.tabSize = doc.tabSize;
    if (typeof doc.indentUnit === "string") obj.indentUnit = doc.indentUnit;
    if (typeof doc.lineWrapping === "boolean") obj.lineWrapping = doc.lineWrapping;
    if (typeof doc.fontFamily === "string") obj.fontFamily = doc.fontFamily;
    if (typeof doc.fontSize === "number") obj.fontSize = doc.fontSize;
    if ("autosave" in doc) obj.autosave = doc.autosave;
    if ("inputFormEx" in doc) obj.inputFormEx = doc.inputFormEx;
    if (doc.mirror && typeof doc.mirror === "object") obj.mirror = doc.mirror;
    if (doc.clone && typeof doc.clone === "object") obj.clone = doc.clone;
    if (doc.juncture && typeof doc.juncture === "object") obj.juncture = doc.juncture;
    // keys: per keymap, merged over the defaults when mapped (applyKeys)
    if (doc.keys && typeof doc.keys === "object") cfg.keys = doc.keys;
    if ("inputLineEx" in doc) obj.inputLineEx = doc.inputLineEx;
    if (!keymapPinned && typeof doc[keymapField] === "string") obj.keymap = doc[keymapField];
    applyEditorCfg(obj);
    if ("languages" in doc) applyLanguages(doc.languages);
  }

  function codeFiles() { return T.codeFiles || null; }

  function showLang() {
    if (head.lang) head.lang.textContent = (st.langId || "text") + (st.eol === "\r\n" ? " · CRLF" : "");
  }

  // a line about mixed line endings, for the message that opens the file
  function mixedNote() {
    return st.eolMixed ? " ── mixed line endings (a save makes them all " + (st.eol === "\r\n" ? "CRLF" : "LF") + ")" : "";
  }

  // a tezcatl-command named by a key (cfg.keys): run where it belongs -- this
  // code_editor's own code.* here, anything else (a panel's: lsp.back ...) by the bus
  function runCommand(cmd) {
    const C = T.commands;
    if (!C) { flash("! lib/core/commands.js is missing: " + cmd, true); return; }
    // skin: the skin page this code_editor is in (its bus id) -- a panel's command
    // is taken by that skin's panel; null: not in a skin
    const skin = T.skinPort ? T.skinPort.id(window) : null;
    C.invoke(cmd, { skin }, { local: true, onNone: () => flash("! " + cmd + " ── nothing takes it (add the panel)", true) });
  }

  function setDoc(text) {
    const e = codeFiles() ? codeFiles().eolOf(text) : { eol: "\n", mixed: false };
    st.eol = e.eol;
    st.eolMixed = e.mixed;
    showLang();
    settingDoc = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      effects: histComp.reconfigure(freshHistory()),
    });
    settingDoc = false;
    // what the editor holds ("\n" lines), so undoing back to it is clean
    st.baseline = view.state.doc.toString();
    if (st.dirty) setDirty(false);
    if (marksById.size) { marksById.clear(); rebuildMarks(); }
  }

  function rebuildMarks() {
    const lineCount = view.state.doc.lines;
    const ranges = [];
    for (const layer of marksById.values()) {
      if (!layer.class) continue;
      for (const [from, to] of layer.spans) {
        const a = Math.max(0, Math.min(view.state.doc.length, from));
        const b = Math.max(0, Math.min(view.state.doc.length, to));
        if (b > a) ranges.push(Decoration.mark({ class: layer.class }).range(a, b));
      }
      for (const ln of layer.lines) {
        if (ln >= 1 && ln <= lineCount) {
          ranges.push(Decoration.line({ class: layer.class })
            .range(view.state.doc.line(ln).from));
        }
      }
    }
    const set = Decoration.set(ranges, true);
    view.dispatch({ effects: markComp.reconfigure(EditorView.decorations.of(set)) });
  }

  function applyMark(spec) {
    if (!spec || typeof spec.id !== "string") return;
    marksById.set(spec.id, {
      class: (typeof spec.class === "string" && spec.class) || "cm-tez-mark",
      spans: Array.isArray(spec.ranges)
        ? spec.ranges
            .filter((r) => r && Number.isFinite(r.from) && Number.isFinite(r.to))
            .map((r) => [r.from, r.to])
        : [],
      lines: Array.isArray(spec.lines) ? spec.lines.filter(Number.isFinite) : [],
    });
    rebuildMarks();
  }

  function clearMark(id) {
    if (typeof id === "string") marksById.delete(id);
    else marksById.clear();
    rebuildMarks();
  }

  function gotoLine(line, col) {
    const lc = view.state.doc.lines;
    const ln = Math.max(1, Math.min(lc, Math.floor(line) || 1));
    const l = view.state.doc.line(ln);
    const pos = l.from + Math.max(0, Math.min(l.length, Math.floor(col) || 0));
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    view.focus();
  }

  let flashTimer = null;
  // sticky: stays until the next message (a conflict, an error -- what asks for a choice)
  let stickyShown = false;
  function flash(s, sticky) {
    if (!head.msg) return;
    head.msg.textContent = s;
    stickyShown = !!sticky;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = sticky ? null : setTimeout(() => { head.msg.textContent = ""; }, 1500);
  }
  // a by-the-way note ("lsp javascript"): never over a message that asks
  // for a choice (a copy left behind, a conflict)
  function note(s) {
    if (stickyShown) return;
    flash(s);
  }

  if (T.panelFrame) {
    T.panelFrame.init({ role: opts.role || "code", name: NAME });
    T.panelFrame.setFocusTarget(view.contentDOM);
    if (editable) {
      T.panelFrame.onInsert((text) => {
        if (typeof text !== "string" || st.readOnly) return;
        view.dispatch(view.state.replaceSelection(text));
        view.focus();
      });
    }
    if (bus) bus.post("code.ready", editable && opts.files === true ? { name: NAME, inputLineEx: inputLineExNow() } : { name: NAME });
  }

  if (bus) {
    view.contentDOM.addEventListener("copy", () => {
      const sel = view.state.selection.main;
      if (sel.empty) return;
      const text = view.state.sliceDoc(sel.from, sel.to);
      if (text) bus.post("killring.add", { text, source: NAME });
    });
    // vim `y` yanks do not fire a DOM copy -- catch them via the adapter poll.
    view.contentDOM.addEventListener("blur", () => localYankPoll());
  }

  if (bus) {
    bus.onMine("code.set", (payload) => {
      const obj = payload && typeof payload === "object" ? payload : { text: payload };
      if (typeof obj.text !== "string") return;
      // a file over unsaved edits is refused here, as :e refuses:
      // the sender's idea of "unsaved" (the frame's, from code.dirty) can be
      // behind, and the text replaced would take its copy with it (mirror.enter)
      if (editable && st.dirty && ("filename" in obj || "path" in obj)) {
        const want = "filename" in obj ? obj.filename : obj.path;
        const why = "unsaved changes (" + (st.baselinePath || "no path") + ") ── not opened";
        flash("! " + why + ": " + want, true);
        bus.post("code.openFailed", { name: NAME, path: want, reason: why, dirty: true });
        return;
      }
      if ("filename" in obj) ed.lsp.leaveFor(obj.filename);
      else if ("path" in obj) ed.lsp.leaveFor(obj.path);
      if ("filename" in obj || "language" in obj) applyLang(obj.language || obj.filename);
      if (editable && "readOnly" in obj) applyReadOnly(obj.readOnly);
      setDoc(obj.text);
      if ("filename" in obj) st.baselinePath = obj.filename;
      else if ("path" in obj) st.baselinePath = obj.path;
      // the text handed over is taken to be the file on disk (the opener read
      // it); `base` overrides that ("absent", or null for an unchecked save)
      if ("filename" in obj || "path" in obj) {
        st.diskBaseP = "base" in obj ? Promise.resolve(obj.base) : hashText(obj.text);
        ed.files.showPath();
      }
      ed.cancelAutosave();
      // cursor: "end" -- go on typing after the text (an input form given a start)
      if (obj.cursor === "end") view.dispatch({ selection: { anchor: view.state.doc.length } });
      if ("filename" in obj || "path" in obj) {
        ed.lsp.attach(st.baselinePath, st.langId);
        ed.mirror.enter();
        // as :e says it: a file handed over is opened too (the frame's tree Enter -- a thema's `file`)
        bus.post("code.opened", { name: NAME, path: st.baselinePath });
      }
      flash("set " + obj.text.length + " chars" + mixedNote(), st.eolMixed);
    });

    // code.file {op, arg, bang}: the file commands from outside -- a skin's
    // input form (`:w`, `:e <path>` ... typed there, lib/skin/skin-ex.js) or the
    // code.* tezcatl-commands. The same as typing them in this editor.
    bus.onMine("code.file", (payload) => {
      const p = payload || {};
      const name = OP_EX[p.op];
      if (!name || !editable) return;
      fileEx[name]({ bang: !!p.bang, arg: typeof p.arg === "string" ? p.arg.trim() : "", req: p.req });
    });

    // External yank (kill-ring picker -> here). vim does a real `p`; others
    // replaceSelection. Editor-only.
    bus.onMine("killring.yank", (payload) => {
      const text = payload && payload.text;
      if (typeof text !== "string" || st.readOnly || !editable) return;
      adapter.yankExternal(text);
      view.focus();
    });

    bus.onMine("code.get", (payload, meta) => {
      if (T.panelFrame) {
        T.panelFrame.replyTo(meta, "code.text", {
          name: NAME, text: view.state.doc.toString(), dirty: st.dirty, language: st.langId,
          path: st.baselinePath,
        });
      }
    });

    bus.onMine("code.configure", (payload) => {
      const obj = payload || {};
      if ("languages" in obj) applyLanguages(obj.languages);
      if ("filename" in obj || "language" in obj) applyLang(obj.language || obj.filename);
      if (editable && "readOnly" in obj) applyReadOnly(obj.readOnly);
      applyEditorCfg(obj);
    });

    bus.onMine("dict.words", (payload) => {
      const arr = payload && Array.isArray(payload.entries) ? payload.entries : [];
      dictWords = arr.filter((e) => e && typeof e.word === "string" && e.word);
    });

    bus.onMine("code.mark", (payload) => applyMark(payload));
    bus.onMine("code.clearMarks", (payload) => {
      clearMark(payload && typeof payload === "object" ? payload.id : payload);
    });
    bus.onMine("code.goto", (payload) => {
      const o = payload && typeof payload === "object" ? payload : {};
      if (Number.isFinite(o.line)) gotoLine(o.line, Number.isFinite(o.col) ? o.col : 0);
    });

    // A file editor (code_editor, opts.files) says where it is, and comes to the
    // front when asked (lib/code/code-locate.js): code.query {req} is
    // answered by every one of them with code.here {req, name, path, dirty, lsp: {key, serverId} | null};
    // code.reveal {req} brings this one forward -- inside a skin, the skin
    // focuses the pane that holds this frame (lib/core/panes.js, by the frame's
    // window, so two skins with the same pane names never mix them up) -- and
    // answers code.revealed {req, focused}: a browser may refuse to bring
    // another window to the front, and the asker says so.
    if (opts.files === true) {
      bus.on("code.query", (payload) => {
        bus.post("code.here", { req: payload && payload.req, name: NAME, path: st.baselinePath, dirty: st.dirty, diagnostics: ed.nav.diagnostics(), lsp: st.lspServer, mode: adapter.mode() });
      });
      // The lead-key input form's keys (D-lead-key), through its input_target:
      // code.keys {req, events} (to this one) -> each key as the keydown a real
      // press makes, on the editor (so vim, the keymaps and code.json's keys take
      // it as typed); a char nobody took (insert mode) goes in as text, as typing
      // would put it -> code.keys.sent {req, ok, error, mode} to the sender.
      // The mode also goes out as code.mode {name, mode} when vim changes it.
      bus.onMine("code.keys", (payload, meta) => {
        const r = editable ? pressKeys((payload && payload.events) || []) : { ok: false, error: "this code_editor is read-only" };
        bus.post("code.keys.sent", Object.assign({ req: payload && payload.req, mode: adapter.mode() }, r), { to: meta.from.id });
      });
      adapter.watchMode();
      // code.edits {req, path, edits} (to this one; a rename made in another
      // code_editor) -> code.edited (lib/code-editor/lsp-actions.js receiveEdits)
      bus.onMine("code.edits", (payload) => ed.actions.receiveEdits(payload));
      // code.append {req, text} (to this one; code_vi_minimum's `:m code_editor <file>`)
      // -> the text on a line of its own at the end, one unsaved change -> code.appended {req, ok, reason}
      bus.onMine("code.append", (payload, meta) => {
        const p = payload || {};
        const reply = (ok, reason) => bus.post("code.appended", { req: p.req, ok, reason: reason || null }, { to: meta.from.id });
        if (!editable || st.readOnly) { reply(false, "read-only"); return; }
        if (typeof p.text !== "string" || !p.text) { reply(false, "no text"); return; }
        const doc = view.state.doc.toString();
        const sep = doc === "" || doc.endsWith("\n") ? "" : "\n";
        view.dispatch({ changes: { from: doc.length, insert: sep + p.text.replace(/\n+$/, "") + "\n" }, userEvent: "input.append" });
        flash("a text was added at the end (from " + ((meta.from && meta.from.name) || "another panel") + ") ── u takes it out, :w saves");
        reply(true);
      });
      // code.juncture {req, op, [to]} (to this one; the frame's `juncture ...`
      // lines, the juncture_tree panel) -> code.juncture.done {req, name, path,
      // ok, op, id, message, notes} to the sender (lib/code/code-editor/juncture.js)
      bus.onMine("code.juncture", (payload, meta) => {
        const req = payload && payload.req;
        ed.juncture.run(payload).then((r) => bus.post("code.juncture.done", Object.assign({ req, name: NAME }, r), { to: meta.from.id }));
      });
      // code.edits.undo {req} -> code.edits.undone {req, ok}: the rename failed elsewhere
      bus.onMine("code.edits.undo", (payload) => ed.actions.receiveUndo(payload));
      // code.outline.query {req} (to this one) -> code.outline {req, name, path, via, items, reason}
      bus.onMine("code.outline.query", (payload) => {
        const req = payload && payload.req;
        ed.nav.outline().then((r) => bus.post("code.outline", Object.assign({ req, name: NAME, path: st.baselinePath }, r)));
      });
      bus.onMine("code.reveal", (payload) => {
        const req = payload && payload.req;
        try {
          if (window.parent && window.parent !== window) window.parent.postMessage({ type: "tezcatl.pane.reveal" }, location.origin);
        } catch (_) {}
        try { window.focus(); } catch (_) {}
        view.focus();
        setTimeout(() => {
          bus.post("code.revealed", { req, focused: typeof document.hasFocus === "function" ? document.hasFocus() : true });
        }, 150);
      });
    }
  }

  // -- keys from outside (code.keys) --------------------------------------------
  const KEY_NAMES = {
    left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown",
    return: "Enter", escape: "Escape", tab: "Tab", backspace: "Backspace", delete: "Delete",
  };
  for (let i = 1; i <= 12; i++) KEY_NAMES["f" + i] = "F" + i;
  // what a key nobody took puts in (insert mode): the char, a newline, a tab
  const TYPED = { return: "\n", tab: "\t" };

  function pressKeys(events) {
    for (const e of events) {
      const mods = new Set(e.modifiers || []);
      const key = KEY_NAMES[e.key] || e.key;
      const ev = new KeyboardEvent("keydown", {
        key, bubbles: true, cancelable: true,
        ctrlKey: mods.has("control"), altKey: mods.has("meta"), metaKey: mods.has("super"),
        shiftKey: mods.has("shift") || (e.key.length === 1 && e.key !== e.key.toLowerCase()),
      });
      const taken = !view.contentDOM.dispatchEvent(ev);
      if (taken) continue;
      const text = TYPED[e.key] !== undefined ? TYPED[e.key] : (Array.from(e.key).length === 1 ? e.key : null);
      if (text !== null && !mods.has("control") && !mods.has("meta") && !mods.has("super")) {
        view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: "input.type" });
      }
    }
    return { ok: true };
  }

  // vim's mode as the status line says it, or null (another keymap)
  function vimMode() {
    try {
      const cm = getCM(view);
      const v = cm && cm.state && cm.state.vim;
      if (!v) return null;
      if (v.insertMode) return cm.state.overwrite ? "REPLACE" : "INSERT";
      if (v.visualMode) return v.visualLine ? "V-LINE" : v.visualBlock ? "V-BLOCK" : "VISUAL";
      return "NORMAL";
    } catch (_) { return null; }
  }
  let modeCm = null;
  function watchVimMode() {
    try {
      const cm = getCM(view);
      if (!cm || cm === modeCm) return;
      modeCm = cm;
      cm.on("vim-mode-change", () => { if (bus) bus.post("code.mode", { name: NAME, mode: adapter.mode() }); });
    } catch (_) {}
  }

  // code.json's keys -> tezcatl-commands, mapped once code.json is read (or
  // could not be), and again when the keymap changes. Only a file editor.
  // vim's maps are the page's (mapped once a key; a change needs the page read again)
  let keysRead = false;
  function applyKeys() {
    if (!editable || opts.files !== true) return;
    const ext = adapter.bindKeys(keysOf(mergeKeys(cfg.keys), cfg.keymap));
    view.dispatch({ effects: keysComp.reconfigure(ext) });
  }
  function keysReady() {
    keysRead = true;
    applyKeys();
    tellInputLineEx();
  }
  // whether the skin's input line takes ":" lines for this one: on code.ready,
  // and code.input-line-ex {name, on} when code.json or the keymap changes it
  let toldInputLineEx = null;
  function inputLineExNow() { return inputLineEx(cfg.inputLineEx, cfg.keymap); }
  function tellInputLineEx() {
    if (!bus || !editable || opts.files !== true) return;
    const on = inputLineExNow();
    if (on === toldInputLineEx) return;
    toldInputLineEx = on;
    bus.post("code.input-line-ex", { name: NAME, on });
  }
  if (T.config && T.config.sibling) {
    fetch(T.config.sibling("code.json"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(applyCodeJson)
      .catch(() => {})
      .then(keysReady);
  } else keysReady();

  if (params.get("lang")) applyLang(params.get("lang"));

  if (editable) {
    fileEditors.add({
      view,
      ex: fileEx,
      command: runCommand,
      // `:<key> [text]`: to the input form when key is this editor's choice
      inputForm(key, text) {
        if (key === cfg.inputFormEx) toInputForm(text);
        else flash("! :" + key + " is not the command to the input form (inputFormEx in code.json is " + cfg.inputFormEx + ")", true);
      },
    });
    defineFileEx();
    defineInputFormEx(cfg.inputFormEx);
    // this code_editor's own code.* commands: one invoked here (a key) runs on this
    // one, the nearest -- the same table as a skin's (lib/skin/skin-ex.js COMMANDS)
    if (opts.files === true && T.commands && T.skinEx) {
      const table = T.skinEx.COMMANDS;
      Object.keys(table).forEach((name) => {
        T.commands.register(name, (args) => {
          const a = args || {};
          const c = table[name];
          const ex = OP_EX[c.op];
          if (!ex) return false;
          fileEx[ex]({ bang: !!a.bang, arg: c.arg && typeof a[c.arg] === "string" ? a[c.arg].trim() : "" });
          return true;
        });
      });
      // code.to-input: to the skin's input line, as vim's `:#` (emacs' M-x names it)
      T.commands.register("code.to-input", () => { toInputForm(""); return true; });
      T.commands.load().catch(() => {});
    }
    // the keys are mapped once code.json is read (keysReady below), so "" can leave one unmapped
    // code_editor.html?path=<path from the FS root> opens that file (a new one if it is not there)
    if (params.get("path")) ed.files.openPath(params.get("path"), true);
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("pagehide", () => ed.lsp.detach());
    // the code_editor is closed: its slot goes -- kept when the text has unsaved
    // edits, and said on the bus (code.closed; the file_changes panel lists it)
    window.addEventListener("pagehide", () => ed.mirror.leave());
  }

  return {
    view: view,
    name: NAME,
    applyLang: applyLang,
    applyReadOnly: applyReadOnly,
    setDoc: setDoc,
    flash: flash,
    mark: applyMark,
    clearMarks: clearMark,
    goto: gotoLine,
    getText: () => view.state.doc.toString(),
    path: () => st.baselinePath,
    config: () => Object.assign({}, cfg),
    lspAttached: () => st.lspAttachedPath,
    isReadOnly: () => st.readOnly,
    isDirty: () => st.dirty,
    save: () => ed.files.requestSave(false),
    open: (path, force) => ed.files.openPath(path, force),
    focus: () => view.focus(),
  };
}
