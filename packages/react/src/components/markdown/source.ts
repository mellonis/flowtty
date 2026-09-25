import { clusterWidth, graphemes } from '@flowtty/core';
// Markdown SOURCE highlighter — the counterpart to layout.ts. Where
// layoutMarkdown *renders* markdown (consuming markers, e.g. `**x**` → bold
// "x"), this colors the raw source while keeping every character intact, the
// way a code editor highlights a .md file. Used by the articles example's "raw"
// view so the source stays readable AND legible at a glance.
//
// It is faithful to the bytes: no word-collapsing. Wrapping (when enabled) is a
// hard char-wrap at `width`, so indentation and runs of spaces survive.

import { parseFenceInfo } from './parse.js';
import { highlightBlock, type CodeLine } from './highlight/index.js';
import { charsToSpans, type SpanStyle, type StyledChar, type StyledSpan } from './layout.js';

/** One visual row of highlighted source. `lineNum` is the 1-based source line
 *  for the first fragment of a wrapped line; continuation fragments carry null. */
export interface SourceLine {
  lineNum: number | null;
  spans: StyledSpan[];
}

// Mirror of the block detectors in parse.ts — duplicated here (rather than
// widening parse.ts's exports with regex internals) because the source view
// must classify lines while preserving their literal text.
const HEADING_RE = /^(#{1,6})(\s.*)?$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
// Must accept exactly the lines parse.ts calls a fence — an info string with a
// title (``` ```ts title="src/app.ts" ```) included — or the source view would
// never enter code state and would mis-highlight the rest of the file. This view
// keeps the simpler "any fence toggles" rule: it shows a .md file as written,
// and nested fences of different lengths are rare in prose.
const FENCE_RE = /^(`{3,}|~{3,})[ \t]*(.*)$/;
const QUOTE_RE = /^(\s*>\s?)(.*)$/;
const LIST_RE = /^(\s*(?:[-*+]|\d+\.)\s+)(.*)$/;

// Inline markers, markers KEPT (unlike parse.ts which strips them).
// code | ![alt](src) | **bold** | *emphasis* | [text](url)
const INLINE_RE = /(`[^`]+`)|(!\[[^\]]*\]\([^)]*\))|(\*\*[\s\S]+?\*\*)|(\*[\s\S]+?\*)|(\[[^\]]+\]\([^)]*\))/g;
const LINK_RE = /^\[([^\]]+)\]\(([^)]*)\)$/;

function headingColor(level: number): string {
  return level <= 1 ? 'magenta' : level === 2 ? 'cyan' : 'blue';
}

function pushText(out: StyledChar[], text: string, style: SpanStyle): void {
  for (const ch of graphemes(text)) out.push({ ch, style });
}

// Inline highlighter that KEEPS the markdown markers, dimming them so the
// structure is visible while the content carries its emphasis style. `base` is
// the surrounding style (e.g. a heading's bold+color) applied to plain runs.
function inlineSourceChars(text: string, base: SpanStyle): StyledChar[] {
  const out: StyledChar[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) pushText(out, text.slice(last, idx), base);
    const tok = m[0];
    if (m[1]) pushText(out, tok, { color: 'cyan' });                       // `code`
    else if (m[2]) pushText(out, tok, { dim: true });                      // ![img]()
    else if (m[3]) {                                                       // **bold**
      pushText(out, '**', { dim: true });
      pushText(out, tok.slice(2, -2), { ...base, bold: true });
      pushText(out, '**', { dim: true });
    } else if (m[4]) {                                                     // *emphasis*
      pushText(out, '*', { dim: true });
      pushText(out, tok.slice(1, -1), { ...base, underline: true });
      pushText(out, '*', { dim: true });
    } else {                                                              // [text](url)
      const lm = LINK_RE.exec(tok);
      if (lm) {
        pushText(out, '[', { dim: true });
        pushText(out, lm[1]!, { color: 'blue', underline: true, link: lm[2]! });
        pushText(out, '](', { dim: true });
        pushText(out, lm[2]!, { dim: true });
        pushText(out, ')', { dim: true });
      } else {
        pushText(out, tok, base);
      }
    }
    last = idx + tok.length;
  }
  if (last < text.length) pushText(out, text.slice(last), base);
  return out;
}

// Highlight every fenced block of the document in one pass, so a construct that
// spans lines keeps its state, and index the result BY SOURCE LINE — the view
// itself walks the file one line at a time. A line outside any block is absent
// from the result. The block boundaries follow this view's simpler rule: any
// fence toggles, so a fence line is never inside a block.
function fencedCodeLines(lines: string[]): (CodeLine | undefined)[] {
  const out: (CodeLine | undefined)[] = new Array(lines.length).fill(undefined);
  let i = 0;
  while (i < lines.length) {
    const fence = FENCE_RE.exec(lines[i]!);
    if (!fence) { i++; continue; }
    const lang = parseFenceInfo(fence[2] ?? '').lang;
    const start = i + 1;
    let end = start;
    while (end < lines.length && !FENCE_RE.test(lines[end]!)) end++;
    highlightBlock(lines.slice(start, end), lang).forEach((cl, k) => { out[start + k] = cl; });
    i = end + 1; // past the closing fence, which styles as a fence in its own right
  }
  return out;
}

// Style one full source line into chars. `code` is the line's highlighting when
// it sits inside a fenced block.
function lineToChars(line: string, code: CodeLine | undefined): StyledChar[] {
  if (code) {
    const out: StyledChar[] = [];
    for (const cs of code.segs) pushText(out, cs.text, { color: cs.color, dim: cs.dim, bold: cs.bold });
    return out;
  }
  if (FENCE_RE.test(line)) {
    const out: StyledChar[] = [];
    pushText(out, line, { dim: true });
    return out;
  }
  const heading = HEADING_RE.exec(line);
  if (heading) {
    const level = heading[1]!.length;
    const out: StyledChar[] = [];
    pushText(out, heading[1]!, { dim: true });
    if (heading[2]) out.push(...inlineSourceChars(heading[2], { bold: true, color: headingColor(level) }));
    return out;
  }
  if (HR_RE.test(line)) {
    const out: StyledChar[] = [];
    pushText(out, line, { dim: true });
    return out;
  }
  const quote = QUOTE_RE.exec(line);
  if (quote) {
    const out: StyledChar[] = [];
    pushText(out, quote[1]!, { dim: true, color: 'cyan' });
    out.push(...inlineSourceChars(quote[2]!, { dim: true }));
    return out;
  }
  const list = LIST_RE.exec(line);
  if (list) {
    const out: StyledChar[] = [];
    pushText(out, list[1]!, { color: 'yellow' });
    out.push(...inlineSourceChars(list[2]!, {}));
    return out;
  }
  return inlineSourceChars(line, {});
}

// Hard wrap by display column, preserving every cluster and never splitting a
// wide one (a row takes at least one, so a glyph wider than the row still
// moves). width<=0 → no wrap.
function hardWrap(chars: StyledChar[], width: number): StyledChar[][] {
  if (width <= 0) return [chars];
  const lines: StyledChar[][] = [];
  let row: StyledChar[] = [];
  let w = 0;
  for (const c of chars) {
    const cw = clusterWidth(c.ch);
    if (row.length > 0 && w + cw > width) { lines.push(row); row = []; w = 0; }
    row.push(c);
    w += cw;
  }
  if (row.length > 0 || lines.length === 0) lines.push(row);
  return lines;
}

/**
 * Highlight markdown `src` AS SOURCE into visual lines fitting `width` cells.
 * `wrap` true hard-wraps over-long lines (continuation rows carry lineNum null);
 * false emits one row per source line (host clips the overflow). Blank source
 * lines become rows with empty spans. The result paginates by row slicing, same
 * as layoutMarkdown / splitVisualLines.
 */
export function highlightMarkdownSource(src: string, width: number, wrap: boolean): SourceLine[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const code = fencedCodeLines(lines);
  const out: SourceLine[] = [];

  lines.forEach((line, idx) => {
    const chars = lineToChars(line, code[idx]);
    const visual = wrap ? hardWrap(chars, width) : [chars];
    visual.forEach((vc, i) => {
      out.push({ lineNum: i === 0 ? idx + 1 : null, spans: charsToSpans(vc) });
    });
  });
  return out;
}
