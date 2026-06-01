// Markdown SOURCE highlighter — the counterpart to layout.ts. Where
// layoutMarkdown *renders* markdown (consuming markers, e.g. `**x**` → bold
// "x"), this colors the raw source while keeping every character intact, the
// way a code editor highlights a .md file. A raw-source view consumes it so the source stays readable AND legible at a glance.
//
// It is faithful to the bytes: no word-collapsing. Wrapping (when enabled) is a
// hard char-wrap at `width`, so indentation and runs of spaces survive.

import { highlightCode } from './parse.js';
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
const FENCE_RE = /^(```|~~~)\s*([\w-]*)\s*$/;
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
  for (const ch of [...text]) out.push({ ch, style });
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

// Style one full source line into chars, given the running fenced-code state.
function lineToChars(line: string, inCode: boolean, codeLang: string): StyledChar[] {
  if (FENCE_RE.test(line)) {
    const out: StyledChar[] = [];
    pushText(out, line, { dim: true });
    return out;
  }
  if (inCode) {
    const out: StyledChar[] = [];
    for (const cs of highlightCode(line, codeLang)) {
      pushText(out, cs.text, { color: cs.color, dim: cs.dim });
    }
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

// Hard char-wrap preserving every cell. width<=0 → no wrap.
function hardWrap(chars: StyledChar[], width: number): StyledChar[][] {
  if (width <= 0 || chars.length <= width) return [chars];
  const lines: StyledChar[][] = [];
  for (let i = 0; i < chars.length; i += width) lines.push(chars.slice(i, i + width));
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
  const out: SourceLine[] = [];
  let inCode = false;
  let codeLang = '';

  lines.forEach((line, idx) => {
    const chars = lineToChars(line, inCode, codeLang);
    // Toggle fence state AFTER styling this line (the fence line itself is dim).
    const fence = FENCE_RE.exec(line);
    if (fence) {
      if (inCode) { inCode = false; codeLang = ''; }
      else { inCode = true; codeLang = fence[2] ?? ''; }
    }
    const visual = wrap ? hardWrap(chars, width) : [chars];
    visual.forEach((vc, i) => {
      out.push({ lineNum: i === 0 ? idx + 1 : null, spans: charsToSpans(vc) });
    });
  });
  return out;
}
