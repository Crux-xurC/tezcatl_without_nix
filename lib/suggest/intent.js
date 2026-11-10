// lib/suggest/intent.js -- the suggestion source "intent" (D-suggestions): the
// intent ids of command/binding_map.json, turned into a table when read
// (never stored: one place holds them).
//
//   toTable(bindings) -> {columns, rows: [{id, cells}]}   (pure)
//   load(env) -> Promise<table>   env: {getJson(path)}
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else ((root.Tezcatl = root.Tezcatl || {}).suggestSources = root.Tezcatl.suggestSources || {}).intent = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function toTable(bindings) {
    const rows = (Array.isArray(bindings) ? bindings : [])
      .filter((b) => b && typeof b.id === 'string' && b.id)
      .map((b) => ({ id: b.id, cells: { line: b.id, desc: b.keys ? 'keys: ' + b.keys : '' } }));
    return { columns: [{ key: 'line', label: 'intent' }, { key: 'desc', label: 'keys' }], rows: rows };
  }

  function load(env) {
    return env.getJson('command/binding_map.json').then(toTable);
  }

  return { toTable, load };
});
