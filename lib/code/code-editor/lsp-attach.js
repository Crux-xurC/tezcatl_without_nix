import { LSPClient, languageServerSupport, serverDiagnostics, lintGutter } from "../../vendor/codemirror/cm.bundle.js";

// -- webLSP consumer
// The editor holds the /lsp WebSocket for its doc. It
// resolves file -> (path, langId) once, attaches, and lets
// @codemirror/lsp-client drive didOpen/didChange + diagnostics/completion/
// hover. The relay multiplexes the shared server; this side is one client.
//
// The client is the editor's (ed.st.lspClient / lspUri / lspAttachedPath / lspServer):
// the LSP actions, the outline and the save (didSave) use it as it is.
export function createLspAttach(ed) {
  const { st, view } = ed;
  let ws0 = null;   // the socket of the client attached now

  function detach() {
    if (st.lspClient) {
      try { st.lspClient.disconnect(); } catch (_) {}
      st.lspClient = null;
    }
    if (ws0) {
      const w = ws0;
      ws0 = null;
      try { w.close(); } catch (_) {}
    }
    st.lspAttachedPath = null;
    st.lspUri = null;
    st.lspServer = null;
    st.lspHeld = false;
    try { view.dispatch({ effects: ed.comp.lsp.reconfigure([]) }); } catch (_) {}
  }

  // Before another file's text goes in: a client still attached to the old
  // file would send it as a didChange of the old URI (the server's copy of
  // that file would become this one). Reloading the same path keeps it.
  function leaveFor(path) {
    if (st.lspClient && st.lspAttachedPath !== path) detach();
  }

  function attach(path, lang) {
    // a file of the work place (a clone, the scratch) has no project around
    // it: no language server is attached
    const work = ed.codeFiles() && ed.codeFiles().isWork(path);
    if (!ed.editable || !ed.bus || typeof path !== "string" || !path || !lang || work) {
      detach();
      return;
    }
    if (path === st.lspAttachedPath && ws0) return;
    detach();

    ed.relay.lspUrl().then((url) => (url ? ed.relay.ticketed(url) : url)).then((url) => {
      if (!url || path !== st.baselinePath) return;

      const subs = new Set();
      const ws = new WebSocket(url);
      ws0 = ws;

      const transport = {
        send(msg) { if (ws.readyState === WebSocket.OPEN) ws.send(msg); },
        subscribe(h) { subs.add(h); },
        unsubscribe(h) { subs.delete(h); },
      };

      ws.onopen = function () {
        // "client":"editor": lsp.json may name a different server for the
        // editor than for other /lsp clients (elixir: a syntax check outside
        // a mix project; xipe_totec's scanner keeps elixir-ls)
        ws.send(JSON.stringify({ kind: "attach", path: path, lang: lang, client: "editor" }));
      };

      ws.onmessage = function (evt) {
        let ctrl = null;
        let data = evt.data;
        try {
          const o = JSON.parse(evt.data);
          if (o && typeof o.kind === "string") ctrl = o;
          // a server that writes the URI its own way (nil leaves "(" as it
          // is, the relay encodes it): diagnostics under the editor's URI,
          // or the client drops them (lib/code/code-files.js sameFileUri, A8)
          else if (o && o.method === "textDocument/publishDiagnostics" && o.params &&
                   ws === ws0 && st.lspUri && o.params.uri !== st.lspUri &&
                   ed.codeFiles() && ed.codeFiles().sameFileUri(o.params.uri, st.lspUri)) {
            o.params.uri = st.lspUri;
            data = JSON.stringify(o);
          }
        } catch (_) {}

        if (ctrl) {
          if (ws !== ws0) return;
          if (ctrl.kind === "attached") {
            try {
              // serverDiagnostics() is a client extension: it registers the
              // textDocument/publishDiagnostics handler that feeds @codemirror/
              // lint (drawn by lintGutter below). languageServerSupport only
              // adds the editor-side pieces (completion / hover / signature).
              st.lspClient = new LSPClient({
                rootUri: ctrl.rootUri,
                // the library's own default is 3s (code.json "lsp")
                timeout: ed.cfg.lsp.timeoutMs,
                extensions: [serverDiagnostics()],
              }).connect(transport);
              view.dispatch({
                effects: ed.comp.lsp.reconfigure([
                  lintGutter(),
                  languageServerSupport(st.lspClient, ctrl.uri, lang),
                ]),
              });
              st.lspAttachedPath = path;
              st.lspUri = ctrl.uri;
              // which server of the relay's GET /lsp/servers (code.here says it: `lsp restart`)
              st.lspServer = { key: ctrl.key || null, serverId: ctrl.serverId || null };
              ed.note("lsp " + ctrl.serverId);
            } catch (e) {
              try { console.error("code-editor: lsp attach failed", e); } catch (_) {}
              detach();
            }
          } else if (ctrl.kind === "held") {
            // another consumer owns this file on the shared server (D-lsp-owner):
            // nothing about it comes here, so its diagnostics never land on this text
            ed.flash("lsp: this file is open in another code_editor ── no diagnostics nor completion here till that one closes it", true);
            st.lspHeld = true;
          } else if (ctrl.kind === "released") {
            // its owner closed it: attached again, this text is opened (and owned)
            const p = st.lspAttachedPath, l = st.langId;
            const was = st.lspHeld;
            detach();
            attach(p, l);
            if (was) ed.flash("lsp: the other code_editor closed this file ── the language server is here now");
          } else if (ctrl.kind === "env") {
            // the project's environment the server starts with (D-project-env): asked for the first time, or failed
            if (ctrl.state === "fetching") ed.flash("lsp: asking for the project environment (" + ctrl.marker + " in " + ctrl.root + ") …", true);
            else if (ctrl.state === "failed") ed.flash("lsp: the project environment of " + ctrl.root + " could not be read (" + ctrl.reason + ") ── the relay's own is used (env show, env reload)", true);
          } else if (ctrl.kind === "error") {
            ed.flash("lsp: " + ctrl.reason);
            detach();
          } else if (ctrl.kind === "exit") {
            // stays until the next message: no diagnostics nor completion from here on
            ed.flash("lsp: disconnected ── :Reconnect connects again (the text is kept through the copy)", true);
            detach();
          }
          return;
        }

        subs.forEach((h) => {
          try { h(data); } catch (_) {}
        });
      };

      ws.onclose = function () {
        // closed under us (the relay restarted, the link dropped) -- not by detach
        if (ws !== ws0) return;
        if (st.lspAttachedPath) ed.flash("lsp: disconnected ── :Reconnect connects again (the text is kept through the copy)", true);
        detach();
      };
      ws.onerror = function () {};
    });
  }

  return { attach, detach, leaveFor };
}
