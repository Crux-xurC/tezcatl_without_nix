// lib/xipe/matrix-render.js -- the table drawn as DOM: header (click to
// sort), the filter prompt row, the rows with cursor / selection / color.
// Split out of lib/xipe/matrix-grid.js (the table split by
// what it does); the grid calls it with its state and the selection, and
// `on` for what a click or the filter prompt changes ({toggleSort,
// commitFilter, cancelFilter, again}). Not exercised by unit tests (DOM).
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).matrixRender = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // -- rendering (DOM; not exercised by unit tests) -----------------------

  function render(el, state, sel, on) {
    if (!el || typeof document === 'undefined') return;
    el.textContent = '';

    const table = document.createElement('table');
    table.className = 'mx-grid';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.appendChild(document.createElement('th')); // gutter header, blank
    state.columns.forEach(function (col) {
      const th = document.createElement('th');
      th.textContent = col.label || col.key;
      if (state.sort.key === col.key) th.textContent += state.sort.dir === 1 ? ' ▲' : ' ▼';
      th.addEventListener('click', function () { on.toggleSort(col.key); on.again(); });
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    if (state.filterPrompt) {
      const promptRow = document.createElement('tr');
      promptRow.className = 'mx-filter-row';
      const cell = document.createElement('td');
      cell.colSpan = state.columns.length + 1;
      const label = document.createElement('span');
      const col = state.columns.filter(function (c) { return c.key === state.filterPrompt; })[0];
      label.textContent = '/ ' + (col ? (col.label || col.key) : state.filterPrompt) + ': ';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = state.filters[state.filterPrompt] || '';
      input.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); on.commitFilter(state.filterPrompt, input.value); on.again(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); on.cancelFilter(); on.again(); }
      });
      cell.appendChild(label);
      cell.appendChild(input);
      promptRow.appendChild(cell);
      thead.appendChild(promptRow);
      setTimeout(function () { input.focus(); }, 0);
    }

    const tbody = document.createElement('tbody');
    const selRowSet = new Set(sel.rowIds);
    const selColSet = new Set(sel.colKeys);

    state.order.forEach(function (id, rowIndex) {
      const row = state.rowsById[id];
      const tr = document.createElement('tr');
      tr.style.contentVisibility = 'auto';

      const gutter = document.createElement('td');
      gutter.className = 'mx-gutter';
      gutter.textContent = String(rowIndex + 1);
      if (rowIndex === state.cursor.rowIndex && state.cursor.col === -1) gutter.classList.add('mx-cursor');
      if (selRowSet.has(id) && sel.scope === 'row') gutter.classList.add('mx-selected');
      tr.appendChild(gutter);

      state.columns.forEach(function (col, colIndex) {
        const td = document.createElement('td');
        const value = row.cells[col.key];
        td.textContent = value == null ? '' : String(value);
        // cells are clamped to one line by the page's CSS (a 4x4 matrix or a
        // stack trace must not stretch the grid) -- the full text stays
        // reachable here and via cursorValue()
        if (value != null && String(value).length > 40) td.title = String(value);
        td.dataset.render = col.render || 'text';
        if (col.render === 'state') td.dataset.state = String(value);
        const mark = state.colors[id] && state.colors[id][col.key];
        if (mark) td.dataset.color = mark;
        if (rowIndex === state.cursor.rowIndex && colIndex === state.cursor.col) td.classList.add('mx-cursor');
        if (selRowSet.has(id) && (sel.scope === 'row' || selColSet.has(col.key))) td.classList.add('mx-selected');
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    el.appendChild(table);
  }

  return { render: render };
});
