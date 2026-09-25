// Grapheme clusters and their display width — the two units of the cell grid.
// A cell holds one cluster (a base plus its combining marks, a flag's two
// regional indicators, an emoji with its skin tone or ZWJ sequence); the
// cluster occupies 1 or 2 columns. See docs/terminal.md (display width).
//
// Segmentation is `Intl.Segmenter`, a runtime built-in (no dependency). Text
// with nothing at or above U+0300 — all Latin and Cyrillic — has no combining
// marks, no wide glyphs and no multi-unit clusters, so it skips the segmenter:
// each UTF-16 unit is its own width-1 character.
import { charWidth } from './displayWidth.js';

const NEEDS_SEGMENTER = /[\u0300-\uffff]/;
const VS16 = 0xfe0f;
// Zero-width by the table, but a column on a terminal that measures per code
// point (observed on macOS Terminal.app): the format characters ZWSP..RLM and
// WJ..invisible operators, and the enclosing marks (the keycap U+20E3 among
// them). Under the 'codepoint' policy each is a cell of its own.
function takesColumnAlone(cp: number): boolean {
  return (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x2060 && cp <= 0x2064) || (cp >= 0x20dd && cp <= 0x20e4);
}

/**
 * How the grid cuts text into cells. `'cluster'` (the default) is a grapheme
 * cluster per cell, the width of its widest part — what most terminals draw.
 * `'codepoint'` is one code point per cell with the zero-width code points
 * after it (a combining mark, ZWJ, VS16) glued on — what a terminal that
 * measures per code point (macOS Terminal.app) advances by: a skin-tone or
 * ZWJ emoji takes two cells of two columns (plus one for the joiner), a VS16
 * sequence one column. A backend sets it for the terminal it drives; see
 * docs/terminal.md (display width).
 */
export type WidthPolicy = 'cluster' | 'codepoint';

let policy: WidthPolicy = 'cluster';

/** Set the width policy; every measurement from here on follows it. */
export function setWidthPolicy(next: WidthPolicy): void {
  policy = next;
}

/** The width policy in force. */
export function widthPolicy(): WidthPolicy {
  return policy;
}
// Regional indicators are East Asian Neutral (width 1 alone); a pair of them
// is a flag, which terminals draw as one emoji of two columns.
const isRegionalIndicator = (cp: number): boolean => cp >= 0x1f1e6 && cp <= 0x1f1ff;

let segmenter: Intl.Segmenter | null = null;
function segments(text: string): Intl.Segments {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return segmenter.segment(text);
}

/** `text` as cells, in order: grapheme clusters, or code points with their zero-width followers under the `'codepoint'` policy. */
export function graphemes(text: string): string[] {
  if (!NEEDS_SEGMENTER.test(text)) return text.split('');
  const out: string[] = [];
  if (policy === 'codepoint') {
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (out.length > 0 && charWidth(cp) === 0 && !isControl(cp) && !takesColumnAlone(cp)) out[out.length - 1] += ch;
      else out.push(ch);
    }
    return out;
  }
  for (const { segment } of segments(text)) out.push(segment);
  return out;
}

// C0, DEL and C1 have no glyph; paint substitutes a space, so they take a column.
function isControl(cp: number): boolean {
  return cp < 0x20 || (cp >= 0x7f && cp < 0xa0);
}

/**
 * Display columns of one cluster: 2 for East Asian Wide / Fullwidth and emoji
 * presentation, 0 for a lone zero-width mark, 1 otherwise. The width of a
 * multi-code-point cluster is the widest of its parts; a VS16 turns a narrow
 * base into an emoji (2), and a pair of regional indicators is a flag (2). A
 * terminal that does not join a sequence draws it wider than this says — the
 * known remainder, see docs/terminal.md.
 */
export function clusterWidth(cluster: string): 0 | 1 | 2 {
  if (cluster.length === 0) return 0;
  if (cluster.length === 1 && cluster.charCodeAt(0) < 0x300) return 1;
  if (policy === 'codepoint') {
    // The base decides; its glued followers (combining marks, VS16) add nothing.
    const base = cluster.codePointAt(0)!;
    return isControl(base) || takesColumnAlone(base) ? 1 : charWidth(base);
  }
  let width: 0 | 1 | 2 = 0;
  let vs16 = false;
  let indicators = 0;
  for (const ch of cluster) {
    const cp = ch.codePointAt(0)!;
    if (cp === VS16) { vs16 = true; continue; }
    if (isRegionalIndicator(cp) && ++indicators === 2) return 2;
    const w = isControl(cp) ? 1 : charWidth(cp);
    if (w > width) width = w;
  }
  return vs16 && width === 1 ? 2 : width;
}

/** Display columns of `text`: the sum of its clusters' widths. Plain text only — styling lives in the cell, not the string. */
export function stringWidth(text: string): number {
  if (!NEEDS_SEGMENTER.test(text)) return text.length;
  let w = 0;
  for (const g of graphemes(text)) w += clusterWidth(g);
  return w;
}

/**
 * How many of `clusters`, from index `from`, fit in `width` columns. A wide
 * cluster that would cross the edge does not fit, so the count can be 0 even
 * with room for one column: the caller decides whether to force progress.
 */
export function fitClusters(clusters: readonly string[], width: number, from = 0): number {
  let n = 0;
  let w = 0;
  for (let i = from; i < clusters.length; i++) {
    const cw = clusterWidth(clusters[i]!);
    if (w + cw > width) break;
    w += cw;
    n++;
  }
  return n;
}

/** UTF-16 index of the end of the cluster containing `i` (`i` on a boundary: the end of the cluster starting there). */
export function nextGrapheme(value: string, i: number): number {
  if (i >= value.length) return value.length;
  if (!NEEDS_SEGMENTER.test(value)) return i + 1;
  if (policy === 'codepoint') {
    let at = 0;
    for (const cell of graphemes(value)) {
      const end = at + cell.length;
      if (i < end) return end;
      at = end;
    }
    return value.length;
  }
  const seg = segments(value).containing(i)!;
  return seg.index + seg.segment.length;
}

/** UTF-16 index of the start of the cluster before `i` (`i` inside a cluster: that cluster's start). */
export function prevGrapheme(value: string, i: number): number {
  if (i <= 0) return 0;
  if (!NEEDS_SEGMENTER.test(value)) return i - 1;
  if (policy === 'codepoint') {
    let at = 0;
    for (const cell of graphemes(value)) {
      const end = at + cell.length;
      if (i - 1 < end) return at;
      at = end;
    }
    return 0;
  }
  return segments(value).containing(i - 1)!.index;
}
