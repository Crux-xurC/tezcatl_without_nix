// Tezcatl -- the entry of markdown.bundle.js: @lezer/markdown with the GFM
// extensions (tables, strikethrough, task lists), what the markdown panel
// (lib/code/markdown-page.js) reads a note with. cm.bundle.js has the
// CommonMark parser inside @codemirror/lang-markdown but not GFM's tables.
// Built apart from cm.bundle.js, by languages/build.mjs: @lezer/common and
// @lezer/highlight are read from cm.bundle.js (`languageKit`). See README.md.
import { parser as commonmark, GFM } from "@lezer/markdown";

export const parser = commonmark.configure(GFM);
