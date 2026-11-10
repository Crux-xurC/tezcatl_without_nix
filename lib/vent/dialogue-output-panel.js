(function (root) {
  'use strict';
  const Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  function ts() {
    return new Date().toTimeString().slice(0, 8);
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function mount(rootEl) {
    rootEl.innerHTML =
      '<div class="status closed">disconnected</div>' +
      '<div class="target">(no context yet)</div>' +
      '<h2>goals</h2>' +
      '<div class="target pg-goals">(none yet)</div>' +
      '<h2>response</h2>' +
      '<div class="target pg-response">(none yet)</div>' +
      '<h2>log</h2>' +
      '<div class="log"></div>';
    const statusEl = rootEl.querySelector('.status');
    const targetEl = rootEl.querySelector('.target');
    const goalsEl = rootEl.querySelector('.pg-goals');
    const responseEl = rootEl.querySelector('.pg-response');
    const logEl = rootEl.querySelector('.log');

    let lastKey = null;
    let lastRow = null;
    let lastCount = 0;

    function append(cls, html) {
      const key = cls + ' ' + html;
      if (key === lastKey && lastRow) {
        lastCount += 1;
        lastRow.querySelector('.ts').textContent = ts();
        lastRow.querySelector('.rep').textContent = ' ×' + lastCount;
        return;
      }
      lastKey = key;
      lastCount = 1;
      const row = document.createElement('div');
      row.className = cls;
      row.innerHTML = '<span class="ts">' + ts() + '</span> ' + html + '<span class="rep"></span>';
      logEl.appendChild(row);
      logEl.scrollTop = logEl.scrollHeight;
      lastRow = row;
    }

    function setState(state) {
      statusEl.className = 'status ' + state;
      statusEl.textContent =
        state === 'open' ? 'connected' :
        state === 'connecting' ? 'connecting...' :
        state === 'no-config' ? 'no connection configured (config.json: connections)' :
        'disconnected';
    }

    function renderTarget(ctx) {
      targetEl.textContent =
        'buffer-name: ' + ctx['buffer-name'] + '\n' +
        'window:      ' + ctx.window + '\n' +
        'frame:       ' + ctx.frame;
    }

    function renderProofGeneralOutput(content) {
      goalsEl.textContent = (content && content.goals) || '(none)';
      responseEl.textContent = (content && content.response) || '(none)';
    }

    function handleMessage(msg) {
      switch (msg.kind) {
        case 'context':
          renderTarget(msg);
          append('in-ctx', 'context  ' + esc(msg['buffer-name']) +
            '  ' + esc(msg.window) + '  ' + esc(msg.frame));
          break;
        case 'event':
          if (msg.type === 'buffer.changed') break;
          if (msg.type === 'proof-general.output') {
            renderProofGeneralOutput(msg.content);
            append('in-ev', '<span class="type">proof-general.output</span>');
            break;
          }
          append('in-ev',
            '<span class="source">[' + esc(msg.source === null ? 'null' : msg.source) + ']</span> ' +
            '<span class="type">' + esc(msg.type) + '</span>' +
            (msg.content !== undefined ? ' ' + esc(JSON.stringify(msg.content)) : ''));
          break;
        case 'hello':
          append('in-meta', 'hello');
          break;
        case 'flush':
          append('in-meta', 'flush');
          break;
        default:
          append('in-meta', esc(msg.kind));
      }
    }

    return { handleMessage: handleMessage, setState: setState };
  }

  Tezcatl.dialogueOutputPanel = { mount: mount };
})(typeof self !== 'undefined' ? self : this);
