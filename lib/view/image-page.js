// lib/view/image-page.js -- the image panel (panels/extra/image.html): one
// picture of the pages (lib/view/image.js), fitted to the panel. ?path= gives
// the first one (none: lib/view/image.js DEFAULT); image.show {path} on the bus
// -- the frame's `image <path>` (lib/skin/image-commands.js) -- changes it.
(function () {
  'use strict';
  var T = window.Tezcatl;
  var I = T.image;
  var params = new URLSearchParams(location.search);
  var bus = T.bus;
  T.panelFrame.init({ role: 'image', name: params.get('name') || null });

  var imgEl = document.getElementById('img');
  var whatEl = document.getElementById('what');
  var errEl = document.getElementById('err');

  function tell(text, err) { if (bus) bus.post('recv.say', { text: text, cls: err ? 'err' : null }); }
  function fail(msg) { errEl.textContent = '! ' + msg; tell('! image ── ' + msg, true); }

  function show(arg) {
    var r = I.resolve(arg);
    if (r.error) { fail(r.error); return false; }
    errEl.textContent = '';
    imgEl.onload = function () {
      whatEl.textContent = r.path + ' · ' + imgEl.naturalWidth + '×' + imgEl.naturalHeight;
      document.title = 'Tezcatl — image ' + r.path;
    };
    imgEl.onerror = function () { whatEl.textContent = r.path; fail('cannot be read: ' + r.path); };
    imgEl.src = T.config.sibling(r.path);
    return true;
  }

  if (bus) bus.onMine('image.show', function (p) { show(p && p.path); });
  show(params.get('path') || I.DEFAULT);
})();
