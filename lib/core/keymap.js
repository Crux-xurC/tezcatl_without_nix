(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).keymap = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SPECIAL = {
    Enter: 'return',
    Escape: 'escape',
    Tab: 'tab',
    Backspace: 'backspace',
    Delete: 'delete',
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    Home: 'home',
    End: 'end',
    PageUp: 'prior',
    PageDown: 'next',
  };
  for (let i = 1; i <= 12; i++) SPECIAL['F' + i] = 'f' + i;

  const LONE_MODIFIER = new Set([
    'Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS', 'Hyper', 'Super',
    'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'Symbol', 'SymbolLock',
  ]);

  const MODIFIER_ORDER = ['control', 'meta', 'shift', 'super'];

  function isPrintable(key) {
    return key.length === 1 && key.charCodeAt(0) >= 0x20;
  }

  function normalize(ev) {
    if (ev.isComposing) return null;

    const raw = ev.key;
    if (typeof raw !== 'string' || raw.length === 0) return null;
    if (LONE_MODIFIER.has(raw)) return null;

    let key;
    let special = false;
    if (Object.prototype.hasOwnProperty.call(SPECIAL, raw)) {
      key = SPECIAL[raw];
      special = true;
    } else if (isPrintable(raw)) {
      key = raw;
    } else {
      return null;
    }

    const modifiers = [];
    if (ev.ctrlKey) modifiers.push('control');
    if (ev.altKey) modifiers.push('meta');
    if (ev.metaKey) modifiers.push('super');
    if (ev.shiftKey && special) modifiers.push('shift');

    modifiers.sort(function (a, b) {
      return MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b);
    });

    return { key: key, modifiers: modifiers };
  }

  return {
    normalize: normalize,
    SPECIAL: SPECIAL,
    LONE_MODIFIER: LONE_MODIFIER,
  };
});
