// lib/skin/task-table-commands.js -- the `task_table ...` lines of a skin's
// input form (D-task-table):
//   task_table take[!] <path> <name>   a task_table panel added for the table
//                                      named <name> (blanks in it are fine: the
//                                      rest of the line) of the note <path>; its
//                                      book is read when there is one, `!` takes
//                                      the table again over it
//   task_table save                    the task_table meant now to its book (w)
//   task_table put[!]                  ... and into the note (W); `!` over a
//                                      table changed since it was taken
//   task_table list                    ... and the rows shown into the task list (L)
// The panel meant: the focused one, else the first of this skin. The panel
// says what came of it itself (recv.say).
(function (root) {
  'use strict';

  const USAGE = 'task_table take[!] <path> <name> / task_table save / task_table put[!] / task_table list';

  // a line -> null (not its) | {cmd: 'take', path, name, fresh} | {cmd: 'save' | 'list'} | {cmd: 'put', bang} | {error}
  // resolve(arg) -> {path} | {error} (from the file of the code_editor meant now)
  function parse(line, resolve) {
    const m = /^\s*task_table(?:\s+([\s\S]*))?$/.exec(String(line == null ? '' : line));
    if (!m) return null;
    const rest = (m[1] || '').trim();
    let w = /^(take!?)\s+(\S+)\s+(\S[\s\S]*)$/.exec(rest);
    if (w) {
      const r = resolve ? resolve(w[2]) : { path: w[2].replace(/^\/+/, '') };
      if (r.error) return { error: r.error };
      return { cmd: 'take', path: r.path, name: w[3].trim(), fresh: w[1] === 'take!' };
    }
    if (/^take!?(\s|$)/.test(rest)) return { error: 'a note and a table name: ' + USAGE };
    if (rest === 'save' || rest === 'list') return { cmd: rest };
    w = /^put(!?)$/.exec(rest);
    if (w) return { cmd: 'put', bang: w[1] === '!' };
    return { error: USAGE };
  }

  // h: { bus, recv(text, cls, ref), resolve(arg), add(path, name, fresh) -> bool,
  //      panels() -> [{id, bus, place, focused}] (this skin's task_table panels) }
  function wire(h) {
    function err(t, ref) { h.recv('! ' + t, 'err', ref || null); return false; }
    function run(c) {
      if (c.cmd === 'take') return h.add(c.path, c.name, c.fresh);
      const all = h.panels();
      const p = all.filter(function (x) { return x.focused; })[0] || all[0];
      if (!p) return err('task_table ' + c.cmd + ' ── there is no task_table here (task_table take <path> <name> adds one)');
      if (!p.bus) return err('task_table ' + c.cmd + ' ── the task_table at ' + p.place + ' is still loading', { kind: 'panel', id: p.id });
      h.bus.post('task_table.do', { op: c.cmd, bang: !!c.bang }, { to: p.bus });
      return true;
    }
    function handle(line) {
      const c = parse(line, h.resolve);
      if (!c) return false;
      if (c.error) return err(c.error);
      return run(c);
    }
    return { handle: handle, run: run };
  }

  const api = { USAGE, parse, wire };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.Tezcatl = root.Tezcatl || {}).taskTableCommands = api;
})(typeof self !== 'undefined' ? self : this);
