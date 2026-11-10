// lib/skin/recv-refs.js -- what a line of a skin's receiving side points at.
// A line may carry, beside its text, a reference: where or which.
//   {kind: 'panel', id}                a panel of this skin (its id in the skin)
//   {kind: 'at', path, line?, col?}    a place in a file (line / col 1-based)
//   {kind: 'coord', type, ids, ...}    where a panel was when `radar` was typed (lib/skin/radar.js)
//   {kind: 'list', name, items: [..]}  a numbered list put there (`lsp list`): a later
//                                      command takes its numbers (`lsp stop 2`)
//   {kind: 'bus', id, name?}           a panel by its bus id -- what a panel says of another
//                                      (recv.say); the skin makes it a 'panel' when it is its own,
//                                      else it stays: a panel of another window
// The text is for people and is never read back: `go on` goes to the last
// panel / at / coord reference, whatever the line says; "@" alone in an input
// line is replaced by its text (text).
// Pure: the page keeps one store (create) and draws the mark (mark).
(function (root) {
  'use strict';

  function posInt(v) {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  // anything -> a sound reference | null
  function sound(ref) {
    if (!ref || typeof ref !== 'object') return null;
    if (ref.kind === 'panel') return typeof ref.id === 'string' && ref.id ? { kind: 'panel', id: ref.id } : null;
    if (ref.kind === 'at') {
      if (typeof ref.path !== 'string' || !ref.path) return null;
      const line = posInt(ref.line);
      return { kind: 'at', path: ref.path, line: line, col: line ? posInt(ref.col) : null };
    }
    if (ref.kind === 'coord') {
      const ids = Array.isArray(ref.ids) ? ref.ids.filter(function (v) { return typeof v === 'string' && v; }) : [];
      if (typeof ref.type !== 'string' || !ref.type || !ids.length) return null;
      return { kind: 'coord', type: ref.type, table: typeof ref.table === 'string' ? ref.table : '', ids: ids,
        cols: Array.isArray(ref.cols) ? ref.cols.filter(function (v) { return typeof v === 'string' && v; }) : [],
        scope: ref.scope === 'row' ? 'row' : 'cell', panel: typeof ref.panel === 'string' ? ref.panel : null,
        name: typeof ref.name === 'string' ? ref.name : null };
    }
    if (ref.kind === 'bus') {
      return typeof ref.id === 'string' && ref.id ? { kind: 'bus', id: ref.id, name: typeof ref.name === 'string' && ref.name ? ref.name : null } : null;
    }
    if (ref.kind === 'list') {
      if (typeof ref.name !== 'string' || !ref.name || !Array.isArray(ref.items)) return null;
      return { kind: 'list', name: ref.name, items: ref.items.slice() };
    }
    return null;
  }

  // what "@" alone in an input line becomes: the panel's place now ("2 1"),
  // "path:12", the ids of a coordinate as they are (space-separated) -> text | null
  function text(ref, placeOf) {
    if (!ref) return null;
    if (ref.kind === 'panel') return (placeOf && placeOf(ref.id)) || null;
    if (ref.kind === 'at') return ref.path + (ref.line ? ':' + ref.line + (ref.col ? ':' + ref.col : '') : '');
    if (ref.kind === 'coord') return ref.ids.join(' ');
    // another window's panel has no place here: its name
    if (ref.kind === 'bus') return ref.name || ref.id;
    return null;
  }
  // what is shown after the line: "@" and that text ("@2 1", "@path:12", "@<id> <id>")
  function mark(ref, placeOf) {
    const t = text(ref, placeOf);
    return t ? '@' + t : '';
  }

  // the references of the lines there are, oldest first (as many as the lines kept)
  function create(max) {
    const keepN = posInt(max) || 300;
    const refs = [];
    return {
      // -> the reference kept | null
      add: function (ref) {
        const r = sound(ref);
        if (!r) return null;
        refs.push(r);
        while (refs.length > keepN) refs.shift();
        return r;
      },
      // the last place to go to (a panel, a place in a file, a coordinate; a list is not one)
      last: function () {
        for (let i = refs.length - 1; i >= 0; i--) if (refs[i].kind !== 'list') return refs[i];
        return null;
      },
      // item n (1-based) of the last list called `name` -> {item} | {error}
      item: function (name, n) {
        for (let i = refs.length - 1; i >= 0; i--) {
          const r = refs[i];
          if (r.kind !== 'list' || r.name !== name) continue;
          if (!r.items.length) return { error: 'the last ' + name + ' list is empty' };
          const k = posInt(n);
          if (!k || k > r.items.length) return { error: 'no ' + n + ' in the last ' + name + ' list (1 to ' + r.items.length + ')' };
          return { item: r.items[k - 1] };
        }
        return { error: 'no ' + name + ' list yet (' + name + ' list first)' };
      },
    };
  }

  const api = { sound, text, mark, create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).recvRefs = api;
})(typeof self !== 'undefined' ? self : this);
