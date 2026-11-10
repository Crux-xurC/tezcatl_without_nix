// lib/suggest/dict.js -- the suggestion source "dict" (D-suggestions): one list of
// the dictionary (D-dictionary; ?list=, else "default"), read from its file through
// the relay (/fs, the file named by list_kinds/dict.json `dataFile`) and
// turned into a table when read -- the dictionary stays where people put
// words (the dict list panel); nothing is stored here. Needs lib/list/dict.js.
//
//   toTable(doc, list, dictLib) -> {columns, rows: [{id, cells}]}   (pure)
//   load(env) -> Promise<table>
//     env: {getJson(path), readFs(path) -> Promise<{doc, error}>, params}
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else ((root.Tezcatl = root.Tezcatl || {}).suggestSources = root.Tezcatl.suggestSources || {}).dict = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function toTable(doc, list, dictLib) {
    const rows = dictLib.entries(doc || { lists: {} }, list || 'default')
      .map((e) => ({ id: e.word, cells: { line: e.word, desc: e.note } }));
    return { columns: [{ key: 'line', label: 'word' }, { key: 'desc', label: 'note' }], rows: rows };
  }

  function load(env) {
    const dictLib = self.Tezcatl.dict;
    return env.getJson('list_kinds/dict.json').catch(() => ({})).then((cfg) => {
      const file = (cfg && cfg.dataFile) || 'dict.json';
      return env.readFs(file).then((r) => {
        if (r.error) throw new Error(file + ': ' + r.error);
        return toTable(r.doc, env.params.get('list') || (cfg && cfg.list), dictLib);
      });
    });
  }

  return { toTable, load };
});
