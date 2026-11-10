// lib/list/kinds/xipe_cards.js -- the list kind "xipe_cards": Xipe Totec's cards (every function, from card/list); Enter opens one in matrix.html, M-d its definition.
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  // Xipe Totec card browser (read-only). fill() asks card/list once (a
  // one-shot request over the relay's /xipe; `?root=` or cfg.root names the
  // xipe.json entry, "." by default): every function with its file, line,
  // effect and how many calc rows it has -- structured fields, no text of
  // Xipe Totec's is read. Read once: open the list again to refresh.
  // onSelect opens a card in matrix.html, whose launch contract is an opaque
  // `{kind, ref}` pair (matrix.html never parses `ref`): each item carries
  // `raw.ref`, the card's address as card/get takes it. The key bound to
  // "define" (M-d) goes to the function's definition (code.open-at), its
  // path put under the FS root (lib/xipe/xipe-place.js).
  kinds.xipe_cards = (function () {
    var OPEN_CLAIM_TIMEOUT_MS = 200;

    function mkReqId() {
      return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    }

    // Same claim-or-open-new-window shape as lib/vent/compile-intent.js's
    // openCutoff (compile.cutoff.open/opened) -- if a matrix.html already
    // attached to this {kind, ref} claims the reqId within the window, reuse
    // it instead of opening a duplicate. No trailing "ready" handshake here
    // (matrix.html doesn't have one yet) -- open-and-forget past the claim.
    function openMatrix(kind, ref, api) {
      var reqId = mkReqId();
      var bus = api.bus;
      var claimed = false;
      var off = bus.on('matrix.table.opened', function (payload) {
        if (payload && payload.reqId === reqId) claimed = true;
      });
      bus.post('matrix.table.open', { reqId: reqId, kind: kind, ref: ref });
      setTimeout(function () {
        off();
        if (claimed) return;
        var base = (Tezcatl.config && Tezcatl.config.sibling)
          ? Tezcatl.config.sibling('panels/resident/matrix.html')
          : 'panels/resident/matrix.html';
        var url = base +
          '?kind=' + encodeURIComponent(kind) +
          '&ref=' + encodeURIComponent(ref) +
          '&req=' + encodeURIComponent(reqId);
        var w = typeof root.open === 'function' ? root.open(url, 'tezcatl-matrix-' + reqId) : null;
        if (api.log) api.log(w ? 'opened matrix: ' + ref : 'popup blocked: ' + ref);
      }, OPEN_CLAIM_TIMEOUT_MS);
    }

    function dep(name, file) {
      return (root.Tezcatl && root.Tezcatl[name]) || (typeof require === 'function' ? require(file) : null);
    }
    function rootKey(cfg, api) {
      var q = api && api.params && typeof api.params.get === 'function' ? api.params.get('root') : null;
      return q || (cfg && cfg.root) || '.';
    }
    // the card's address, as matrix.html's kind "xipe" (card/get) takes it
    function refOf(c) {
      var p = [];
      if (c.module != null && c.module !== '') p.push('module=' + encodeURIComponent(c.module));
      if (c.name != null) p.push('name=' + encodeURIComponent(c.name));
      if (c.anykey != null && c.anykey !== '') p.push('arity=' + encodeURIComponent(c.anykey));
      return p.join('&');
    }
    // card/list's cards -> items; place: (path from the project's root) -> path from the FS root | null
    function toItems(cards, place) {
      return (Array.isArray(cards) ? cards : []).map(function (c) {
        var at = c.path ? c.path + (c.line ? ':' + c.line : '') : '(no file)';
        var n = c.rows || 0;
        var sub = [at, c.effect || 'unknown', n + (n === 1 ? ' row' : ' rows')];
        if (c.visibility === 'private') sub.push('private');
        var fsPath = typeof place === 'function' && c.path ? place(c.path) : null;
        return {
          id: c.id,
          label: c.label || ((c.module ? c.module + '.' : '') + c.name),
          sub: sub.join(' · '),
          raw: { ref: refOf(c), kind: 'xipe', card: c, open: fsPath ? { path: fsPath, line: c.line || 1 } : null },
        };
      });
    }

    return {
      fill: function (cfg, api) {
        var client = dep('xipeClient', '../../xipe/xipe-client.js');
        var P = dep('xipePlace', '../../xipe/xipe-place.js');
        var config = root.Tezcatl && root.Tezcatl.config;
        var key = rootKey(cfg, api);
        return Promise.all([client.call(config, key, 'card/list', {}), P.fsRoot(config)]).then(function (got) {
          var where = P.resolver(got[1], got[0].project && got[0].project.root);
          var items = toItems(got[0].result && got[0].result.cards, where.place);
          if (api && api.log) {
            api.log(items.length + ' function(s)  root=' + key +
              (where.why ? ' ── M-d cannot open a definition: ' + where.why : ''));
          }
          return items;
        }, function (e) {
          if (api && api.log) api.log('! ' + ((e && e.message) || e));
          return [];
        });
      },
      onKey: function (chord, item, cfg, api) {
        if (!(cfg && cfg.keys && cfg.keys[chord] === 'define') || !item) return;
        var o = item.raw && item.raw.open;
        if (!o) { if (api.log) api.log('! ' + item.label + ' has no place to open (its file is not known, or is outside the FS root)'); return; }
        if (root.Tezcatl && root.Tezcatl.commands) root.Tezcatl.commands.invoke('code.open-at', { path: o.path, line: o.line });
      },
      _toItems: toItems,
      _refOf: refOf,
      onSelect: function (item, cfg, api) {
        var ref = item && item.raw && item.raw.ref;
        if (!ref) {
          if (api.log) api.log('this card has no ref');
          return;
        }
        openMatrix((item.raw && item.raw.kind) || 'xipe', ref, api);
      },
      _openMatrix: openMatrix,
    };
  })();
})(typeof self !== 'undefined' ? self : this);
