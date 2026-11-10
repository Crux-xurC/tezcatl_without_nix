// lib/code/editor-keys.js -- the file editor's keys per keymap (D-code-editor),
// the pure part. A key only names a tezcatl command (D-command-target); which
// keys a keymap has is code.json "keys":
//
//   "keys": { "vim":   { "gd": "code.lsp-definition", ... },
//             "emacs": { "M-.": "code.lsp-definition", ... } }
//
// Each keymap's table is merged over its defaults below ("" unmaps one). The
// older flat form ({"gd": ...}, every value a command) is vim's.
// vim's keys are vim's notation (mapped with vim's own maps); the others are
// written as Emacs writes them (C- M- S- s-, a space between strokes:
// "C-c C-d") or as CodeMirror does ("Ctrl-Alt-e") -- toCm turns them into
// CodeMirror's.

export const DEFAULT_KEYS = {
  vim: {
    "gd": "code.lsp-definition", "gr": "code.lsp-references", "K": "code.lsp-hover",
    "]d": "code.diag-next", "[d": "code.diag-prev",
    "]]": "code.def-next", "[[": "code.def-prev",
    "<C-o>": "lsp.back", "<C-i>": "lsp.forward",
  },
  // as Emacs' own: xref (M-. M-? M-, C-M-,), next-error (M-g n / p),
  // defuns (C-M-a / C-M-e), help at point (C-h .); M-x: to the skin's input
  // line, where tezcatl's commands are typed (vim's `:#`)
  emacs: {
    "M-.": "code.lsp-definition", "M-?": "code.lsp-references", "C-h .": "code.lsp-hover",
    "M-g n": "code.diag-next", "M-g p": "code.diag-prev",
    "C-M-e": "code.def-next", "C-M-a": "code.def-prev",
    "M-,": "lsp.back", "C-M-,": "lsp.forward",
    "M-x": "code.to-input",
  },
  default: {},
};

function isTable(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

// code.json "keys" -> {keymap id: {key: command}} over the defaults
export function mergeKeys(doc, defaults = DEFAULT_KEYS) {
  const out = {};
  Object.keys(defaults).forEach((id) => { out[id] = Object.assign({}, defaults[id]); });
  if (!isTable(doc)) return out;
  const values = Object.keys(doc).map((k) => doc[k]);
  // the flat form: every value a command (or "") -- vim's
  const flat = values.length > 0 && values.every((v) => typeof v === "string");
  const per = flat ? { vim: doc } : doc;
  Object.keys(per).forEach((id) => {
    if (!isTable(per[id])) return;
    out[id] = Object.assign({}, out[id] || {}, per[id]);
  });
  return out;
}

// one keymap's table, "" (unmapped) and non-commands left out
export function keysOf(merged, id) {
  const t = (merged && merged[id]) || {};
  const out = {};
  Object.keys(t).forEach((k) => { if (typeof t[k] === "string" && t[k]) out[k] = t[k]; });
  return out;
}

const NAMED = { RET: "Enter", TAB: "Tab", SPC: "Space", ESC: "Escape", DEL: "Backspace", "<return>": "Enter", "<tab>": "Tab", "<escape>": "Escape" };
const MOD = { C: "Ctrl", M: "Alt", S: "Shift", s: "Meta" };
const CM_MOD = /^(Ctrl|Control|Alt|Shift|Meta|Cmd|Mod)$/;

// one stroke ("C-M-e", "Ctrl-Alt-e", "M-.", "C--") -> CodeMirror's, or null
function stroke(s) {
  const parts = s.split(/-(?=.)/);
  const last = parts.pop();
  if (!last) return null;
  const mods = [];
  for (const p of parts) {
    if (MOD[p]) mods.push(MOD[p]);
    else if (CM_MOD.test(p)) mods.push(p === "Control" ? "Ctrl" : p);
    else return null;
  }
  return mods.concat([NAMED[last] || last]).join("-");
}

// a key as written in code.json -> CodeMirror's notation, or null when it cannot be read
export function toCm(key) {
  if (typeof key !== "string" || !key.trim()) return null;
  const strokes = key.trim().split(/\s+/).map(stroke);
  return strokes.every(Boolean) ? strokes.join(" ") : null;
}

// a non-vim keymap's table -> [{key (CodeMirror's), command, as (as written)}],
// and the keys that could not be read
export function bindings(table) {
  const out = [];
  const bad = [];
  Object.keys(table || {}).forEach((k) => {
    const cm = toCm(k);
    if (cm) out.push({ key: cm, command: table[k], as: k });
    else bad.push(k);
  });
  return { bindings: out, bad };
}

// whether the skin's input line takes ":" lines for this editor: code.json
// "inputLineEx" when it says (true / false), else only with vim
export function inputLineEx(setting, keymapId) {
  return typeof setting === "boolean" ? setting : keymapId === "vim";
}
