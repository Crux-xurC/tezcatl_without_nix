// lib/view/color-page.js -- the colour panel (panels/extra/color.html,
// the whole panel turns the colour it is given, with what was
// asked and what the browser makes of it. It takes the tezcatl-command
// color.show {color} | {json, name} -- every colour panel open does; with none
// open, the command opens a new window (command_map.json fallback). A JSON is
// read from the FS root (as the dictionary's data). ?color= / ?json=&name=
// give the first one.
(function () {
  'use strict';
  var T = window.Tezcatl;
  var C = T.color;
  var params = new URLSearchParams(location.search);
  T.panelFrame.init({ role: 'color', name: params.get('name') || null });

  var swatch = document.getElementById('swatch');
  var valueEl = document.getElementById('value');
  var whatEl = document.getElementById('what');
  var errEl = document.getElementById('err');

  function fsBase() {
    return T.config.load().then(function (cfg) {
      var u = cfg && cfg.connections && cfg.connections[0] && cfg.connections[0].url;
      if (!u) throw new Error('config.json has no relay URL');
      var x = new URL(u);
      return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host;
    });
  }

  function fail(msg) { errEl.textContent = '! ' + msg; }

  function paint(color, what) {
    if (!(window.CSS && CSS.supports && CSS.supports('color', color))) { fail('not a colour: ' + color); return false; }
    errEl.textContent = '';
    swatch.style.background = color;
    var computed = getComputedStyle(swatch).backgroundColor;
    swatch.style.color = C.ink(computed);
    valueEl.textContent = color;
    whatEl.textContent = (what ? what + ' · ' : '') + computed;
    document.title = 'Tezcatl — color ' + color;
    return true;
  }

  // {color} | {json, name} -> Promise<bool>
  function show(a) {
    var x = a || {};
    if (typeof x.color === 'string' && x.color) return Promise.resolve(paint(x.color, null));
    if (typeof x.json === 'string' && x.json && typeof x.name === 'string' && x.name) {
      var path = x.json.replace(/^\/+/, '');
      return fsBase().then(function (base) { return fetch(base + '/fs/read?path=' + encodeURIComponent(path), { cache: 'no-store' }); })
        .then(function (r) {
          if (!r.ok) throw new Error('cannot read ' + path + ' (HTTP ' + r.status + ')');
          return r.text();
        })
        .then(function (text) {
          var doc;
          try { doc = JSON.parse(text); } catch (_) { throw new Error(path + ' is not JSON'); }
          var got = C.pick(doc, x.name, path);
          if (got.error) throw new Error(got.error);
          return paint(got.color, x.name + ' (' + path + ')');
        })
        .catch(function (e) { fail((e && e.message) || String(e)); return false; });
    }
    fail(C.USAGE);
    return Promise.resolve(false);
  }

  T.commands.register('color.show', function (args) { show(args); return true; });
  T.commands.load().catch(function () {});
  T.commands.listenBus();

  var first = params.get('color') ? { color: params.get('color') } : params.get('json') ? { json: params.get('json'), name: params.get('key') || '' } : null;
  if (first) show(first);
  else whatEl.textContent = 'color <colour> / color <JSON path> <name>';
})();
