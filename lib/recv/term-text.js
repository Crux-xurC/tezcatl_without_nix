// lib/recv/term-text.js -- what a terminal printed, as lines of plain text, for
// the receiving side (D-unified-dock: an xterm as a source of output_target). Not
// a terminal: escape sequences are dropped (colours, cursor moves, titles),
// "\r" goes back to the start of the line and what follows writes over it
// (a progress bar shows its last state), "\b" one back. A sequence cut
// between two writes waits for the rest. Pure: no DOM.
//
//   create(keep) -> {write(text), lines() -> [string], take() -> [string], rest() -> string}
//   keep: the last lines kept. take(): the lines ended since the last take (of
//   those kept); rest(): the line being printed (not ended yet)
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).termText = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // CSI, OSC (ended by BEL or ST), a charset choice, and the two-char ones
  const SEQ = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()*+][0-9A-Za-z]|[@-Z\\-_=>78])/g;
  // the start of a sequence that has not ended yet (at the end of a write)
  const OPEN = /\x1b(?:\[[0-?]*[ -/]*|\][^\x07\x1b]*(?:\x1b)?|[()*+])?$/;

  function create(keep) {
    const max = Math.max(1, keep | 0 || 200);
    const done = [];
    let cur = [];
    let col = 0;
    let pending = '';
    let pushed = 0;
    let taken = 0;

    function push() {
      pushed++;
      done.push(cur.join(''));
      if (done.length > max) done.splice(0, done.length - max);
      cur = [];
      col = 0;
    }

    function write(text) {
      let s = pending + String(text == null ? '' : text);
      pending = '';
      const open = OPEN.exec(s);
      if (open && open[0]) { pending = open[0]; s = s.slice(0, open.index); }
      s = s.replace(SEQ, '');
      for (const ch of s) {
        if (ch === '\n') push();
        else if (ch === '\r') col = 0;
        else if (ch === '\b') col = Math.max(0, col - 1);
        else if (ch === '\t') { const to = (Math.floor(col / 8) + 1) * 8; while (col < to) { cur[col] = cur[col] || ' '; col++; } }
        else if (ch < ' ' || ch === '\x7f') continue;
        else { while (cur.length < col) cur.push(' '); cur[col] = ch; col++; }
      }
    }

    function lines() {
      const out = done.slice();
      if (cur.length) out.push(cur.join(''));
      return out.length > max ? out.slice(out.length - max) : out;
    }

    function take() {
      const out = done.slice(Math.max(0, done.length - (pushed - taken)));
      taken = pushed;
      return out;
    }
    function rest() { return cur.join(''); }

    return { write, lines, take, rest };
  }

  return { create };
});
