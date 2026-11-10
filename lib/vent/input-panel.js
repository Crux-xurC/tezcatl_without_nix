(function (root) {
  'use strict';
  const Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  function ts() {
    return new Date().toTimeString().slice(0, 8);
  }

  function submitAction(e) {
    if (e.key !== 'Enter') return null;
    return e.shiftKey ? 'send' : 'ret';
  }

  function mount(rootEl, opts) {
    const send = opts.send;
    const getContext = opts.getContext || function () { return null; };
    const kbd = Tezcatl.kbd;
    const resolver = Tezcatl.resolver || null;

    rootEl.innerHTML =
      '<div class="status closed">disconnected</div>' +
      '<div class="abort">' +
        '<button type="button" class="cg" ' +
          'title="Send C-g when Emacs is stuck waiting for input (not an undo of this command ── C-g is global)">' +
          'Unstick Emacs (C-g)</button>' +
      '</div>' +
      '<div class="modes">' +
        '<button type="button" data-mode="form" class="on">Form</button>' +
        '<button type="button" data-mode="live">Live</button>' +
        '<button type="button" data-mode="text">Text</button>' +
      '</div>' +
      '<div class="form">' +
        '<input class="kbd" type="text" autocomplete="off" spellcheck="false" ' +
          'placeholder="press keys (C-x C-f) or type notation; S-Enter / Send transmits">' +
        '<button class="send" type="button">Send</button>' +
        '<div class="composed">' +
          '<span class="lbl">composed</span> <span class="preview"></span>' +
        '</div>' +
        '<div class="lastcap"></div>' +
        '<div class="caphint"></div>' +
      '</div>' +
      '<div class="intentform" hidden></div>' +
      '<div class="capture off" hidden>' +
        '<button type="button">capture: OFF</button>' +
        '<span class="hint">Escape (Fn+CapsLock) toggles · C-[ sends ESC</span>' +
      '</div>' +
      '<div class="textmode" hidden>' +
        '<textarea class="text" rows="4" spellcheck="false" ' +
          'placeholder="raw text -> one input event per character. ' +
          'S-Enter / Send transmits; Enter is a newline. No prefix or RET is added."></textarea>' +
        '<button class="textsend" type="button">Send</button>' +
        '<div class="textpreview"></div>' +
      '</div>' +
      '<div class="target">(no context yet)</div>' +
      '<div class="log"></div>';

    const statusEl = rootEl.querySelector('.status');
    const cgEl = rootEl.querySelector('.abort .cg');
    const modeEls = rootEl.querySelectorAll('.modes button');
    const formEl = rootEl.querySelector('.form');
    const kbdEl = rootEl.querySelector('.kbd');
    const sendEl = rootEl.querySelector('.send');
    const previewEl = rootEl.querySelector('.preview');
    const lastCapEl = rootEl.querySelector('.lastcap');
    const capHintEl = rootEl.querySelector('.caphint');
    const captureEl = rootEl.querySelector('.capture');
    const buttonEl = rootEl.querySelector('.capture button');
    const textModeEl = rootEl.querySelector('.textmode');
    const textAreaEl = rootEl.querySelector('.text');
    const textSendEl = rootEl.querySelector('.textsend');
    const textPreviewEl = rootEl.querySelector('.textpreview');
    const intentFormEl = rootEl.querySelector('.intentform');
    const targetEl = rootEl.querySelector('.target');
    const logEl = rootEl.querySelector('.log');

    let mode = 'form';
    let capturing = false;
    const history = [];
    let histIdx = 0;

    function esc(s) {
      return String(s).replace(/[&<>]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
      });
    }

    function append(cls, text) {
      const row = document.createElement('div');
      row.className = cls;
      row.innerHTML = '<span class="ts">' + ts() + '</span> ' + esc(text);
      logEl.appendChild(row);
      logEl.scrollTop = logEl.scrollHeight;
    }

    function setState(state) {
      statusEl.className = 'status ' + state;
      statusEl.textContent =
        state === 'open' ? 'connected' :
        state === 'connecting' ? 'connecting...' :
        state === 'no-config' ? 'no connection configured (config.json: connections)' :
        'disconnected';
    }

    function setTarget(ctx) {
      targetEl.textContent =
        'buffer-name: ' + ctx['buffer-name'] + '\n' +
        'window:      ' + ctx.window + '\n' +
        'frame:       ' + ctx.frame;
    }


    function setMode(next) {
      mode = next;
      modeEls.forEach(function (b) {
        b.className = b.dataset.mode === next ? 'on' : '';
      });
      formEl.hidden = next !== 'form';
      captureEl.hidden = next !== 'live';
      textModeEl.hidden = next !== 'text';
      if (next === 'form') {
        kbdEl.focus();
      } else {
        kbdEl.blur();
        setCapturing(false);
        if (next === 'text') textAreaEl.focus();
      }
    }

    modeEls.forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.dataset.mode); });
    });


    function updatePreview() {
      const text = kbdEl.value.trim();
      if (!text) { previewEl.textContent = ''; previewEl.className = 'preview'; return; }
      const r = kbd.parse(text);
      if (r.error) {
        previewEl.textContent = 'parse error: ' + r.error;
        previewEl.className = 'preview error';
      } else {
        previewEl.textContent = kbd.describe(r.events) +
          '   (' + r.events.length + ' event' + (r.events.length === 1 ? '' : 's') + ')';
        previewEl.className = 'preview ok';
      }
    }

    function doSend() {
      const text = kbdEl.value.trim();

      const hit = resolver && resolver.lookup(text);
      if (hit) {
        if (!hit.intent) {
          append('out-drop', '(binding "' + text + '" -> intent "' + hit.binding.id +
            '" which is not defined)');
          return;
        }
        if (hit.intent.params && hit.intent.params.length) {
          openIntentForm(hit, text);
        } else {
          runIntent(hit, {}, text);
        }
        return;
      }

      const r = kbd.parse(text);
      if (r.error) { append('out-drop', '(not sent: ' + r.error + ')'); return; }
      const events = Tezcatl.middleware.run(r.events, getContext());
      const msg = Tezcatl.protocol.encodeInput(events);
      if (send(msg)) {
        append('out-sent', '→ ' + kbd.describe(events) + '   ' + JSON.stringify(msg));
        history.push(text);
        histIdx = history.length;
        kbdEl.value = '';
        lastCapEl.textContent = '';
        updatePreview();
      } else {
        append('out-fail', '✗ not connected: ' + text);
      }
    }


    // intent.run {req, id, args} (a decode_emacs panel's key or refresh: D-decode-emacs;
    // the frame's `intent` line, a run_table's `run from`: D-run-table)
    // -> intent.ran {req, ok, payload | error, book} to the asker: once Emacs answered
    // (an eval), at once (keys, a local backend); before it, intent.took {req, id}
    // when a later intent's process started (D-intent-later). An answer with a table also
    // goes out as intent.result (lib/vent/resolver.js).
    if (Tezcatl.bus && resolver) {
      Tezcatl.bus.on('intent.run', function (p, meta) {
        if (!p || typeof p.id !== 'string' || !meta || !meta.from) return;
        const hit = resolver.lookup(p.id);
        const to = { to: meta.from.id };
        // book: the intent's result.book, for a run_table's `run from` (D-run-table)
        const book = hit && hit.intent && hit.intent.result && hit.intent.result.book || null;
        const answer = function (ok, payload, error) { Tezcatl.bus.post('intent.ran', { req: p.req, ok: ok, payload: ok ? payload : null, error: error || null, book: book }, to); };
        if (!hit || !hit.intent) { answer(false, null, 'no intent "' + p.id + '"'); return; }
        // an eval, or a statement on database window 1: answered later
        const isEval = !!hit.intent.sql || ((hit.intent.emacs || {}).kind === 'eval' && !(hit.intent.browser || {}).backend);
        // confirmed: a table key pressed twice, or intent! (D-discard-confirm)
        const ctx = Object.assign({}, getContext(), { confirmed: p.confirmed === true });
        const sent = resolver.dispatch(hit.intent, p.args || {}, ctx, isEval ? function (status, payload) {
          // a later intent's process started (D-intent-later): the asker stops its time limit
          if (status === 'took') { Tezcatl.bus.post('intent.took', { req: p.req, id: p.id }, to); return; }
          if (status === 'ok') answer(true, payload); else answer(false, null, typeof payload === 'string' ? payload : JSON.stringify(payload));
        } : undefined);
        if (!sent) answer(false, null, 'not sent (is emacs-vent connected? the log of the input panel says why)');
        else if (!isEval) answer(true, null);
      });
    }

    function runIntent(hit, args, text) {
      const sent = resolver.dispatch(hit.intent, args, getContext());
      if (sent) {
        history.push(text);
        histIdx = history.length;
        kbdEl.value = '';
        lastCapEl.textContent = '';
        updatePreview();
      }
    }

    function closeIntentForm() {
      intentFormEl.hidden = true;
      intentFormEl.textContent = '';
    }

    function buildParamField(p) {
      const from = p.from || { kind: 'user-input' };

      if (from.kind === 'selection') {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.autocomplete = 'off';
        inp.dataset.name = p.name;
        try {
          const sel = String((root.getSelection && root.getSelection()) || '').trim();
          if (sel) inp.value = sel;
        } catch (_) { }
        return inp;
      }

      if (from.kind === 'list-item') {
        const wrap = document.createElement('span');
        const sel = document.createElement('select');
        sel.dataset.name = p.name;
        const fetchBtn = document.createElement('button');
        fetchBtn.type = 'button';
        fetchBtn.textContent = 'Fetch ' + from.of;
        fetchBtn.style.marginLeft = '.4em';

        function fillFrom(items) {
          sel.textContent = '';
          if (!Array.isArray(items) || !items.length) {
            const opt = document.createElement('option');
            opt.textContent = '(' + from.of + ': empty)';
            sel.appendChild(opt);
            sel.disabled = true;
            return;
          }
          items.forEach(function (item) {
            const opt = document.createElement('option');
            opt.value = opt.textContent = (typeof item === 'string') ? item : JSON.stringify(item);
            sel.appendChild(opt);
          });
          sel.disabled = false;
        }

        const cached = resolver && resolver.getLastResult(from.of);
        if (Array.isArray(cached)) {
          fillFrom(cached);
        } else {
          const opt = document.createElement('option');
          opt.textContent = '(not fetched yet -- click Fetch)';
          sel.appendChild(opt);
          sel.disabled = true;
        }

        fetchBtn.addEventListener('click', function () {
          const src = resolver && resolver.lookup(from.of);
          if (!src || !src.intent) {
            append('out-drop', 'list-item source "' + from.of + '" is not a known intent');
            return;
          }
          fetchBtn.disabled = true;
          fetchBtn.textContent = 'fetching…';
          resolver.dispatch(src.intent, {}, getContext(), function (status, payload) {
            fetchBtn.disabled = false;
            fetchBtn.textContent = 'Fetch ' + from.of;
            if (status === 'ok') fillFrom(payload);
          });
        });

        wrap.appendChild(sel);
        wrap.appendChild(fetchBtn);
        Object.defineProperty(wrap, 'value', { get: function () { return sel.value; } });
        wrap.focus = function () { sel.focus(); };
        return wrap;
      }

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.autocomplete = 'off';
      inp.dataset.name = p.name;
      return inp;
    }

    function openIntentForm(hit, text) {
      intentFormEl.textContent = '';
      const title = document.createElement('div');
      title.className = 'lbl';
      title.textContent = hit.intent.id + ' — ' + (hit.intent.title || '');
      intentFormEl.appendChild(title);

      const fields = [];
      hit.intent.params.forEach(function (p) {
        const row = document.createElement('label');
        row.style.display = 'block';
        row.style.margin = '.25em 0';
        row.textContent = p.name + (p.required ? ' * ' : ' ') +
          (p.doc ? '(' + p.doc + ') ' : '');
        const el = buildParamField(p);
        row.appendChild(el);
        intentFormEl.appendChild(row);
        fields.push({ spec: p, el: el });
      });

      const run = document.createElement('button');
      run.type = 'button';
      run.textContent = 'Run ' + hit.intent.id;
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.style.marginLeft = '.5em';
      intentFormEl.appendChild(run);
      intentFormEl.appendChild(cancel);

      function submit() {
        const args = {};
        for (let i = 0; i < fields.length; i++) {
          const v = fields[i].el.value.trim();
          if (fields[i].spec.required && !v) {
            append('out-drop', '(intent "' + hit.intent.id + '": "' +
              fields[i].spec.name + '" is required)');
            fields[i].el.focus();
            return;
          }
          if (v) args[fields[i].spec.name] = v;
        }
        closeIntentForm();
        runIntent(hit, args, text);
      }

      run.addEventListener('click', submit);
      cancel.addEventListener('click', closeIntentForm);
      fields.forEach(function (f) {
        f.el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.preventDefault(); closeIntentForm(); }
        });
      });

      intentFormEl.hidden = false;
      if (fields.length) fields[0].el.focus();
    }

    function appendToken(tok) {
      const v = kbdEl.value.replace(/\s+$/, '');
      kbdEl.value = (v ? v + ' ' : '') + tok + ' ';
      histIdx = history.length;
      updatePreview();
    }

    kbdEl.addEventListener('input', updatePreview);
    sendEl.addEventListener('click', doSend);
    sendEl.addEventListener('mousedown', function (e) { e.preventDefault(); });

    kbdEl.addEventListener('focus', function () {
      if (mode === 'form') setCapturing(true);
    });
    kbdEl.addEventListener('blur', function () { setCapturing(false); });

    kbdEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCapturing(false);
        kbdEl.blur();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setCapturing(!capturing);
        return;
      }

      const act = submitAction(e);
      if (act === 'send') { e.preventDefault(); doSend(); return; }
      if (act === 'ret') { e.preventDefault(); appendToken('RET'); return; }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (histIdx > 0) { histIdx--; kbdEl.value = history[histIdx]; updatePreview(); }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (histIdx < history.length - 1) {
          histIdx++; kbdEl.value = history[histIdx];
        } else {
          histIdx = history.length; kbdEl.value = '';
        }
        updatePreview();
        return;
      }

      if (!capturing) return;

      if (e.isComposing || e.key === 'Process' || e.key === 'Unidentified') return;
      if (Tezcatl.keymap.LONE_MODIFIER.has(e.key)) { e.preventDefault(); return; }

      const bare = !e.ctrlKey && !e.altKey && !e.metaKey;
      if (bare && e.key.length === 1 && e.key.charCodeAt(0) >= 0x20) return;
      if (bare && (e.key === 'Backspace' || e.key === 'Delete')) return;

      e.preventDefault();
      const norm = Tezcatl.keymap.normalize(e);
      if (!norm) { append('out-drop', '(ignored: ' + (e.key || '?') + ')'); return; }
      const tok = kbd.describe([norm]);
      appendToken(tok);
      lastCapEl.textContent = '↳ captured  ' + tok;
    });


    function setCapturing(on) {
      if (capturing === on) return;
      capturing = on;
      captureEl.className = 'capture ' + (on ? 'on' : 'off');
      buttonEl.textContent = 'capture: ' + (on ? 'ON' : 'OFF');
      formEl.classList.toggle('capturing', on);
      capHintEl.textContent = on
        ? '⌨ capturing keys · Esc exits · Tab toggles · type text for names/paths · S-Enter sends'
        : 'text mode · focus the field or press Tab to capture Emacs keys';
      append('in-meta', 'capture ' + (on ? 'ON' : 'OFF'));
    }

    buttonEl.addEventListener('click', function () { setCapturing(!capturing); });

    function onLiveKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCapturing(!capturing);
        return;
      }
      if (!capturing) return;
      e.preventDefault();
      const norm = Tezcatl.keymap.normalize(e);
      if (!norm) {
        append('out-drop', '(dropped: ' + (e.key || '?') + ')');
        return;
      }
      const events = Tezcatl.middleware.run([norm], getContext());
      const msg = Tezcatl.protocol.encodeInput(events);
      if (send(msg)) {
        append('out-sent', '→ ' + kbd.describe(events) + '   ' + JSON.stringify(msg));
      } else {
        append('out-fail', '✗ not connected: ' + kbd.describe(events));
      }
    }

    function onDocKeydown(e) {
      if (mode === 'live') { onLiveKeydown(e); return; }
      if (mode === 'form' && e.key === 'Tab' && document.activeElement !== kbdEl) {
        e.preventDefault();
        kbdEl.focus();
      }
    }
    document.addEventListener('keydown', onDocKeydown);


    function updateTextPreview() {
      const raw = textAreaEl.value;
      if (!raw) { textPreviewEl.textContent = ''; textPreviewEl.className = 'textpreview'; return; }
      const r = Tezcatl.text.encode(raw);
      if (r.error) {
        textPreviewEl.textContent = 'nothing to send: ' + r.error;
        textPreviewEl.className = 'textpreview error';
        return;
      }
      const chars = Array.from(raw).length;
      textPreviewEl.textContent =
        chars + ' char' + (chars === 1 ? '' : 's') + ' → ' +
        r.events.length + ' event' + (r.events.length === 1 ? '' : 's') +
        (r.dropped ? '  (' + r.dropped + ' dropped)' : '');
      textPreviewEl.className = 'textpreview ok';
    }

    function doSendText() {
      const raw = textAreaEl.value;
      const r = Tezcatl.text.encode(raw);
      if (r.error) { append('out-drop', '(not sent: ' + r.error + ')'); return; }
      if (!r.events.length) { append('out-drop', '(not sent: no sendable characters)'); return; }
      const events = Tezcatl.middleware.run(r.events, getContext());
      const msg = Tezcatl.protocol.encodeInput(events);
      if (send(msg)) {
        const shown = raw.length > 60 ? raw.slice(0, 60) + '…' : raw;
        append('out-sent', '→ text (' + events.length + ' events)  ' + JSON.stringify(shown));
        textAreaEl.value = '';
        updateTextPreview();
      } else {
        append('out-fail', '✗ not connected: text (' + r.events.length + ' events)');
      }
    }

    textAreaEl.addEventListener('input', updateTextPreview);
    textSendEl.addEventListener('click', doSendText);
    textSendEl.addEventListener('mousedown', function (e) { e.preventDefault(); });
    textAreaEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); doSendText(); }
    });

    setMode('form');

    if (resolver) resolver.attach({ send: send, log: append });

    cgEl.addEventListener('mousedown', function (e) { e.preventDefault(); });
    cgEl.addEventListener('click', function () {
      if (resolver && resolver.abort) { resolver.abort(); return; }
      const ok = send(Tezcatl.protocol.encodeInput([{ key: 'g', modifiers: ['control'] }]));
      append(ok ? 'in-meta' : 'out-fail', ok ? '⎋ C-g sent' : '✗ not connected: C-g');
    });

    return {
      setState: setState,
      setTarget: setTarget,
      onInbound: function (m) { if (resolver) resolver.onInbound(m); },
      log: append,
    };
  }

  Tezcatl.inputPanel = { mount: mount };
})(typeof self !== 'undefined' ? self : this);
