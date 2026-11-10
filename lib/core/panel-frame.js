(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var bus = Tezcatl.bus;


  var ALIAS = {
    return: 'enter',
    ret: 'enter',
    esc: 'escape',
    del: 'delete',
    spc: ' ',
    space: ' ',
  };
  function normKey(k) {
    var low = String(k).toLowerCase();
    return Object.prototype.hasOwnProperty.call(ALIAS, low) ? ALIAS[low] : low;
  }

  function chord(desc) {
    var parts = String(desc).split('-');
    var key = parts.pop();
    var mods = [];
    parts.forEach(function (p) {
      if (p === 'C') mods.push('control');
      else if (p === 'M') mods.push('meta');
      else if (p === 'S') mods.push('shift');
      else if (p === 's') mods.push('super');
    });
    mods.sort();
    return { key: normKey(key), mods: mods };
  }

  var sequences = [
    { key: 'leave',    chords: [chord('escape'), chord('escape')], event: 'yield',    reason: 'leave-key' },
    { key: 'killring', chords: [chord('escape'), chord('y')],      event: 'killring', reason: 'killring-key' },
  ];
  var windowMs = 400;

  var recent = [];

  function seqChords(key) {
    for (var i = 0; i < sequences.length; i++) {
      if (sequences[i].key === key) return sequences[i].chords;
    }
    return null;
  }
  function maxSeqLen() {
    var m = 1;
    for (var i = 0; i < sequences.length; i++) {
      if (sequences[i].chords.length > m) m = sequences[i].chords.length;
    }
    return m;
  }

  function evChord(ev) {
    var mods = [];
    if (ev.ctrlKey) mods.push('control');
    if (ev.altKey) mods.push('meta');
    if (ev.shiftKey) mods.push('shift');
    if (ev.metaKey) mods.push('super');
    mods.sort();
    return { key: normKey(ev.key), mods: mods };
  }

  function sameChord(a, b) {
    return (
      a.key === b.key &&
      a.mods.length === b.mods.length &&
      a.mods.every(function (m, i) {
        return b.mods[i] === m;
      })
    );
  }

  function matchTail(hist, wanted, winMs) {
    if (hist.length < wanted.length) return false;
    var tail = hist.slice(hist.length - wanted.length);
    if (tail[tail.length - 1].at - tail[0].at > winMs) return false;
    for (var i = 0; i < wanted.length; i++) {
      if (!sameChord(tail[i], wanted[i])) return false;
    }
    return true;
  }

  function onKeydown(ev) {
    if (ev.isComposing || ev.repeat) return;
    var c = evChord(ev);
    var now = Date.now();
    recent.push({ key: c.key, mods: c.mods, at: now });
    while (recent.length && now - recent[0].at > windowMs) recent.shift();
    var cap = maxSeqLen();
    if (recent.length > cap) recent = recent.slice(recent.length - cap);

    for (var i = 0; i < sequences.length; i++) {
      var s = sequences[i];
      if (!sameChord(c, s.chords[s.chords.length - 1])) continue;
      if (!matchTail(recent, s.chords, windowMs)) continue;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      recent = [];
      bus.post(s.event, { reason: s.reason, origin: bus.whoami() });
      return;
    }
  }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('keydown', onKeydown, true);
  }


  function applyConfig(cfg) {
    var k = (cfg && cfg.ui && cfg.ui.keys) || {};
    setChords('leave', k.leave);
    setChords('killring', k.killring);
    if (typeof k.leaveTimeoutMs === 'number' && k.leaveTimeoutMs > 0) {
      windowMs = k.leaveTimeoutMs;
    }
    var st = (cfg && cfg.ui && cfg.ui.startup) || {};
    if (st.clipboardMirror) armClipboardMirror();
  }

  var clipArmed = false;
  var lastClip = null;
  function readClip() {
    try {
      if (typeof document === 'undefined' || !document.hasFocus || !document.hasFocus()) return;
      var nav = typeof navigator !== 'undefined' ? navigator : null;
      var p = nav && nav.clipboard && nav.clipboard.readText && nav.clipboard.readText();
      if (!p || typeof p.then !== 'function') return;
      p.then(function (t) {
        if (typeof t === 'string' && t && t !== lastClip) {
          lastClip = t;
          bus.post('killring.add', { text: t, source: 'clipboard' });
        }
      }).catch(function () { });
    } catch (_) {}
  }
  function armClipboardMirror() {
    if (clipArmed || typeof root.addEventListener !== 'function') return;
    clipArmed = true;
    root.addEventListener('focus', readClip);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) readClip();
      });
    }
    readClip();
  }
  function setChords(key, list) {
    if (!Array.isArray(list) || !list.length) return;
    for (var i = 0; i < sequences.length; i++) {
      if (sequences[i].key === key) sequences[i].chords = list.map(chord);
    }
  }

  if (Tezcatl.config && Tezcatl.config.load) {
    Tezcatl.config
      .load()
      .then(applyConfig)
      .catch(function () {
      });
  }


  var focusTarget = null;
  var insertCbs = [];
  var focusCbs = [];
  var cmdCbs = [];

  function init(meta) {
    bus.identify(meta || {});

    // Cross-window "who was last focused" -- shape matches what
    // panels/invisible/cursor.html already accumulates into focusHistory.
    // `id` is the bus identity (bus.whoami().id), globally addressable
    // (bus.post(..., {to: id})) regardless of whether this panel lives
    // inside a skin's panes.js tree or as its own standalone window --
    // unlike a panes.js-local pane id, which only means something inside
    // that one skin instance.
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('focus', function () {
        var who = bus.whoami();
        bus.post('focus.changed', { id: who.id, role: who.role, name: who.name });
      });
    }

    // The roster: a panel says when it opens and when it
    // goes, and answers a roll call -- who it is travels as the sender of
    // each message. The work store (lib/core/work-page.js) keeps the record.
    bus.post('panel.open', {});
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('pagehide', function () { bus.post('panel.close', {}); });
    }
    bus.on('panel.roll', function (p) { bus.post('panel.here', { req: p && p.req }); });

    bus.onMine('focus', function (payload, m) {
      try {
        if (typeof root.focus === 'function') root.focus();
      } catch (_) {}
      var el =
        typeof focusTarget === 'function' ? focusTarget() : focusTarget;
      if (el && typeof el.focus === 'function') {
        try {
          el.focus();
        } catch (_) {}
      }
      focusCbs.forEach(function (fn) {
        callSafe(fn, payload, m);
      });
    });

    bus.onMine('insert', function (payload, m) {
      var text =
        payload && typeof payload === 'object' && 'text' in payload
          ? payload.text
          : payload;
      insertCbs.forEach(function (fn) {
        callSafe(fn, text, m);
      });
    });

    bus.onMine('command', function (payload, m) {
      cmdCbs.forEach(function (fn) {
        callSafe(fn, payload, m);
      });
    });

    return Tezcatl.panelFrame;
  }

  function callSafe(fn, a, b) {
    try {
      fn(a, b);
    } catch (e) {
      try {
        console.error('Tezcatl.panelFrame callback threw', e);
      } catch (_) {}
    }
  }

  function setFocusTarget(elOrFn) {
    focusTarget = elOrFn;
  }
  function onFocus(fn) {
    focusCbs.push(fn);
  }
  function onInsert(fn) {
    insertCbs.push(fn);
  }
  function onCommand(fn) {
    cmdCbs.push(fn);
  }

  function replyTo(meta, type, payload) {
    var to = meta && meta.from && meta.from.id;
    return bus.post(type, payload, to ? { to: to } : undefined);
  }

  function reportCursor(info) {
    return bus.post('cursor', info || {});
  }

  var api = {
    init: init,
    setFocusTarget: setFocusTarget,
    onFocus: onFocus,
    onInsert: onInsert,
    onCommand: onCommand,
    replyTo: replyTo,
    reportCursor: reportCursor,
    _chord: chord,
    _evChord: evChord,
    _sameChord: sameChord,
    _matchTail: matchTail,
    _leaveSequence: function () {
      return seqChords('leave');
    },
    _seqChords: seqChords,
    _applyConfig: applyConfig,
  };

  // -- the skin port ------------------------------------------------
  // The one place where a panel looks at the skin it is in, and at its
  // siblings there. A panel is an iframe of its skin's page (same origin), so
  // it could reach into window.parent anywhere; it does so only through here:
  //   inSkin(w)          is this page a panel of a skin (an iframe)?
  //   id(w)              the skin page's bus id (null alone in a window)
  //   siblings(w)        the panels of the same skin: [{id, role, name}] (bus identities;
  //                      null alone in a window). The skin's own list when it registered
  //                      one (panels; asked by a panel of a synthesis, that synthesis' first),
  //                      else its iframes'
  //   hasRole(w, role)   is there a panel of that role among them?
  //   synthesis(w)       the synthesis this panel is in (D-synthesis) | null:
  //                      {own, name, place, self, main, moves, members: [{k, panel, main, name, id}]}
  //   block(w)           this panel's block as the skin keeps it ({text, side, ...}; a panel
  //                      can read its settings from the text) | null: bare, or alone in a window
  //   of(w)              what the skin registered ({openNew, panels, ...}) | null --
  //                      from a panel, the skin page itself, or (ofOpener) a window it opened
  //   register(w, port)  a skin page says what it offers its panels
  // `w` is the asking page's window.
  function hostOf(w) {
    try { return w && w.parent && w.parent !== w ? w.parent : null; } catch (_) { return null; }
  }
  function portOf(w) {
    try {
      if (!w || w.closed) return null;
      if (w.tezcatlSkin) return w.tezcatlSkin;
      var h = hostOf(w);
      return h && h.tezcatlSkin ? h.tezcatlSkin : null;
    } catch (_) { return null; }
  }
  function whoIn(win) {
    try {
      var t = win.Tezcatl;
      return t && t.bus && t.bus.self && t.bus.self.id ? { id: t.bus.self.id, role: t.bus.self.role || null, name: t.bus.self.name || null } : null;
    } catch (_) { return null; }
  }
  var skinPort = {
    inSkin: function (w) { return !!hostOf(w); },
    id: function (w) { var h = hostOf(w); var who = h && whoIn(h); return who ? who.id : null; },
    siblings: function (w) {
      var h = hostOf(w);
      if (!h) return null;
      var port = portOf(w);
      if (port && typeof port.panels === 'function') { try { return port.panels(w); } catch (_) {} }
      var out = [];
      try {
        for (var i = 0; i < h.frames.length; i++) { var who = whoIn(h.frames[i]); if (who) out.push(who); }
      } catch (_) {}
      return out;
    },
    hasRole: function (w, role) {
      return (skinPort.siblings(w) || []).some(function (x) { return x.role === role; });
    },
    synthesis: function (w) {
      var port = portOf(w);
      try { return port && typeof port.synthesisOf === 'function' ? port.synthesisOf(w) : null; } catch (_) { return null; }
    },
    block: function (w) {
      var port = portOf(w);
      try { return port && typeof port.blockOf === 'function' ? port.blockOf(w) : null; } catch (_) { return null; }
    },
    of: portOf,
    ofOpener: function (w) { try { return portOf(w.opener); } catch (_) { return null; } },
    register: function (w, port) { w.tezcatlSkin = Object.assign(w.tezcatlSkin || {}, port); return w.tezcatlSkin; },
  };
  Tezcatl.skinPort = skinPort;
  api.skinPort = skinPort;

  Tezcatl.panelFrame = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
