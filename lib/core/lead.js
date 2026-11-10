// Lead key notation (docs/files/lib-core-lead.js.md D-lead-key).
//
// Keys the browser/OS would take, or that a text field cannot hold (arrows,
// Return), are written as the lead char (default ";") plus exactly one char:
//   ;c ;a ;s ;w   Ctrl / Alt(meta) / Shift / Super on the next key (stackable)
//   ;h ;j ;k ;l   left / down / up / right
//   ;e ;q         return / escape
//   ;t ;b ;d      tab / backspace / delete
//   ;f<c>         F1..F12, <c> taken from fnRow ("1234567890-=")
//   ;;            a plain ";"
//   ;<other>      a shortcut bound to a tezcatl command (fires when typed):
//                 "name arg...", the args in the order command_map.json gives
// Uppercase after the lead is reserved (held modifiers, not yet).
//
// Self-contained on purpose: it is meant to absorb kbd.js later, not call it.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).lead = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MODIFIERS = { c: 'control', a: 'meta', s: 'shift', w: 'super' };
  const KEYS = {
    h: 'left', j: 'down', k: 'up', l: 'right',
    e: 'return', q: 'escape',
    t: 'tab', b: 'backspace', d: 'delete',
  };
  const FN = 'f';
  // Chars after the lead that can never be rebound (uppercase is checked apart).
  const PROTECTED = Object.keys(MODIFIERS).concat(Object.keys(KEYS), [FN]);

  const MODIFIER_ORDER = ['control', 'meta', 'shift', 'super'];
  const MOD_TO_PREFIX = { control: 'C-', meta: 'M-', shift: 'S-', super: 's-' };
  const NAMED = new Set(Object.keys(KEYS).map(function (k) { return KEYS[k]; }));
  for (let i = 1; i <= 12; i++) NAMED.add('f' + i);

  const DEFAULTS = {
    lead: ';',
    fnRow: '1234567890-=',
    bindings: { ':': 'skin.focus abs', i: 'dock.target', g: 'dock.suggest', o: 'dock.recv' },
  };

  function isAscii(ch) {
    const c = ch.codePointAt(0);
    return ch.length === 1 && c >= 0x21 && c <= 0x7e;
  }

  function isPrintable(ch) {
    const c = ch.codePointAt(0);
    return c >= 0x20 && c !== 0x7f && !(c >= 0x80 && c < 0xa0);
  }

  function isUpper(ch) {
    return ch >= 'A' && ch <= 'Z';
  }

  function sortMods(mods) {
    return mods.slice().sort(function (a, b) {
      return MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b);
    });
  }

  // opts: { lead, fnRow, bindings } as read from config.json ui.keys
  // (bindings is laid over the defaults; "" unbinds one). Bad entries are
  // reported in errors and fall back to the default.
  function configure(opts) {
    opts = opts || {};
    const errors = [];

    let lead = DEFAULTS.lead;
    if (opts.lead !== undefined) {
      const l = opts.lead;
      if (typeof l !== 'string' || l.length !== 1 || !isAscii(l) || /[A-Za-z0-9]/.test(l)) {
        errors.push('lead must be one ASCII symbol, got ' + JSON.stringify(l));
      } else {
        lead = l;
      }
    }

    let fnRow = DEFAULTS.fnRow;
    if (opts.fnRow !== undefined) {
      const r = opts.fnRow;
      const chars = typeof r === 'string' ? Array.from(r) : [];
      if (chars.length !== 12 || !chars.every(isAscii) || new Set(chars).size !== 12) {
        errors.push('fnRow must be 12 distinct ASCII chars, got ' + JSON.stringify(r));
      } else {
        fnRow = r;
      }
    }

    const bindings = Object.assign({}, DEFAULTS.bindings);
    const over = opts.bindings || {};
    Object.keys(over).forEach(function (ch) {
      const cmd = over[ch];
      if (ch.length !== 1 || !isAscii(ch)) {
        errors.push('binding key must be one ASCII char, got ' + JSON.stringify(ch));
      } else if (ch === lead || PROTECTED.indexOf(ch) >= 0 || isUpper(ch)) {
        errors.push('"' + lead + ch + '" is fixed and cannot be bound');
      } else if (typeof cmd !== 'string') {
        errors.push('binding for "' + lead + ch + '" must be a command name');
      } else if (cmd === '') {
        delete bindings[ch];
      } else {
        bindings[ch] = cmd;
      }
    });
    // A default binding can collide with a lead moved onto it.
    delete bindings[lead];

    return { table: { lead: lead, fnRow: fnRow, bindings: bindings }, errors: errors };
  }

  // Reads one char at a time. feed(ch) returns:
  //   { lights }                     nothing to send yet (lead / modifier / ;f)
  //   { lights, event }              a key for the target
  //   { lights: [], binding }        a shortcut: run this tezcatl command
  //   { lights: [], error }          bad notation; the reader starts over
  // lights are what the virtual keyboard should push: modifier names
  // ('control' ...) or key values ('Y', 'left', 'f5').
  function reader(table) {
    table = table || DEFAULTS;
    let waiting = false;  // just read the lead
    let fn = false;       // just read ;f
    let mods = [];

    function reset() { waiting = false; fn = false; mods = []; }

    function emit(key) {
      const event = { key: key, modifiers: sortMods(mods) };
      reset();
      return { lights: [key], event: event };
    }

    function fail(msg) {
      reset();
      return { lights: [], error: msg };
    }

    function feed(ch) {
      const L = table.lead;
      if (fn) {
        const i = table.fnRow.indexOf(ch);
        if (i < 0) return fail('"' + L + FN + ch + '" is not a function key (row ' + table.fnRow + ')');
        return emit('f' + (i + 1));
      }
      if (waiting) {
        waiting = false;
        if (ch === L) return emit(L);
        if (Object.prototype.hasOwnProperty.call(MODIFIERS, ch)) {
          const m = MODIFIERS[ch];
          if (mods.indexOf(m) >= 0) return fail('repeated modifier "' + L + ch + '"');
          mods.push(m);
          return { lights: [m] };
        }
        if (ch === FN) { fn = true; return { lights: [] }; }
        if (Object.prototype.hasOwnProperty.call(KEYS, ch)) return emit(KEYS[ch]);
        if (isUpper(ch)) return fail('"' + L + ch + '" is reserved (held modifiers)');
        if (Object.prototype.hasOwnProperty.call(table.bindings, ch)) {
          if (mods.length) return fail('a modifier needs a key, got shortcut "' + L + ch + '"');
          const cmd = table.bindings[ch];
          reset();
          return { lights: [], binding: cmd };
        }
        return fail('"' + L + ch + '" means nothing');
      }
      if (ch === L) { waiting = true; return { lights: [] }; }
      if (!isPrintable(ch)) return fail('non-printable character U+' +
        ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
      if (mods.length) {
        if (ch !== ' ' && !isAscii(ch)) return fail('modifiers go on ASCII only, got "' + ch + '"');
        if (mods.indexOf('shift') >= 0 && ch !== ' ') {
          return fail('write the shifted char itself instead of ' + L + 's' + ch);
        }
      }
      return emit(ch);
    }

    // Anything left half-written at the end of a line.
    function end() {
      if (!waiting && !fn && !mods.length) return null;
      const msg = fn ? 'function key without a char' :
                  waiting ? 'line ends after the lead' : 'a modifier needs a key';
      reset();
      return msg;
    }

    function state() {
      return { waiting: waiting, fn: fn, modifiers: sortMods(mods) };
    }

    return { feed: feed, end: end, state: state, reset: reset };
  }

  // Whole line -> { events, spans } (spans[i] = [from, to) in UTF-16 units of
  // the source for events[i]) or { error, at } (incomplete: true when the line
  // only stops half-way -- after the lead, a modifier or ;f). Shortcuts are typed, never
  // part of a line, so one here is an error.
  function parse(text, table) {
    table = table || DEFAULTS;
    const r = reader(table);
    const events = [];
    const spans = [];
    let pos = 0;
    let start = 0;
    for (const ch of String(text)) {
      const atStart = !r.state().waiting && !r.state().fn && !r.state().modifiers.length;
      if (atStart) start = pos;
      const out = r.feed(ch);
      pos += ch.length;
      if (out.error) return { error: out.error, at: start };
      if (out.binding) {
        return { error: 'shortcut "' + table.lead + ch + '" (' + out.binding + ') cannot be sent', at: start };
      }
      if (out.event) { events.push(out.event); spans.push([start, pos]); }
    }
    // half-written at the end: incomplete (waiting for the rest), not wrong
    const tail = r.end();
    if (tail) return { error: tail, at: start, incomplete: true };
    return { events: events, spans: spans };
  }

  // Pasted text goes in as plain chars: the lead is doubled, newlines and
  // tabs become ;e and ;t, other control chars are dropped.
  function escape(text, table) {
    const L = (table || DEFAULTS).lead;
    let out = '';
    for (const ch of String(text)) {
      if (ch === L) out += L + L;
      else if (ch === '\n') out += L + 'e';
      else if (ch === '\t') out += L + 't';
      else if (isPrintable(ch)) out += ch;
    }
    return out;
  }

  function describe(events) {
    return events.map(function (e) {
      const p = e.modifiers.map(function (m) { return MOD_TO_PREFIX[m]; }).join('');
      const k = NAMED.has(e.key) ? '<' + e.key + '>' : e.key === ' ' ? 'SPC' : e.key;
      return p + k;
    }).join(' ');
  }

  return {
    configure: configure,
    reader: reader,
    parse: parse,
    escape: escape,
    describe: describe,
    DEFAULTS: DEFAULTS,
    PROTECTED: PROTECTED,
    // the fixed table, for whoever explains it (lib/skin/how-to-use.js)
    MODIFIERS: Object.assign({}, MODIFIERS),
    KEYS: Object.assign({}, KEYS),
    FN: FN,
  };
});
