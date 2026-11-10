// lib/skin/lead-form.js -- a lead-key input form, shared by the input_leadkey
// panel (lib/skin/input-leadkey-page.js) and the frame's own input form
// (lib/skin/frame-page.js; D-lead-key, D-unified-dock).
//
// Two lines: what is typed (`ls ;cd x`) and what will be sent (`l s SPC C-d SPC
// x`), read by lib/core/lead.js. The second line is the truth. submit() sends
// it: `lead.send` {id, events} to an input_target, which hands it on unread and
// answers `lead.sent`; the answer is shown in the note. A line that does not
// read is not sent; one that stops half-way (after ;, a modifier or ;f) shows
// "waiting" rather than an error.
//
// As each char settles in the form, the keys it settles go to the virtual
// keyboard (`lead.keys` {keys}); a shortcut (;: ;i ...) runs its tezcatl
// command at once and leaves nothing in the form. A char is read with the text
// left of it, so moving the cursor or editing never puts it out of step; chars
// that come through an IME composition are read when it ends (with an IME on,
// even ASCII comes as a composition). Pasted text goes in as plain chars
// (lead.escape: ; -> ;;). The keys of the page (Enter, history) are the page's.
//
//   mount({form, sends, mark, note}, {target: () => bus id | null, said})
//     -> {render, submit, note, sync, table}
// The table comes from config.json ui.keys: lead, fnRow, leadBindings.
(function (root) {
  'use strict';
  var T = (root.Tezcatl = root.Tezcatl || {});

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  }

  function mount(els, opts) {
    var lead = T.lead;
    var formEl = els.form, sendsEl = els.sends, markEl = els.mark, noteEl = els.note;
    var api = { table: lead.configure().table };

    T.config.load().then(function (cfg) {
      var k = (cfg && cfg.ui && cfg.ui.keys) || {};
      var r = lead.configure({ lead: k.lead, fnRow: k.fnRow, bindings: k.leadBindings });
      api.table = r.table;
      if (r.errors.length) note('config.json ui.keys: ' + r.errors.join('; '), 'err');
      render();
    }).catch(function () {});

    function note(text, cls) {
      if (!noteEl) return;
      noteEl.textContent = text || '';
      noteEl.className = cls || '';
    }

    // -- the second line -------------------------------------------------------
    function render() {
      var table = api.table;
      var text = formEl.value;
      var r = lead.parse(text, table);
      if (r.error && r.incomplete) {
        var head = lead.parse(text.slice(0, r.at), table);
        sendsEl.innerHTML = (r.at && !head.error ? esc(lead.describe(head.events)) + ' ' : '') +
          '<span class="wait">… waiting for the key after ' + esc(text.slice(r.at)) + '</span>';
        sendsEl.className = 'sends waiting';
      } else if (r.error) {
        sendsEl.innerHTML = '<span class="err">' + esc(r.error) + '</span>' +
          '<span class="at"> at ' + (r.at + 1) + ': ' + esc(text.slice(r.at, r.at + 8)) + '</span>';
        sendsEl.className = 'sends bad';
      } else {
        sendsEl.innerHTML = r.events.map(function (e) {
          return '<span class="' + (e.modifiers.length ? 'mod' : 'key') + '">' + esc(lead.describe([e])) + '</span>';
        }).join(' ');
        sendsEl.className = 'sends';
      }
      if (markEl) {
        var st = readerAt(formEl.selectionStart == null ? text.length : formEl.selectionStart).state();
        markEl.textContent = st.fn ? 'F' : st.waiting ? table.lead : st.modifiers.length ?
          lead.describe([{ key: '', modifiers: st.modifiers }]) : '';
      }
      return r;
    }

    // the reader as it stands after the text left of pos
    function readerAt(pos) {
      var r = lead.reader(api.table);
      for (var ch of formEl.value.slice(0, pos)) r.feed(ch);
      return r;
    }

    // -- typing -----------------------------------------------------------------
    var snap = { value: formEl.value, start: 0, end: 0 };
    function sync() {
      snap = { value: formEl.value, start: formEl.selectionStart, end: formEl.selectionEnd };
    }

    // the chars put in since the snapshot: {at, text}, or null (a delete, a move)
    function inserted() {
      var old = snap.value, now = formEl.value;
      if (now === old) return null;
      var a = 0;
      while (a < old.length && a < now.length && old[a] === now[a]) a++;
      var b = 0;
      while (b < old.length - a && b < now.length - a && old[old.length - 1 - b] === now[now.length - 1 - b]) b++;
      var removed = old.slice(a, old.length - b);
      var text = now.slice(a, now.length - b);
      if (!text || (removed && removed !== old.slice(snap.start, snap.end))) return null;
      return { at: a, text: text };
    }

    function settle() {
      var ins = inserted();
      sync();
      if (!ins) return;
      var table = api.table;
      var r = readerAt(ins.at);
      var lights = [];
      var chars = Array.from(ins.text);
      for (var i = 0; i < chars.length; i++) {
        var before = r.state();
        var out = r.feed(chars[i]);
        if (out.binding && chars.length === 1) {
          // a shortcut: its lead and char come back out, and it runs
          var from = ins.at > 0 && formEl.value.charAt(ins.at - 1) === table.lead ? ins.at - 1 : ins.at;
          formEl.setRangeText('', from, ins.at + chars[i].length, 'end');
          sync();
          render();
          runShortcut(out.binding);
          return;
        }
        if (out.error && before.waiting && chars.length === 1) {
          // ;z and the like: said, and the char comes back out
          formEl.setRangeText('', ins.at, ins.at + chars[i].length, 'end');
          sync();
          render();
          note(out.error, 'err');
          return;
        }
        lights = lights.concat(out.lights);
      }
      if (lights.length) T.bus.post('lead.keys', { keys: lights });
    }

    formEl.addEventListener('beforeinput', function (e) {
      if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') {
        var text = e.dataTransfer ? e.dataTransfer.getData('text/plain') : e.data;
        e.preventDefault();
        formEl.setRangeText(lead.escape(text || '', api.table), formEl.selectionStart, formEl.selectionEnd, 'end');
        sync();
        render();
      }
    });
    formEl.addEventListener('input', function (e) {
      note('');
      if (!e.isComposing) settle();
      render();
    });
    formEl.addEventListener('compositionend', function () { settle(); render(); });
    // a value set by the page (history, :# from code_editor) is not typing
    function moved() { if (formEl.value === snap.value || document.activeElement !== formEl) sync(); render(); }
    formEl.addEventListener('keyup', function (e) {
      if (/^Arrow|^Home$|^End$/.test(e.key)) moved();
    });
    formEl.addEventListener('click', moved);
    formEl.addEventListener('focus', function () { sync(); render(); });

    function runShortcut(line) {
      var words = String(line).trim().split(/\s+/);
      var name = words.shift();
      var spec = (T.commands.list ? T.commands.list() : []).find(function (c) { return c.name === name; });
      var args = {};
      ((spec && spec.args) || []).forEach(function (a, i) { if (words[i] !== undefined) args[a] = words[i]; });
      note(api.table.lead + ' → ' + line);
      T.commands.invoke(name, args);
    }

    // -- sending ----------------------------------------------------------------
    var waiting = {};
    var seq = 0;
    T.bus.onMine('lead.sent', function (p) {
      var w = p && waiting[p.id];
      if (!w) return;
      clearTimeout(w.timer);
      delete waiting[p.id];
      if (p.ok) { if (!opts.quietOk || !opts.quietOk(p)) note('→ ' + p.target + '  ' + w.desc, 'ok'); }
      else note('✗ ' + (p.error || 'not sent') + '  ' + w.desc, 'err');
    });

    // -> true when the line went (it is then emptied), false when it did not
    function submit() {
      var text = formEl.value;
      if (!text) return false;
      var r = render();
      if (r.error) { note('not sent: ' + (r.incomplete ? 'the line stops half-way (' + r.error + ')' : r.error), 'err'); return false; }
      var to = opts.target();
      if (!to) { note('no input_target in this skin: nothing to send to', 'err'); return false; }
      var id = 'l' + Date.now().toString(36) + (++seq);
      var desc = lead.describe(r.events);
      waiting[id] = {
        desc: desc,
        timer: setTimeout(function () {
          delete waiting[id];
          note('✗ no answer from input_target  ' + desc, 'err');
        }, 3000),
      };
      T.bus.post('lead.send', { id: id, events: r.events }, { to: to });
      formEl.value = '';
      sync();
      render();
      return true;
    }

    if (T.commands && T.commands.load && !(T.commands.isLoaded && T.commands.isLoaded())) T.commands.load().catch(function () {});
    sync();
    render();
    api.render = render;
    api.submit = submit;
    api.note = note;
    api.sync = sync;
    return api;
  }

  T.leadForm = { mount: mount };
})(typeof self !== 'undefined' ? self : this);
