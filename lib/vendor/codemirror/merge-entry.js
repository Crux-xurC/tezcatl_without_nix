// Tezcatl -- the entry of merge.bundle.js: @codemirror/merge, what the
// code_diff panel (lib/code/code-diff-page.js) shows two files with.
// Built apart from cm.bundle.js, by languages/build.mjs: the shared
// CodeMirror / Lezer packages are read from cm.bundle.js (`languageKit`), so
// this and the editor use the same @codemirror/state and view. See README.md.
export { MergeView, goToNextChunk, goToPreviousChunk } from "@codemirror/merge";
