// lib/core/work-log.js -- the record of what is running and who is open
// the pure part. panels/invisible/work.html listens to the
// bus and keeps one of these; the `work` list shows it.
//
// Nothing announces "I started / I ended" for this record: what already goes
// over the bus is matched against a table of pairs (work.json) --
//   { name, start, where?, end: [types], fail?: [types], failWhere?, key,
//     text?, slowMs?, expireMs?, cancel?: {type, payload} }
// A message of type `start` (its payload matching `where`) opens a row; one
// of the `end` types with the same key closes it. The key is a field of the
// payload (`req`, `path` ...) or "@from": the sender's bus id. Matching is by
// type and key only -- no text is read.
// A row: { n (the order), pair, key, from: {id, role, name} (who fired it),
//          at, text, status: running | done | failed | expired | lost, endAt }
// Some starts have no end that is sure to come (a command no window took, a
// file opened into the code_editor that already has it): a pair with `expireMs`
// ends its row by time -- running for that long, it is `expired`. No timer
// runs for it: like `slow`, it is worked out when the record is next heard
// or read (the recorder may be a background window, its timers slowed).
// `slow` (a running row older than its pair's slowMs) and `orphan` (its
// sender is not among the panels open) are worked out when the rows are read.
//
// The roster (`who`) is the same record: panel-frame says panel.open when a
// panel starts and panel.close when it goes (pagehide), the pair "panel"
// with key "@from". A panel that went without saying so is found by a roll
// call (roll / here / rollDone) and its row becomes `lost`.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).workLog = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_ROWS = 300;
  const ROSTER = 'panel';

  function matches(where, payload) {
    if (!where) return true;
    const p = payload || {};
    return Object.keys(where).every(function (k) { return p[k] === where[k]; });
  }
  function keyOf(pair, payload, meta) {
    if (pair.key === '@from') return meta && meta.from && meta.from.id ? meta.from.id : null;
    const v = payload && payload[pair.key || 'req'];
    return v == null || v === '' ? null : String(v);
  }
  // "{path}" -> the start payload's field (missing: nothing)
  function fill(tpl, payload, from) {
    const src = Object.assign({ role: from && from.role, name: from && from.name }, payload || {});
    return String(tpl || '').replace(/\{(\w+)\}/g, function (_m, k) {
      const v = src[k];
      return v == null || typeof v === 'object' ? '' : String(v);
    }).replace(/\s+/g, ' ').trim();
  }
  // the pairs of work.json, the unusable ones left out -> {pairs, problems}
  function readPairs(doc) {
    const problems = [];
    const pairs = [];
    ((doc && doc.pairs) || []).forEach(function (p, i) {
      if (!p || typeof p.name !== 'string' || typeof p.start !== 'string' || !Array.isArray(p.end) || !p.end.length) {
        problems.push('pair ' + (i + 1) + ': name, start and end are needed');
        return;
      }
      if (pairs.some(function (x) { return x.name === p.name; })) { problems.push('pair "' + p.name + '" twice'); return; }
      pairs.push(p);
    });
    return { pairs: pairs, problems: problems };
  }

  // pairs: readPairs(...).pairs
  function create(pairs) {
    const table = pairs || [];
    let rows = [];
    let seq = 0;
    let rollAt = null;     // a roll call under way: {seen: {id: true}}

    function open(pair, key, payload, meta) {
      const from = (meta && meta.from) || {};
      seq += 1;
      const row = {
        n: seq, pair: pair.name, key: key,
        from: { id: from.id || null, role: from.role || null, name: from.name || null },
        at: (meta && meta.ts) || Date.now(),
        text: fill(pair.text, payload, from) || pair.name,
        status: 'running', endAt: null,
      };
      rows.push(row);
      if (rows.length > MAX_ROWS) {
        // the oldest that has ended goes; running rows are kept
        const i = rows.findIndex(function (r) { return r.status !== 'running'; });
        rows.splice(i >= 0 ? i : 0, 1);
      }
      return row;
    }
    function running(pairName, key) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].pair === pairName && rows[i].key === key && rows[i].status === 'running') return rows[i];
      }
      return null;
    }

    // rows of a pair with expireMs that ran that long end as `expired` -> true when one did
    function sweep(now) {
      let changed = false;
      rows.forEach(function (r) {
        if (r.status !== 'running' || r.pair === ROSTER) return;
        const p = pairOf(r.pair);
        const ms = p && Number(p.expireMs);
        if (!(ms > 0) || now - r.at < ms) return;
        r.status = 'expired';
        r.endAt = r.at + ms;
        changed = true;
      });
      return changed;
    }

    // a bus message -> true when the record changed
    function hear(type, payload, meta) {
      let changed = sweep((meta && meta.ts) || Date.now());
      table.forEach(function (pair) {
        if (pair.start === type && matches(pair.where, payload)) {
          const key = keyOf(pair, payload, meta);
          if (key == null) return;
          // the same thing started again while running (a panel saying open twice): one row
          if (pair.key === '@from' && running(pair.name, key)) return;
          open(pair, key, payload, meta);
          changed = true;
        } else if (pair.end.indexOf(type) >= 0) {
          const key = keyOf(pair, payload, meta);
          const row = key == null ? null : running(pair.name, key);
          if (!row) return;
          const failed = (pair.fail || []).indexOf(type) >= 0 || (pair.failWhere && matches(pair.failWhere, payload));
          row.status = failed ? 'failed' : 'done';
          row.endAt = (meta && meta.ts) || Date.now();
          changed = true;
        }
      });
      return changed;
    }

    function pairOf(name) { return table.filter(function (p) { return p.name === name; })[0] || null; }
    // the panels open, as far as this record knows: {id: row}
    function openPanels() {
      const m = {};
      rows.forEach(function (r) { if (r.pair === ROSTER && r.status === 'running') m[r.key] = r; });
      return m;
    }
    // the rows as shown; opts.only: 'running' | 'panels' | 'work' (all but the roster)
    function list(now, opts) {
      sweep(now);
      const only = opts && opts.only;
      const here = openPanels();
      return rows.filter(function (r) {
        if (only === 'panels') return r.pair === ROSTER && r.status === 'running';
        if (r.pair === ROSTER) return false;
        return only === 'running' ? r.status === 'running' : true;
      }).map(function (r) {
        const p = pairOf(r.pair) || {};
        const is = r.status === 'running';
        return Object.assign({}, r, {
          ms: (is ? now : r.endAt) - r.at,
          slow: !!(is && p.slowMs && now - r.at >= p.slowMs),
          // still waited for, but who fired it is not among the panels open
          orphan: !!(is && r.from.id && !here[r.from.id]),
          cancel: !!(is && p.cancel),
          place: r.place || null,
        });
      });
    }

    // what to send to stop row n: {to, type, payload} | {error}
    function cancelOf(n, now) {
      sweep(now == null ? Date.now() : now);
      const r = rows.filter(function (x) { return x.n === n; })[0];
      if (!r || r.pair === ROSTER) return { error: 'there is no row ' + n + ' (work list)' };
      if (r.status !== 'running') return { error: 'row ' + n + ' (' + r.text + ') has ended already: ' + r.status };
      const p = pairOf(r.pair);
      if (!p || !p.cancel || !p.cancel.type) return { error: 'row ' + n + ' (' + r.text + ') cannot be stopped from here' };
      if (!r.from.id) return { error: 'row ' + n + ': who fired it is not known' };
      const payload = {};
      Object.keys(p.cancel.payload || {}).forEach(function (k) {
        const v = p.cancel.payload[k];
        payload[k] = v === '{key}' ? r.key : v;
      });
      return { to: r.from.id, type: p.cancel.type, payload: payload, row: r };
    }

    // -- the roll call: who is really open --------------------------------
    function roll() { rollAt = { seen: {} }; }
    // a panel answered: {id, role, name}; place: {skin, place, panel} | null (its frame said where)
    function here(who, place) {
      if (!who || !who.id) return;
      if (rollAt) rollAt.seen[who.id] = true;
      let row = running(ROSTER, who.id);
      if (!row) {
        const pair = pairOf(ROSTER);
        if (!pair) return;
        row = open(pair, who.id, {}, { from: who, ts: Date.now() });
      }
      if (who.role) row.from.role = who.role;
      if (who.name) { row.from.name = who.name; row.text = [row.from.role || '', who.name].join(' ').trim(); }
      if (place) row.place = place;
    }
    function placeOf(id, place) {
      const row = running(ROSTER, id);
      if (row && place) row.place = place;
    }
    // the roll call is over: an open panel that did not answer went without saying so
    function rollDone(now) {
      if (!rollAt) return 0;
      let lost = 0;
      rows.forEach(function (r) {
        if (r.pair === ROSTER && r.status === 'running' && !rollAt.seen[r.key]) {
          r.status = 'lost';
          r.endAt = now;
          lost += 1;
        }
      });
      rollAt = null;
      return lost;
    }

    return { hear: hear, list: list, cancelOf: cancelOf, roll: roll, here: here, placeOf: placeOf, rollDone: rollDone,
      size: function () { return rows.length; } };
  }

  function two(n) { return (n < 10 ? '0' : '') + n; }
  function clock(ts) { const d = new Date(ts); return two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()); }
  function took(ms) { return ms < 1000 ? ms + ' ms' : (Math.round(ms / 100) / 10) + ' s'; }
  function who(from) { return [(from && from.role) || '?', (from && from.name) || ''].join(' ').trim(); }
  // a row of list() -> {label, sub}: what the list shows
  function show(r) {
    const st = r.status === 'running' ? (r.slow ? 'slow' : 'running') : r.status;
    return {
      label: r.n + '  ' + st + '  ' + r.text,
      sub: who(r.from) + ' · ' + clock(r.at) + ' · ' + took(r.ms) + (r.orphan ? ' · its panel is gone' : '') + (r.cancel ? ' · Del stops it' : ''),
    };
  }
  // a row of list(now, {only: 'panels'}) -> one line of `who`
  function whoLine(r, i) {
    const p = r.place;
    return (i + 1) + '  ' + who(r.from) + (p ? '  ' + (p.skin || 'frame') + ' ' + p.place : '') + '  since ' + clock(r.at);
  }

  return { create: create, readPairs: readPairs, show: show, whoLine: whoLine, clock: clock, took: took, MAX_ROWS: MAX_ROWS, ROSTER: ROSTER };
});
