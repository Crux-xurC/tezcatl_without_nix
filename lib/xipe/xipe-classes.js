// lib/xipe/xipe-classes.js -- matrix.html's kind="xipe_classes" adapter logic
// (pure): Xipe Totec's card/list result -> the generic grid's {columns, rows},
// the functions whose class waits for a person (D-xipe-approval).
//
// Xipe Totec evaluates a function only when a person classified it
// (`effect_source` "user"). Two other sources wait for a person's approval
// (`effect/approve`, xipe_totec's D-effect-approval):
//   "agent"   -- an AI agent proposed the class with a one-line reason
//                (`effect/propose`, the MCP bridge's propose_class)
//   "changed" -- a person had classified it, and a rescan found its body
//                changed since; the class shown is the one approved before
// Every other card is left out. What is shown comes from card/list's own
// fields; no Xipe Totec text is read for meaning. The reason is the agent's
// text: shown as it is, never acted on.
//
// `open` : where the function is defined, for the grid's "g d" (its source
// beside the class and reason) -- card/list's `path` put under the FS root by
// `place` (lib/xipe/xipe-place.js), and its `line`.
//
// ref: "all" (every waiting class), or "source=agent" / "source=changed".

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).xipeClasses = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WAITING = { agent: 'proposed', changed: 'body changed' };

  function str(v) { return v == null ? '' : String(v); }

  function wanted(ref) {
    const p = new URLSearchParams(str(ref));
    const s = p.get('source');
    return s && WAITING[s] ? s : null;
  }

  // the cards waiting for a person, in card/list's order (by file and line)
  function waiting(result, ref) {
    const cards = (result && Array.isArray(result.cards)) ? result.cards : [];
    const only = wanted(ref);
    return cards.filter(function (c) {
      return c && WAITING[c.effect_source] && (!only || c.effect_source === only);
    });
  }

  // place: (path from the project's root) -> path from the FS root | null
  function toGrid(result, place, ref) {
    const cards = waiting(result, ref);
    return {
      // what a row is: said with the selection's coordinate (`radar`)
      type: 'function',
      columns: [
        { key: 'function', label: 'function', render: 'text' },
        { key: 'class', label: 'class', render: 'state' },
        { key: 'why', label: 'waits for', render: 'state' },
        { key: 'reason', label: 'reason (the agent\'s)', render: 'text' },
        { key: 'rows', label: 'rows', render: 'number' },
      ],
      rows: cards.map(function (c) {
        const row = {
          id: c.id,
          cells: {
            function: str(c.label),
            class: str(c.effect || 'unknown'),
            why: WAITING[c.effect_source],
            reason: c.effect_source === 'agent' ? str(c.effect_reason) : '',
            rows: str(c.rows == null ? 0 : c.rows),
          },
        };
        const at = typeof place === 'function' && typeof c.path === 'string' && c.path ? place(c.path) : null;
        if (at) row.open = { path: at, span: typeof c.line === 'number' && c.line > 0 ? { line: c.line } : null };
        return row;
      }),
    };
  }

  // effect/approve's params for the rows chosen (ids of this table's rows)
  function approveParams(ids) {
    return { ids: (Array.isArray(ids) ? ids : []).filter(function (id) { return typeof id === 'string' && id; }) };
  }

  return { waiting: waiting, toGrid: toGrid, approveParams: approveParams, WAITING: WAITING };
});
