# `panels/resident/code_el_intent.html`

The page of code_el_intent (extension transcript).

**Takes part in**: [D-intent-resolution](lib-vent-resolver.js.md#d-intent-resolution)

## Selection and revision notes

(Moved from the comments of `panels/resident/code_el_intent.html`, 2026-09-10.)

code_el_intent.html — a viewer of the transcript of intents (extensions) run. This comment is the design's source of truth.

  - It calls the viewer's core (lib/code/code-editor.js) with `editable:false`; the difference is its role/surface `"el-intent"` and that it
    shows only "what extensions were sent"
  - Its contents are the whole of `renderTrace()` posted by lib/vent/resolver.js on `resolver.trace`, poured in by the skin with
    `code.set`. One entry = one intent sent; its status (sending / waiting / ok / err / timeout / aborted / sent) is rewritten in place
  - The form shown is "the Elisp the extension runs" (unsent form); it does not travel to emacs-vent in this form (what is sent is the
    keystrokes of the fixed `M-:` wrapper). The header and each entry's `;;` line say so
  - Never (as code.html): load lib/core/ws.js or touch vent; fetch, save or take `?src=`; allow editing
  - Its role is `"el-intent"`, not `"code"`, so a skin holding both a file viewer and this transcript never mistakes where `code.ready` /
    `code.set` go
  - Not done: Elisp highlighting (no lisp mode in the bundle; plain text); updating by difference (`code.append` …) instead of replacing
    the whole doc each time; it auto-scrolls to the end after each update (the transcript grows at the bottom)

Record: made with `panels/skins/intent.html` (input + this panel); entries `code_el_intent` and `intent-skin` in the launcher.
