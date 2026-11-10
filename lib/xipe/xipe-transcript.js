// lib/xipe/xipe-transcript.js -- how the Xipe dialogue window's transcript
// (panels/resident/code_xipe_out.html) renders what went over /xipe. Pure: the skin
// (panels/skins/xipe.html) keeps the lines and pushes the text.
//
// xipe_totec 's display convention: id / from / the dialogue
// envelope are hidden from the human-facing view. A reply shows its
// dialogue.text when Xipe Totec gave one, else the result (or error) as
// JSON. Nothing here parses dialogue.text -- it is shown as-is.

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).xipeTranscript = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NOTIFY_MAX = 200;

  function sent(text) {
    return String(text).split(/\r?\n/).map(function (l) { return '> ' + l; });
  }

  function reply(r) {
    if (r.error) {
      const e = r.error;
      const head = '! ' + (e.code ? e.code + ': ' : '') + (e.message || JSON.stringify(e));
      const txt = r.dialogue && typeof r.dialogue.text === 'string' ? r.dialogue.text.split(/\r?\n/) : [];
      return [head].concat(txt);
    }
    if (r.dialogue && typeof r.dialogue.text === 'string' && r.dialogue.text !== '') {
      return r.dialogue.text.split(/\r?\n/);
    }
    const res = r.result;
    if (res == null || (typeof res === 'object' && Object.keys(res).length === 0)) return ['(ok)'];
    return JSON.stringify(res, null, 2).split('\n');
  }

  function notify(n) {
    const body = n.params == null ? '' : JSON.stringify(n.params);
    return ['· ' + n.method + (body ? ' ' + (body.length > NOTIFY_MAX ? body.slice(0, NOTIFY_MAX) + '…' : body) : '')];
  }

  function info(i) {
    if (i.kind === 'initialized') {
      const p = i.project || {};
      return ['# connected: project ' + (p.id || '?') + '  ' + (p.root || '')];
    }
    return ['# ' + i.kind + ': ' + (i.reason == null ? '' : i.reason)];
  }

  // keep at most `max` lines
  function append(lines, more, max) {
    const out = lines.concat(more);
    return max && out.length > max ? out.slice(out.length - max) : out;
  }

  return { sent: sent, reply: reply, notify: notify, info: info, append: append };
});
