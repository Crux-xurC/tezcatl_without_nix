// lib/list/kinds/commands.js -- the list kind "commands": the palette of tezcatl commands (command/command_map.json).
// One file per kind; the table of kinds and what they share is lib/list/list-kinds.js.
// panels/tool/list.html loads only the kind it shows.
(function (root) {
  'use strict';
  var Tezcatl = (root.Tezcatl = root.Tezcatl || {});
  var kinds = typeof module === 'object' && module.exports ? require('../list-kinds.js') : Tezcatl.listKinds;

  kinds.commands = {
    fill: function () {
      var list = (Tezcatl.commands && Tezcatl.commands.list()) || [];
      return list.map(function (c) {
        return {
          id: c.name,
          label: c.name,
          sub: c.desc + (c.hasImpl ? '' : '  (no impl here)'),
          raw: c,
        };
      });
    },
    order: function (items) {
      return items.slice().sort(function (a, b) {
        return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
      });
    },
    onSelect: function (item) {
      if (Tezcatl.commands) Tezcatl.commands.invoke(item.id);
    },
  };
})(typeof self !== 'undefined' ? self : this);
