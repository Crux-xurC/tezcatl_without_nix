// lib/code/file-changes.js -- which open code_editor a change of a file concerns, and
// what to do about it.
// Pure: panels/resident/file_changes.html listens and acts.
//
// No watching and no timer: what changes files in tezcatl already says so on
// the bus, and that record is matched against the code_editor open now:
//   code.saved {name, path}          a code_editor wrote its file
//   fs.changed {op, paths}           a code_editor made (write) / deleted / moved one
//                                    (rename: paths = [from, to])
//   file.changed {op, paths, source} anything else that knows a file changed --
//                                    the place for decoding patches (a git
//                                    command sent to a terminal, an Emacs save,
//                                    an intent ...), added later as plug-ins:
//                                    tezcatl itself reads no backend's text
// The open code_editor answer code.query with code.here {name, path, dirty}.
//
// For each code_editor showing a changed path (not the one that made the change):
//   write   clean -> read it again (code.file edit = `:e`, which refuses over
//           unsaved edits, so a code_editor edited meanwhile is never lost);
//           dirty -> a notice (`:e!` to read it again, `:Replay` for the copy)
//   delete  a notice (its text stays in the code_editor; `:w` makes the file again)
//   rename  a notice (the code_editor still names the old path)
//
// And a code_editor closed with unsaved edits (closing is never
// refused; the copy stays -- and the person is told):
//   code.closed {name, path, dirty, copy}   from the code_editor as it goes
//   GET /mirror/list  slots with unsaved_closed  read when the panel starts
//                     (the panel may have gone with it: a reload of the window)
// Enter opens the file; the code_editor says "a copy is left -- :Replay", then :w.
// `d` (twice) throws such a copy away (POST /mirror/drop,
// mirror.left {paths, why} -- a rename refused over such copies
// -- lists them again with how to tidy up.

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).fileChanges = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(p) { return String(p == null ? '' : p).trim().replace(/^\/+/, ''); }

  // a bus message -> {op, paths, by, byId, source} | null. `byId`: the bus id
  // of the code_editor that made it, never told about its own change (an id, not
  // a name: two code_editor opened by hand can share one); `by`
  // its name, when there is no id.
  function fromMessage(type, payload, meta) {
    const p = payload || {};
    const by = (meta && meta.from && meta.from.name) || p.name || null;
    const byId = (meta && meta.from && meta.from.id) || null;
    if (type === 'code.saved') {
      return p.path ? { op: 'write', paths: [norm(p.path)], by: p.name || by, byId, source: 'code_editor' } : null;
    }
    if (type === 'fs.changed' || type === 'file.changed') {
      const op = p.op === 'delete' || p.op === 'rename' ? p.op : 'write';
      const paths = (Array.isArray(p.paths) ? p.paths : []).map(norm).filter(Boolean);
      if (!paths.length || (op === 'rename' && paths.length < 2)) return null;
      return { op, paths, by: type === 'fs.changed' ? by : null, byId: type === 'fs.changed' ? byId : null, source: type === 'fs.changed' ? 'code_editor' : (p.source || 'file.changed') };
    }
    return null;
  }

  // the same change said twice (a new file: code.saved and fs.changed write) -> one
  function key(c) { return c.op + ' ' + c.paths.join(' > ') + ' ' + (c.byId || c.by || ''); }

  // a change + the code_editor open now ([{id, name, path, dirty}]) ->
  // {reload: [{id, name, path}], notices: [{id, name, path, op, dirty, to, text}]}
  // opts.reload === false (code.json "fileChanges": {"reload": false}): a clean
  // code_editor is not read again by itself -- it is told, as an edited one is
  function plan(change, editors, opts) {
    const auto = !(opts && opts.reload === false);
    const out = { reload: [], notices: [] };
    if (!change) return out;
    const touched = change.op === 'rename' ? [change.paths[0]] : change.paths;
    (editors || []).forEach((e) => {
      if (!e || !e.path) return;
      if (change.byId ? e.id === change.byId : (change.by && e.name === change.by)) return;
      const path = norm(e.path);
      if (touched.indexOf(path) < 0) return;
      const who = { id: e.id, name: e.name, path };
      if (change.op === 'write' && !e.dirty && auto) { out.reload.push(who); return; }
      const n = Object.assign({ op: change.op, dirty: !!e.dirty, to: change.op === 'rename' ? change.paths[1] : null }, who);
      n.text = change.op === 'write' && !e.dirty
        ? path + ' changed on the disk (' + (change.source || '') + ') ── :e reads it again (reading again by itself is off: code.json fileChanges.reload)'
        : change.op === 'write'
        ? path + ' changed on the disk (' + (change.source || '') + ') ── this code_editor has edits: :e! reads it again, :Replay applies the copy'
        : change.op === 'delete'
          ? path + ' was deleted ── its text stays in this code_editor (:w makes it again)'
          : path + ' was moved to ' + n.to + ' ── this code_editor still has the old path (:e ' + n.to + ' opens it again)';
      out.notices.push(n);
    });
    return out;
  }

  function closedText(name, path, copy) {
    if (!path) return 'the code_editor panel ' + (name || '') + ' (a text with no path) was closed unsaved ── there is no copy';
    return 'the code_editor panel of ' + path + ' was closed unsaved' + (name ? ' (' + name + ')' : '') +
      (copy === false ? ' ── there is no copy' : ' ── Enter opens it; :Replay applies the copy, :w saves (d drops the copy if it is not wanted)');
  }

  // code.closed -> a notice {path, name, text} | null (closed clean: nothing to say)
  function closedNotice(payload) {
    const p = payload || {};
    if (!p.dirty) return null;
    const path = p.path ? norm(p.path) : null;
    return { path, name: p.name || null, copy: p.copy !== false && !!path, text: closedText(p.name, path, p.copy !== false && !!path) };
  }

  // GET /mirror/list's slots -> notices for the ones closed with unsaved edits, the newest first
  function closedFromSlots(slots) {
    return (Array.isArray(slots) ? slots : [])
      .filter((s) => s && s.path && typeof s.unsaved_closed === 'number')
      .sort((a, b) => b.unsaved_closed - a.unsaved_closed)
      .map((s) => ({ path: norm(s.path), name: null, copy: true, at: s.unsaved_closed, text: closedText(null, norm(s.path), true) }));
  }

  // mirror.left {paths, why}: something refused to touch files whose copy was
  // left by a code_editor closed unsaved (a rename reaching them) ->
  // notices, one per path, that say how to tidy up
  function leftNotices(payload) {
    const p = payload || {};
    const why = p.why === 'rename' ? 'a rename reaching this file was refused' : (p.why || 'tidy it up before use');
    return (Array.isArray(p.paths) ? p.paths : []).map(norm).filter(Boolean).map((path) => ({
      path, name: null, copy: true,
      text: path + ': a copy closed unsaved is left (' + why + ') ── Enter opens it; :Replay, :w; d drops the copy if it is not wanted',
    }));
  }

  return { fromMessage, key, plan, norm, closedNotice, closedFromSlots, leftNotices };
});
