// lib/skin/skin-ex.js -- a skin's code_editor and its input form, wired for Vim's
// ways: code_editor edits its text; what Vim would do on the
// command line goes through the skin's input form.
//
//   code_editor  `:# [text]`  --cmd.focus {name, text}-->  skin
//      (the symbol is code.json "inputFormEx", default "#": ! # & < = > @ ~)
//      skin: answers cmd.focused, focuses the input form (with `text` typed in);
//      after the next line sent from it, focus goes back to code_editor
//   input form  `:w` `:e <path>` `:Delete` `:Rename` `:Move` (lib/code/code-files.js parseEx)
//      skin --code.file {op, arg, bang}--> its code_editor
//   tezcatl-commands code.write / code.edit / code.delete / code.rename / code.move /
//      code.mirror / code.replay / code.reconnect (command_map.json) -> the same code.file
//   input form  `:12` `:12:5`  --code.goto {line, col}--> its code_editor (as Vim's `:12`)
//   input form  `:find path[:line[:col]]`  -> opts.locate: the code_editor that has
//      the path open, or a new one (lib/code/code-locate.js)
//   input form  `:grep pattern [path]`  -> opts.grep: the matches in a list
//      (Enter opens one)
//
// A line not starting with ":" is the skin's own (`tree ...`); handle()
// says whether it took the line.
//
// An editor may turn the ":" lines off (code.json "inputLineEx"; by default
// only vim takes them -- D-code-editor): it says so on code.ready
// {inputLineEx} and code.input-line-ex {on}, and a ":" line meant for it is
// refused here, never sent (refused(line) says it for the skin's own ":" lines).

(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).skinEx = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // tezcatl-command -> code.file; the args each takes
  const COMMANDS = {
    'code.write': { op: 'write', arg: null },
    'code.edit': { op: 'edit', arg: 'path' },
    'code.delete': { op: 'delete', arg: null },
    'code.rename': { op: 'rename', arg: 'name' },
    'code.move': { op: 'move', arg: 'path' },
    'code.scratch': { op: 'scratch', arg: null },
    // the marks replaced with ids of a list: args.with = "<mark> <list>"
    'code.replace': { op: 'replace', arg: 'with' },
    // the copy
    'code.mirror': { op: 'mirror', arg: null },
    'code.replay': { op: 'replay', arg: null },
    'code.reconnect': { op: 'reconnect', arg: null },
    // the language server
    'code.lsp-definition': { op: 'lsp-definition', arg: null },
    'code.lsp-references': { op: 'lsp-references', arg: null },
    'code.lsp-rename': { op: 'lsp-rename', arg: 'name' },
    'code.lsp-format': { op: 'lsp-format', arg: null },
    'code.lsp-hover': { op: 'lsp-hover', arg: null },
    'code.diag-next': { op: 'diag-next', arg: null },
    'code.diag-prev': { op: 'diag-prev', arg: null },
    // what the editor knows of the text: the outline's definitions, the syntax tree
    'code.def-next': { op: 'def-next', arg: null },
    'code.def-prev': { op: 'def-prev', arg: null },
    'code.node-select': { op: 'node-select', arg: null },
    'code.node-parent': { op: 'node-parent', arg: null },
    'code.node-next': { op: 'node-next', arg: null },
    'code.node-prev': { op: 'node-prev', arg: null },
  };

  // opts: { bus, panes, code: <code_editor pane name>, cmd: <input form pane name>,
  //         files: Tezcatl.codeFiles, say(text),
  //         locate(target) -> Promise<{ok, message}> (`:find`; optional),
  //         grep(args) -> {ok, message} (`:grep`; optional) }
  // A skin whose code_editor is not always the same one (the frame) gives
  // instead: code: () -> the name of the code_editor meant now (null: none),
  // isCode(meta) -> whether a cmd.focus came from one of its code_editor,
  // focusPane(name, busId) -> its own way of focusing a panel, and
  // focusCmd(text) -> its own input form (not a pane), focused with `text` typed in.
  function wire(opts) {
    const bus = opts.bus;
    const files = opts.files;
    const say = opts.say || function () {};
    const codeName = typeof opts.code === 'function' ? opts.code : function () { return opts.code; };
    const ids = {};       // panel name -> bus id (from code.ready)
    const exOff = {};     // panel name -> true: it takes no ":" lines (inputLineEx false)
    let cmdId = null;
    let back = null;      // the code_editor to go back to after the next line sent (it came by :#)
    const reqStamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    let reqSeq = 0;

    function from(meta, name) { return !!name && meta && meta.from && meta.from.name === name; }
    // the code_editor a ":" line goes to: the one whose `:#` brought us here, else the one meant now
    function target() { return back || codeName(); }
    function codeId() { return ids[target()] || null; }
    function paneOf(name) {
      return opts.panes ? opts.panes.panes().filter(function (p) { return p.name === name; })[0] || null : null;
    }
    // the pane, and the editor inside it: panes.focus only focuses the frame's
    // window; bus `focus` (panel-frame) puts the caret in its editor
    function focusPane(name, busId) {
      if (opts.focusPane) return opts.focusPane(name, busId);
      const pane = paneOf(name);
      if (!pane) return false;
      opts.panes.focus(pane.id);
      if (busId) bus.post('focus', {}, { to: busId });
      return true;
    }

    bus.on('code.ready', function (p, meta) {
      if (meta && meta.from && meta.from.name) ids[meta.from.name] = meta.from.id;
      if (meta && meta.from && meta.from.name && p && typeof p.inputLineEx === 'boolean') exOff[meta.from.name] = !p.inputLineEx;
      if (from(meta, opts.cmd)) cmdId = meta.from.id;
    });

    bus.on('code.input-line-ex', function (p, meta) {
      if (meta && meta.from && meta.from.name && p && typeof p.on === 'boolean') exOff[meta.from.name] = !p.on;
    });

    // a ":" line the code_editor meant now does not take: what to say, else null
    function refused(line) {
      const name = target();
      if (!name || !exOff[name]) return null;
      return '! ' + String(line || '').trim() + ' ── this code_editor takes no ":" lines (inputLineEx in code.json; its keymap\'s keys or the palette do the same)';
    }

    bus.on('cmd.focus', function (p, meta) {
      const mine = opts.isCode ? opts.isCode(meta) : from(meta, codeName());
      if (!mine) return;
      bus.post('cmd.focused', { for: meta.from.name });
      const text = (p && p.text) || '';
      if (opts.focusCmd) { back = meta.from.name; opts.focusCmd(text); return; }
      if (!paneOf(opts.cmd)) return;
      back = meta.from.name;
      if (cmdId) bus.post('code.set', { text: text, cursor: 'end' }, { to: cmdId });
      focusPane(opts.cmd, cmdId);
    });

    // the file commands to code_editor; false when there is no code_editor (yet)
    function toCode(op, arg, bang) {
      const codeId_ = codeId();
      if (!codeId_) return false;
      // req: carried on the answer (code.saved / code.saveFailed), so the two are a pair (work.json)
      reqSeq += 1;
      bus.post('code.file', { op: op, arg: arg || '', bang: !!bang, req: 'ex' + reqStamp + '-' + reqSeq }, { to: codeId_ });
      return true;
    }

    // a line from the input form: true when it was a ":" line (taken here).
    // Any other line (`skin focus 2 2`, `tree add`) means the person went on
    // to something else: the way back from `:#` is dropped, so the next ":"
    // line goes to the code_editor meant then, not the one `:#` came from
    function handle(line) {
      const text = String(line || '').trim();
      if (text.charAt(0) !== ':') { back = null; return false; }
      const no = refused(text);
      if (no) { say(no); back = null; return true; }
      // :12 / :12:5 -- the line (and column, 1-based) in this skin's code_editor
      const n = /^:\s*(\d+)(?::(\d+))?\s*$/.exec(text);
      if (n) {
        if (!codeId()) { say('! ' + text + ' ── there is no code_editor yet'); return true; }
        bus.post('code.goto', { line: Number(n[1]), col: n[2] ? Number(n[2]) - 1 : 0 }, { to: codeId() });
        focusPane(target(), codeId());
        back = null;
        say(text);
        return true;
      }
      // :find path[:line[:col]] -- the code_editor that has it open, or a new one
      const f = /^:\s*find(?:\s+(.*))?$/.exec(text);
      if (f) {
        if (!opts.locate) { say('! ' + text + ' ── not available in this skin'); return true; }
        if (!f[1] || !f[1].trim()) { say('! ' + text + ' ── no path (:find path[:line[:col]])'); return true; }
        back = null;
        Promise.resolve(opts.locate(f[1].trim())).then(function (r) {
          say((r && r.ok === false ? '! ' : '') + text + ' ── ' + ((r && r.message) || ''), r && r.ok !== false ? r.ref : null);
        });
        return true;
      }
      // :grep pattern [path] -- the files searched, the matches in a list
      const g = /^:\s*grep(?:\s+(.*))?$/.exec(text);
      if (g) {
        if (!opts.grep) { say('! ' + text + ' ── not available in this skin'); return true; }
        back = null;
        const r = opts.grep(g[1] || '');
        say((r && r.ok === false ? '! ' : '') + text + ' ── ' + ((r && r.message) || ''));
        return true;
      }
      const c = files.parseEx(text);
      if (c.error) say('! ' + text + ' ── ' + c.error);
      else if (!toCode(c.op, c.arg, c.bang)) say('! ' + text + ' ── there is no code_editor yet');
      else say(text + ' ── to code_editor (the result is in its head)');
      return true;
    }

    // after the input form sent its lines: back to code_editor, if `:#` brought us here
    function sent() {
      if (!back) return;
      const name = back;
      back = null;
      focusPane(name, ids[name] || null);
    }

    // the code.* tezcatl-commands; isMine(ctx) says whether this skin runs one
    // that came over the bus (the tree skin's "focused last")
    function register(commands, isMine) {
      Object.keys(COMMANDS).forEach(function (name) {
        const c = COMMANDS[name];
        commands.register(name, function (args, ctx) {
          if (isMine && !isMine(ctx)) return false;
          const a = args || {};
          const ok = toCode(c.op, c.arg ? a[c.arg] : '', a.bang);
          if (!ok) say('! ' + name + ' ── there is no code_editor yet');
          return ok;
        });
      });
    }

    return { handle: handle, sent: sent, register: register, refused: refused };
  }

  return { wire: wire, COMMANDS: COMMANDS };
});
