// lib/term/keys.js -- key events ({key, modifiers}, as lib/core/lead.js gives
// them) to the bytes a terminal sends for them, as xterm does by default
// (and xterm.js with it). Only the encoding: what the keys do is the shell's
// or the TUI's. appCursor is DECCKM (vim, less...: the arrows as ESC O x);
// xterm.js says it in term.modes.applicationCursorKeysMode.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).termKeys = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ESC = '\x1b';
  const CURSOR = { up: 'A', down: 'B', right: 'C', left: 'D' };
  const SS3_FN = { f1: 'P', f2: 'Q', f3: 'R', f4: 'S' };
  const TILDE = { delete: 3, f5: 15, f6: 17, f7: 18, f8: 19, f9: 20, f10: 21, f11: 23, f12: 24 };
  // ctrl on a char that is not a letter
  const CTRL_CHAR = { '@': 0, ' ': 0, '2': 0, '[': 27, '3': 27, '\\': 28, '4': 28, ']': 29, '5': 29,
    '^': 30, '6': 30, '_': 31, '-': 31, '7': 31, '/': 31, '?': 127, '8': 127 };

  // the xterm modifier parameter: 1 + shift 1 + alt 2 + ctrl 4
  function param(mods) {
    return 1 + (mods.shift ? 1 : 0) + (mods.meta ? 2 : 0) + (mods.control ? 4 : 0);
  }

  function one(e, opts) {
    const m = {};
    (e.modifiers || []).forEach(function (x) { m[x] = true; });
    if (m.super) return { error: 'a terminal has no Super (' + describe(e) + ')' };
    const k = e.key;
    const any = m.shift || m.meta || m.control;

    if (Object.prototype.hasOwnProperty.call(CURSOR, k)) {
      if (any) return { bytes: ESC + '[1;' + param(m) + CURSOR[k] };
      return { bytes: ESC + (opts.appCursor ? 'O' : '[') + CURSOR[k] };
    }
    if (Object.prototype.hasOwnProperty.call(SS3_FN, k)) {
      return { bytes: any ? ESC + '[1;' + param(m) + SS3_FN[k] : ESC + 'O' + SS3_FN[k] };
    }
    if (Object.prototype.hasOwnProperty.call(TILDE, k)) {
      return { bytes: ESC + '[' + TILDE[k] + (any ? ';' + param(m) : '') + '~' };
    }

    let base;
    if (k === 'return') base = '\r';
    else if (k === 'tab') { if (m.shift) return { bytes: (m.meta ? ESC : '') + ESC + '[Z' }; base = '\t'; }
    else if (k === 'backspace') base = m.control ? '\x08' : '\x7f';
    else if (k === 'escape') base = ESC;
    else if (typeof k === 'string' && Array.from(k).length === 1) {
      if (m.shift) return { error: 'shift goes on a key that is not a char (' + describe(e) + ')' };
      if (m.control) {
        const lower = k.toLowerCase();
        if (lower >= 'a' && lower <= 'z') base = String.fromCharCode(lower.charCodeAt(0) - 96);
        else if (Object.prototype.hasOwnProperty.call(CTRL_CHAR, k)) base = String.fromCharCode(CTRL_CHAR[k]);
        else return { error: 'no control code for ' + JSON.stringify(k) };
      } else {
        base = k;
      }
    } else {
      return { error: 'no bytes for ' + JSON.stringify(k) };
    }
    if (m.shift && k !== 'tab') return { error: 'shift goes on a key that is not a char (' + describe(e) + ')' };
    return { bytes: (m.meta ? ESC : '') + base };
  }

  function describe(e) {
    const p = { control: 'C-', meta: 'M-', shift: 'S-', super: 's-' };
    return (e.modifiers || []).map(function (x) { return p[x] || ''; }).join('') + e.key;
  }

  // events -> {bytes} | {error} (the first event that has no bytes)
  function encode(events, opts) {
    opts = opts || {};
    let out = '';
    for (let i = 0; i < events.length; i++) {
      const r = one(events[i], opts);
      if (r.error) return { error: r.error };
      out += r.bytes;
    }
    return { bytes: out };
  }

  return { encode: encode };
});
