// lib/skin/skin-dict.js -- a skin's dictionary wiring. The skin names
// one dict pane (list.html?config=dict, lib/list/list-kinds.js "dict") and the
// input panes that use it; only those are wired, so "which input uses which
// list" is the skin's composition, and two skins on the same
// bus never feed each other.
//
//   dict pane --dict.entries--> skin --dict.words {to: editor}--> editors
//   dict pane --dict.pick-----> skin --insert {to: last focused editor}
//
// Editors are recognised by bus identity name (the ?name= the skin gave the
// pane), their bus id learned from code.ready -- the same way basic.html
// learns its code pane from code.ready.

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).skinDict = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // opts: { dict: "<dict pane name>", editors: ["<editor pane name>", ...] }
  function wire(bus, opts) {
    const dictName = opts && opts.dict;
    const editorNames = (opts && opts.editors) || [];
    const ids = {};            // editor name -> bus id
    let lastFocused = null;    // editor name
    let entries = [];

    function isEditor(meta) {
      return !!(meta && meta.from && editorNames.indexOf(meta.from.name) !== -1);
    }

    function push(name) {
      if (ids[name]) bus.post('dict.words', { entries: entries }, { to: ids[name] });
    }

    const offs = [
      bus.on('code.ready', function (_p, meta) {
        if (!isEditor(meta)) return;
        ids[meta.from.name] = meta.from.id;
        push(meta.from.name);
      }),
      bus.on('focus.changed', function (p) {
        if (p && editorNames.indexOf(p.name) !== -1) lastFocused = p.name;
      }),
      bus.on('dict.entries', function (p, meta) {
        if (!(meta && meta.from && meta.from.name === dictName)) return;
        entries = (p && Array.isArray(p.entries)) ? p.entries : [];
        editorNames.forEach(push);
      }),
      bus.on('dict.pick', function (p, meta) {
        if (!(meta && meta.from && meta.from.name === dictName)) return;
        const word = p && p.word;
        const target = (lastFocused && ids[lastFocused]) ? lastFocused
          : editorNames.filter(function (n) { return ids[n]; })[0];
        if (typeof word === 'string' && target) bus.post('insert', { text: word }, { to: ids[target] });
      }),
    ];

    // the dict pane may have published before this skin listened
    bus.post('dict.query', {});

    return {
      entries: function () { return entries.slice(); },
      editorId: function (name) { return ids[name] || null; },
      off: function () { offs.forEach(function (f) { f(); }); },
    };
  }

  return { wire: wire };
});
