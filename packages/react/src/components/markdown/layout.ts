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
  /** OSC 8 hyperlink target — set on link spans so a renderer can make them
   *  clickable on capable backends. Carried through wrapping like any style. */
  link?: string;
}

/** One rendered row. Empty `spans` is a blank spacer line (height 1). */
export interface StyledLine {
  spans: StyledSpan[];
}

export type SpanStyle = Omit<StyledSpan, 'text'>;
export interface StyledChar { ch: string; style: SpanStyle }

function styleForSeg(s: InlineSeg): SpanStyle {
  const st: SpanStyle = {};
  if (s.code) st.color = 'cyan';
  else if (s.image) st.dim = true;
  else if (s.link) st.color = 'blue'; // plain-text link label
  if (s.bold) st.bold = true;
  if (s.emphasis) st.underline = true;
  // A link can wrap any inner kind (code/bold/plain). Keep the inner color but
  // always mark it underlined + clickable so the affordance survives.
  if (s.link) {
    st.link = s.link;
    st.underline = true;
  }
  return st;
}

function sameStyle(a: SpanStyle, b: SpanStyle): boolean {
  return !!a.bold === !!b.bold && !!a.dim === !!b.dim
    && !!a.underline === !!b.underline && (a.color ?? '') === (b.color ?? '')
    && (a.link ?? '') === (b.link ?? '');
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
//
// Each word remembers the style of the space that preceded it (`sep`), so an
// interword space *inside* a styled run (e.g. the space in *bare state*) keeps
// that run's style — an emphasis underline runs continuously across the space
// instead of breaking on it.
interface Word { chars: StyledChar[]; sep: SpanStyle }

function wrapChars(chars: StyledChar[], width: number): StyledChar[][] {
  const words: Word[] = [];
  let cur: StyledChar[] = [];
  let curSep: SpanStyle = {};
  let spaceStyle: SpanStyle | null = null; // style of the first space in the current run
  for (const c of chars) {
    if (c.ch === ' ') {
      if (cur.length) { words.push({ chars: cur, sep: curSep }); cur = []; curSep = {}; }
      if (spaceStyle === null) spaceStyle = c.style;
    } else {
      if (spaceStyle !== null) { curSep = spaceStyle; spaceStyle = null; }
      cur.push(c);
    }
  }
  if (cur.length) words.push({ chars: cur, sep: curSep });

  if (width <= 0) {
    return [words.flatMap((w, i) => (i ? [{ ch: ' ', style: w.sep }, ...w.chars] : w.chars))];
  }

  const lines: StyledChar[][] = [];
  let line: StyledChar[] = [];
  for (const w of words) {
    let word = w.chars;
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
      if (sep) line.push({ ch: ' ', style: w.sep });
      line.push(...word);
    }
  }
  if (line.length || lines.length === 0) lines.push(line);
  return lines;
}

export function charsToSpans(chars: StyledChar[]): StyledSpan[] {
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
          const num = b.ordered ? `${idx + 1}. ` : '';
          const first: StyledSpan[] = [];
          if (item.checked === undefined) {
            const bullet = b.ordered ? num : '• ';
            first.push({ text: bullet, color: 'yellow' });
          } else {
            // GFM task item: `☑ ` (checked, green) / `☐ ` (unchecked). For an
            // ordered list keep the number, then the box.
            if (num) first.push({ text: num, color: 'yellow' });
            first.push({ text: item.checked ? '☑ ' : '☐ ', color: item.checked ? 'green' : undefined });
          }
          const indent = first.reduce((n, s) => n + [...s.text].length, 0);
          out.push(...wrapBlock(item.segs, width, {
            first,
            cont: [{ text: ' '.repeat(indent) }],
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
