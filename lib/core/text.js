(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).text = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isLoneSurrogate(ch) {
    if (ch.length !== 1) return false;
    const c = ch.charCodeAt(0);
    return c >= 0xd800 && c <= 0xdfff;
  }

  function encode(text) {
    const raw = String(text == null ? '' : text);
    if (raw === '') return { error: 'empty' };

    const norm = raw.replace(/\r\n?/g, '\n');

    const events = [];
    let dropped = 0;
    for (const ch of norm) {
      if (ch === '\n') { events.push({ key: 'return', modifiers: [] }); continue; }
      if (ch === '\t') { events.push({ key: 'tab', modifiers: [] }); continue; }
      if (ch.length === 1) {
        const c = ch.charCodeAt(0);
        if (c < 0x20 || c === 0x7f) { dropped++; continue; }
        if (isLoneSurrogate(ch)) { dropped++; continue; }
      }
      events.push({ key: ch, modifiers: [] });
    }
    return { events: events, dropped: dropped };
  }

  return { encode: encode };
});
