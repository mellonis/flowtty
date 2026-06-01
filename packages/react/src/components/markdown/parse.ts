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

export type MdBlock =
  | { kind: 'heading'; level: number; segs: InlineSeg[] }
  | { kind: 'paragraph'; segs: InlineSeg[] }
  | { kind: 'list'; ordered: boolean; items: InlineSeg[][] }
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
const ULIST_RE = /^\s*[-*+]\s+(.*)$/;
const OLIST_RE = /^\s*\d+\.\s+(.*)$/;

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
    const ul = ULIST_RE.exec(line);
    const ol = OLIST_RE.exec(line);
    if (ul || ol) {
      flushParagraph(para); para = [];
      const ordered = !!ol;
      const items: InlineSeg[][] = [];
      while (i < lines.length) {
        const u = ULIST_RE.exec(lines[i]!);
        const o = OLIST_RE.exec(lines[i]!);
        if (ordered && o) items.push(parseInline(o[1]!));
        else if (!ordered && u) items.push(parseInline(u[1]!));
        else break;
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
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
