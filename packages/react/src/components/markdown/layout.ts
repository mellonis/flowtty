// Framework-free markdown → styled visual lines. Turns the block tree from
// parseMarkdown into a flat list of pre-wrapped lines, each a run of styled
// spans. Pre-wrapping (rather than leaning on Yoga's flexWrap) is deliberate:
// it gives a stable visual-line count, so a paginating host (e.g. the articles
// example) can slice the output by row exactly the way it slices raw text.

import { parseMarkdown, type InlineSeg, type MdList, type MdAlign } from './parse.js';
import { checkboxMarker } from '../checkboxMarker.js';
import {
  detectLanguage, highlightBlock, hunkNumbers, resolveLanguage,
  type CodeLine, type CodeLineKind,
} from './highlight/index.js';
import { clusterWidth, graphemes, stringWidth } from '@flowtty/core';
import type { Color, WrapContinuation } from '@flowtty/core';

/** How a fenced block is framed. `'bar'` (the default) draws a dim label row
 *  and a dim `│ ` gutter; `'literal'` prints the ``` fences as written. */
export type MarkdownCodeFence = 'bar' | 'literal';

/** What happens to a code line wider than the space left for it. */
export type MarkdownCodeWrap = 'wrap' | 'truncate';

export interface MarkdownOptions {
  /** Fenced-block frame. Default `'bar'`. */
  codeFence?: MarkdownCodeFence;
  /** Over-long code lines: hard-wrap them (default) or cut them with a `…`. */
  codeWrap?: MarkdownCodeWrap;
  /** Cap on the rendered rows of one fenced block. Past it the block ends with
   *  a dim `… N more lines` row, N counting the source lines left out. */
  maxCodeRows?: number;
  /** Dim, right-aligned source line numbers in a gutter before the code. */
  lineNumbers?: boolean;
  /** Faint green / red bands behind a diff's added / removed rows. Default true.
   *  Turn it off where the band cannot say what it means — a 16-color terminal
   *  has no faint green (see docs/components.md — diff blocks). */
  diffBackground?: boolean;
}

/** One fenced block of a laid-out document, reported by
 *  {@link layoutMarkdownDetailed} so a host can offer "copy this block" with
 *  the exact source — no frame glyphs, no wrapping, no row cap. */
export interface MarkdownCodeBlock {
  lang: string;
  title?: string;
  /** The block's raw lines, newline-joined — what a copy action should yield. */
  source: string;
  /** Index of the first output line of the block, label row included. */
  startLine: number;
  /** Index one past the block's last output line. */
  endLine: number;
  /** False while a streamed block's closing fence has not arrived yet. */
  closed: boolean;
}

export interface StyledSpan {
  text: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  color?: Color;
  /** Cell background — set on a diff row's band, which runs the full width of
   *  the code area (the padding spaces at the end of the row belong to it). */
  background?: Color;
  /** OSC 8 hyperlink target — set on link spans so a renderer can make them
   *  clickable on capable backends. Carried through wrapping like any style. */
  link?: string;
}

/** One rendered row. Empty `spans` is a blank spacer line (height 1). */
export interface StyledLine {
  spans: StyledSpan[];
  /**
   * This row's text carries on at the start of the row below, with no line
   * break between them in the source: `dropped` is what the wrap ate at the
   * break (`' '` at a word boundary, `''` through a run of characters) and
   * `textWidth` how many cells the row's own text covers — padding a diff band
   * added excluded. The renderer puts it on the row's box as `wrapContinues`,
   * so a drag-selection copies the paragraph back as the one line it was
   * written as.
   *
   * See docs/input.md (selection).
   */
  continues?: WrapContinuation;
  /**
   * How many of the leading spans are FRAME rather than content: a code
   * block's `│ ` bar and line-number gutter, a blockquote's bar, a fence
   * label. The renderer paints them exactly as it paints the rest and marks
   * them `selectable={false}`, so a drag over the document copies the text and
   * leaves the chrome behind — and a wrapped row can be rejoined without
   * splicing a gutter glyph into the middle of the line.
   *
   * A list marker, a task checkbox and a diff's `+`/`-` column are content:
   * they are what the author wrote, and a copied diff has to still apply.
   */
  chrome?: number;
  /**
   * The row is frame from edge to edge — a fence label, a `… N more lines`
   * notice. It is not a line of the document at all, so the renderer takes the
   * whole row out of a selection and a copy skips it rather than returning it
   * as an empty line. An empty line the author wrote, and an empty line inside
   * a code block, are NOT this: their content area is selectable and blank.
   */
  frame?: true;
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
    && (a.background ?? '') === (b.background ?? '')
    && (a.link ?? '') === (b.link ?? '');
}

function segsToChars(segs: InlineSeg[], base: SpanStyle = {}): StyledChar[] {
  const out: StyledChar[] = [];
  for (const s of segs) {
    const style = { ...base, ...styleForSeg(s) };
    for (const ch of graphemes(s.text)) out.push({ ch, style });
  }
  return out;
}

// The unit every measurement here uses: display columns. `StyledChar.ch` is a
// grapheme cluster and takes the columns `clusterWidth` says (an ideograph or
// an emoji two, a base with its combining marks one). `<Table>` measures the
// same way. See docs/terminal.md (display width).
const cellWidth = (c: StyledChar): number => clusterWidth(c.ch);

function charsWidth(chars: StyledChar[]): number {
  let n = 0;
  for (const c of chars) n += cellWidth(c);
  return n;
}

const textWidth = stringWidth;

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

/** One wrapped row, with what the break that ended it dropped (see
 *  `StyledLine`). A row that ends the block carries nothing. */
interface WrappedChars { chars: StyledChar[]; continues?: string }

/** {@link wrapChars} without the break kinds, for callers that lay rows out
 *  side by side (a table cell) rather than one under the next. */
function wrapChars(chars: StyledChar[], width: number): StyledChar[][] {
  return wrapCharsDetailed(chars, width).map((l) => l.chars);
}

function wrapCharsDetailed(chars: StyledChar[], width: number): WrappedChars[] {
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
    return [{ chars: words.flatMap((w, i) => (i ? [{ ch: ' ', style: w.sep }, ...w.chars] : w.chars)) }];
  }

  const lines: WrappedChars[] = [];
  // Every row but the last of the block carries what the break that ended it
  // dropped: the space eaten at a word boundary, or nothing where it cut
  // through a long word. Runs of spaces were already collapsed into one by the
  // pass above (paragraphs come space-joined out of parseMarkdown), so a word
  // boundary drops exactly one.
  const push = (chars: StyledChar[], continues: string): void => { lines.push({ chars, continues }); };
  let line: StyledChar[] = [];
  let lineW = 0;
  for (const w of words) {
    let word = w.chars;
    let wordW = charsWidth(word);
    while (wordW > width) {
      if (line.length) { push(line, ' '); line = []; lineW = 0; }
      // Take as many chars as fit — always at least one, so a glyph wider than
      // the whole line still makes progress.
      let take = 0;
      let takeW = 0;
      while (take < word.length && (take === 0 || takeW + cellWidth(word[take]!) <= width)) {
        takeW += cellWidth(word[take]!);
        take++;
      }
      push(word.slice(0, take), '');
      word = word.slice(take);
      wordW -= takeW;
    }
    const sep = line.length ? 1 : 0;
    if (lineW + sep + wordW > width) {
      if (line.length) push(line, ' ');
      line = [...word];
      lineW = wordW;
    } else {
      if (sep) line.push({ ch: ' ', style: w.sep });
      line.push(...word);
      lineW += sep + wordW;
    }
  }
  if (line.length || lines.length === 0) lines.push({ chars: line });
  return lines;
}

/** Whether a row's painted prefix is blank — a list item's hanging indent, or
 *  nothing at all. A blank prefix is part of the line's own text as painted,
 *  so it needs no `chrome` marking; a prefix that draws a glyph is either
 *  content the author wrote (a list marker) or frame that has to be marked. */
function prefixIsBlank(prefix?: StyledSpan[]): boolean {
  return (prefix ?? []).every((s) => s.text.trim() === '');
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
  opts: {
    first?: StyledSpan[];
    cont?: StyledSpan[];
    base?: SpanStyle;
    /** The prefix is frame, not content — a blockquote's bar. It is marked
     *  `chrome` and left out of the span a copy reads. */
    chromePrefix?: boolean;
  } = {},
): StyledLine[] {
  const indent = Math.max(prefixWidth(opts.first), prefixWidth(opts.cont));
  const contentWidth = Math.max(1, width - indent);
  const charLines = wrapCharsDetailed(segsToChars(segs, opts.base), contentWidth);
  const chrome = opts.chromePrefix === true;
  // A blank prefix is painted as part of the line (a hanging indent goes with
  // the space the wrap dropped); a chrome one is taken out of the copy, so the
  // span starts past it. Anything else is content that would land mid-line.
  const marks = chrome || prefixIsBlank(opts.cont);
  return charLines.map((cl, i) => {
    const pre = i === 0 ? opts.first : opts.cont;
    const line: StyledLine = { spans: [...(pre ?? []), ...charsToSpans(cl.chars)] };
    if (chrome && pre !== undefined && pre.length > 0) line.chrome = pre.length;
    if (marks && cl.continues !== undefined) {
      const textStart = chrome ? prefixWidth(pre) : 0;
      line.continues = {
        dropped: cl.continues,
        ...(textStart > 0 ? { textStart } : {}),
        textWidth: (chrome ? 0 : prefixWidth(pre)) + charsWidth(cl.chars),
      };
    }
    return line;
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
      const box = checkboxMarker(item.checked, 'none');
      marker.push({ text: `${box.text} `, color: box.color });
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

// ─── fenced code blocks ─────────────────────────────────────────────────────

// The quiet frame: a dim gutter on every code row, the blockquote's shape
// without its color (color there means "quoted"; here the code keeps its own
// token colors) and without dimming the code behind it. Two cells wide, so the
// bar is the only extra glyph a copy-by-eye has to skip.
const CODE_BAR = '│ ';

// The faint bands behind a diff's changed rows. Dark 24-bit values on purpose:
// the layout is backend-agnostic, so the SAME value has to survive every
// downgrade. These land on the darkest green / red of the xterm cube at 256
// colors and on black at 16 — never on the color of the text in front of them —
// and vanish entirely when color is off (docs/components.md — diff blocks).
const ADDED_BG = '#003b00';
const REMOVED_BG = '#3b0000';

function rowBackground(kind: CodeLineKind): Color | undefined {
  return kind === 'added' ? ADDED_BG : kind === 'removed' ? REMOVED_BG : undefined;
}

/**
 * The source line number to print for each line of a fenced block. Plain
 * 1-based counting, except in a diff: there the rows are numbered the way the
 * patch numbers them, counting from each `@@ -a,b +c,d @@` header — a removed
 * row shows its number in the OLD file, an added or context row its number in
 * the NEW one. A row with no number — a hunk or file header, or anything before
 * the first hunk header — gets `null` and leaves the gutter blank, which is why
 * a diff that carries no hunk header numbers nothing rather than counting 1..n.
 */
function sourceLineNumbers(lines: string[], code: readonly CodeLine[], diff: boolean): (number | null)[] {
  if (!diff) return lines.map((_, i) => i + 1);
  let removed: number | null = null;
  let added: number | null = null;
  return lines.map((line, i) => {
    const kind = code[i]?.kind;
    if (kind === 'hunk') {
      const at = hunkNumbers(line);
      removed = at?.removed ?? null;
      added = at?.added ?? null;
      return null;
    }
    if (kind === 'header') return null;
    if (kind === 'removed') return removed === null ? null : removed++;
    if (kind === 'added') return added === null ? null : added++;
    // A context row exists in both files: it advances both counters.
    if (removed !== null) removed++;
    return added === null ? null : added++;
  });
}

// Split one highlighted code line into rows of at most `width` grid columns
// (see cellWidth). Code keeps its whitespace, so it can't be word-wrapped:
// 'wrap' hard-breaks it, carrying token colors across the break; 'truncate'
// keeps one row and marks the cut with a `…` wearing the style of the text it
// replaced, so a cut string still reads as a string.
function splitCodeChars(chars: StyledChar[], width: number, mode: MarkdownCodeWrap): StyledChar[][] {
  if (charsWidth(chars) <= width) return [chars];
  if (mode === 'truncate') {
    // Keep what fits in width − 1 columns; the ellipsis wears the style of the
    // first cluster it replaced. A wide cluster that would cross the edge is dropped.
    const keep: StyledChar[] = [];
    let w = 0;
    for (const c of chars) {
      const cw = cellWidth(c);
      if (w + cw > Math.max(0, width - 1)) break;
      keep.push(c);
      w += cw;
    }
    return [[...keep, { ch: '…', style: chars[keep.length]!.style }]];
  }
  const rows: StyledChar[][] = [];
  let row: StyledChar[] = [];
  let w = 0;
  for (const c of chars) {
    const cw = cellWidth(c);
    // A row takes at least one cluster, so a glyph wider than the row still moves.
    if (row.length > 0 && w + cw > width) { rows.push(row); row = []; w = 0; }
    row.push(c);
    w += cw;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

// Fill a row out to `width` grid columns with styled spaces — what turns a
// row background into a solid band. A row already at (or over) the width is
// returned untouched: padding never truncates.
function padChars(chars: StyledChar[], width: number, style: SpanStyle): StyledChar[] {
  const free = width - charsWidth(chars);
  if (free <= 0) return chars;
  return [...chars, ...Array.from({ length: free }, () => ({ ch: ' ', style }))];
}

interface CodeBlockSrc { lang: string; title?: string; lines: string[] }

function layoutCode(b: CodeBlockSrc, width: number, opts: MarkdownOptions, out: StyledLine[]): void {
  const bar = (opts.codeFence ?? 'bar') === 'bar';
  // The whole block at once, so a construct that spans lines (a block comment, a
  // triple-quoted string) keeps its state. The RAW label goes in: an unlabeled
  // block is where the highlighter looks for a diff by itself.
  const code = highlightBlock(b.lines, b.lang);
  const detected = b.lang.trim() === '' ? detectLanguage(b.lines) : undefined;
  const isDiff = (b.lang.trim() === '' ? detected : resolveLanguage(b.lang)) === 'diff';
  const numbers = opts.lineNumbers ? sourceLineNumbers(b.lines, code, isDiff) : null;
  const gutter = numbers ? Math.max(1, ...numbers.map((n) => String(n ?? '').length)) : 0;
  const indent = (bar ? CODE_BAR.length : 0) + (numbers ? gutter + 1 : 0);
  // width <= 0 means "unmeasured" for every other block here — keep code on one
  // row per source line rather than inventing a width.
  const avail = width > 0 ? Math.max(1, width - indent) : 0;

  if (bar) {
    // The label replaces the opening fence and shows the word the author wrote
    // (`ts`, not `typescript`). A block that was recognised as a diff without
    // saying so is the one thing the label adds, since the rows are colored as
    // a diff and nothing else on screen would explain why.
    const lang = b.lang || detected || '';
    const label = b.title ? (lang ? `${lang} · ${b.title}` : b.title) : lang;
    // The label is the frame's caption, not a line of the block: chrome from
    // edge to edge, so a copy skips the row instead of pasting a blank line.
    if (label) out.push({ spans: [{ text: label, dim: true }], chrome: 1, frame: true });
  } else {
    // Literal mode prints the fence as written — the author chose to show the
    // backticks, so they are content and a copy keeps them.
    out.push({ spans: [{ text: '```' + b.lang, dim: true }] });
  }

  const prefix = (num: number | null): StyledSpan[] => {
    const spans: StyledSpan[] = [];
    if (bar) spans.push({ text: CODE_BAR, dim: true });
    // A wrapped continuation row carries the gutter's width but no number.
    if (numbers) spans.push({ text: String(num ?? '').padStart(gutter) + ' ', dim: true });
    return spans;
  };

  // Rows first, then the cap: `maxCodeRows` counts RENDERED rows, while the
  // "N more lines" it prints counts SOURCE lines, so each row remembers where
  // it came from.
  const bands = opts.diffBackground ?? true;
  // The gutter — the bar, the line numbers, or both — is the block's frame, so
  // every row of it carries the same `chrome` count. A diff's `+`/`-` column is
  // NOT in it: that one is content, or a copied diff would no longer apply.
  const rows: {
    spans: StyledSpan[]; src: number; chrome: number;
    continues?: string; textStart?: number; textWidth?: number;
  }[] = [];
  b.lines.forEach((_cl, si) => {
    const hl = code[si]!;
    const background = bands ? rowBackground(hl.kind) : undefined;
    const chars: StyledChar[] = hl.segs.flatMap((cs) => graphemes(cs.text).map((ch) => ({
      ch,
      style: { color: cs.color, dim: cs.dim, bold: cs.bold, background },
    })));
    const pieces = avail > 0 ? splitCodeChars(chars, avail, opts.codeWrap ?? 'wrap') : [chars];
    pieces.forEach((pc, pi) => {
      // A band has to be a solid bar: pad the row out to the code width so a
      // short line — and every wrapped continuation row — ends flush.
      const body = background === undefined ? pc : padChars(pc, avail, { background });
      const pre = prefix(pi === 0 ? numbers?.[si] ?? null : null);
      // A wrapped code row is one source line cut in two, so it joins with
      // nothing. The gutter in front of it is chrome and out of the selection,
      // so the join splices nothing into the line.
      const carries = pi < pieces.length - 1;
      rows.push({
        spans: [...pre, ...charsToSpans(body)],
        src: si,
        chrome: pre.length,
        // The code starts past the gutter, and the band pads `body` out to the
        // code width: the span is the text between the two.
        ...(carries
          ? { continues: '', textStart: prefixWidth(pre), textWidth: charsWidth(pc) }
          : {}),
      });
    });
  });

  const max = opts.maxCodeRows;
  const capped = max !== undefined && max >= 0 && rows.length > max;
  const shown = capped ? rows.slice(0, max) : rows;
  for (const [i, r] of shown.entries()) {
    // The last shown row of a capped block runs into the "… N more lines"
    // notice, which is not its continuation.
    const carries = r.continues !== undefined && i < shown.length - 1;
    out.push({
      spans: r.spans,
      ...(r.chrome > 0 ? { chrome: r.chrome } : {}),
      ...(carries
        ? {
            continues: {
              dropped: r.continues!,
              ...(r.textStart ? { textStart: r.textStart } : {}),
              textWidth: r.textWidth ?? 0,
            },
          }
        : {}),
    });
  }
  if (capped) {
    // A source line with at least one row on screen counts as shown. The notice
    // is the frame speaking, not the block: chrome, whole row.
    const hidden = b.lines.length - ((shown[shown.length - 1]?.src ?? -1) + 1);
    const pre = prefix(null);
    out.push({
      spans: [...pre, { text: `… ${hidden} more line${hidden === 1 ? '' : 's'}`, dim: true }],
      chrome: pre.length + 1,
      frame: true,
    });
  }
  if (!bar) out.push({ spans: [{ text: '```', dim: true }] });
}

/**
 * Lay out markdown `src` into styled visual lines fitting `width` cells. The
 * result is paginatable by simple row slicing. Style mapping (no italic in the
 * terminal cell model): **bold**→bold, *emphasis*→underline, `code`→cyan,
 * [links]→blue underline, images→dim alt text, headings→bold + level color,
 * blockquotes→`│ ` gutter + dim, fenced code→a dim label row over a dim `│ `
 * gutter with per-language token colors, nested lists→indented under the parent
 * item's text, tables→padded columns with a bold header over a dim rule.
 *
 * Use {@link layoutMarkdownDetailed} when the caller also needs the document's
 * fenced blocks (to offer "copy this block", say).
 */
export function layoutMarkdown(src: string, width: number, options: MarkdownOptions = {}): StyledLine[] {
  return layoutMarkdownDetailed(src, width, options).lines;
}

/** {@link layoutMarkdown}'s rows plus one descriptor per fenced code block. */
export interface MarkdownLayout {
  lines: StyledLine[];
  codeBlocks: MarkdownCodeBlock[];
}

/**
 * Lay markdown out exactly as {@link layoutMarkdown} does, and additionally
 * report every fenced block: its language, title, raw source and the half-open
 * range of output rows it occupies (label row included). The reported source is
 * the block as written — no gutter, no wrapping, no `maxCodeRows` cap — so a
 * host can hand it straight to a clipboard.
 */
export function layoutMarkdownDetailed(
  src: string,
  width: number,
  options: MarkdownOptions = {},
): MarkdownLayout {
  const blocks = parseMarkdown(src);
  const out: StyledLine[] = [];
  const codeBlocks: MarkdownCodeBlock[] = [];
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
        // The bar says "quoted"; the author wrote `> `. It is frame, so a copy
        // of a quoted paragraph comes back as the paragraph.
        out.push(...wrapBlock(b.segs, width, {
          first: bar, cont: bar, base: { dim: true }, chromePrefix: true,
        }));
        break;
      }
      case 'list':
        layoutList(b, width, 0, out);
        break;
      case 'table':
        layoutTable(b.align, b.header, b.rows, width, out);
        break;
      case 'code': {
        // The spacer above belongs to neither neighbour: the block starts here.
        const startLine = out.length;
        layoutCode(b, width, options, out);
        codeBlocks.push({
          lang: b.lang,
          ...(b.title === undefined ? {} : { title: b.title }),
          source: b.lines.join('\n'),
          startLine,
          endLine: out.length,
          closed: b.closed,
        });
        break;
      }
      case 'hr':
        out.push({ spans: [{ text: '─'.repeat(Math.max(1, width)), dim: true }] });
        break;
    }
  }
  return { lines: out, codeBlocks };
}
