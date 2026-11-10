// lib/skin/how-to-use.js -- what the How_to_use panel says (D-unified-dock): a
// short explanation of the input form, drawn from the lead-key table itself
// (lib/core/lead.js, with config.json ui.keys laid over it) and from
// command_map.json -- so a key bound again, or a command added, is never
// explained wrong. Pure: no DOM.
//
//   sections(table, commands, lead) -> [{title, rows: [{key, text}]}]
// table: lead.configure(...).table ({lead, fnRow, bindings}); commands:
// Tezcatl.commands.list() ({name, desc, line}); lead: lib/core/lead.js.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).howToUse = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MOD_NAMES = { control: 'Ctrl', meta: 'Alt (Meta)', shift: 'Shift', super: 'Super' };
  const KEY_NAMES = {
    left: '←', down: '↓', up: '↑', right: '→', return: 'Return', escape: 'Esc',
    tab: 'Tab', backspace: 'Backspace', delete: 'Delete',
  };

  // a command's description, up to its first " -- " or "(" (the rest is detail)
  function short(desc) {
    const s = String(desc || '').split(/\s+--\s+|\s+\(/)[0].trim();
    return s.length > 80 ? s.slice(0, 79) + '…' : s;
  }

  function sections(table, commands, lead) {
    const L = table.lead;
    const byName = {};
    (commands || []).forEach((c) => { byName[c.name] = c; });
    const keys = [];
    Object.keys(lead.MODIFIERS).forEach((k) => keys.push({ key: L + k, text: MOD_NAMES[lead.MODIFIERS[k]] + ' on the next key' }));
    Object.keys(lead.KEYS).forEach((k) => keys.push({ key: L + k, text: KEY_NAMES[lead.KEYS[k]] || lead.KEYS[k] }));
    const row = table.fnRow;
    keys.push({ key: L + lead.FN + row[0] + '…' + L + lead.FN + row[row.length - 1], text: 'F1…F' + row.length });
    keys.push({ key: L + L, text: 'a plain "' + L + '"' });

    const shortcuts = Object.keys(table.bindings).sort().map((ch) => {
      const line = table.bindings[ch];
      const c = byName[String(line).trim().split(/\s+/)[0]];
      return { key: L + ch, text: line + (c && c.desc ? ' ── ' + short(c.desc) : '') };
    });

    const form = [
      { key: 'Enter', text: 'send the line (an empty line: into the focused panel)' },
      { key: 'Alt+p / Alt+n', text: 'the lines sent before' },
      { key: 'Esc Esc', text: 'in a panel: back to the input form' },
      { key: ':', text: 'alone: to the map (hjkl, Enter)' },
    ];

    // the commands that are a line of the frame (command_map.json `line`)
    const lines = (commands || []).filter((c) => c.line).map((c) => ({ key: c.line, text: short(c.desc) }));

    return [
      { title: 'the input form', rows: form },
      { title: 'keys (' + L + ' and one char)', rows: keys },
      { title: 'shortcuts (run when typed)', rows: shortcuts },
      { title: 'lines', rows: lines },
    ].filter((s) => s.rows.length);
  }

  return { sections, short };
});
