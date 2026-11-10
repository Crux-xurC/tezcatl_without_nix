// lib/skin/frame-layout.js -- what the frame skin holds, and its `skin ...`
// commands . Pure: no DOM, no
// bus, no storage -- panels/skins/frame.html draws it and keeps it.
//
// The skin is divided along its main axis first, into *lines* (1 to
// MAX_LINES; the type is their number as a letter, A / B / C / D …), and each line along the other axis into its panels
// (two axes). `axis` "h" (the default, and every skin saved
// before): the lines are columns side by side and the
// panels are stacked top to bottom in each; "v": the lines are rows one
// above the other and the panels sit left to right in each. In the code a
// line is a "column" (`columns`, `col`) and a panel's order in it its "row",
// whichever the axis: "v" only turns the drawing (rects) and the arrow keys
// (move) around. Ratios are whole numbers, divided by their sum (1,2,1 ->
// 1/4, 2/4, 1/4).
//
// A place is written line first, then the panel's order in it (1 from the
// top / left): "23" is the 3rd panel of the 2nd line ("2,3" / "2.3" also do).
//
// Saved (skin save) as JSON:
//   { "name": "workspace_1", "type": "C", "axis": "h", "ratio": [1, 2, 1], "focus": "23",
//     "columns": [ [], [ ["killring", 1, 1, false], ["tree", 2, 2, false], ... ], [] ] }
// ("zoom": what skin unzoom gives back, when a zoom is in force; "dock": the dock as changed
// in place -- lib/skin/dock-layout.js -- carried as it is)
// each panel [name, order, vertical ratio, active]; `focus` is the place
// focused last (the active one). In memory a panel is {id, panel, ratio}:
// `id` names one instance (the page keeps its iframe by it, so a panel that
// moves is never reloaded); `focus` is {col, row} | null.
//
// Commands (one line of the input form):
// How a line is written (one rule for every skin command): words are separated by
// blanks; a comma only joins a list of numbers of no fixed length into one word
// (`skin main 1,4`, `skin sub 1,2,1`; no blank around it); what has a fixed
// number of parts (a place, the two to swap) is that many words (`skin focus 2 3`).
//
//   skin main x,y,z               the lines and their sizes (how many: the type)
//   skin sub a,b,c [line]         the sizes of the panels in a line (the focused one unless given)
//   skin axis h | v               the main axis (with panels: the skin is turned over, the places stay)
//   skin add line [<pos>]         one more line, size 1 (at the end, or put in at <pos>)
//   skin del line [<pos>]         an empty line taken away (the last, or the one at <pos>)
//   skin equal [-m | -s]          the sizes made equal: -m the lines, -s the panels in the focused line, neither: both
//   skin zoom [-m | -s] [n]       the focused line (-m) / panel in its line (-s) made n times (10) the largest
//                                 of the others -- a size like any other, kept by skin save; neither: both
//   skin unzoom [-m | -s]         the sizes as they were before the zoom (a change of sizes or places since forgets them)
//   skin add <panel>              a panel where its block says (blocks/<panel>.json "at": a line),
//                                 else in the focused line, else the 1st
//   skin add <col> <panel>        a panel after the last one in the line, focused
//   skin add <col> <row> <panel>  a panel put in at that place (the rest move on), focused
//                                 (either as a block -- the default -- or with -bare: the panel alone)
//   block arrange t|b|r|l|tl|tr|bl|br   where the focused block's thema is (top / bottom / right /
//                                 left, or round a corner: top and left ... -- an L, square here; a
//                                 style rounds it)
//   block place <panel> <line>    where `skin add <panel>` puts that panel (kept by the page, as block new)
//   block new <panel> <source> [t|b|r|l]   a block for that panel (source: name | file | status);
//                                 kept by the page (this browser), as `skin save` keeps a skin
//   block min [line]              the focused block made small along the sub axis: to its band
//                                 (the sentence shows), or -- line -- to a thin line; the others
//                                 share what it gave up. Its panel is hidden, not reloaded
//   block unmin                   back to its size
//   thema color <name | colour>   this place's band: a colour of the palette or a CSS colour
//   thema thickness <px>          ... how thick (4 to 200)
//   thema source <name|file|status>   ... where its sentence comes from
//   thema text [<sentence>]       ... a sentence of its own (none: from the source again)
//   thema style [<name>]          ... drawn with a style: thema/<name>.css (local/thema/ first); none: plain
//   thema reset                   ... as the panel's block says (blocks/), but the side and min
//
// A panel is a block unless added -bare: the
// panel and a thema (panels/extra/thema.html) round it, drawn by the page.
// `block` in memory: null (bare) or what this place changes of the panel's
// block (now `side`); saved as a 5th item: false (bare) or that object --
// none for the panel's block as it is (and in every skin saved before).
// A synthesis (D-synthesis, lib/skin/synthesis.js) is one panel here: `skin add
// <name>` with a name that is no panel's but a synthesis' places it (ctx.synthesis
// gives its definition, read before). In memory it is a panel whose `panel` is
// the synthesis' name, with `syn` {own, keep, saved}: its own name (<name>_<n>,
// the smallest free in the skin), what its main kept (synthesis.keep), and
// whether it was read from a saved skin (not a reload). Saved as a 5th item
// {synthesis: <own>, keep?} with what the band changes. It always wears its band.
//   skin del <col> <row>          close that panel
//   skin del <panel>              close the panel of that name (the focused one, else the first)
//   skin switch ver a b [col]     exchange two rows in a column (the focused one unless given)
//   skin switch hor a b           exchange two columns, whole
//   skin focus <col> <row>        focus that place (the nearest panel when it is empty)
//   skin focus x | x - | y | y -  the panel right / left / below / above the focused one
//   skin focus abs                to the map of the skin in the dock (panels/extra/panel_abstract.html),
//                                 where hjkl / the arrows are those four (the page's: here it passes)
//   skin name <name>              name this skin (new ones are workspace_1, workspace_2 ...)
//   skin save [<name>]            keep it (under the name given, which it then takes)
//   skin read <name>              open one kept
//   go on                         to the panel / the place in a file the last line of the receiving
//                                 side with a reference (@...) points at (lib/skin/recv-refs.js; the page's)
// A column with panels is never dropped by `skin main`: close them first.

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).frameLayout = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // the type is the number of lines as a letter (A: 1 … D: 4 …), kept in saved
  // skins as before; the lines were once A to D only -- now up to MAX_LINES
  const MAX_LINES = 26;
  const TYPES = Array.from({ length: MAX_LINES }, (_v, i) => String.fromCharCode(65 + i));
  const USAGE = 'skin main, sub, axis, add, equal, zoom, unzoom, del, switch, focus, name, save, read';
  const BLOCK_USAGE = 'block arrange, new, place, min, unmin';
  const THEMA_USAGE = 'thema color, thickness, source, text, style, reset';
  const MINS = ['band', 'line'];
  // a colour for the band: a name of the palette, a CSS colour name, #hex, rgb()/hsl()
  // (a name may be one a style gives: --th-<name>, e.g. orange of thema/lcars)
  const COLOR = /^(?:[a-z][a-z0-9-]*|#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%]+\))$/i;
  const STYLE = /^[a-z0-9][a-z0-9_-]*$/i;
  const SIDES = { t: 't', b: 'b', r: 'r', l: 'l', top: 't', bottom: 'b', right: 'r', left: 'l', tl: 'tl', tr: 'tr', bl: 'bl', br: 'br' };
  const SIDE_WORDS = { t: 'the top', b: 'the bottom', r: 'the right', l: 'the left', tl: 'the top and left', tr: 'the top and right', bl: 'the bottom and left', br: 'the bottom and right' };
  const SOURCES = ['name', 'file', 'status'];
  const ZOOM = 10;   // skin zoom without n
  // the word for a line (column / row, in the messages' language): what a line is called on this skin's axis
  function lw(s) { return s && s.axis === 'v' ? 'row' : 'column'; }

  function posInt(s) {
    const t = String(s == null ? '' : s).trim();
    return /^[1-9]\d*$/.test(t) ? Number(t) : null;
  }
  // "1,2,1" -> [1, 2, 1] | null
  function intList(s) {
    const parts = String(s == null ? '' : s).split(',');
    const out = parts.map(posInt);
    return out.length && out.every((n) => n != null) ? out : null;
  }

  function typeOf(n) { return TYPES[n - 1]; }

  // a fresh skin: `type` columns of equal width, nothing in them
  function create(type, name, axis) {
    const i = TYPES.indexOf(String(type || 'A').toUpperCase());
    const n = i < 0 ? 1 : i + 1;
    const ratio = [];
    for (let k = 0; k < n; k++) ratio.push(1);
    return { name: name || null, type: typeOf(n), axis: axis === 'v' ? 'v' : 'h', ratio, focus: null, zoom: null, columns: ratio.map(() => []) };
  }

  // workspace_N for a new skin: one more than the largest N among `names`
  function defaultName(names) {
    let max = 0;
    (names || []).forEach((nm) => {
      const m = /^workspace_(\d+)$/.exec(String(nm));
      if (m) max = Math.max(max, Number(m[1]));
    });
    return 'workspace_' + (max + 1);
  }

  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  // "23" / "2,3" / "2.3" -> {col, row} | null
  function place(s) {
    const t = String(s == null ? '' : s).trim();
    let m = /^(\d+)[,.](\d+)$/.exec(t);
    if (!m) m = /^([1-9])([1-9])$/.exec(t);
    if (!m) return null;
    const col = Number(m[1]);
    const row = Number(m[2]);
    return col > 0 && row > 0 ? { col, row } : null;
  }
  // a place as kept in a saved skin ("focus": "23", "1,10" past the 9th; read by place)
  function placeKey(p) { return p ? (p.col < 10 && p.row < 10 ? '' + p.col + p.row : p.col + ',' + p.row) : null; }
  // a place as said and typed: "<line> <nth>" (skin focus 2 3, skin del 2 3)
  function placeText(p) { return p ? p.col + ' ' + p.row : null; }

  // -- saving -------------------------------------------------------------------
  function toJson(s) {
    const j = {
      name: s.name, type: s.type, axis: s.axis === 'v' ? 'v' : 'h', ratio: s.ratio.slice(), focus: placeKey(s.focus),
      columns: s.columns.map((col, ci) => col.map((p, ri) => {
        const e = [p.panel, ri + 1, p.ratio, !!(s.focus && s.focus.col === ci + 1 && s.focus.row === ri + 1)];
        if (p.syn) e.push(Object.assign(clone(p.block || {}), { synthesis: p.syn.own }, p.syn.keep ? { keep: clone(p.syn.keep) } : {}));
        else if (p.block === null) e.push(false);
        else if (p.block && Object.keys(p.block).length) e.push(clone(p.block));
        return e;
      })),
    };
    if (s.zoom) j.zoom = clone(s.zoom);
    // the dock as changed in place (lib/skin/dock-layout.js reads it; carried as it is here)
    if (s.dock && typeof s.dock === 'object' && Object.keys(s.dock).length) j.dock = clone(s.dock);
    return j;
  }
  // the 5th item of a saved panel -> null (bare) | {side?}
  function blockOf(b) {
    if (b === false) return null;
    const o = {};
    if (!b || typeof b !== 'object') return o;
    if (SIDES[b.side]) o.side = SIDES[b.side];
    if (MINS.indexOf(b.min) >= 0) o.min = b.min;
    if (typeof b.color === 'string' && COLOR.test(b.color)) o.color = b.color;
    if (posInt(b.thickness) && b.thickness >= 4 && b.thickness <= 200) o.thickness = Number(b.thickness);
    if (SOURCES.indexOf(b.source) >= 0) o.source = b.source;
    if (typeof b.text === 'string' && b.text.trim()) o.text = b.text.trim().slice(0, 200);
    if (typeof b.style === 'string' && STYLE.test(b.style)) o.style = b.style;
    return o;
  }
  // the 5th item of a saved synthesis -> {own, keep, saved} | null
  const OWN = /^[\w.-]+_\d+$/;
  function synOf(b, saved) {
    if (!b || typeof b !== 'object' || typeof b.synthesis !== 'string' || !OWN.test(b.synthesis)) return null;
    return { own: b.synthesis, keep: keepOf(b.keep), saved: !!saved };
  }
  // what a main keeps: a few plain values (it goes into the main's query again)
  function keepOf(k) {
    if (!k || typeof k !== 'object' || Array.isArray(k)) return null;
    const o = {};
    Object.keys(k).slice(0, 16).forEach((key) => {
      const v = k[key];
      if (/^[a-z][\w-]{0,31}$/i.test(key) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) o[key] = String(v).slice(0, 200);
    });
    return Object.keys(o).length ? o : null;
  }
  // <name>_<n> for a synthesis placed now: the smallest n free in the skin
  function ownName(s, name) {
    const taken = {};
    s.columns.forEach((col) => col.forEach((p) => { if (p.syn) taken[p.syn.own] = true; }));
    let n = 1;
    while (taken[name + '_' + n]) n += 1;
    return name + '_' + n;
  }
  // what skin unzoom gives back -> {main: [n…] | null, sub: {col, ratios} | null} | null
  function zoomOf(z, cols) {
    if (!z || typeof z !== 'object') return null;
    const ints = (a) => (Array.isArray(a) && a.length && a.every((n) => posInt(n) != null) ? a.map(Number) : null);
    const main = ints(z.main);
    const sub = z.sub && posInt(z.sub.col) && cols[z.sub.col - 1] && ints(z.sub.ratios) ? { col: Number(z.sub.col), ratios: ints(z.sub.ratios) } : null;
    return main || sub ? { main, sub } : null;
  }
  // The panels that are the frame's file editor (D-code-editor): opening a file,
  // the ":" lines, check, :Diff go to one of them. One place, so another editor
  // panel is one entry here.
  const EDITORS = ['code_editor'];
  function isEditor(panel) { return EDITORS.indexOf(panel) >= 0; }
  // panels renamed since a skin was saved: old name -> new (a saved skin keeps its words)
  const RENAMED = { code_vi: 'code_editor' };
  // a saved skin (or anything read back) -> a sound state | null; ids from newId.
  // saved: read from a saved skin (skin read, ?skin=), not this window's own again
  function fromJson(j, newId, saved) {
    if (!j || typeof j !== 'object' || !Array.isArray(j.columns) || !j.columns.length) return null;
    const cols = j.columns.slice(0, 4).map((col) => (Array.isArray(col) ? col : [])
      .filter((p) => Array.isArray(p) && typeof p[0] === 'string' && p[0])
      .map((p) => {
        const e = { id: newId ? newId() : '', panel: RENAMED[p[0]] || p[0], ratio: posInt(p[2]) || 1, block: blockOf(p[4]) };
        const syn = synOf(p[4], saved);
        if (syn) { e.syn = syn; if (e.block === null) e.block = {}; }
        return e;
      }));
    const ratio = cols.map((_c, i) => (Array.isArray(j.ratio) && posInt(j.ratio[i])) || 1);
    const s = { name: typeof j.name === 'string' && j.name ? j.name : null, type: typeOf(cols.length), axis: j.axis === 'v' ? 'v' : 'h',
      ratio, focus: null, zoom: zoomOf(j.zoom, cols), columns: cols };
    const f = place(j.focus);
    s.focus = f && s.columns[f.col - 1] && s.columns[f.col - 1][f.row - 1] ? f : null;
    if (j.dock && typeof j.dock === 'object' && !Array.isArray(j.dock)) s.dock = clone(j.dock);
    return s;
  }

  // -- reading a line -------------------------------------------------------------
  function parse(line) {
    // blanks separate the words; a list (1,2,1) is one word, no blank inside
    const words = String(line == null ? '' : line).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return { error: 'an empty line' };
    if (words[0] === 'block') return parseBlock(words.slice(1));
    if (words[0] === 'thema') return parseThema(words.slice(1), String(line).trim());
    // go on: to what the last line of the receiving side with a reference points at (the page's)
    if (words[0] === 'go') return words.length === 2 && words[1] === 'on' ? { cmd: 'go-on' } : { error: 'go on (to the panel or place the last line with @ points at)' };
    if (words[0] !== 'skin') return { error: 'start with skin, block or thema (' + USAGE + '; ' + BLOCK_USAGE + '; ' + THEMA_USAGE + '), lsp list / stop / timeout / restart, check update, diff -n / -f A,B, work list / watch / cancel, who, radar, open <page> [tab|window], database, db login / exit / cancel / list, syn, or go on' };
    const cmd = words[1];
    const a = words.slice(2);
    const colArg = (w) => (w == null ? null : posInt(w));
    // -m / -s: which axis; neither: both
    const axes = (ws) => {
      const m = ws.indexOf('-m') >= 0;
      const sb = ws.indexOf('-s') >= 0;
      return { m: m || !sb, s: sb || !m };
    };
    switch (cmd) {
      case 'main': {
        const ws = a.length === 1 ? intList(a[0]) : null;
        if (!ws) return { error: 'skin main x,y,z (the ratios of the lines on the main axis: 1 to ' + MAX_LINES + ' integers, comma-separated)' };
        if (ws.length > MAX_LINES) return { error: 'at most ' + MAX_LINES + ' lines' };
        return { cmd: 'main', widths: ws };
      }
      case 'sub': {
        const hs = intList(a[0]);
        if (!hs || a.length > 2 || (a.length === 2 && colArg(a[1]) == null)) {
          return { error: 'skin sub a,b,c [line] (the ratios of the panels in a line: one integer per panel, comma-separated)' };
        }
        return { cmd: 'sub', heights: hs, col: colArg(a[1]) };
      }
      case 'axis': {
        if (a.length === 1 && (a[0] === 'h' || a[0] === 'v')) return { cmd, axis: a[0] };
        return { error: 'skin axis h or skin axis v (h: columns side by side, v: rows one above another)' };
      }
      case 'equal':
      case 'unzoom': {
        if (a.some((w) => w !== '-m' && w !== '-s')) return { error: 'skin ' + cmd + ' [-m | -s]' };
        return Object.assign({ cmd }, axes(a));
      }
      case 'zoom': {
        const ns = a.filter((w) => w !== '-m' && w !== '-s');
        const n = ns.length === 1 ? posInt(ns[0]) : null;
        if (ns.length > 1 || (ns.length === 1 && (n == null || n < 2))) return { error: 'skin zoom [-m | -s] [factor (2 or more, default ' + ZOOM + ')]' };
        return Object.assign({ cmd, n: n || ZOOM }, axes(a));
      }
      case 'add': {
        const bare = a.indexOf('-bare') >= 0;
        if (bare) a.splice(a.indexOf('-bare'), 1);
        if (a[0] === 'line' && a.length <= 2 && !bare) {
          if (a.length === 2 && !posInt(a[1])) return { error: 'skin add line [position]' };
          return { cmd: 'line', at: a.length === 2 ? posInt(a[1]) : null };
        }
        if (a.length === 1 && !posInt(a[0])) return { cmd, col: null, row: null, panel: a[0], bare };
        if (a.length === 2 && posInt(a[0])) return { cmd, col: posInt(a[0]), row: null, panel: a[1], bare };
        if (a.length === 3 && posInt(a[0]) && posInt(a[1])) return { cmd, col: posInt(a[0]), row: posInt(a[1]), panel: a[2], bare };
        return { error: 'skin add <panel> [-bare], skin add <line> [nth] <panel> [-bare] or skin add line [position]' };
      }
      case 'del': {
        // skin del line [<pos>]: an empty line taken away (the last when not given)
        if (a[0] === 'line' && a.length <= 2) {
          if (a.length === 2 && !posInt(a[1])) return { error: 'skin del line [position]' };
          return { cmd: 'del-line', at: a.length === 2 ? posInt(a[1]) : null };
        }
        if (a.length === 2 && posInt(a[0]) && posInt(a[1])) return { cmd, col: posInt(a[0]), row: posInt(a[1]) };
        if (a.length === 1 && !posInt(a[0])) return { cmd, panel: a[0] };
        return { error: 'skin del <line> <nth>, skin del <panel> or skin del line [position]' };
      }
      case 'switch': {
        // the two to swap are two words (skin switch ver 1 2 [line])
        const dir = a[0];
        const rest = a.slice(1);
        const n = rest.map(posInt);
        const ok = n.every((x) => x != null);
        if (dir === 'ver' && ok && (rest.length === 2 || rest.length === 3)) return { cmd: 'switch-ver', a: n[0], b: n[1], col: rest.length === 3 ? n[2] : null };
        if (dir === 'hor' && ok && rest.length === 2) return { cmd: 'switch-hor', a: n[0], b: n[1] };
        return { error: 'skin switch ver a b [line] or skin switch hor a b' };
      }
      case 'focus': {
        if (a.length === 1 && a[0] === 'abs') return { cmd: 'focus-abs' };
        // a place is two words: skin focus 2 3
        if (a.length === 2 && posInt(a[0]) && posInt(a[1])) return { cmd, to: { col: posInt(a[0]), row: posInt(a[1]) } };
        const dirWord = a.join(' ');
        const dirs = { 'x': 'right', 'x -': 'left', '-x': 'left', 'y': 'down', 'y -': 'up', '-y': 'up' };
        if (dirs[dirWord]) return { cmd, dir: dirs[dirWord] };
        return { error: 'skin focus <line> <nth> (e.g. 2 3), skin focus x / x - / y / y - or skin focus abs (the map)' };
      }
      case 'name':
      case 'read': {
        const n = a.join(' ').trim();
        if (!n) return { error: 'skin ' + cmd + ' <name>' };
        return { cmd, name: n };
      }
      case 'save':
        return { cmd, name: a.join(' ').trim() || null };
    }
    return { error: (cmd ? 'no such command: skin ' + cmd : 'a command is needed after skin') + ' (' + USAGE + ')' };
  }

  // "block …" (the words after "block")
  function parseBlock(a) {
    if (a[0] === 'arrange') {
      if (a.length === 2 && SIDES[a[1]]) return { cmd: 'block-arrange', side: SIDES[a[1]] };
      return { error: 'block arrange t|b|r|l|tl|tr|bl|br (the thema at the top, bottom, right or left, or round a corner on two sides)' };
    }
    if (a[0] === 'new') {
      const side = a.length === 4 ? SIDES[a[3]] : 't';
      if ((a.length === 3 || a.length === 4) && SOURCES.indexOf(a[2]) >= 0 && side) {
        return { cmd: 'block-new', panel: a[1], source: a[2], side };
      }
      return { error: 'block new <panel> <' + SOURCES.join('|') + '> [t|b|r|l|tl|tr|bl|br] (the side defaults to t)' };
    }
    if (a[0] === 'place') {
      if (a.length === 3 && posInt(a[2])) return { cmd: 'block-place', panel: a[1], line: posInt(a[2]) };
      return { error: 'block place <panel> <line> (where skin add <panel> puts it)' };
    }
    if (a[0] === 'min') {
      if (a.length === 1) return { cmd: 'block-min', min: 'band' };
      if (a.length === 2 && a[1] === 'line') return { cmd: 'block-min', min: 'line' };
      return { error: 'block min or block min line (down to the band with its text / down to a line)' };
    }
    if (a[0] === 'unmin' && a.length === 1) return { cmd: 'block-unmin' };
    return { error: (a[0] ? 'no such command: block ' + a[0] : 'a command is needed after block') + ' (' + BLOCK_USAGE + ')' };
  }

  // "thema …": this place's band (the words after "thema"; `raw` keeps a sentence's spaces)
  function parseThema(a, raw) {
    const k = a[0];
    if (k === 'color') {
      // a CSS colour is the rest of the line, as CSS writes it (rgb(10, 20, 30)); kept without blanks
      const v = raw.replace(/^thema\s+color\s*/, '').trim().replace(/\s+/g, '');
      if (a.length >= 2 && COLOR.test(v)) return { cmd: 'thema-set', key: 'color', value: v };
      return { error: 'thema color <base|info|warn|alert|calm or a CSS colour (#hex, rgb(), a name)>' };
    }
    if (k === 'thickness') {
      const n = a.length === 2 ? posInt(a[1]) : null;
      if (n && n >= 4 && n <= 200) return { cmd: 'thema-set', key: 'thickness', value: n };
      return { error: 'thema thickness <px (4 to 200)>' };
    }
    if (k === 'source') {
      if (a.length === 2 && SOURCES.indexOf(a[1]) >= 0) return { cmd: 'thema-set', key: 'source', value: a[1] };
      return { error: 'thema source <' + SOURCES.join('|') + '>' };
    }
    if (k === 'text') {
      const t = raw.replace(/^thema\s+text\s*/, '').trim();
      return { cmd: 'thema-set', key: 'text', value: t ? t.slice(0, 200) : null };
    }
    if (k === 'style') {
      if (a.length === 1) return { cmd: 'thema-set', key: 'style', value: null };
      if (a.length === 2 && STYLE.test(a[1])) return { cmd: 'thema-set', key: 'style', value: a[1] };
      return { error: 'thema style [<name>] (thema/<name>.css; local/thema/ first; no name removes it)' };
    }
    if (k === 'reset' && a.length === 1) return { cmd: 'thema-reset' };
    return { error: (k ? 'no such command: thema ' + k : 'a command is needed after thema') + ' (' + THEMA_USAGE + ')' };
  }

  // what a place is called: a panel's name, a synthesis' own name
  function nameOf(p) { return p ? (p.syn ? p.syn.own : p.panel) : null; }

  // -- focus ------------------------------------------------------------------------
  function at(s, p) { return p && s.columns[p.col - 1] ? s.columns[p.col - 1][p.row - 1] || null : null; }

  // the panel nearest to `p` in column `col` (the same row, or the last one above it) | null
  function inColumn(s, col, row) {
    const c = s.columns[col - 1];
    if (!c || !c.length) return null;
    return { col, row: Math.min(Math.max(row, 1), c.length) };
  }

  // the place to focus from `from` going `dir` -> {col, row} | null (nothing that way)
  function move(s, from, dir) {
    if (!from || !at(s, from)) return first(s);
    // axis "v": the lines are rows -- up / down cross them, left / right go along one
    if (s.axis === 'v') dir = ({ down: 'right', up: 'left', right: 'down', left: 'up' })[dir] || dir;
    if (dir === 'down') return at(s, { col: from.col, row: from.row + 1 }) ? { col: from.col, row: from.row + 1 } : null;
    if (dir === 'up') return from.row > 1 ? { col: from.col, row: from.row - 1 } : null;
    const step = dir === 'right' ? 1 : -1;
    // the next column that has a panel; the same row there, or its last one
    for (let c = from.col + step; c >= 1 && c <= s.columns.length; c += step) {
      const p = inColumn(s, c, from.row);
      if (p) return p;
    }
    return null;
  }
  function first(s) {
    for (let c = 1; c <= s.columns.length; c++) if (s.columns[c - 1].length) return { col: c, row: 1 };
    return null;
  }
  // `to` itself, or the nearest panel: the same column (last row), else the nearest column that has one
  function nearest(s, to) {
    if (at(s, to)) return to;
    if (!s.columns.length) return null;
    const col = Math.min(Math.max(to.col, 1), s.columns.length);
    for (let d = 0; d < s.columns.length; d++) {
      for (const c of [col - d, col + d]) {
        const p = inColumn(s, c, to.row);
        if (p) return p;
      }
    }
    return null;
  }

  // -- applying a command -------------------------------------------------------------
  // state + a parsed command -> {state, message} | {error}. Never changes the given state.
  // ctx: {resolve(name) -> canonical panel name | null, newId() -> string}.
  // save / read (storage), focus abs (the dock) and go on (the receiving side) are the page's: here they pass.
  function apply(state, c, ctx) {
    if (!c || c.error) return { error: (c && c.error) || '?' };
    const s = clone(state);
    const focusCol = (given) => given || (s.focus && s.focus.col) || null;
    const L = lw(s);
    // a change of sizes or places: what skin unzoom would give back no longer fits
    if (['main', 'sub', 'line', 'del-line', 'equal', 'add', 'del', 'switch-ver', 'switch-hor'].indexOf(c.cmd) >= 0) s.zoom = null;
    const sizes = (s0) => s0.type + ' (' + s0.ratio.join(' : ') + ')';
    switch (c.cmd) {
      case 'main': {
        const n = c.widths.length;
        const dropped = s.columns.slice(n).map((col, i) => (col.length ? L + ' ' + (n + i + 1) : null)).filter(Boolean);
        if (dropped.length) return { error: dropped.join(', ') + ' still has panels ── close them with skin del first' };
        while (s.columns.length < n) s.columns.push([]);
        s.columns = s.columns.slice(0, n);
        s.ratio = c.widths.slice();
        s.type = typeOf(n);
        return { state: s, message: sizes(s) };
      }
      case 'sub': {
        const col = focusCol(c.col);
        if (!col) return { error: 'which ' + L + '? ── focus one, or write the ' + L + ' (skin sub a,b [' + L + '])' };
        const panels = s.columns[col - 1];
        if (!panels) return { error: 'there is no ' + L + ' ' + col };
        if (c.heights.length !== panels.length) {
          return { error: L + ' ' + col + ' has ' + panels.length + ' panel(s) (so ' + panels.length + ' ratio(s))' };
        }
        panels.forEach((p, i) => { p.ratio = c.heights[i]; });
        return { state: s, message: L + ' ' + col + ' (' + c.heights.join(' : ') + ')' };
      }
      case 'axis': {
        if ((s.axis || 'h') === c.axis) return { state: s, message: 'already ' + c.axis };
        s.axis = c.axis;
        const any = s.columns.some((col) => col.length);
        return { state: s, message: 'axis ' + c.axis + ' (' + (c.axis === 'v' ? 'rows one above another, panels left to right in each' : 'columns side by side, panels top to bottom in each') + ')' +
          (any ? ' ── the panels keep their coordinates; the layout is transposed' : '') };
      }
      case 'line': {
        const n = s.columns.length;
        if (n >= MAX_LINES) return { error: 'at most ' + MAX_LINES + ' ' + L + 's' };
        const pos = c.at == null ? n + 1 : c.at;
        if (pos > n + 1) return { error: 'cannot add at ' + L + ' ' + pos + ' (up to ' + L + ' ' + (n + 1) + ')' };
        s.columns.splice(pos - 1, 0, []);
        s.ratio.splice(pos - 1, 0, 1);
        s.type = typeOf(n + 1);
        if (s.focus && s.focus.col >= pos) s.focus = { col: s.focus.col + 1, row: s.focus.row };
        return { state: s, message: 'added ' + L + ' ' + pos + ' ── ' + sizes(s) };
      }
      case 'del-line': {
        const n = s.columns.length;
        if (n <= 1) return { error: 'the only ' + L + ' stays (a skin has one at least)' };
        const pos = c.at == null ? n : c.at;
        if (pos > n) return { error: 'there is no ' + L + ' ' + pos + ' (' + n + ' ' + L + '(s))' };
        if (s.columns[pos - 1].length) return { error: L + ' ' + pos + ' still has panels ── close them with skin del first' };
        s.columns.splice(pos - 1, 1);
        s.ratio.splice(pos - 1, 1);
        s.type = typeOf(n - 1);
        if (s.focus && s.focus.col > pos) s.focus = { col: s.focus.col - 1, row: s.focus.row };
        return { state: s, message: 'took ' + L + ' ' + pos + ' away ── ' + sizes(s) };
      }
      case 'equal': {
        const said = [];
        if (c.m) { s.ratio = s.ratio.map(() => 1); said.push(sizes(s)); }
        if (c.s) {
          const col = s.focus && s.focus.col;
          if (col && s.columns[col - 1].length) {
            s.columns[col - 1].forEach((p) => { p.ratio = 1; });
            said.push(L + ' ' + col + ' (' + s.columns[col - 1].map(() => 1).join(' : ') + ')');
          } else if (!c.m) return { error: 'which ' + L + '? ── focus a panel first (skin equal -s)' };
        }
        return { state: s, message: 'equal: ' + said.join(', ') };
      }
      case 'zoom': {
        if (!s.focus || !at(s, s.focus)) return { error: 'no panel to enlarge ── focus one first (skin zoom)' };
        const z = s.zoom || { main: null, sub: null };
        const big = (base, i) => c.n * Math.max(1, ...base.filter((_r, k) => k !== i));
        const said = [];
        if (c.m && s.columns.length > 1) {
          const base = z.main || s.ratio.slice();
          s.ratio = base.slice();
          s.ratio[s.focus.col - 1] = big(base, s.focus.col - 1);
          z.main = base;
          said.push(sizes(s));
        }
        if (c.s) {
          const col = s.focus.col;
          const panels = s.columns[col - 1];
          // a panel of another line was zoomed: that line is given back first
          if (z.sub && z.sub.col !== col && s.columns[z.sub.col - 1] && s.columns[z.sub.col - 1].length === z.sub.ratios.length) {
            s.columns[z.sub.col - 1].forEach((p, i) => { p.ratio = z.sub.ratios[i]; });
            z.sub = null;
          }
          if (panels.length > 1) {
            const base = z.sub && z.sub.col === col ? z.sub.ratios : panels.map((p) => p.ratio || 1);
            panels.forEach((p, i) => { p.ratio = i === s.focus.row - 1 ? big(base, i) : base[i]; });
            z.sub = { col, ratios: base.slice() };
            said.push(L + ' ' + col + ' (' + panels.map((p) => p.ratio).join(' : ') + ')');
          }
        }
        if (!said.length) return { error: 'nothing to enlarge against (one ' + L + ', and one panel in it)' };
        s.zoom = z.main || z.sub ? z : null;
        return { state: s, message: 'zoom ' + placeText(s.focus) + ': ' + said.join(', ') + ' ── skin unzoom takes it back' };
      }
      case 'unzoom': {
        const z = s.zoom;
        if (!z) return { error: 'nothing to take back (changing sizes or the layout after skin zoom drops what to go back to)' };
        const said = [];
        if (c.m && z.main) {
          if (z.main.length === s.ratio.length) { s.ratio = z.main.slice(); said.push(sizes(s)); }
          z.main = null;
        }
        if (c.s && z.sub) {
          const panels = s.columns[z.sub.col - 1];
          if (panels && panels.length === z.sub.ratios.length) {
            panels.forEach((p, i) => { p.ratio = z.sub.ratios[i]; });
            said.push(L + ' ' + z.sub.col + ' (' + z.sub.ratios.join(' : ') + ')');
          }
          z.sub = null;
        }
        s.zoom = z.main || z.sub ? z : null;
        if (!said.length) return { error: 'nothing to take back' + (c.m && !c.s ? ' (-m)' : c.s && !c.m ? ' (-s)' : '') };
        return { state: s, message: 'taken back: ' + said.join(', ') };
      }
      case 'add': {
        let note = '';
        if (c.col == null) {
          // where: the panel's own place (ctx.placeOf, from its block), else the focused line, else the 1st
          const name0 = ctx && ctx.resolve ? ctx.resolve(c.panel) : c.panel;
          const own = name0 && ctx && ctx.placeOf ? posInt(ctx.placeOf(name0)) : null;
          let col = own || (s.focus && s.focus.col) || 1;
          if (col > s.columns.length) { note = ' (there is no ' + L + ' ' + col + ', so in ' + L + ' ' + s.columns.length + ')'; col = s.columns.length; }
          c = Object.assign({}, c, { col });
        }
        const panels = s.columns[c.col - 1];
        if (!panels) return { error: 'there is no ' + L + ' ' + c.col + ' (' + s.columns.length + ' ' + L + '(s), ' + s.type + ')' };
        const row = c.row == null ? panels.length + 1 : c.row;
        if (row > panels.length + 1) return { error: 'cannot add at place ' + row + ' of ' + L + ' ' + c.col + ' (up to ' + (panels.length + 1) + ')' };
        const name = ctx && ctx.resolve ? ctx.resolve(c.panel) : c.panel;
        // a name that is no panel's: a synthesis' (D-synthesis), its definition read before
        const def = !name && ctx && ctx.synthesis ? ctx.synthesis(c.panel) : null;
        if (!name && !def) return { error: 'no such panel: ' + c.panel + (ctx && ctx.synthesis ? ' (nor a synthesis: syntheses/' + c.panel + '.json)' : '') };
        if (def && c.bare) return { error: c.panel + ' is a synthesis: it always wears its band (no -bare)' };
        const id = ctx && ctx.newId ? ctx.newId() : (name || def.name) + '-' + c.col + '-' + row;
        const e = { id, panel: name || def.name, ratio: 1, block: c.bare ? null : {} };
        // c.keep: what its main is to start with (a line built by another command: `database id=1`)
        if (def) e.syn = { own: ownName(s, def.name), keep: keepOf(c.keep), saved: false };
        panels.splice(row - 1, 0, e);
        s.focus = { col: c.col, row };
        return { state: s, message: (def ? 'the synthesis ' + e.syn.own : name) + ' at ' + placeText(s.focus) + (c.bare ? ' (a bare panel)' : '') + note };
      }
      case 'del': {
        let p = null;
        if (c.panel) {
          const name = ctx && ctx.resolve ? ctx.resolve(c.panel) || c.panel : c.panel;
          const f = at(s, s.focus);
          const is = (x) => x.panel === name || !!(x.syn && x.syn.own === name);
          if (f && is(f)) p = s.focus;
          else {
            for (let ci = 0; ci < s.columns.length && !p; ci++) {
              const ri = s.columns[ci].findIndex(is);
              if (ri >= 0) p = { col: ci + 1, row: ri + 1 };
            }
          }
          if (!p) return { error: name + ' is not open' };
        } else {
          p = { col: c.col, row: c.row };
          if (!at(s, p)) return { error: 'there is no panel at ' + placeText(p) };
        }
        const gone = s.columns[p.col - 1].splice(p.row - 1, 1)[0];
        if (s.focus) {
          if (s.focus.col === p.col && s.focus.row === p.row) s.focus = nearest(s, p);
          else if (s.focus.col === p.col && s.focus.row > p.row) s.focus = { col: p.col, row: s.focus.row - 1 };
        }
        return { state: s, message: 'closed ' + (gone.syn ? 'the synthesis ' + gone.syn.own : gone.panel) + ' at ' + placeText(p) };
      }
      case 'switch-ver': {
        const col = focusCol(c.col);
        if (!col) return { error: 'which column? ── focus one, or write the column (skin switch ver a,b [column])' };
        const panels = s.columns[col - 1];
        if (!panels) return { error: 'there is no column ' + col };
        if (!panels[c.a - 1] || !panels[c.b - 1]) return { error: 'column ' + col + ' has no places ' + c.a + ' and ' + c.b + ' (' + panels.length + ' panel(s))' };
        if (c.a === c.b) return { error: 'the same place' };
        // the panels change places; each place keeps its height
        const pa = panels[c.a - 1];
        const pb = panels[c.b - 1];
        const ra = pa.ratio;
        pa.ratio = pb.ratio;
        pb.ratio = ra;
        panels[c.a - 1] = pb;
        panels[c.b - 1] = pa;
        if (s.focus && s.focus.col === col) {
          if (s.focus.row === c.a) s.focus = { col, row: c.b };
          else if (s.focus.row === c.b) s.focus = { col, row: c.a };
        }
        return { state: s, message: 'column ' + col + ': ' + c.a + ' ⇄ ' + c.b };
      }
      case 'switch-hor': {
        if (!s.columns[c.a - 1] || !s.columns[c.b - 1]) return { error: 'there are no columns ' + c.a + ' and ' + c.b + ' (' + s.columns.length + ' column(s))' };
        if (c.a === c.b) return { error: 'the same column' };
        // whole columns change places; each place keeps its width
        const t = s.columns[c.a - 1];
        s.columns[c.a - 1] = s.columns[c.b - 1];
        s.columns[c.b - 1] = t;
        if (s.focus) {
          if (s.focus.col === c.a) s.focus = { col: c.b, row: s.focus.row };
          else if (s.focus.col === c.b) s.focus = { col: c.a, row: s.focus.row };
        }
        return { state: s, message: 'column ' + c.a + ' ⇄ column ' + c.b };
      }
      case 'focus': {
        let to;
        if (c.to) {
          to = nearest(s, c.to);
          if (!to) return { error: 'there is no panel to focus' };
        } else {
          to = move(s, s.focus, c.dir);
          if (!to) return { error: 'there is no panel ' + ({ right: 'to the right', left: 'to the left', down: 'below', up: 'above' })[c.dir] };
        }
        s.focus = to;
        return { state: s, message: placeText(to) + ' ' + nameOf(at(s, to)) + (c.to && (c.to.col !== to.col || c.to.row !== to.row) ? ' (' + placeText(c.to) + ' is empty, so the nearest)' : '') };
      }
      case 'block-arrange': {
        const p = at(s, s.focus);
        if (!p) return { error: 'no panel is focused' };
        if (p.block === null) return { error: p.panel + ' at ' + placeText(s.focus) + ' is a bare panel (not a block) ── add it again with skin add' };
        p.block = Object.assign({}, p.block || {}, { side: c.side });
        return { state: s, message: 'the thema of ' + placeText(s.focus) + ' is at ' + SIDE_WORDS[c.side] };
      }
      case 'block-min':
      case 'block-unmin':
      case 'thema-set':
      case 'thema-reset': {
        const p = at(s, s.focus);
        if (!p) return { error: 'no panel is focused' };
        const where = placeText(s.focus);
        if (p.block === null) return { error: p.panel + ' at ' + where + ' is a bare panel (not a block)' };
        const b = Object.assign({}, p.block || {});
        let message;
        if (c.cmd === 'block-min') {
          b.min = c.min;
          message = where + ' shrunk to its ' + (c.min === 'line' ? 'line' : 'band') + ' (block unmin takes it back)';
        } else if (c.cmd === 'block-unmin') {
          if (!b.min) return { error: where + ' is not shrunk' };
          delete b.min;
          message = where + ' is back';
        } else if (c.cmd === 'thema-reset') {
          Object.keys(b).forEach((k) => { if (k !== 'side' && k !== 'min') delete b[k]; });
          message = 'the thema of ' + where + " is back to its panel's block";
        } else {
          if (c.value == null) delete b[c.key];
          else b[c.key] = c.value;
          message = 'the thema of ' + where + ': ' + c.key + (c.value == null ? ' removed' : ' = ' + c.value);
        }
        p.block = b;
        return { state: s, message };
      }
      case 'block-place': {
        const name = ctx && ctx.resolve ? ctx.resolve(c.panel) : c.panel;
        if (!name) return { error: 'no such panel: ' + c.panel };
        // kept by the page (this browser), as block new
        return { state: s, message: '', place: { panel: name, at: c.line } };
      }
      case 'block-new': {
        const name = ctx && ctx.resolve ? ctx.resolve(c.panel) : c.panel;
        if (!name) return { error: 'no such panel: ' + c.panel };
        // kept by the page (this browser), as skin save
        return { state: s, message: '', def: { panel: name, source: c.source, side: c.side } };
      }
      case 'name':
        s.name = c.name;
        return { state: s, message: 'named "' + c.name + '" (skin save keeps it)' };
      case 'save':
        if (c.name) s.name = c.name;
        return { state: s, message: '' };
      case 'read':
      case 'focus-abs':
      case 'go-on':
        return { state: s, message: '' };
    }
    return { error: '?' };
  }

  // where each panel goes, as fractions of the stage (0..1):
  // {panels: [{id, panel, col, row, focused, x, y, w, h}], columns: [{col, x, y, w, h, empty}]}
  // (axis "v": the same, turned over -- a line is a row)
  // opts: {subPx: the stage's length along the sub axis, fixedPx(panel) -> px of a minimised block}
  function rects(s, opts) {
    const r = rectsH(s, opts || {});
    if (s.axis !== 'v') return r;
    const turn = (o) => Object.assign({}, o, { x: o.y, y: o.x, w: o.h, h: o.w });
    return { panels: r.panels.map(turn), columns: r.columns.map(turn) };
  }
  function rectsH(s, opts) {
    const subPx = opts.subPx > 0 ? opts.subPx : 600;
    // a minimised block: its band or a line, in px; the others share the rest
    const fixed = (p) => (p.block && p.block.min ? (opts.fixedPx ? opts.fixedPx(p) : (p.block.min === 'line' ? 4 : 24)) / subPx : 0);
    const wsum = s.ratio.reduce((a, b) => a + b, 0) || 1;
    const panels = [];
    const columns = [];
    let x = 0;
    s.columns.forEach((col, ci) => {
      const w = (s.ratio[ci] || 1) / wsum;
      columns.push({ col: ci + 1, x, y: 0, w, h: 1, empty: !col.length });
      const hsum = col.reduce((a, p) => a + (fixed(p) ? 0 : (p.ratio || 1)), 0) || 1;
      const free = Math.max(0, 1 - col.reduce((a, p) => a + fixed(p), 0));
      let y = 0;
      col.forEach((p, ri) => {
        const h = fixed(p) || free * (p.ratio || 1) / hsum;
        panels.push({ id: p.id, panel: p.panel, syn: p.syn || null, block: p.block === undefined ? {} : p.block, col: ci + 1, row: ri + 1,
          focused: !!(s.focus && s.focus.col === ci + 1 && s.focus.row === ri + 1), x, y, w, h });
        y += h;
      });
      x += w;
    });
    return { panels, columns };
  }

  // the place of the panel with this id -> {col, row} | null
  function find(s, id) {
    for (let ci = 0; ci < s.columns.length; ci++) {
      const ri = s.columns[ci].findIndex((p) => p.id === id);
      if (ri >= 0) return { col: ci + 1, row: ri + 1 };
    }
    return null;
  }

  return { TYPES, MAX_LINES, SOURCES, MINS, EDITORS, isEditor, RENAMED, create, defaultName, place, placeKey, placeText, toJson, fromJson, parse, apply, move, nearest, rects, find, at, nameOf, keepOf };
});
