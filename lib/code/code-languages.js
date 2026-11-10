(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  // These ids drive two things: the CM6 grammar AND the webLSP language key
  // (lsp.json). The grammar is either in the bundle (lib/vendor/codemirror/
  // entry.js `LANGS`) or a grammar plugin loaded at run time (GRAMMARS below,
  //
  // The tables here are the built-in ones. code.json `languages` (or a
  // `code.configure {languages}`) adds to them without touching code:
  //   { "<id>": { "extensions": ["go"], "filenames": ["go.mod"],
  //               "names": ["golang"], "grammar": "languages/go.js" } }
  // -- an id with no grammar still gets its LSP (lsp.json). User entries win
  // over the built-in ones..
  var IDS = [
    'javascript', 'json', 'html', 'css', 'markdown', 'yaml', 'python',
    'rust', 'cpp', 'sql', 'xml', 'shell', 'lua', 'toml', 'diff',
    'dockerfile', 'ruby', 'erlang', 'elixir', 'nix', 'ocaml', 'haskell', 'mariadb',
  ];

  // id -> grammar plugin, a path from the tezcatl root (like list_kinds'
  // `page`). The rest of IDS have their grammar in the bundle.
  var GRAMMARS = {
    elixir: 'languages/elixir.js',
    // SQL in MariaDB's dialect: the database window's command line (?lang=mariadb)
    mariadb: 'languages/mariadb.js',
  };

  var BY_FILENAME = {
    dockerfile: 'dockerfile',
    containerfile: 'dockerfile',
    'gemfile': 'ruby',
    'rakefile': 'ruby',
    'pkgbuild': 'shell',
    '.bashrc': 'shell',
    '.bash_profile': 'shell',
    '.zshrc': 'shell',
    '.profile': 'shell',
    'cargo.lock': 'toml',
    'mix.exs': 'elixir',
    'dune-project': 'ocaml',
    'dune-workspace': 'ocaml',
    'dune': 'ocaml',
  };

  var BY_EXT = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'javascript', tsx: 'javascript', mts: 'javascript', cts: 'javascript',
    json: 'json', jsonc: 'json', json5: 'json',
    html: 'html', htm: 'html', xhtml: 'html', vue: 'html', svelte: 'html',
    css: 'css', scss: 'css', sass: 'css', less: 'css',
    md: 'markdown', markdown: 'markdown', mkd: 'markdown',
    yml: 'yaml', yaml: 'yaml',
    py: 'python', pyw: 'python', pyi: 'python',
    rs: 'rust',
    c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', cxx: 'cpp',
    hpp: 'cpp', hh: 'cpp', hxx: 'cpp', 'c++': 'cpp',
    sql: 'sql',
    xml: 'xml', svg: 'xml', xsd: 'xml', xsl: 'xml', xslt: 'xml', plist: 'xml', rss: 'xml',
    sh: 'shell', bash: 'shell', zsh: 'shell', ksh: 'shell',
    lua: 'lua',
    toml: 'toml',
    diff: 'diff', patch: 'diff',
    dockerfile: 'dockerfile',
    rb: 'ruby', rake: 'ruby', gemspec: 'ruby',
    erl: 'erlang', hrl: 'erlang',
    ex: 'elixir', exs: 'elixir', eex: 'elixir', heex: 'elixir', leex: 'elixir',
    nix: 'nix',
    ml: 'ocaml', mli: 'ocaml', mll: 'ocaml', mly: 'ocaml',
    hs: 'haskell', lhs: 'haskell',
    txt: null, text: null, log: null,
  };

  var BY_NAME = {
    javascript: 'javascript', js: 'javascript', node: 'javascript',
    typescript: 'javascript', ts: 'javascript', jsx: 'javascript', tsx: 'javascript',
    json: 'json',
    html: 'html', htm: 'html',
    css: 'css', scss: 'css', sass: 'css', less: 'css',
    markdown: 'markdown', md: 'markdown',
    yaml: 'yaml', yml: 'yaml',
    python: 'python', py: 'python',
    rust: 'rust', rs: 'rust',
    cpp: 'cpp', 'c++': 'cpp', c: 'cpp', cxx: 'cpp',
    sql: 'sql',
    mariadb: 'mariadb', mysql: 'mariadb',
    xml: 'xml', svg: 'xml',
    shell: 'shell', sh: 'shell', bash: 'shell', 'shell-script': 'shell',
    lua: 'lua',
    toml: 'toml',
    diff: 'diff', patch: 'diff',
    dockerfile: 'dockerfile', docker: 'dockerfile',
    ruby: 'ruby', rb: 'ruby',
    erlang: 'erlang', erl: 'erlang',
    elixir: 'elixir', ex: 'elixir', exs: 'elixir', eex: 'elixir', heex: 'elixir',
    nix: 'nix',
    ocaml: 'ocaml', ml: 'ocaml',
    haskell: 'haskell', hs: 'haskell',
    text: null, plain: null, txt: null, none: null,
  };

  function has(obj, k) {
    return Object.prototype.hasOwnProperty.call(obj, k);
  }

  // the user's table (code.json `languages`), replaced whole by configure()
  var user = { ids: [], byName: {}, byFile: {}, byExt: {}, grammars: {} };

  function strings(v) {
    return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x.trim(); }) : [];
  }

  // configure(table) -> list of problems (strings); bad entries are skipped
  function configure(table) {
    var next = { ids: [], byName: {}, byFile: {}, byExt: {}, grammars: {} };
    var problems = [];
    if (table != null && (typeof table !== 'object' || Array.isArray(table))) {
      problems.push('languages: expected an object of { <id>: {...} }');
      table = null;
    }
    Object.keys(table || {}).forEach(function (rawId) {
      var id = rawId.trim().toLowerCase();
      var e = table[rawId];
      if (!id || !e || typeof e !== 'object' || Array.isArray(e)) {
        problems.push('languages.' + rawId + ': expected an object');
        return;
      }
      next.ids.push(id);
      next.byName[id] = id;
      strings(e.names).forEach(function (n) { next.byName[n.trim().toLowerCase()] = id; });
      strings(e.filenames).forEach(function (f) { next.byFile[f.trim().toLowerCase()] = id; });
      strings(e.extensions).forEach(function (x) {
        next.byExt[x.trim().toLowerCase().replace(/^\./, '')] = id;
      });
      if (typeof e.grammar === 'string' && e.grammar.trim()) next.grammars[id] = e.grammar.trim();
      else if ('grammar' in e && e.grammar != null) problems.push('languages.' + rawId + '.grammar: expected a path');
    });
    user = next;
    return problems;
  }

  function pick(userTable, builtIn, k) {
    if (has(userTable, k)) return userTable[k];
    if (has(builtIn, k)) return builtIn[k];
    return undefined;
  }

  function resolve(hint) {
    if (typeof hint !== 'string') return null;
    var s = hint.trim().toLowerCase();
    if (!s) return null;
    var hit;

    if ((hit = pick(user.byName, BY_NAME, s)) !== undefined) return hit;

    var base = s.split(/[\\/]/).pop();
    if (!base) return null;

    if ((hit = pick(user.byFile, BY_FILENAME, base)) !== undefined) return hit;

    var dot = base.lastIndexOf('.');
    var ext = dot > 0 ? base.slice(dot + 1) : (dot === 0 ? base.slice(1) : '');
    if (ext && (hit = pick(user.byExt, BY_EXT, ext)) !== undefined) return hit;

    return null;
  }

  // the grammar plugin's path for id, or null (bundle grammar, or none)
  function grammar(id) {
    if (typeof id !== 'string') return null;
    var g = pick(user.grammars, GRAMMARS, id);
    return g === undefined ? null : g;
  }

  function list() {
    return IDS.concat(user.ids.filter(function (id) { return IDS.indexOf(id) < 0; }));
  }

  Tezcatl.codeLanguages = { resolve: resolve, list: list, configure: configure, grammar: grammar };
  if (typeof module === 'object' && module.exports) {
    module.exports = Tezcatl.codeLanguages;
  }
})(typeof self !== 'undefined' ? self : this);
