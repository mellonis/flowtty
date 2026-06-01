// Framework-free markdown → styled visual lines. Turns the block tree from
// parseMarkdown into a flat list of pre-wrapped lines, each a run of styled
// spans. Pre-wrapping (rather than leaning on Yoga's flexWrap) is deliberate:
// it gives a stable visual-line count, so a paginating host can slice the output by row exactly the way it slices raw text.

import { parseMarkdown, highlightCode, type InlineSeg } from './parse.js';

export interface StyledSpan {
  text: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  color?: string;
}

/** One rendered row. Empty `spans` is a blank spacer line (height 1). */
export interface StyledLine {
  spans: StyledSpan[];
}

type SpanStyle = Omit<StyledSpan, 'text'>;
interface StyledChar { ch: string; style: SpanStyle }

function styleForSeg(s: InlineSeg): SpanStyle {
  if (s.code) return { color: 'cyan' };
  if (s.image) return { dim: true };
  if (s.link) return { color: 'blue', underline: true };
  const st: SpanStyle = {};
  if (s.bold) st.bold = true;
  if (s.emphasis) st.underline = true;
  return st;
}

function sameStyle(a: SpanStyle, b: SpanStyle): boolean {
  return !!a.bold === !!b.bold && !!a.dim === !!b.dim
    && !!a.underline === !!b.underline && (a.color ?? '') === (b.color ?? '');
}

function segsToChars(segs: InlineSeg[], base: SpanStyle = {}): StyledChar[] {
  const out: StyledChar[] = [];
  for (const s of segs) {
    const style = { ...base, ...styleForSeg(s) };
    for (const ch of [...s.text]) out.push({ ch, style });
  }
  return out;
}

// Greedy word-wrap over styled chars. Words are non-space runs; a single space
// separates them. Over-long words are hard char-wrapped. Collapses space runs,
// which is fine because paragraphs are already space-joined by parseMarkdown.
function wrapChars(chars: StyledChar[], width: number): StyledChar[][] {
  const words: StyledChar[][] = [];
  let cur: StyledChar[] = [];
  for (const c of chars) {
    if (c.ch === ' ') { if (cur.length) { words.push(cur); cur = []; } }
    else cur.push(c);
  }
  if (cur.length) words.push(cur);

  if (width <= 0) return [words.flatMap((w, i) => (i ? [{ ch: ' ', style: {} }, ...w] : w))];

  const lines: StyledChar[][] = [];
  let line: StyledChar[] = [];
  for (let word of words) {
    while (word.length > width) {
      if (line.length) { lines.push(line); line = []; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    const sep = line.length ? 1 : 0;
    if (line.length + sep + word.length > width) {
      if (line.length) lines.push(line);
      line = [...word];
    } else {
      if (sep) line.push({ ch: ' ', style: {} });
      line.push(...word);
    }
  }
  if (line.length || lines.length === 0) lines.push(line);
  return lines;
}

function charsToSpans(chars: StyledChar[]): StyledSpan[] {
  const spans: StyledSpan[] = [];
  for (const c of chars) {
    const last = spans[spans.length - 1];
    if (last && sameStyle(last, c.style)) last.text += c.ch;
    else spans.push({ text: c.ch, ...c.style });
  }
  return spans;
}

function prefixWidth(p?: StyledSpan[]): number {
  return p ? p.reduce((n, s) => n + [...s.text].length, 0) : 0;
}

// Wrap inline content, optionally with a first-line prefix (e.g. a list marker)
// and an equal-width continuation prefix (e.g. spaces, for hanging indent).
function wrapBlock(
  segs: InlineSeg[],
  width: number,
  opts: { first?: StyledSpan[]; cont?: StyledSpan[]; base?: SpanStyle } = {},
): StyledLine[] {
  const indent = Math.max(prefixWidth(opts.first), prefixWidth(opts.cont));
  const contentWidth = Math.max(1, width - indent);
  const charLines = wrapChars(segsToChars(segs, opts.base), contentWidth);
  return charLines.map((cl, i) => {
    const pre = i === 0 ? opts.first : opts.cont;
    return { spans: [...(pre ?? []), ...charsToSpans(cl)] };
  });
}

function headingColor(level: number): string {
  return level <= 1 ? 'magenta' : level === 2 ? 'cyan' : 'blue';
}

/**
 * Lay out markdown `src` into styled visual lines fitting `width` cells. The
 * result is paginatable by simple row slicing. Style mapping (no italic in the
 * terminal cell model): **bold**→bold, *emphasis*→underline, `code`→cyan,
 * [links]→blue underline, images→dim alt text, headings→bold + level color,
 * blockquotes→`│ ` gutter + dim, fenced code→per-language token colors.
 */
export function layoutMarkdown(src: string, width: number): StyledLine[] {
  const blocks = parseMarkdown(src);
  const out: StyledLine[] = [];
  const blank = () => { if (out.length) out.push({ spans: [] }); };

  for (const b of blocks) {
    blank();
    switch (b.kind) {
      case 'heading': {
        const hashes = '#'.repeat(b.level) + ' ';
        out.push(...wrapBlock(b.segs, width, {
          first: [{ text: hashes, dim: true }],
          cont: [{ text: ' '.repeat(hashes.length) }],
          base: { bold: true, color: headingColor(b.level) },
        }));
        break;
      }
      case 'paragraph':
        out.push(...wrapBlock(b.segs, width));
        break;
      case 'blockquote': {
        const bar: StyledSpan[] = [{ text: '│ ', dim: true, color: 'cyan' }];
        out.push(...wrapBlock(b.segs, width, { first: bar, cont: bar, base: { dim: true } }));
        break;
      }
      case 'list':
        b.items.forEach((item, idx) => {
          const marker = b.ordered ? `${idx + 1}. ` : '• ';
          out.push(...wrapBlock(item, width, {
            first: [{ text: marker, color: 'yellow' }],
            cont: [{ text: ' '.repeat(marker.length) }],
          }));
        });
        break;
      case 'code': {
        const fence = '```';
        out.push({ spans: [{ text: fence + b.lang, dim: true }] });
        for (const cl of b.lines) {
          out.push({
            spans: highlightCode(cl, b.lang)
              .map((cs) => ({ text: cs.text, color: cs.color, dim: cs.dim })),
          });
        }
        out.push({ spans: [{ text: fence, dim: true }] });
        break;
      }
      case 'hr':
        out.push({ spans: [{ text: '─'.repeat(Math.max(1, width)), dim: true }] });
        break;
    }
  }
  return out;
}
