// The virtual keyboard's pure part (docs/files/lib-core-lead.js.md D-lead-key,
// "仮想キーボード"): a US tenkeyless (87 keys) drawn as ASCII, which keys a
// light lands on, and the five push-out slots that colour them.
//
// A light is what lead.js reader().feed gives: a modifier name ('control',
// 'meta', 'shift', 'super') or a key value ('Y', ';', 'left', 'f5', ' ').
// It turns into one or more slot entries ('Y' is shift, then y); an entry is
// the ids of the keys it lights (a modifier lights both sides).
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).virtualKeyboard = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UNIT = 5;      // chars per 1u
  const SLOTS = 5;

  // [id, label, width in u]; a string alone is a 1u key whose id is itself.
  // x is where the row starts (u); null in a row is a 1u gap.
  const ROWS = [
    { keys: [
      ['esc', 'Esc'], null,
      ['f1', 'F1'], ['f2', 'F2'], ['f3', 'F3'], ['f4', 'F4'], [null, '', 0.5],
      ['f5', 'F5'], ['f6', 'F6'], ['f7', 'F7'], ['f8', 'F8'], [null, '', 0.5],
      ['f9', 'F9'], ['f10', 'F10'], ['f11', 'F11'], ['f12', 'F12'], [null, '', 0.25],
      ['prtsc', 'PrS'], ['scrlk', 'ScL'], ['pause', 'Pau'],
    ] },
    { keys: [] },
    { keys: [
      '`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', ['bksp', 'Bksp', 2], [null, '', 0.25],
      ['ins', 'Ins'], ['home', 'Hom'], ['pgup', 'PgU'],
    ] },
    { keys: [
      ['tab', 'Tab', 1.5], 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', ['\\', '\\', 1.5], [null, '', 0.25],
      ['del', 'Del'], ['end', 'End'], ['pgdn', 'PgD'],
    ] },
    { keys: [
      ['caps', 'Caps', 1.75], 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", ['enter', 'Enter', 2.25],
    ] },
    { keys: [
      ['lshift', 'Shift', 2.25], 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', ['rshift', 'Shift', 2.75],
      [null, '', 1.25], ['up', '^'],
    ] },
    { keys: [
      ['lctrl', 'Ctl', 1.25], ['lsuper', 'Sup', 1.25], ['lalt', 'Alt', 1.25], ['space', 'Space', 6.25],
      ['ralt', 'Alt', 1.25], ['rsuper', 'Sup', 1.25], ['menu', 'Mnu', 1.25], ['rctrl', 'Ctl', 1.25], [null, '', 0.25],
      ['left', '<'], ['down', 'v'], ['right', '>'],
    ] },
  ];

  // Lines of segments {text, id}: id is null between keys. Every key spans
  // [round(x*UNIT), round((x+w)*UNIT)), so the columns line up across rows.
  function render() {
    return ROWS.map(function (row) {
      const segs = [];
      let x = 0;
      let col = 0;
      row.keys.forEach(function (k) {
        if (typeof k === 'string') k = [k, k.toUpperCase()];
        if (k === null) k = [null, '', 1];
        const w = k[2] === undefined ? 1 : k[2];
        const from = Math.round(x * UNIT);
        const to = Math.round((x + w) * UNIT);
        x += w;
        if (k[0] === null) return;
        if (from > col) segs.push({ text: ' '.repeat(from - col), id: null });
        const inner = to - from - 2;
        segs.push({ text: '[' + center(k[1], inner) + ']', id: k[0] });
        col = to;
      });
      return segs;
    });
  }

  function center(s, n) {
    if (s.length >= n) return s.slice(0, n);
    const left = Math.ceil((n - s.length) / 2);
    return ' '.repeat(left) + s + ' '.repeat(n - s.length - left);
  }

  function columns() {
    return render().reduce(function (m, segs) {
      return Math.max(m, segs.reduce(function (n, s) { return n + s.text.length; }, 0));
    }, 0);
  }

  const MOD_KEYS = {
    control: ['lctrl', 'rctrl'],
    meta: ['lalt', 'ralt'],
    shift: ['lshift', 'rshift'],
    super: ['lsuper', 'rsuper'],
  };
  const NAMED = {
    left: 'left', down: 'down', up: 'up', right: 'right',
    return: 'enter', escape: 'esc', tab: 'tab', backspace: 'bksp', delete: 'del',
    ' ': 'space',
  };
  for (let i = 1; i <= 12; i++) NAMED['f' + i] = 'f' + i;
  // US layout: the shifted char -> the key it is on
  const SHIFTED = {
    '~': '`', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8',
    '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'",
    '<': ',', '>': '.', '?': '/',
  };
  const PLAIN = new Set('`1234567890-=[]\\;\',./abcdefghijklmnopqrstuvwxyz');

  // a light -> slot entries (each an array of key ids); [] when it is on no key (あ)
  function entries(light) {
    if (Object.prototype.hasOwnProperty.call(MOD_KEYS, light)) return [MOD_KEYS[light]];
    if (Object.prototype.hasOwnProperty.call(NAMED, light)) return [[NAMED[light]]];
    if (PLAIN.has(light)) return [[light]];
    if (light >= 'A' && light <= 'Z') return [MOD_KEYS.shift, [light.toLowerCase()]];
    if (Object.prototype.hasOwnProperty.call(SHIFTED, light)) return [MOD_KEYS.shift, [SHIFTED[light]]];
    return [];
  }

  // Five slots, newest first. push(entry) and tick() (push an empty one) drop
  // the oldest. shade(id) is the slot index of the newest entry lighting id,
  // or -1.
  function slots(n) {
    n = n || SLOTS;
    let list = [];
    function push(entry) { list = [entry].concat(list).slice(0, n); }
    return {
      push: push,
      tick: function () { push(null); },
      empty: function () { return list.every(function (e) { return !e; }); },
      list: function () { return list.slice(); },
      shade: function (id) {
        for (let i = 0; i < list.length; i++) if (list[i] && list[i].indexOf(id) >= 0) return i;
        return -1;
      },
    };
  }

  return {
    render: render,
    columns: columns,
    entries: entries,
    slots: slots,
    UNIT: UNIT,
    SLOTS: SLOTS,
  };
});
