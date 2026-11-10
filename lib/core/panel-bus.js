// lib/core/panel-bus.js -- the bus between the panels (one BroadcastChannel).
// Every type it carries, who posts it and who takes it: bus/messages.json
// (D-bus-ledger; test/bus-ledger.test.js keeps it in step with the code).
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  var CHANNEL = 'tezcatl';
  var VERSION = 1;

  var self = {
    id:
      'f-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8),
    role: null,
    name: null,
  };

  var listeners = Object.create(null);

  var bc = null;
  try {
    if (typeof root.BroadcastChannel === 'function') {
      bc = new root.BroadcastChannel(CHANNEL);
      bc.onmessage = function (ev) {
        deliver(ev.data);
      };
    }
  } catch (_) {
    bc = null;
  }
  var frameOnly = !bc;   // no channel at all: messages stay in this frame
  if (!bc && !bus_warned()) {
    try {
      console.warn(
        'Tezcatl.bus: BroadcastChannel unavailable -- panel<->panel messaging is this-frame-only',
      );
    } catch (_) {}
  }

  var warned = false;
  function bus_warned() {
    var w = warned;
    warned = true;
    return w;
  }

  function identify(meta) {
    if (meta && typeof meta === 'object') {
      if (typeof meta.role === 'string') self.role = meta.role;
      if (typeof meta.name === 'string') self.name = meta.name;
    }
    return whoami();
  }

  function whoami() {
    return { id: self.id, role: self.role, name: self.name };
  }

  function post(type, payload, opts) {
    opts = opts || {};
    var msg = {
      v: VERSION,
      type: String(type),
      from: whoami(),
      to: opts.to || null,
      payload: payload,
      ts: Date.now(),
    };
    if (bc) {
      try {
        bc.postMessage(msg);
      } catch (_) {}
    }
    // a BroadcastChannel does not hand a message back to its sender: {echo}
    // (and the no-channel fallback, this frame only) deliver it here directly
    if (opts.echo || frameOnly) deliver(msg, true);
    return msg;
  }

  function deliver(msg, local) {
    if (!msg || msg.v !== VERSION || typeof msg.type !== 'string') return;
    if (!local && msg.from && msg.from.id === self.id) return;

    var meta = { from: msg.from, to: msg.to, type: msg.type, ts: msg.ts };
    fire(listeners[msg.type], msg.payload, meta);
    fire(listeners['*'], msg.payload, meta);
  }

  function fire(set, payload, meta) {
    if (!set) return;
    set.forEach(function (fn) {
      try {
        fn(payload, meta);
      } catch (e) {
        try {
          console.error('Tezcatl.bus listener for "' + meta.type + '" threw', e);
        } catch (_) {}
      }
    });
  }

  function on(type, fn) {
    var key = String(type);
    (listeners[key] || (listeners[key] = new Set())).add(fn);
    return function off() {
      var set = listeners[key];
      if (set) set.delete(fn);
    };
  }

  function onMine(type, fn) {
    return on(type, function (payload, meta) {
      if (!meta.to || meta.to === self.id) fn(payload, meta);
    });
  }

  function close() {
    if (bc) {
      try {
        bc.close();
      } catch (_) {}
      bc = null;
    }
  }

  Tezcatl.bus = {
    identify: identify,
    whoami: whoami,
    self: self,
    post: post,
    on: on,
    onMine: onMine,
    close: close,
    CHANNEL: CHANNEL,
    VERSION: VERSION,
  };
})(typeof self !== 'undefined' ? self : this);
