// lib/code/markdown.js -- the markdown panel, the pure parts: the
// `markdown ...` lines of a skin's input form, and a note's parse tree
// (@lezer/markdown + GFM, lib/vendor/codemirror/markdown.bundle.js) turned
// into plain blocks the page draws with DOM calls -- never as HTML: raw HTML
// in a note is kept as text (the panel is on the pages' origin, with the bus).
//   markdown <path>      a markdown panel for that file (its saved text)
//   markdown follow      the panel follows the code_editor of the skin that has the file
//   markdown unfollow    back to the saved text
// Each block knows the lines it came from (1-based, line .. endLine), so the
// panel marks the block under a code_editor's cursor and Enter goes to its line.
// A table's caption is the pandoc line `Table: <caption>` just before or
// after it; an image is not shown (its path is said instead).
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Tezcatl = root.Tezcatl || {}).markdown = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const USAGE = 'markdown <path> / markdown follow / markdown unfollow';
  const IMAGE_SAID = 'this panel cannot show an image ── its file is ';

  // a line -> null (not a markdown line) | {cmd: 'open', path} | {cmd: 'follow' | 'unfollow'} | {error}
  // resolve(arg) -> {path} | {error} (lib/code/code-files.js resolve, from the current file)
  function parse(line, resolve) {
    const m = /^\s*markdown(?:\s+([\s\S]*))?$/.exec(String(line == null ? '' : line));
    if (!m) return null;
    const rest = (m[1] || '').trim();
    if (!rest) return { error: USAGE };
    if (rest === 'follow' || rest === 'unfollow') return { cmd: rest };
    const r = resolve ? resolve(rest) : { path: rest.replace(/^\/+/, '') };
    if (r.error) return { error: r.error };
    return { cmd: 'open', path: r.path };
  }

  // a link's target -> 'web' (http/https: a new window) | 'file' (a path, from
  // the note's directory) | 'none' (an anchor, mailto:, javascript: ... -- plain text)
  function linkKind(href) {
    const h = String(href || '').trim();
    if (!h || h.charAt(0) === '#') return 'none';
    if (/^https?:\/\//i.test(h)) return 'web';
    if (/^[a-z][a-z0-9+.-]*:/i.test(h) || h.indexOf('//') === 0) return 'none';
    return 'file';
  }

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–' };
  function entity(s) {
    const m = /^&(?:#(\d+)|#x([0-9a-f]+)|(\w+));$/i.exec(s);
    if (!m) return s;
    try {
      if (m[1]) return String.fromCodePoint(Number(m[1]));
      if (m[2]) return String.fromCodePoint(parseInt(m[2], 16));
    } catch (_) { return s; }
    return Object.prototype.hasOwnProperty.call(ENTITIES, m[3]) ? ENTITIES[m[3]] : s;
  }

  // the tree as plain nodes {name, from, to, kids}
  function plain(tree) {
    const c = tree.cursor();
    function node() {
      const n = { name: c.name, from: c.from, to: c.to, kids: [] };
      if (c.firstChild()) {
        do { n.kids.push(node()); } while (c.nextSibling());
        c.parent();
      }
      return n;
    }
    return node();
  }

  const MARKS = { EmphasisMark: 1, CodeMark: 1, LinkMark: 1, HeaderMark: 1, QuoteMark: 1, ListMark: 1, TaskMarker: 1, StrikethroughMark: 1, TableDelimiter: 1, CodeInfo: 1, LinkTitle: 1, LinkLabel: 1, URL: 1 };

  // the layout of a note -> {blocks}; each block {t, line, endLine, ...}
  function layout(tree, text) {
    const src = String(text == null ? '' : text);
    const root = plain(tree);
    // line numbers: the start of each line
    const starts = [0];
    for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
    function lineOf(pos) {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
      return lo + 1;
    }
    const slice = (n) => src.slice(n.from, n.to);
    const kid = (n, name) => n.kids.filter((k) => k.name === name)[0] || null;

    // link reference definitions: [label]: url
    const refs = {};
    (function collect(n) {
      if (n.name === 'LinkReference') {
        const label = kid(n, 'LinkLabel');
        const url = kid(n, 'URL');
        if (label && url) refs[slice(label).slice(1, -1).trim().toLowerCase()] = slice(url);
        return;
      }
      n.kids.forEach(collect);
    })(root);

    // inline content of `n` from `from` to `to`: text in the gaps between its children
    function inline(n, from, to) {
      const out = [];
      let pos = from;
      function text(a, b) {
        if (b <= a) return;
        // a line break inside a paragraph: a space; the indentation after it goes
        let s = src.slice(a, b).replace(/[ \t]*\n[ \t]*/g, ' ');
        // a mark taken out between two breaks (a quote's `>`): one space, not two
        const prev = out[out.length - 1];
        if (prev && prev.t === 'text' && / $/.test(prev.s)) s = s.replace(/^ +/, '');
        if (s) out.push({ t: 'text', s: s });
      }
      n.kids.forEach((k) => {
        if (k.to <= from || k.from >= to) return;
        text(pos, k.from);
        pos = k.to;
        const piece = inlineNode(k);
        if (piece) out.push(piece);
      });
      text(pos, to);
      return out;
    }
    function inner(n) {
      // between the opening and the closing marks
      const marks = n.kids.filter((k) => MARKS[k.name]);
      const from = marks.length ? marks[0].to : n.from;
      const to = marks.length > 1 ? marks[marks.length - 1].from : n.to;
      return inline({ kids: n.kids.filter((k) => !MARKS[k.name]) }, from, to);
    }
    function hrefOf(n) {
      const url = kid(n, 'URL');
      if (url) return slice(url).replace(/^<|>$/g, '');
      const label = kid(n, 'LinkLabel');
      const key = (label ? slice(label).slice(1, -1) : '').trim().toLowerCase();
      if (key && refs[key] != null) return refs[key];
      // [text] alone, or [text][]: the text is the label
      const lm = n.kids.filter((k) => k.name === 'LinkMark');
      const textKey = lm.length >= 2 ? src.slice(lm[0].to, lm[1].from).trim().toLowerCase() : '';
      return refs[textKey] != null ? refs[textKey] : null;
    }
    function linkText(n) {
      const lm = n.kids.filter((k) => k.name === 'LinkMark');
      if (lm.length < 2) return [{ t: 'text', s: slice(n) }];
      return inline({ kids: n.kids.filter((k) => !MARKS[k.name]) }, lm[0].to, lm[1].from);
    }
    function inlineNode(k) {
      switch (k.name) {
        case 'Emphasis': return { t: 'em', kids: inner(k) };
        case 'StrongEmphasis': return { t: 'strong', kids: inner(k) };
        case 'Strikethrough': return { t: 'del', kids: inner(k) };
        case 'InlineCode': {
          const m = k.kids.filter((x) => x.name === 'CodeMark');
          return { t: 'code', s: src.slice(m.length ? m[0].to : k.from, m.length > 1 ? m[m.length - 1].from : k.to).replace(/\n/g, ' ') };
        }
        case 'Link': {
          const href = hrefOf(k);
          return href == null ? { t: 'text', s: slice(k) } : { t: 'link', href: href, kind: linkKind(href), kids: linkText(k) };
        }
        case 'Autolink': {
          const href = slice(k).replace(/^<|>$/g, '');
          return { t: 'link', href: href, kind: linkKind(href), kids: [{ t: 'text', s: href }] };
        }
        case 'URL': return { t: 'link', href: slice(k), kind: linkKind(slice(k)), kids: [{ t: 'text', s: slice(k) }] };
        case 'Image': {
          const lm = k.kids.filter((x) => x.name === 'LinkMark');
          const alt = lm.length >= 2 ? src.slice(lm[0].to, lm[1].from) : '';
          return { t: 'img', alt: alt, src: hrefOf(k) || '' };
        }
        case 'Escape': return { t: 'text', s: slice(k).slice(1) };
        case 'Entity': return { t: 'text', s: entity(slice(k)) };
        case 'HardBreak': return { t: 'br' };
        case 'HTMLTag': case 'Comment': case 'ProcessingInstruction': return { t: 'raw', s: slice(k) };
        default:
          return MARKS[k.name] ? null : { t: 'text', s: slice(k) };
      }
    }

    function at(n, b) { b.line = lineOf(n.from); b.endLine = lineOf(Math.max(n.from, n.to - 1)); return b; }

    function tableOf(n) {
      // by the `|` delimiters (an empty cell has no TableCell node)
      const rowOf = (r) => {
        const ds = r.kids.filter((k) => k.name === 'TableDelimiter');
        const segs = [];
        let start = r.from;
        ds.forEach((d) => { segs.push([start, d.from]); start = d.to; });
        segs.push([start, r.to]);
        if (ds.length && ds[0].from === r.from) segs.shift();
        if (ds.length && ds[ds.length - 1].to === r.to) segs.pop();
        return segs.map(([a, b]) => {
          const c = r.kids.filter((k) => k.name === 'TableCell' && k.from >= a && k.to <= b)[0];
          return c ? inline(c, c.from, c.to) : [];
        });
      };
      const head = kid(n, 'TableHeader');
      const delim = n.kids.filter((k) => k.name === 'TableDelimiter')[0];
      const align = delim ? slice(delim).replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((d) => {
        const s = d.trim();
        return /^:-*:$/.test(s) ? 'center' : /-:$/.test(s) ? 'right' : /^:-/.test(s) ? 'left' : null;
      }) : [];
      return {
        t: 'table', caption: null, align: align,
        head: head ? rowOf(head) : [],
        rows: n.kids.filter((k) => k.name === 'TableRow').map(rowOf),
      };
    }

    function block(n) {
      const h = /^(?:ATX|Setext)Heading(\d)$/.exec(n.name);
      if (h) {
        const marks = n.kids.filter((k) => k.name === 'HeaderMark');
        let from = n.from, to = n.to;
        if (n.name.charAt(0) === 'A') {
          if (marks[0] && marks[0].from === n.from) from = marks[0].to;
          const tail = marks.length > 1 ? marks[marks.length - 1] : null;
          if (tail) to = tail.from;
        } else if (marks.length) to = marks[marks.length - 1].from;
        return at(n, { t: 'h', level: Number(h[1]), kids: trim(inline(n, from, to)) });
      }
      switch (n.name) {
        case 'Paragraph': return at(n, { t: 'p', kids: trim(inline(n, n.from, n.to)) });
        case 'FencedCode': {
          const info = kid(n, 'CodeInfo');
          const code = n.kids.filter((k) => k.name === 'CodeText').map(slice).join('');
          return at(n, { t: 'pre', lang: info ? slice(info) : '', s: code });
        }
        case 'CodeBlock': {
          const s = slice(n).split('\n').map((l) => l.replace(/^(?: {1,4}|\t)/, '')).join('\n');
          return at(n, { t: 'pre', lang: '', s: s });
        }
        case 'Blockquote': return at(n, { t: 'quote', kids: blocks(n) });
        case 'HorizontalRule': return at(n, { t: 'hr' });
        case 'BulletList': case 'OrderedList': {
          const items = n.kids.filter((k) => k.name === 'ListItem').map((it) => {
            const task = kid(it, 'Task');
            if (task) {
              const mark = kid(task, 'TaskMarker');
              const done = mark ? /\[[xX]\]/.test(slice(mark)) : false;
              return at(it, { t: 'li', task: done, kids: [at(task, { t: 'p', kids: trim(inline(task, mark ? mark.to : task.from, task.to)) })] });
            }
            return at(it, { t: 'li', task: null, kids: blocks(it) });
          });
          const first = n.name === 'OrderedList' && n.kids[0] ? parseInt(slice(kid(n.kids[0], 'ListMark') || n.kids[0]), 10) : null;
          return at(n, { t: n.name === 'OrderedList' ? 'ol' : 'ul', start: Number.isFinite(first) ? first : null, items: items });
        }
        case 'Table': return at(n, tableOf(n));
        case 'HTMLBlock': case 'CommentBlock': case 'ProcessingInstructionBlock':
          return at(n, { t: 'raw', s: slice(n).replace(/\n$/, '') });
        case 'LinkReference': return null;
        default: return null;
      }
    }
    function trim(kids) {
      if (kids.length && kids[0].t === 'text') kids[0].s = kids[0].s.replace(/^\s+/, '');
      const last = kids[kids.length - 1];
      if (last && last.t === 'text') last.s = last.s.replace(/\s+$/, '');
      return kids.filter((k) => !(k.t === 'text' && !k.s));
    }
    // the blocks of a container; a `Table: ...` paragraph next to a table is its caption
    function blocks(n) {
      const out = n.kids.map(block).filter(Boolean);
      for (let i = 0; i < out.length; i++) {
        if (!out[i] || out[i].t !== 'table') continue;
        [i - 1, i + 1].some((j) => {
          const c = out[j] && caption(out[j]);
          if (c == null || out[i].caption != null) return false;
          out[i].caption = c;
          if (j < i) { out[i].line = out[j].line; } else { out[i].endLine = out[j].endLine; }
          out[j] = null;
          return true;
        });
      }
      return out.filter(Boolean);
    }
    function caption(b) {
      if (b.t !== 'p' || b.kids.length !== 1 || b.kids[0].t !== 'text') return null;
      const m = /^Table:\s*(.+)$/.exec(b.kids[0].s);
      return m ? m[1].trim() : null;
    }

    return { blocks: blocks(root), lines: starts.length };
  }

  // The GFM tables of a note, for taking one into a matrix and putting it
  // back (lib/code/markdown.js is pure: the tree comes from the parser) ->
  // [{name, line, endLine, captionLine, head, rows, from, to, tableFrom, tableTo}]
  //   name      the pandoc caption just before or after (`Table: <name>`, blanks
  //             inside kept), else null
  //   head/rows each cell as its markdown source, trimmed (`**a**` stays so):
  //   align     each column's: 'left' | 'right' | 'center' | null
  //             what goes back into the note keeps its marks
  //   from/to   the table with its caption line (what a table put back replaces);
  //             tableFrom/tableTo the table alone
  // Lines are 1-based. Tables inside a list or a quote are read too.
  function tables(tree, text) {
    const src = String(text == null ? '' : text);
    const root = plain(tree);
    const starts = [0];
    for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
    function lineOf(pos) {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
      return lo + 1;
    }
    function captionOf(n) {
      if (!n || n.name !== 'Paragraph') return null;
      const m = /^Table:[ \t]*([^\n]*?)[ \t]*$/.exec(src.slice(n.from, n.to));
      return m && m[1] ? m[1] : null;
    }
    // a row's cells by its `|` delimiters: an empty cell has no TableCell node,
    // so counting TableCells would shift the columns after it
    const cells = (r) => {
      const ds = r.kids.filter((k) => k.name === 'TableDelimiter');
      const out = [];
      let start = r.from;
      ds.forEach((d) => { out.push([start, d.from]); start = d.to; });
      out.push([start, r.to]);
      if (ds.length && ds[0].from === r.from) out.shift();
      if (ds.length && ds[ds.length - 1].to === r.to) out.pop();
      return out.map(([a, b]) => src.slice(a, b).trim());
    };
    const out = [];
    const used = new Set();
    (function walk(n) {
      n.kids.forEach((k, i) => {
        if (k.name !== 'Table') { walk(k); return; }
        // a caption between two tables is the first one's (as the panel draws it): used once
        const before = used.has(n.kids[i - 1]) ? null : captionOf(n.kids[i - 1]);
        const after = before == null ? captionOf(n.kids[i + 1]) : null;
        const cap = before != null ? n.kids[i - 1] : after != null ? n.kids[i + 1] : null;
        if (cap) used.add(cap);
        const head = k.kids.filter((x) => x.name === 'TableHeader')[0];
        const delim = k.kids.filter((x) => x.name === 'TableDelimiter')[0];
        const align = delim ? src.slice(delim.from, delim.to).replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((d) => {
          const t = d.trim();
          return /^:-*:$/.test(t) ? 'center' : /-:$/.test(t) ? 'right' : /^:-/.test(t) ? 'left' : null;
        }) : [];
        out.push({
          name: before != null ? before : after,
          line: lineOf(k.from), endLine: lineOf(Math.max(k.from, k.to - 1)),
          captionLine: cap ? lineOf(cap.from) : null,
          head: head ? cells(head) : [],
          align: align,
          rows: k.kids.filter((x) => x.name === 'TableRow').map(cells),
          from: cap && before != null ? cap.from : k.from,
          to: cap && after != null ? cap.to : k.to,
          tableFrom: k.from, tableTo: k.to,
        });
      });
    })(root);
    return out;
  }

  // the table named `name` -> {table} | {error} (none, or more than one: never a guess)
  function findTable(list, name) {
    const want = String(name == null ? '' : name).trim();
    const hits = (list || []).filter((t) => t.name === want);
    if (!hits.length) return { error: 'no table named "' + want + '" (a `Table: ' + want + '` line just before or after it)' };
    if (hits.length > 1) return { error: hits.length + ' tables are named "' + want + '" (lines ' + hits.map((t) => t.line).join(', ') + ') ── give each its own name' };
    return { table: hits[0] };
  }

  // the index of the top block that holds `line` (or the last one before it) -> -1 | i
  function blockAt(blocks, line) {
    let found = -1;
    for (let i = 0; i < (blocks || []).length; i++) {
      if (blocks[i].line <= line) found = i;
      if (blocks[i].line <= line && line <= blocks[i].endLine) return i;
    }
    return found;
  }

  return { USAGE: USAGE, IMAGE_SAID: IMAGE_SAID, parse: parse, linkKind: linkKind, entity: entity, layout: layout, tables: tables, findTable: findTable, blockAt: blockAt };
});
