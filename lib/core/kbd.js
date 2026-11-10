(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).kbd = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SPECIAL_KEYS = new Set([
    'return', 'tab', 'backspace', 'delete', 'escape',
    'up', 'down', 'left', 'right', 'home', 'end', 'prior', 'next',
    'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  ]);

  const ALIAS = { RET: 'return', TAB: 'tab', ESC: 'escape', DEL: 'backspace', SPC: ' ' };
  const MOD_PREFIX = { 'C-': 'control', 'M-': 'meta', 'S-': 'shift', 's-': 'super' };
  const MODIFIER_ORDER = ['control', 'meta', 'shift', 'super'];
  const MOD_TO_PREFIX = { control: 'C-', meta: 'M-', shift: 'S-', super: 's-' };

  function sortMods(mods) {
    return mods.slice().sort(function (a, b) {
      return MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b);
    });
  }

  function isPrintableChar(ch) {
    const c = ch.charCodeAt(0);
    return ch.length === 1 && c >= 0x20 && c !== 0x7f;
  }

  function singleKey(rest, tok) {
    if (rest.length > 1 && rest[0] === '<' && rest[rest.length - 1] === '>') {
      const name = rest.slice(1, -1);
      if (!SPECIAL_KEYS.has(name)) throw 'unknown key "<' + name + '>" in "' + tok + '"';
      return name;
    }
    if (Object.prototype.hasOwnProperty.call(ALIAS, rest)) return ALIAS[rest];
    if (rest.length === 1) {
      if (!isPrintableChar(rest)) throw 'non-printable key in "' + tok + '"';
      return rest;
    }
    throw 'a modifier needs a single key in "' + tok + '"';
  }

  function parseToken(tok) {
    let mods = [];
    let rest = tok;
    while (rest.length > 2 && MOD_PREFIX[rest.slice(0, 2)]) {
      mods.push(MOD_PREFIX[rest.slice(0, 2)]);
      rest = rest.slice(2);
    }
    if (MOD_PREFIX[rest]) throw 'dangling modifier in "' + tok + '"';

    if (mods.length) {
      for (let i = 0; i < mods.length; i++) {
        if (mods.indexOf(mods[i]) !== i) throw 'repeated modifier in "' + tok + '"';
      }
      return [{ key: singleKey(rest, tok), modifiers: sortMods(mods) }];
    }

    if (rest.length > 1 && rest[0] === '<' && rest[rest.length - 1] === '>') {
      const name = rest.slice(1, -1);
      if (!SPECIAL_KEYS.has(name)) throw 'unknown key "<' + name + '>"';
      return [{ key: name, modifiers: [] }];
    }
    if (Object.prototype.hasOwnProperty.call(ALIAS, rest)) {
      return [{ key: ALIAS[rest], modifiers: [] }];
    }
    if (rest.length === 1) {
      if (!isPrintableChar(rest)) throw 'non-printable key in "' + tok + '"';
      return [{ key: rest, modifiers: [] }];
    }
    const events = [];
    for (const ch of rest) {
      if (!isPrintableChar(ch)) throw 'non-printable character in "' + tok + '"';
      events.push({ key: ch, modifiers: [] });
    }
    return events;
  }

  function parse(text) {
    const tokens = String(text).trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return { error: 'empty' };
    const events = [];
    try {
      for (const tok of tokens) {
        const evs = parseToken(tok);
        for (let i = 0; i < evs.length; i++) events.push(evs[i]);
      }
    } catch (msg) {
      return { error: String(msg) };
    }
    return { events: events };
  }

  function describe(events) {
    return events.map(function (e) {
      const p = e.modifiers.map(function (m) { return MOD_TO_PREFIX[m]; }).join('');
      const k = SPECIAL_KEYS.has(e.key) ? '<' + e.key + '>' :
                e.key === ' ' ? 'SPC' : e.key;
      return p + k;
    }).join(' ');
  }

  return { parse: parse, describe: describe, SPECIAL_KEYS: SPECIAL_KEYS };
});
