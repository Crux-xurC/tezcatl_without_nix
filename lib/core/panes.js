(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var doc = root.document;

  var CSS =
    '.tzp-node{display:flex;width:100%;height:100%;min-width:0;min-height:0}' +
    '.tzp-node.row{flex-direction:row}.tzp-node.col{flex-direction:column}' +
    '.tzp-cell{position:relative;display:flex;min-width:0;min-height:0;overflow:hidden}' +
    '.tzp-leaf{display:flex;flex-direction:column;width:100%;height:100%;' +
    'border:1px solid var(--tzp-border,#333);background:var(--tzp-bg,#111)}' +
    '.tzp-leaf.focused{border-color:var(--tzp-focus,#8cb4ff)}' +
    '.tzp-head{flex:0 0 auto;display:flex;gap:.5em;align-items:center;' +
    'font:11px/1.6 var(--tz-ui-font, monospace);padding:.1em .5em;color:var(--tzp-head,#9a7fc0);' +
    'background:var(--tzp-headbg,#0a0710);border-bottom:1px solid var(--tzp-border,#333)}' +
    '.tzp-head .name{color:var(--tzp-headfg,#ff9f1c)}' +
    '.tzp-head .x{margin-left:auto;cursor:pointer;padding:0 .35em;color:#c86}' +
    '.tzp-head .x:hover{color:#f66}' +
    '.tzp-frame{flex:1 1 auto;border:0;width:100%;height:100%;background:#000}' +
    '.tzp-split{flex:0 0 6px;background:var(--tzp-split,#222);position:relative;z-index:2}' +
    '.tzp-node.row>.tzp-split{cursor:col-resize}' +
    '.tzp-node.col>.tzp-split{cursor:row-resize}' +
    '.tzp-split:hover{background:var(--tzp-splith,#8cb4ff)}' +
    '.tzp-dragging,.tzp-dragging *{user-select:none!important;cursor:inherit!important}';

  function injectCss() {
    if (!doc || doc.getElementById('tzp-css')) return;
    var s = doc.createElement('style');
    s.id = 'tzp-css';
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  var seq = 0;
  function genId(role) {
    seq += 1;
    return (role || 'pane') + '-' + seq;
  }

  function resolveSrc(src, name) {
    var abs = src;
    try {
      abs =
        Tezcatl.config && Tezcatl.config.sibling
          ? Tezcatl.config.sibling(src)
          : src;
    } catch (_) {}
    try {
      var u = new URL(abs, root.location && root.location.href);
      if (name && !u.searchParams.get('name')) u.searchParams.set('name', name);
      return u.toString();
    } catch (_) {
      if (name && src.indexOf('name=') === -1) {
        return src + (src.indexOf('?') === -1 ? '?' : '&') + 'name=' + encodeURIComponent(name);
      }
      return src;
    }
  }

  function mount(container, spec, opts) {
    injectCss();
    opts = opts || {};
    var storeKey = 'tezcatl:panes:' + (opts.id || 'default');
    var leaves = {};
    var listeners = { focus: [], close: [], layout: [] };
    var focused = null;

    var savedSizes = loadSizes();

    container.innerHTML = '';
    var rootNode = buildNode(spec, container, [], true);
    container.appendChild(rootNode);
    // the kept sizes come from the relay (lib/core/store.js): set when they arrive
    if (!savedSizes && Tezcatl.store) {
      Tezcatl.store.load(storeKey).then(function (m) {
        if (!m || typeof m !== 'object') return;
        savedSizes = m;
        eachCell(function (c, k) {
          if (typeof m[k] === 'number') { c.style.flex = m[k] + ' 1 0'; c._tzpWeight = m[k]; }
        });
      });
    }

    if (root.addEventListener) {
      root.addEventListener('blur', function () {
        root.setTimeout(function () {
          var ae = doc.activeElement;
          if (ae && ae.tagName === 'IFRAME') {
            var id = ae.getAttribute('data-tzp-id');
            if (id && id !== focused) markFocused(id, false);
          }
        }, 0);
      });
    }

    // A panel asks to be shown (code_editor's code.reveal): it posts
    // {type: "tezcatl.pane.reveal"} to this page, and the pane whose frame it
    // came from is focused -- matched by the frame's window, not by a name,
    // so another skin with the same pane names is never confused with this one.
    if (root.addEventListener) {
      root.addEventListener('message', function (ev) {
        var d = ev && ev.data;
        if (!d || d.type !== 'tezcatl.pane.reveal' || !ev.source) return;
        if (root.location && ev.origin !== root.location.origin) return;
        Object.keys(leaves).forEach(function (id) {
          var leaf = leaves[id];
          if (leaf.iframeEl && leaf.iframeEl.contentWindow === ev.source) {
            try { root.focus(); } catch (_) {}
            markFocused(id, true);
          }
        });
      });
    }

    function buildNode(node, _parent, path, isRoot) {
      if (node && node.dir && Array.isArray(node.children)) {
        var el = doc.createElement('div');
        el.className = 'tzp-node ' + (node.dir === 'col' ? 'col' : 'row');
        node.children.forEach(function (child, i) {
          if (i > 0) el.appendChild(makeSplit(el));
          var cell = doc.createElement('div');
          cell.className = 'tzp-cell';
          var w = sizeFor(path.concat(i), child.size);
          cell.style.flex = w + ' 1 0';
          cell._tzpWeight = w;
          cell.appendChild(buildNode(child, cell, path.concat(i), false));
          el.appendChild(cell);
        });
        return el;
      }
      return buildLeaf(node, isRoot);
    }

    function buildLeaf(leaf, isRoot) {
      var role = leaf.panel || 'panel';
      var id = genId(role);
      var name = leaf.name || id;

      var wrap = doc.createElement('div');
      wrap.className = 'tzp-leaf';

      var head = doc.createElement('div');
      head.className = 'tzp-head';
      var roleEl = doc.createElement('span');
      roleEl.textContent = role;
      var nameEl = doc.createElement('span');
      nameEl.className = 'name';
      nameEl.textContent = name;
      var x = doc.createElement('span');
      x.className = 'x';
      x.title = 'close pane';
      x.textContent = '×';
      x.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closePane(id);
      });
      head.appendChild(roleEl);
      head.appendChild(nameEl);
      head.appendChild(x);
      head.addEventListener('pointerdown', function () {
        focus(id);
      });

      var frame = doc.createElement('iframe');
      frame.className = 'tzp-frame';
      frame.setAttribute('data-tzp-id', id);
      frame.setAttribute('title', role + ' ' + name);
      frame.src = resolveSrc(leaf.src, name);

      wrap.appendChild(head);
      wrap.appendChild(frame);

      leaves[id] = {
        id: id,
        role: role,
        name: name,
        src: leaf.src,
        leafEl: wrap,
        iframeEl: frame,
        _isRoot: !!isRoot,
      };
      return wrap;
    }

    function makeSplit(nodeEl) {
      var s = doc.createElement('div');
      s.className = 'tzp-split';
      s.addEventListener('pointerdown', function (e) {
        startDrag(e, s, nodeEl);
      });
      return s;
    }

    function startDrag(e, splitEl, nodeEl) {
      e.preventDefault();
      var horiz = nodeEl.classList.contains('row');
      var prev = splitEl.previousElementSibling;
      var next = splitEl.nextElementSibling;
      if (!prev || !next) return;
      var startPos = horiz ? e.clientX : e.clientY;
      var prevRect = prev.getBoundingClientRect();
      var nextRect = next.getBoundingClientRect();
      var prevPx = horiz ? prevRect.width : prevRect.height;
      var nextPx = horiz ? nextRect.width : nextRect.height;
      var totalPx = prevPx + nextPx;
      var totalW = (prev._tzpWeight || 1) + (next._tzpWeight || 1);

      doc.body.classList.add('tzp-dragging');
      splitEl.setPointerCapture && splitEl.setPointerCapture(e.pointerId);

      function move(ev) {
        var d = (horiz ? ev.clientX : ev.clientY) - startPos;
        var newPrevPx = Math.max(40, Math.min(totalPx - 40, prevPx + d));
        var frac = newPrevPx / totalPx;
        var pw = totalW * frac;
        var nw = totalW - pw;
        prev.style.flex = pw + ' 1 0';
        next.style.flex = nw + ' 1 0';
        prev._tzpWeight = pw;
        next._tzpWeight = nw;
      }
      function up(ev) {
        doc.body.classList.remove('tzp-dragging');
        splitEl.releasePointerCapture && splitEl.releasePointerCapture(ev.pointerId);
        doc.removeEventListener('pointermove', move);
        doc.removeEventListener('pointerup', up);
        saveSizes();
        emit('layout');
      }
      doc.addEventListener('pointermove', move);
      doc.addEventListener('pointerup', up);
    }

    function pathKey(path) {
      return path.join('.');
    }
    function sizeFor(path, dflt) {
      var k = pathKey(path);
      if (savedSizes && typeof savedSizes[k] === 'number') return savedSizes[k];
      return typeof dflt === 'number' ? dflt : 1;
    }
    function loadSizes() {
      var m = Tezcatl.store ? Tezcatl.store.get(storeKey) : null;
      return m && typeof m === 'object' ? m : null;
    }
    // fn(cell, key) for every cell, in the order of its path
    function eachCell(fn) {
      (function walk(el, path) {
        if (!el) return;
        var kids = el.children;
        var idx = 0;
        for (var i = 0; i < kids.length; i++) {
          var c = kids[i];
          if (c.classList && c.classList.contains('tzp-cell')) {
            fn(c, pathKey(path.concat(idx)));
            var inner = c.firstElementChild;
            if (inner && inner.classList.contains('tzp-node')) {
              walk(inner, path.concat(idx));
            }
            idx += 1;
          }
        }
      })(rootNode, []);
    }
    function saveSizes() {
      var out = {};
      eachCell(function (c, k) { out[k] = c._tzpWeight || 1; });
      if (Tezcatl.store) Tezcatl.store.set(storeKey, out);
      savedSizes = out;
    }

    function markFocused(id, doWindowFocus) {
      var leaf = leaves[id];
      if (!leaf) return;
      focused = id;
      Object.keys(leaves).forEach(function (k) {
        leaves[k].leafEl.classList.toggle('focused', k === id);
      });
      if (doWindowFocus !== false) {
        try {
          leaf.iframeEl.contentWindow &&
            leaf.iframeEl.contentWindow.focus();
        } catch (_) {}
      }
      emit('focus', id);
    }

    function focus(id) {
      markFocused(id, true);
    }

    function closePane(id) {
      var leaf = leaves[id];
      if (!leaf) return;
      var cell = leaf.leafEl.parentNode;
      if (cell && cell.classList && cell.classList.contains('tzp-cell')) {
        var nodeEl = cell.parentNode;
        var sib = cell.previousElementSibling || cell.nextElementSibling;
        if (sib && sib.classList.contains('tzp-split')) sib.remove();
        cell.remove();
        var cells = nodeEl.querySelectorAll(':scope > .tzp-cell');
        if (cells.length === 1 && nodeEl.parentNode) {
          var only = cells[0].firstElementChild;
          nodeEl.parentNode.replaceChild(only, nodeEl);
        }
      } else {
        leaf.leafEl.remove();
      }
      delete leaves[id];
      if (focused === id) focused = null;
      saveSizes();
      emit('close', id);
      emit('layout');
    }

    function addPane(leaf, at) {
      at = at || {};
      var cellEl = doc.createElement('div');
      cellEl.className = 'tzp-cell';
      cellEl._tzpWeight = leaf.size || 1;
      cellEl.style.flex = (leaf.size || 1) + ' 1 0';
      cellEl.appendChild(buildLeaf(leaf, false));

      var side = at.side || 'right';
      var wantRow = side === 'left' || side === 'right';
      var target = rootNode;

      var host = doc.createElement('div');
      host.className = 'tzp-node ' + (wantRow ? 'row' : 'col');
      var existingCell = doc.createElement('div');
      existingCell.className = 'tzp-cell';
      existingCell._tzpWeight = 3;
      existingCell.style.flex = '3 1 0';

      container.replaceChild(host, target);
      existingCell.appendChild(target);

      if (side === 'left' || side === 'top') {
        host.appendChild(cellEl);
        host.appendChild(makeSplit(host));
        host.appendChild(existingCell);
      } else {
        host.appendChild(existingCell);
        host.appendChild(makeSplit(host));
        host.appendChild(cellEl);
      }
      rootNode = host;
      emit('layout');
      return lastLeafId();
    }

    function lastLeafId() {
      var ks = Object.keys(leaves);
      return ks[ks.length - 1] || null;
    }

    function emit(evt, arg) {
      (listeners[evt] || []).forEach(function (fn) {
        try {
          fn(arg);
        } catch (e) {
          try {
            console.error('Tezcatl.panes "' + evt + '" listener threw', e);
          } catch (_) {}
        }
      });
    }
    function on(evt, fn) {
      (listeners[evt] || (listeners[evt] = [])).push(fn);
      return function off() {
        var a = listeners[evt] || [];
        var i = a.indexOf(fn);
        if (i !== -1) a.splice(i, 1);
      };
    }

    function panes() {
      return Object.keys(leaves).map(function (id) {
        return {
          id: id,
          role: leaves[id].role,
          name: leaves[id].name,
          src: leaves[id].src,
        };
      });
    }

    return {
      focus: focus,
      focusedId: function () {
        return focused;
      },
      panes: panes,
      has: function (id) {
        return !!leaves[id];
      },
      get: function (id) {
        return leaves[id] || null;
      },
      closePane: closePane,
      addPane: addPane,
      on: on,
      container: container,
    };
  }

  Tezcatl.panes = { mount: mount };
  if (typeof module === 'object' && module.exports) module.exports = Tezcatl.panes;
})(typeof self !== 'undefined' ? self : this);
