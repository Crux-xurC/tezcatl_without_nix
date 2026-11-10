// lib/xipe/matrix-grid.js -- the generic, backend-agnostic grid engine behind
// panels/resident/matrix.html (matrix.html section,
// design). This module knows nothing about Xipe Totec: it takes plain
// {columns, rows} data and reports user actions through two channels only
// (see the design notes) --
//
//   - shell-internal (handled entirely in here): cursor movement, visual
//     selection, sort, filter, per-cell coloring (persisted by the *caller*,
//     not this module -- see opts.onColorChange), CSV export.
//   - reported outward: open-location to the page (opts.onOpen(row) -- the
//     page knows how a file is opened where it lives; without it, `code.open`
//     on the bus) and `killring.add` (yank) via `bus`. Where the selection is (row ids, column keys --
//     never a value) is read with coord(); the page says it to the resident
//     cursor panel after each drawing (opts.onDrawn), and `radar` makes it a
//     reference (lib/skin/radar.js). A key this module does not know does
//     nothing: what to do with a selection is typed, with that reference.
//
// A `row` is `{id, cells: {<colKey>: <already display-ready string>},
// open: {path, span} | undefined}`. Cell *values* are expected to already be
// adapter-resolved (⟦id⟧ tokens turned into display names, repr/binary
// handling done, etc.) -- this module only attaches a `data-render`/
// `data-state` hook per column so CSS can style it, it never re-interprets
// the value itself.
//
// Keys: h/j/k/l + arrows (move), v (visual), Escape (back to normal),
// y (yank), / (filter), c then b/r/y/w (color set/clear), g then d
// (open-location).

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).matrixGrid = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLORS = ['b', 'r', 'y'];

  // the pure pieces and the drawing are their own files
  const D = (typeof module === 'object' && module.exports) ? require('./matrix-data.js') : self.Tezcatl.matrixData;
  const R = (typeof module === 'object' && module.exports) ? require('./matrix-render.js') : self.Tezcatl.matrixRender;
  const parseFilterExpr = D.parseFilterExpr;
  const toCSVField = D.toCSVField;
  const rowsToCSV = D.rowsToCSV;


  // ---------------------------------------------------------------------
  // grid instance
  // ---------------------------------------------------------------------
  function create(opts) {
    opts = opts || {};
    const bus = opts.bus || null;
    const onColorChange = typeof opts.onColorChange === 'function' ? opts.onColorChange : function () {};
    const el = opts.el || null; // DOM container; render() is a no-op without one
    const onDrawn = typeof opts.onDrawn === 'function' ? opts.onDrawn : function () {};   // after each drawing (the page says the coordinate)
    const onOpen = typeof opts.onOpen === 'function' ? opts.onOpen : null;   // g d on a row (one with no `open` too: the page says so)

    const state = {
      columns: [],
      rowsById: {},     // id -> row
      rowIds: [],        // insertion order (pre sort/filter)
      order: [],          // display order after sort+filter
      cursor: { rowIndex: null, col: -1 },
      mode: 'normal',      // 'normal' | 'visual'
      anchor: null,        // { rowIndex, col } snapshot from when visual mode was entered
      sort: { key: null, dir: 1 },
      filters: {},          // colKey -> expr string
      colors: {},            // rowId -> { colKey -> 'b'|'r'|'y' }
      pendingChord: null,      // null | 'c' | 'g'
      filterPrompt: null,       // colKey currently being edited via '/', or null
    };

    if (opts.columns) setColumns(opts.columns);
    if (opts.rows) setRows(opts.rows);
    if (opts.initialColors) state.colors = deepCloneColors(opts.initialColors);

    // -- data -------------------------------------------------------------

    function setColumns(columns) {
      state.columns = (columns || []).slice();
      recompute();
    }

    function setRows(rows) {
      state.rowsById = {};
      state.rowIds = [];
      (rows || []).forEach(function (row) {
        state.rowsById[row.id] = row;
        state.rowIds.push(row.id);
      });
      clampCursor();
      recompute();
    }

    function patchRow(id, cells, extra) {
      const existing = state.rowsById[id];
      const merged = { id: id, cells: Object.assign({}, existing && existing.cells, cells) };
      if (extra && extra.open) merged.open = extra.open;
      else if (existing && existing.open) merged.open = existing.open;
      state.rowsById[id] = merged;
      if (!existing) state.rowIds.push(id);
      recompute();
    }

    function removeRow(id) {
      delete state.rowsById[id];
      state.rowIds = state.rowIds.filter(function (x) { return x !== id; });
      delete state.colors[id];
      clampCursor();
      recompute();
    }

    function recompute() {
      let ids = state.rowIds.slice();

      Object.keys(state.filters).forEach(function (key) {
        const pred = parseFilterExpr(state.filters[key]);
        ids = ids.filter(function (id) { return pred(state.rowsById[id].cells[key]); });
      });

      if (state.sort.key) {
        const key = state.sort.key;
        const dir = state.sort.dir;
        ids = ids.slice().sort(function (a, b) {
          const va = state.rowsById[a].cells[key];
          const vb = state.rowsById[b].cells[key];
          const na = Number(va);
          const nb = Number(vb);
          let cmp;
          if (va !== '' && vb !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) {
            cmp = na < nb ? -1 : na > nb ? 1 : 0;
          } else {
            const sa = String(va == null ? '' : va);
            const sb = String(vb == null ? '' : vb);
            cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
          }
          return cmp * dir;
        });
      }

      state.order = ids;
      clampCursor();
    }

    function clampCursor() {
      if (state.order.length === 0) {
        state.cursor.rowIndex = null;
        return;
      }
      if (state.cursor.rowIndex == null) {
        state.cursor.rowIndex = 0;
        return;
      }
      state.cursor.rowIndex = Math.max(0, Math.min(state.order.length - 1, state.cursor.rowIndex));
    }

    // -- sort / filter (display-only, mouse-triggered from the page layer) --

    function toggleSort(colKey) {
      if (state.sort.key !== colKey) {
        state.sort = { key: colKey, dir: 1 };
      } else if (state.sort.dir === 1) {
        state.sort = { key: colKey, dir: -1 };
      } else {
        state.sort = { key: null, dir: 1 };
      }
      recompute();
    }

    function commitFilter(colKey, expr) {
      if (expr && expr.trim()) state.filters[colKey] = expr;
      else delete state.filters[colKey];
      state.filterPrompt = null;
      recompute();
    }

    function cancelFilter() {
      state.filterPrompt = null;
    }

    // -- selection ----------------------------------------------------------

    function currentRowId() {
      return state.cursor.rowIndex == null ? null : state.order[state.cursor.rowIndex];
    }

    // {rowIds, colKeys, scope: 'row'|'cell'} for whatever is presently
    // selected -- the single cursor cell in normal mode, or the
    // anchor..cursor rectangle in visual mode. Either endpoint touching the
    // gutter (col -1) promotes the whole selection to scope 'row' (every
    // data column, for every spanned row) -- see moduledoc.
    function computeSelection() {
      if (state.cursor.rowIndex == null) return { rowIds: [], colKeys: [], scope: 'cell' };

      let r0 = state.cursor.rowIndex;
      let r1 = state.cursor.rowIndex;
      let c0 = state.cursor.col;
      let c1 = state.cursor.col;

      if (state.mode === 'visual' && state.anchor) {
        r0 = Math.min(state.anchor.rowIndex, state.cursor.rowIndex);
        r1 = Math.max(state.anchor.rowIndex, state.cursor.rowIndex);
        c0 = Math.min(state.anchor.col, state.cursor.col);
        c1 = Math.max(state.anchor.col, state.cursor.col);
      }

      const rowIds = state.order.slice(r0, r1 + 1);
      const scope = c0 === -1 ? 'row' : 'cell';
      const colKeys = scope === 'row'
        ? state.columns.map(function (c) { return c.key; })
        : state.columns.slice(c0, c1 + 1).map(function (c) { return c.key; });

      return { rowIds: rowIds, colKeys: colKeys, scope: scope };
    }

    // -- shell-native actions -------------------------------------------------

    function yank() {
      const sel = computeSelection();
      if (!sel.rowIds.length) return;
      let payload;
      if (sel.rowIds.length === 1 && sel.colKeys.length === 1 && sel.scope === 'cell') {
        payload = state.rowsById[sel.rowIds[0]].cells[sel.colKeys[0]];
      } else {
        payload = sel.rowIds.map(function (id) {
          const row = state.rowsById[id];
          return sel.colKeys.map(function (key) { return row.cells[key]; });
        });
      }
      if (bus) bus.post('killring.add', { text: JSON.stringify(payload), source: 'matrix' });
      exitVisual();
    }

    function setColor(letter) {
      const sel = computeSelection();
      sel.rowIds.forEach(function (id) {
        sel.colKeys.forEach(function (key) {
          if (letter === 'w') {
            if (state.colors[id]) {
              delete state.colors[id][key];
              if (!Object.keys(state.colors[id]).length) delete state.colors[id];
            }
          } else {
            state.colors[id] = state.colors[id] || {};
            state.colors[id][key] = letter;
          }
          onColorChange(id, key, letter === 'w' ? null : letter);
        });
      });
      exitVisual();
    }

    function openLocation() {
      const id = currentRowId();
      const row = id != null ? state.rowsById[id] : null;
      if (onOpen) { if (row) onOpen(row); return; }
      if (row && row.open && row.open.path && bus) {
        bus.post('code.open', { path: row.open.path, span: row.open.span || null });
      }
    }

    // -- cursor / mode --------------------------------------------------------

    function moveCursor(dCol, dRow) {
      if (state.cursor.rowIndex == null) return;
      if (dRow) {
        state.cursor.rowIndex = Math.max(0, Math.min(state.order.length - 1, state.cursor.rowIndex + dRow));
      }
      if (dCol) {
        state.cursor.col = Math.max(-1, Math.min(state.columns.length - 1, state.cursor.col + dCol));
      }
    }

    function enterOrToggleVisual() {
      if (state.mode === 'visual') {
        exitVisual();
      } else {
        state.mode = 'visual';
        state.anchor = { rowIndex: state.cursor.rowIndex, col: state.cursor.col };
      }
    }

    function exitVisual() {
      state.mode = 'normal';
      state.anchor = null;
    }

    // -- key dispatch -----------------------------------------------------

    // `k` is the {key, modifiers} shape Tezcatl.keymap.normalize/2 produces
    // (this module never touches a raw KeyboardEvent). Returns true if the
    // key was consumed (caller should preventDefault), false otherwise.
    function handleKey(k) {
      if (!k || k.modifiers.length) return false; // no modifier chords here

      // Escape always wins, even mid-chord (c-pending, g-pending, or a
      // filter prompt) -- it must never be swallowed as an invalid
      // color/open-location follow-up key.
      if (k.key === 'escape') { exitVisual(); state.pendingChord = null; cancelFilter(); return true; }

      if (state.pendingChord === 'c') {
        state.pendingChord = null;
        if (COLORS.indexOf(k.key) !== -1 || k.key === 'w') { setColor(k.key); return true; }
        return false;
      }
      if (state.pendingChord === 'g') {
        state.pendingChord = null;
        if (k.key === 'd') { openLocation(); return true; }
        return false;
      }

      switch (k.key) {
        case 'h': case 'left': moveCursor(-1, 0); return true;
        case 'l': case 'right': moveCursor(1, 0); return true;
        case 'j': case 'down': moveCursor(0, 1); return true;
        case 'k': case 'up': moveCursor(0, -1); return true;
        case 'v': enterOrToggleVisual(); return true;
        case 'y': yank(); return true;
        case 'c': state.pendingChord = 'c'; return true;
        case 'g': state.pendingChord = 'g'; return true;
        case '/':
          if (state.cursor.col !== -1) state.filterPrompt = state.columns[state.cursor.col].key;
          return true;
        default:
          return false;
      }
    }

    // -- rendering: lib/xipe/matrix-render.js
    function render() {
      R.render(el, state, computeSelection(), { toggleSort: toggleSort, commitFilter: commitFilter, cancelFilter: cancelFilter, again: render });
      onDrawn();
    }
    // where the selection is: {ids, cols, scope} -- row ids and column keys, never a value
    function coord() {
      const sel = computeSelection();
      return { ids: sel.rowIds.slice(), cols: sel.scope === 'row' ? [] : sel.colKeys.slice(), scope: sel.scope };
    }

    return {
      setColumns: setColumns,
      setRows: setRows,
      patchRow: patchRow,
      removeRow: removeRow,
      toggleSort: toggleSort,
      commitFilter: commitFilter,
      cancelFilter: cancelFilter,
      handleKey: handleKey,
      toCSV: function () { return rowsToCSV(state.columns, state.order.map(function (id) { return state.rowsById[id]; })); },
      render: render,
      coord: coord,
      // the cursor cell's full value (cells are shown clamped), or null when
      // the cursor is on the gutter / nowhere
      cursorValue: function () {
        const c = state.cursor;
        if (c.rowIndex == null || c.col < 0) return null;
        const id = state.order[c.rowIndex];
        const col = state.columns[c.col];
        if (id == null || !col) return null;
        const v = state.rowsById[id].cells[col.key];
        return { column: col.label || col.key, value: v == null ? '' : String(v) };
      },
      // the kept colors, when they arrive after the grid was made
      setColors: function (colors) { state.colors = deepCloneColors(colors || {}); render(); },
      getState: function () {
        return {
          columns: state.columns.slice(),
          order: state.order.slice(),
          cursor: Object.assign({}, state.cursor),
          mode: state.mode,
          anchor: state.anchor ? Object.assign({}, state.anchor) : null,
          sort: Object.assign({}, state.sort),
          filters: Object.assign({}, state.filters),
          colors: deepCloneColors(state.colors),
          pendingChord: state.pendingChord,
          filterPrompt: state.filterPrompt,
        };
      },
      _computeSelection: computeSelection,
    };
  }

  function deepCloneColors(colors) {
    const out = {};
    Object.keys(colors || {}).forEach(function (id) { out[id] = Object.assign({}, colors[id]); });
    return out;
  }

  return {
    create: create,
    parseFilterExpr: parseFilterExpr,
    toCSVField: toCSVField,
    rowsToCSV: rowsToCSV,
  };
});
