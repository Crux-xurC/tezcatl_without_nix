# `panels/resident/code.html`

The page of code (file / text viewer).

## Selection and revision notes

(Moved from the comments of `panels/resident/code.html`, 2026-09-10.)

code.html — the file / text VIEWER panel. This comment is the design's source of truth; it stays when the implementation grows.

Its place:
  - a panel that **only shows** text (a file's text, a diff, an LLM's output …): one CodeMirror 6 editor, read-only, on a doc string. "Which
    file / where to save" is all the orchestrator's (a skin, a file panel, ③)
  - **it does not edit.** The editing keymap, history, dirty state and saving are code_editor.html's (the editing panel); the shared core is
    lib/code/code-editor.js
  - editing and showing go through ③, the file endpoint, never vent (D-files-in-elixir); this page never touches vent

Never:
  - allow editing (`EditorView.editable = false`, read-only for good); `code.set`'s `readOnly:false` is ignored — to edit, use code_editor.html
  - load lib/core/ws.js or touch vent
  - fetch text, save it, take `?src=`, hold a path or a file identity, import ③ — all the orchestrator's
  - build an LCARS look (oneDark for now)

What it has (details in the header of lib/code/code-editor.js): a read-only EditorView; panel-frame wiring (focus target = the editor,
the leave key left to panel-frame, `reportCursor` to cursor.html); on the bus it takes `code.set`, `code.get`, `code.configure`, `code.mark`,
`code.clearMarks`, `code.goto` (read-only fields ignored; marks and goto are display only, so the viewer takes them too), and posts
`cursor` (no `code.dirty` — nothing gets dirty).

Decided:
  1. the viewer = code_editor.html without editing; the shared part is `createCodeEditor` in lib/code/code-editor.js, called with
     `editable:false`
  2. CodeMirror 6 ships no UMD global (about 20 ESM packages), so it is bundled once with esbuild into lib/vendor/codemirror/cm.bundle.js;
     zero-build at run time (one `<script type="module">`)
  3. opened alone = an empty scratch view; `?name=` is the bus identity, `?lang=` a language hint for standalone tests

Record: large output `content` was to be replaced, over an inline budget, by a reference envelope `{ref:"file", path, bytes, preview}`, the
browser fetching the whole text through ③ into this viewer (`protocol.inlineMaxBytes` in `config.json`; intent results excluded) — not
implemented ([protocol.md](../protocol.md) §4.1).
