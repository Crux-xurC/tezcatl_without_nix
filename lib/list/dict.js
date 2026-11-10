// lib/list/dict.js -- pure logic of the generic dictionary: named lists of
// {word, note} entries, stored as one JSON doc in a real file via /fs
// (list kind "dict", list_kinds/dict*.json `dataFile`, default dict.json).
//
// Three roles, all generic -- nothing here knows about Xipe Totec or Emacs:
//   store    -- a yanked text, one entry per line: the part before the
//               first ":" is the word, the rest is its note. Nothing is
//               parsed automatically: the person chose what to yank, so a
//               backend's human-readable output is never interpreted by
//               tezcatl.
//   register -- add/remove entries of a named list freely.
//   use      -- candidates for the word being typed (complete()).
//
// Doc shape: { "lists": { "<name>": [ { "word": "...", "note": "..." }, ... ] } }

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).dict = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // "row/add: make a calc row" -> {word: "row/add", note: "make a calc row"}; a line
  // with no ":" is all word. Blank lines (and lines whose word is blank) are
  // skipped.
  function parseLine(line) {
    const s = String(line == null ? '' : line);
    const i = s.indexOf(':');
    const word = (i === -1 ? s : s.slice(0, i)).trim();
    if (!word) return null;
    const note = i === -1 ? '' : s.slice(i + 1).trim();
    return { word: word, note: note };
  }

  function parseYank(text) {
    return String(text == null ? '' : text)
      .split(/\r?\n/)
      .map(parseLine)
      .filter(Boolean);
  }

  function normalize(doc) {
    const lists = doc && typeof doc === 'object' && doc.lists && typeof doc.lists === 'object'
      ? doc.lists : {};
    const out = {};
    Object.keys(lists).forEach(function (name) {
      const arr = Array.isArray(lists[name]) ? lists[name] : [];
      out[name] = arr
        .filter(function (e) { return e && typeof e.word === 'string' && e.word; })
        .map(function (e) { return { word: e.word, note: typeof e.note === 'string' ? e.note : '' }; });
    });
    return { lists: out };
  }

  function entries(doc, list) {
    const d = normalize(doc);
    return d.lists[list] ? d.lists[list].slice() : [];
  }

  // Add entries to `list`, keeping order of first appearance. A word already
  // there keeps its place; its note is replaced only by a non-empty new one.
  function add(doc, list, newEntries) {
    const d = normalize(doc);
    const arr = d.lists[list] ? d.lists[list].slice() : [];
    (newEntries || []).forEach(function (e) {
      if (!e || typeof e.word !== 'string' || !e.word) return;
      const hit = arr.filter(function (x) { return x.word === e.word; })[0];
      if (hit) { if (e.note) hit.note = e.note; }
      else arr.push({ word: e.word, note: e.note || '' });
    });
    d.lists[list] = arr;
    return d;
  }

  function remove(doc, list, word) {
    const d = normalize(doc);
    if (d.lists[list]) d.lists[list] = d.lists[list].filter(function (x) { return x.word !== word; });
    return d;
  }

  // Candidates for `prefix` (the non-space run before the cursor): prefix
  // matches first, then other substring matches, each in list order.
  function complete(list, prefix) {
    const p = String(prefix || '');
    const arr = Array.isArray(list) ? list : [];
    if (!p) return arr.slice();
    const head = [];
    const rest = [];
    arr.forEach(function (e) {
      if (e.word.indexOf(p) === 0) head.push(e);
      else if (e.word.indexOf(p) !== -1) rest.push(e);
    });
    return head.concat(rest);
  }

  return {
    parseLine: parseLine,
    parseYank: parseYank,
    normalize: normalize,
    entries: entries,
    add: add,
    remove: remove,
    complete: complete,
  };
});
