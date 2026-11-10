// lib/skin/how-to-use-page.js -- the How_to_use panel (panels/extra/How_to_use.html;
// D-unified-dock): the keys of the input form, the lead-key table and its
// shortcuts, and the frame's lines -- read from config.json ui.keys, lib/core/lead.js
// and command_map.json when it opens (lib/skin/how-to-use.js says what).
// Only shows: it takes no keys and says nothing on the bus. Like the map, it
// is not one of the panels focused last (no panelFrame.init).
(function () {
  'use strict';
  var T = window.Tezcatl;
  var params = new URLSearchParams(location.search);
  T.bus.identify({ role: 'How_to_use', name: params.get('name') || null });
  var rootEl = document.getElementById('root');
  var errEl = document.getElementById('err');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function draw(table, commands) {
    rootEl.textContent = '';
    T.howToUse.sections(table, commands, T.lead).forEach(function (s) {
      rootEl.appendChild(el('h2', null, s.title));
      s.rows.forEach(function (r) {
        var row = el('div', 'row');
        row.appendChild(el('span', 'key', r.key));
        row.appendChild(el('span', 'text', r.text));
        row.title = r.key + '  ' + r.text;
        rootEl.appendChild(row);
      });
    });
  }

  Promise.all([
    T.config.load().catch(function () { return null; }),
    T.commands.load().catch(function (e) { errEl.textContent = '! command_map.json: ' + (e && e.message || e); }),
  ]).then(function (got) {
    var k = (got[0] && got[0].ui && got[0].ui.keys) || {};
    var r = T.lead.configure({ lead: k.lead, fnRow: k.fnRow, bindings: k.leadBindings });
    if (r.errors.length) errEl.textContent = '! config.json ui.keys: ' + r.errors.join('; ');
    draw(r.table, T.commands.list());
  });
})();
