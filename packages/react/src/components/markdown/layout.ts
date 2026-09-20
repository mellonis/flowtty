// Framework-free markdown → styled visual lines. Turns the block tree from
// parseMarkdown into a flat list of pre-wrapped lines, each a run of styled
// spans. Pre-wrapping (rather than leaning on Yoga's flexWrap) is deliberate:
// it gives a stable visual-line count, so a paginating host (e.g. the articles
// example) can slice the output by row exactly the way it slices raw text.

import { parseMarkdown, highlightCode, type InlineSeg, type MdList, type MdAlign } from './parse.js';
import type { Color } from '@flowtty/core';

export interface StyledSpan {
  text: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  color?: Color;
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

// The unit every measurement here uses: GRID columns. flowtty's grid is one cell
// per code point — paint puts a double-width glyph (emoji, CJK) in a single cell
// and the backends keep it to one screen column — so padding computed in display
// cells would leave rows with wide glyphs a column short per glyph. `<Table>`
// measures the same way. When paint learns to reserve a glyph's second cell,
// this is the one place to switch to `charWidth`.
const cellWidth = (_c: StyledChar): number => 1;

function charsWidth(chars: StyledChar[]): number {
  let n = 0;
  for (const c of chars) n += cellWidth(c);
  return n;
}

const textWidth = (text: string): number => [...text].length;

// Greedy word-wrap over styled chars, measured in grid columns (see cellWidth).
// Words are non-space runs; a single space separates them. Over-long words
// are hard char-wrapped. Collapses space runs, which is fine because paragraphs
// are already space-joined by parseMarkdown.
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
  let lineW = 0;
  for (const w of words) {
    let word = w.chars;
    let wordW = charsWidth(word);
    while (wordW > width) {
      if (line.length) { lines.push(line); line = []; lineW = 0; }
      // Take as many chars as fit — always at least one, so a glyph wider than
      // the whole line still makes progress.
      let take = 0;
      let takeW = 0;
      while (take < word.length && (take === 0 || takeW + cellWidth(word[take]!) <= width)) {
        takeW += cellWidth(word[take]!);
        take++;
      }
      lines.push(word.slice(0, take));
      word = word.slice(take);
      wordW -= takeW;
    }
    const sep = line.length ? 1 : 0;
    if (lineW + sep + wordW > width) {
      if (line.length) lines.push(line);
      line = [...word];
      lineW = wordW;
    } else {
      if (sep) line.push({ ch: ' ', style: w.sep });
      line.push(...word);
      lineW += sep + wordW;
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
  return p ? p.reduce((n, s) => n + textWidth(s.text), 0) : 0;
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

// Render a list and, recursively, its sub-lists. `pad` is the column the list
// starts in: a sub-list starts under its parent item's text, i.e. past the
// parent's marker.
function layoutList(list: MdList, width: number, pad: number, out: StyledLine[]): void {
  // Source numbers are printed as written, so `3.` stays `3.`. The one exception
  // is lazy numbering — every item carrying the same number (`1.` `1.` `1.`) —
  // which counts up from that number the way markdown renderers show it.
  const nums = list.items.map((it) => it.num);
  const lazy = nums.length > 1 && nums.every((n) => n === nums[0]);
  const padSpan: StyledSpan[] = pad > 0 ? [{ text: ' '.repeat(pad) }] : [];

  list.items.forEach((item, idx) => {
    const start = nums[0] ?? 1;
    const num = list.ordered ? `${lazy ? start + idx : item.num ?? idx + 1}. ` : '';
    const marker: StyledSpan[] = [];
    if (item.checked === undefined) {
      marker.push({ text: list.ordered ? num : '• ', color: 'yellow' });
    } else {
      // GFM task item: `☑ ` (checked, green) / `☐ ` (unchecked). For an
      // ordered list keep the number, then the box.
      if (num) marker.push({ text: num, color: 'yellow' });
      marker.push({ text: item.checked ? '☑ ' : '☐ ', color: item.checked ? 'green' : undefined });
    }
    const indent = pad + prefixWidth(marker);
    out.push(...wrapBlock(item.segs, width, {
      first: [...padSpan, ...marker],
      cont: [{ text: ' '.repeat(indent) }],
    }));
    for (const child of item.children ?? []) layoutList(child, width, indent, out);
  });
}

const TABLE_GUTTER = 2;

// Render a table as space-padded columns: bold header, a dim rule per column,
// then the rows. Columns are as wide as their widest cell; when that overflows
// `width` the widest column gives way a cell at a time and its content wraps,
// so a row can span several lines. Widths are grid columns (see cellWidth).
function layoutTable(
  align: (MdAlign | undefined)[],
  header: InlineSeg[][],
  rows: InlineSeg[][][],
  width: number,
  out: StyledLine[],
): void {
  const cols = header.length;
  const cells: StyledChar[][][] = [
    header.map((c) => segsToChars(c, { bold: true })),
    ...rows.map((r) => r.map((c) => segsToChars(c))),
  ];

  const widths = Array.from({ length: cols }, (_, c) => Math.max(1, ...cells.map((r) => charsWidth(r[c]!))));
  const avail = width - TABLE_GUTTER * (cols - 1);
  if (width > 0) {
    let total = widths.reduce((a, b) => a + b, 0);
    while (total > avail) {
      const widest = widths.indexOf(Math.max(...widths));
      if (widths[widest]! <= 1) break; // more columns than cells — let it overflow
      widths[widest]!--;
      total--;
    }
  }

  const wrapped = cells.map((r) => r.map((c, ci) => wrapChars(c, widths[ci]!)));
  // Wrapping rarely fills a shrunk column to the last cell — tighten to what's used.
  for (let c = 0; c < cols; c++) {
    widths[c] = Math.max(1, ...wrapped.flatMap((r) => r[c]!.map(charsWidth)));
  }

  const spaces = (n: number): StyledChar[] => Array.from({ length: Math.max(0, n) }, () => ({ ch: ' ', style: {} }));
  const emitRow = (row: StyledChar[][][]) => {
    const height = Math.max(...row.map((c) => c.length));
    for (let ln = 0; ln < height; ln++) {
      const chars: StyledChar[] = [];
      for (let c = 0; c < cols; c++) {
        const cell = row[c]![ln] ?? [];
        const free = widths[c]! - charsWidth(cell);
        const left = align[c] === 'right' ? free : align[c] === 'center' ? Math.floor(free / 2) : 0;
        chars.push(...spaces(left), ...cell, ...spaces(free - left));
        if (c < cols - 1) chars.push(...spaces(TABLE_GUTTER));
      }
      // Padding after the last cell is invisible — don't emit trailing blanks.
      while (chars.length && chars[chars.length - 1]!.ch === ' ') chars.pop();
      out.push({ spans: charsToSpans(chars) });
    }
  };

  emitRow(wrapped[0]!);
  const rule: StyledSpan[] = [];
  widths.forEach((w, c) => {
    if (c > 0) rule.push({ text: ' '.repeat(TABLE_GUTTER) });
    rule.push({ text: '─'.repeat(w), dim: true });
  });
  out.push({ spans: rule });
  for (const r of wrapped.slice(1)) emitRow(r);
}

function headingColor(level: number): string {
  return level <= 1 ? 'magenta' : level === 2 ? 'cyan' : 'blue';
}

/**
 * Lay out markdown `src` into styled visual lines fitting `width` cells. The
 * result is paginatable by simple row slicing. Style mapping (no italic in the
 * terminal cell model): **bold**→bold, *emphasis*→underline, `code`→cyan,
 * [links]→blue underline, images→dim alt text, headings→bold + level color,
 * blockquotes→`│ ` gutter + dim, fenced code→per-language token colors,
 * nested lists→indented under the parent item's text, tables→padded columns with
 * a bold header over a dim rule.
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
        layoutList(b, width, 0, out);
        break;
      case 'table':
        layoutTable(b.align, b.header, b.rows, width, out);
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
