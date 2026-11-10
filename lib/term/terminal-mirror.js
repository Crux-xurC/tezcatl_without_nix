(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  // A receive-only xterm.js instance: never connects to /pty, only renders
  // bytes broadcast over the panel bus (see panels/resident/xterm.html's
  // `terminal.data` post) by a specific source frame. Used by
  // panels/tool/xterm_cutoff.html. Because it is a fresh bus subscriber, "since I
  // was mounted" falls out for free from BroadcastChannel's pub-sub timing --
  // no marker/snapshot bookkeeping needed.

  var PATH_LINE_RE = /([^\s:()]+\.[A-Za-z0-9]+):(\d+)(?::(\d+))?/g;

  function mount(container, opts) {
    opts = opts || {};
    var bus = Tezcatl.bus;
    var sourceId = opts.source || null;

    var term = new Terminal({
      fontFamily: opts.fontFamily ||
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace',
      fontSize: opts.fontSize || 13,
      disableStdin: true,
      cursorStyle: 'bar',
      cursorBlink: false,
      scrollback: 10000,
      allowProposedApi: true,
      theme: { background: '#000000' },
    });

    var fit = (typeof FitAddon !== 'undefined') ? new FitAddon.FitAddon() : null;
    if (fit) term.loadAddon(fit);
    term.open(container);
    if (fit) { try { fit.fit(); } catch (_) {} }

    function doFit() {
      if (fit) { try { fit.fit(); } catch (_) {} }
    }
    if (typeof root.addEventListener === 'function') root.addEventListener('resize', doFit);
    if (typeof ResizeObserver === 'function') {
      try { new ResizeObserver(doFit).observe(container); } catch (_) {}
    }

    // path:line[:col] -> clickable, per-line ('s plan for
    // xterm.html itself; a disposable per-compile-run pane is at least as
    // good a home for it, since that is exactly where "jump to the error"
    // matters most).
    if (typeof term.registerLinkProvider === 'function') {
      term.registerLinkProvider({
        provideLinks: function (bufferLineNumber, callback) {
          var lineObj = term.buffer.active.getLine(bufferLineNumber - 1);
          if (!lineObj) { callback(undefined); return; }
          var text = lineObj.translateToString(true);
          var links = [];
          var m;
          PATH_LINE_RE.lastIndex = 0;
          while ((m = PATH_LINE_RE.exec(text))) {
            (function (match) {
              var path = match[1];
              var line = parseInt(match[2], 10);
              var col = match[3] ? parseInt(match[3], 10) : 0;
              var startX = match.index + 1;
              links.push({
                range: {
                  start: { x: startX, y: bufferLineNumber },
                  end: { x: startX + match[0].length, y: bufferLineNumber },
                },
                text: match[0],
                activate: function () {
                  if (typeof opts.onLink === 'function') opts.onLink(path, line, col);
                },
              });
            })(m);
          }
          callback(links.length ? links : undefined);
        },
      });
    }

    function onData(payload, meta) {
      if (!sourceId || !meta || !meta.from || meta.from.id !== sourceId) return;
      var bytes = payload && payload.bytes;
      if (!bytes) return;
      term.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    }
    if (bus) bus.on('terminal.data', onData);

    function setSource(id) {
      sourceId = id || null;
      term.clear();
    }

    return { term: term, setSource: setSource, fit: doFit };
  }

  Tezcatl.terminalMirror = { mount: mount };
  if (typeof module === 'object' && module.exports) module.exports = Tezcatl.terminalMirror;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
