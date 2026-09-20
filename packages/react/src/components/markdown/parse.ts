// Framework-free markdown parsing for <Markdown>. Two pure passes:
//   parseMarkdown(src)      → block structure (headings, lists, code, …)
//   highlightCode(line,lang)→ per-line token coloring for fenced code blocks
// Best-effort, line-based; not a CommonMark-complete implementation.

export interface InlineSeg {
  text: string;
  bold?: boolean;
  /** Rendered as underline — terminal cells have no italic. */
  emphasis?: boolean;
  code?: boolean;
  /** href when this segment is a link's text. */
  link?: string;
  /** Image placeholder — `text` holds the alt (or the src if alt is empty). */
  image?: boolean;
}

export interface MdListItem {
  segs: InlineSeg[];
  /** GFM task-list state: `undefined` = a plain item; `true`/`false` = a checkbox. */
  checked?: boolean;
  /** Source number of an ordered item (`3.` → 3). Absent on bullet items. */
  num?: number;
  /** Sub-lists indented under this item, in source order. More than one when the
   *  marker type switches mid-run (a bullet run followed by a numbered one). */
  children?: MdList[];
}

export interface MdList {
  ordered: boolean;
  items: MdListItem[];
}

export type MdAlign = 'left' | 'center' | 'right';

export type MdBlock =
  | { kind: 'heading'; level: number; segs: InlineSeg[] }
  | { kind: 'paragraph'; segs: InlineSeg[] }
  | ({ kind: 'list' } & MdList)
  /** GFM table. `align[c]` is `undefined` when the separator cell has no colon.
   *  Every row has exactly `header.length` cells (short rows padded, long cut). */
  | { kind: 'table'; align: (MdAlign | undefined)[]; header: InlineSeg[][]; rows: InlineSeg[][][] }
  | { kind: 'blockquote'; segs: InlineSeg[] }
  | { kind: 'code'; lang: string; lines: string[] }
  | { kind: 'hr' };

// code | ![alt](src) | **bold** | *emphasis* | [text](url). Image is tried before
// link so the leading `!` isn't left dangling. Asterisk-only emphasis on purpose:
// `_` is left alone so snake_case identifiers aren't mangled.
const INLINE_RE = /(`[^`]+`)|(!\[[^\]]*\]\([^)]*\))|(\*\*[\s\S]+?\*\*)|(\*[\s\S]+?\*)|(\[[^\]]+\]\([^)]*\))/g;
const LINK_RE = /^\[([^\]]+)\]\(([^)]*)\)$/;
const IMG_RE = /^!\[([^\]]*)\]\(([^)]*)\)$/;

export function parseInline(text: string): InlineSeg[] {
  const segs: InlineSeg[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) segs.push({ text: text.slice(last, idx) });
    const tok = m[0];
    if (m[1]) segs.push({ text: tok.slice(1, -1), code: true });
    else if (m[2]) {
      const im = IMG_RE.exec(tok);
      segs.push({ text: im ? (im[1] || im[2] || '') : tok, image: true });
    } else if (m[3]) segs.push({ text: tok.slice(2, -2), bold: true });
    else if (m[4]) segs.push({ text: tok.slice(1, -1), emphasis: true });
    else if (m[5]) {
      const lm = LINK_RE.exec(tok);
      // Recursively parse the label so inline markup inside a link (e.g.
      // [`code`](url) or [**bold**](url)) renders styled instead of leaking its
      // literal markers, and attach the href to every resulting sub-segment.
      if (lm) for (const sub of parseInline(lm[1]!)) segs.push({ ...sub, link: lm[2]! });
      else segs.push({ text: tok });
    }
    last = idx + tok.length;
  }
  if (last < text.length) segs.push({ text: text.slice(last) });
  return segs.length > 0 ? segs : [{ text }];
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE = /^(```|~~~)\s*([\w-]*)\s*$/;
const QUOTE_RE = /^>\s?(.*)$/;
const ULIST_RE = /^(\s*)[-*+]\s+(.*)$/;
const OLIST_RE = /^(\s*)(\d+)\.\s+(.*)$/;
// GFM task-list marker at the start of a list item's content: `[ ]`, `[x]`, `[X]`.
// Non-standard markers (e.g. `[v]`) intentionally don't match — they stay literal.
const TASK_RE = /^\[([ xX])\]\s+(.*)$/;

interface ListLine { indent: number; ordered: boolean; num?: number; content: string }

function parseListLine(line: string): ListLine | null {
  const o = OLIST_RE.exec(line);
  const u = o ? null : ULIST_RE.exec(line);
  const m = o ?? u;
  if (!m) return null;
  // A tab counts as 4 columns — enough to read as "deeper" under any marker.
  const indent = m[1]!.replace(/\t/g, '    ').length;
  return o
    ? { indent, ordered: true, num: Number(o[2]), content: o[3]! }
    : { indent, ordered: false, content: u![2]! };
}

// A line indented at least this far past a list's own indent belongs to a
// sub-list of the preceding item (2 = the width of a `- ` marker).
const NEST_INDENT = 2;

// Build one list from `lines[start…]`, recursing into deeper-indented runs.
// Stops at a dedent (nested lists only) or at a same-level marker-type switch;
// the caller picks up from the returned index — a parent item opens a sibling
// sub-list there, the top level starts a new block.
function parseList(lines: ListLine[], start: number, nested: boolean): { list: MdList; next: number } {
  const first = lines[start]!;
  const list: MdList = { ordered: first.ordered, items: [] };
  let i = start;
  while (i < lines.length) {
    const ln = lines[i]!;
    if (nested && ln.indent < first.indent) break;
    const last = list.items[list.items.length - 1];
    if (last && ln.indent >= first.indent + NEST_INDENT) {
      const sub = parseList(lines, i, true);
      (last.children ??= []).push(sub.list);
      i = sub.next;
      continue;
    }
    if (ln.ordered !== list.ordered) break;
    const tm = TASK_RE.exec(ln.content);
    const item: MdListItem = tm
      ? { segs: parseInline(tm[2]!), checked: tm[1]!.toLowerCase() === 'x' }
      : { segs: parseInline(ln.content) };
    if (ln.num !== undefined) item.num = ln.num;
    list.items.push(item);
    i++;
  }
  return { list, next: i };
}

// Split a table row into trimmed cell sources. A `|` inside an inline code span
// or escaped as `\|` stays in its cell; the escape's backslash is dropped.
function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  const s = line.trim();
  for (let k = 0; k < s.length; k++) {
    const ch = s[k]!;
    if (ch === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  // Edge pipes produce an empty first/last cell — they're framing, not columns.
  if (cells.length > 1 && cells[0]!.trim() === '') cells.shift();
  if (cells.length > 1 && cells[cells.length - 1]!.trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

const TABLE_SEP_CELL_RE = /^:?-+:?$/;

// The separator row's alignments, or null when `line` isn't a separator row.
function parseTableSeparator(line: string): (MdAlign | undefined)[] | null {
  if (!line.includes('|')) return null;
  const cells = splitTableRow(line);
  if (!cells.every((c) => TABLE_SEP_CELL_RE.test(c))) return null;
  return cells.map((c) => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : undefined;
  });
}

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length > 0) blocks.push({ kind: 'paragraph', segs: parseInline(buf.join(' ')) });
  };

  let para: string[] = [];
  while (i < lines.length) {
    const line = lines[i]!;
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushParagraph(para); para = [];
      const marker = fence[1]!;
      const lang = fence[2] ?? '';
      const code: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== marker && !FENCE_RE.test(lines[i]!)) {
        code.push(lines[i]!); i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push({ kind: 'code', lang, lines: code });
      continue;
    }
    if (line.trim() === '') { flushParagraph(para); para = []; i++; continue; }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph(para); para = [];
      blocks.push({ kind: 'heading', level: heading[1]!.length, segs: parseInline(heading[2]!) });
      i++; continue;
    }
    if (HR_RE.test(line)) {
      flushParagraph(para); para = [];
      blocks.push({ kind: 'hr' });
      i++; continue;
    }
    if (QUOTE_RE.test(line)) {
      flushParagraph(para); para = [];
      const quote: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i]!)) {
        quote.push(QUOTE_RE.exec(lines[i]!)![1]!); i++;
      }
      blocks.push({ kind: 'blockquote', segs: parseInline(quote.join(' ')) });
      continue;
    }
    // GFM table: a `|` line directly followed by a separator row with the same
    // number of columns. Checked before lists so `- a | b` rows can't hijack it.
    const align = line.includes('|') && i + 1 < lines.length ? parseTableSeparator(lines[i + 1]!) : null;
    if (align) {
      const header = splitTableRow(line);
      if (header.length === align.length) {
        flushParagraph(para); para = [];
        i += 2;
        const rows: InlineSeg[][][] = [];
        while (i < lines.length && lines[i]!.trim() !== '' && lines[i]!.includes('|')) {
          const cells = splitTableRow(lines[i]!);
          rows.push(header.map((_, c) => parseInline(cells[c] ?? '')));
          i++;
        }
        blocks.push({ kind: 'table', align, header: header.map(parseInline), rows });
        continue;
      }
    }
    if (parseListLine(line)) {
      flushParagraph(para); para = [];
      const run: ListLine[] = [];
      for (let j = i; j < lines.length; j++) {
        const ln = parseListLine(lines[j]!);
        if (!ln) break;
        run.push(ln);
      }
      const { list, next } = parseList(run, 0, false);
      blocks.push({ kind: 'list', ...list });
      i += next;
      continue;
    }
    para.push(line);
    i++;
  }
  flushParagraph(para);
  return blocks;
}

// ─── fenced-code highlighting ───────────────────────────────────────────────

export interface CodeSeg { text: string; color?: string; dim?: boolean }

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'super', 'this',
  'import', 'from', 'export', 'default', 'async', 'await', 'try', 'catch', 'finally',
  'throw', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'yield', 'true',
  'false', 'null', 'undefined', 'interface', 'type', 'enum', 'implements', 'public',
  'private', 'protected', 'readonly', 'static', 'as', 'namespace', 'declare',
]);

// One regex, tried left-to-right per match: comment | string | number | word.
const JS_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

function highlightJs(line: string): CodeSeg[] {
  const segs: CodeSeg[] = [];
  let last = 0;
  for (const m of line.matchAll(JS_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) segs.push({ text: line.slice(last, idx) });
    if (m[1]) segs.push({ text: m[0], dim: true });
    else if (m[2]) segs.push({ text: m[0], color: 'green' });
    else if (m[3]) segs.push({ text: m[0], color: 'yellow' });
    else if (m[4]) segs.push(JS_KEYWORDS.has(m[0]) ? { text: m[0], color: 'magenta' } : { text: m[0] });
    last = idx + m[0].length;
  }
  if (last < line.length) segs.push({ text: line.slice(last) });
  return segs;
}

// key | string | number/bool/null | punctuation passthrough.
const JSON_RE = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?\b)/g;

function highlightJson(line: string): CodeSeg[] {
  const segs: CodeSeg[] = [];
  let last = 0;
  for (const m of line.matchAll(JSON_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) segs.push({ text: line.slice(last, idx) });
    if (m[1]) segs.push({ text: m[0], color: 'cyan' });
    else if (m[2]) segs.push({ text: m[0], color: 'green' });
    else if (m[3]) segs.push({ text: m[0], color: 'yellow' });
    last = idx + m[0].length;
  }
  if (last < line.length) segs.push({ text: line.slice(last) });
  return segs;
}

export function highlightCode(line: string, lang: string): CodeSeg[] {
  const l = lang.toLowerCase();
  if (l === 'js' || l === 'jsx' || l === 'ts' || l === 'tsx' || l === 'javascript' || l === 'typescript') {
    return highlightJs(line);
  }
  if (l === 'json') return highlightJson(line);
  return [{ text: line, dim: true }];
}
