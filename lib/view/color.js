// lib/view/color.js -- the colour panel's pure part: what
// `color …` asks for, a colour picked out of a JSON by name, and whether text
// on it is best black or white. The page (lib/view/color-page.js) shows it.
//
//   color <colour>        #hex, rgb()/hsl(), a CSS name ...    -> {color}
//   color <json> <name>   the colour <name> of a JSON file (a path from the
//                         FS root): {"orange": "#FF9900", ...} -> {json, name}
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).color = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const USAGE = 'color <colour> or color <JSON path> <name>';

  // the words after "color" (a colour may have spaces: rgb(1, 2, 3)) -> {color} | {json, name} | {error}
  function parse(rest) {
    const t = String(rest == null ? '' : rest).trim();
    if (!t) return { error: USAGE };
    const m = /^(\S+\.json)\s+(\S+)$/i.exec(t);
    if (m) return { json: m[1].replace(/^\/+/, ''), name: m[2] };
    if (/\.json$/i.test(t)) return { error: 'no name (' + USAGE + ')' };
    if (!/^[#\w(),.%\s/-]+$/.test(t)) return { error: 'not a colour: ' + t };
    return { color: t.replace(/\s*,\s*/g, ', ') };
  }

  // the colour <name> of a JSON document -> {color} | {error}
  function pick(doc, name, path) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { error: (path || 'JSON') + ' is not of the form {"name": "colour", …}' };
    if (!Object.prototype.hasOwnProperty.call(doc, name)) {
      const names = Object.keys(doc).filter((k) => typeof doc[k] === 'string');
      return { error: (path || 'JSON') + ' has no ' + name + ' (' + (names.slice(0, 12).join(', ') || 'no names') + (names.length > 12 ? ' …' : '') + ')' };
    }
    const v = doc[name];
    if (typeof v !== 'string' || !v.trim()) return { error: 'the value of ' + name + ' is not a colour string' };
    return { color: v.trim() };
  }

  // "rgb(r, g, b)" / "rgba(...)" (what the browser computes) -> the text colour that reads on it
  function ink(computed) {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(String(computed || ''));
    if (!m) return '#000';
    const lin = (c) => { const x = Number(c) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
    return L > 0.179 ? '#000' : '#fff';
  }

  return { USAGE, parse, pick, ink };
});
