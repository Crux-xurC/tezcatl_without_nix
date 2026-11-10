// lib/db/sql.js -- a database as a backend (D-db-backend), the browser's side:
// where a database window's socket is (the relay's /sql, D-db-session), and
// an answer made a matrix table. Nothing of a statement is read here.
//   socketUrl(config) -> Promise<"ws://host:port/sql">
//   answer: {ok, columns, rows, num_rows, truncated} | {ok, columns: null,
//           num_rows (changed), last_insert_id} | {ok: false, error, code}
//   toGrid(answer) -> {columns: [{key, label, render}], rows: [{id, cells}], message}
//   command(text) -> {cmd: 'login', account|null} | {cmd: 'exit'} | {cmd: 'cancel'} | null
//     a database window's command line: a text that is exactly one of these is
//     the window's own command; anything else (null) is one statement, sent as it is
//   head(statement) -> its first line, cut short (what the window says it ran)
//   check(sql) -> null | what is wrong with an intent's `sql` ({statement, args, load})
//   intentArgs(intent, args) -> [values for the statement's ?s, in sql.args' order]
//     (throws what is wrong): a param's type checked as an Elisp one is
//     (lib/vent/elisp.js); a value is passed as a value, never put into the text
//   intentLoads(intent, args) -> [{book, as}] (throws what is wrong): sql.load's
//     books -- each named by a param's value, a path under ~work/books without
//     .json -- made temporary tables `as` on window 1 before the statement
// A column's key is its position (c0, c1 …): a statement may name two columns
// alike (select a, a). NULL is shown as NULL.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).sql = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // the relay's /sql from config.json's first connection (ws://h:p/ -> ws://h:p/sql)
  function socketUrl(config) {
    return config.load().then(function (c) {
      const u = c && c.connections && c.connections[0] && c.connections[0].url;
      if (!u) throw new Error('config.json has no relay URL');
      const x = new URL(u);
      return x.protocol + '//' + x.host + '/sql';
    });
  }

  function cell(v) {
    if (v === null || v === undefined) return 'NULL';
    return typeof v === 'string' ? v : String(v);
  }

  function toGrid(a) {
    if (!a || a.ok === false) return { error: (a && a.error) || 'no answer', code: (a && a.code) || null };
    if (!a.columns) {
      return { columns: [], rows: [], message: a.num_rows + ' row(s) changed' + (a.last_insert_id ? ', last id ' + a.last_insert_id : '') };
    }
    const columns = a.columns.map(function (name, i) { return { key: 'c' + i, label: String(name), render: 'text' }; });
    const rows = (a.rows || []).map(function (r, n) {
      const cells = {};
      r.forEach(function (v, i) { cells['c' + i] = cell(v); });
      return { id: 'q' + (n + 1), cells: cells };
    });
    return {
      columns: columns,
      rows: rows,
      message: a.num_rows + ' row(s)' + (a.truncated ? ' (the first ' + rows.length + ' shown)' : ''),
    };
  }

  var ACCOUNT = /^[\w.$-]{1,80}$/;
  function command(text) {
    var w = String(text == null ? '' : text).trim().split(/\s+/);
    if (w[0] !== 'db') return null;
    if (w[1] === 'login' && w.length <= 3 && (w.length === 2 || ACCOUNT.test(w[2]))) return { cmd: 'login', account: w[2] || null };
    if ((w[1] === 'exit' || w[1] === 'cancel') && w.length === 2) return { cmd: w[1] };
    return null;
  }

  function head(statement) {
    var first = String(statement == null ? '' : statement).trim().split(/\r?\n/)[0];
    return first.length > 60 ? first.slice(0, 59) + '…' : first;
  }

  function check(sql) {
    if (!sql || typeof sql !== 'object') return 'sql: not an object';
    if (typeof sql.statement !== 'string' || !sql.statement.trim()) return 'sql.statement: the statement (a string)';
    if (sql.args != null && (!Array.isArray(sql.args) || sql.args.some(function (a) { return typeof a !== 'string' || !a; }))) return 'sql.args: the names of params, one for each ?';
    if (sql.load != null) {
      if (!Array.isArray(sql.load) || sql.load.length > 8) return 'sql.load: up to 8 of {book, as}';
      for (var i = 0; i < sql.load.length; i++) {
        var l = sql.load[i] || {};
        if (typeof l.book !== 'string' || !l.book) return 'sql.load[' + i + '].book: the name of the param that names the book';
        if (typeof l.as !== 'string' || !TABLE.test(l.as)) return 'sql.load[' + i + '].as: a table name of letters, digits and _';
      }
    }
    return null;
  }

  var TABLE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
  var BOOK = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;
  function bookName(b) {
    return typeof b === 'string' && b.length <= 200 && BOOK.test(b) && b.split('/').every(function (s) { return s !== '.' && s !== '..'; });
  }

  function intentLoads(intent, args) {
    var specs = {};
    (intent.params || []).forEach(function (p) { specs[p.name] = p; });
    return ((intent.sql && intent.sql.load) || []).map(function (l) {
      var spec = specs[l.book];
      if (!spec) throw new Error('sql.load names "' + l.book + '" -- not a param');
      var v = args ? args[l.book] : null;
      if ((v == null || v === '') && spec.default != null) v = spec.default;
      v = v == null ? '' : String(v).replace(/^~work\/books\//, '').replace(/\.json$/, '');
      if (!bookName(v)) throw new Error('book "' + v + '": a name under ~work/books (decode/magit.changed-files, run/x)');
      return { book: v, as: l.as };
    });
  }

  function intentArgs(intent, args) {
    var specs = {};
    (intent.params || []).forEach(function (p) { specs[p.name] = p; });
    return ((intent.sql && intent.sql.args) || []).map(function (name) {
      var spec = specs[name];
      if (!spec) throw new Error('sql.args names "' + name + '" -- not a param');
      var raw = args ? args[name] : null;
      if ((raw == null || raw === '') && spec.default != null) raw = spec.default;
      if (raw == null || raw === '') {
        if (spec.required) throw new Error('missing required param "' + name + '"');
        return null;
      }
      switch (spec.type || 'string') {
        case 'string': case 'path': return String(raw);
        case 'int': {
          var n = Number(raw);
          if (!Number.isFinite(n) || Math.trunc(n) !== n) throw new Error('param expects an integer, got "' + raw + '"');
          return n;
        }
        case 'bool': return raw === true || raw === 'true' || raw === 't';
        case 'enum': {
          var allowed = spec.values || [];
          if (allowed.indexOf(String(raw)) === -1) throw new Error('enum param: "' + raw + '" not one of ' + JSON.stringify(allowed));
          return String(raw);
        }
        default: throw new Error('unknown param type "' + spec.type + '"');
      }
    });
  }

  return { socketUrl: socketUrl, toGrid: toGrid, command: command, head: head, check: check, intentArgs: intentArgs, intentLoads: intentLoads };
});
