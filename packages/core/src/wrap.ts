import { fitClusters, graphemes, stringWidth } from './graphemes.js';

export type WrapMode = 'wrap' | 'truncate' | 'none';

const ELLIPSIS = '…';

/**
 * One display line, and how it joins to the line below when both came out of
 * the SAME source line.
 *
 * `continues` is absent on the last line of a source line — the break after it
 * was a `\n` the author wrote, or there is nothing after it at all. Otherwise it
 * is exactly the text the wrap dropped at the break, which is what putting the
 * source back together needs:
 *
 *  - `''`    — the break cut through a word longer than the line; nothing was
 *              dropped, the two lines run straight into each other.
 *  - `' '`   — the break landed at a word boundary and ate the space there.
 *  - `'   '` — it ate a run of them. `text` keeps whatever spaces still fitted,
 *              so line + `continues` + next line is the source, character for
 *              character.
 *
 * Only `'wrap'` mode produces any of it: `'truncate'` throws content away and
 * `'none'` keeps each source line whole, so neither ever continues.
 */
export interface WrappedLine {
  text: string;
  continues?: string;
}

/**
 * Lay out `text` into display lines fitting within `width` cells.
 * Widths are display columns (`stringWidth`); a wide cluster is never split at a break.
 *
 *  - 'wrap'     — word-wrap at spaces; any single word longer than width is char-wrapped.
 *  - 'truncate' — each source line truncated to width, with `…` in the last cell when truncated.
 *  - 'none'     — each source line preserved unchanged (caller is responsible for overflow).
 *
 * Always returns at least one line (empty input → `['']`, matching measureText's height=1 default).
 */
export function wrapText(text: string, width: number, mode: WrapMode): string[] {
  return wrapTextLines(text, width, mode).map((line) => line.text);
}

/**
 * {@link wrapText}, with each line also saying how it joins to the next one —
 * see {@link WrappedLine}. The painter records those joins on the frame so a
 * drag-selection over a wrapped paragraph copies it back as one line rather
 * than broken at the wrap column (see docs/input.md, selection).
 */
export function wrapTextLines(text: string, width: number, mode: WrapMode): WrappedLine[] {
  if (width < 0) width = 0;
  const out: WrappedLine[] = [];

  for (const source of text.split('\n')) {
    if (mode === 'none') {
      out.push({ text: source });
      continue;
    }
    if (mode === 'truncate') {
      out.push({ text: truncateLine(source, width) });
      continue;
    }
    // mode === 'wrap'
    const before = out.length;
    wrapLine(source, width, out);
    // Whatever the wrap did inside this source line, the break after its LAST
    // line is the `\n` the author wrote (or the end of the text) — never a soft
    // wrap. A source line ending in a space leaves `wrapLine` mid-break, and
    // carrying that mark across the newline would paste the two lines as one.
    const last = out[out.length - 1];
    if (last !== undefined && out.length > before) delete last.continues;
    recordDropped(source, out, before);
  }

  if (out.length === 0) out.push({ text: '' });
  return out;
}

function truncateLine(line: string, width: number): string {
  if (width <= 0) return '';
  if (stringWidth(line) <= width) return line;
  // Content was cut — always signal it with the ellipsis in the last cell, even
  // when the cut lands on a word boundary (a space). Otherwise the truncation is
  // invisible (e.g. "hello world"/5 would silently render as "hello").
  if (width === 1) return ELLIPSIS;
  const clusters = graphemes(line);
  // A wide cluster that would not fit before the ellipsis is dropped: the line
  // comes out a column short rather than torn.
  return clusters.slice(0, fitClusters(clusters, width - 1)).join('') + ELLIPSIS;
}

/**
 * What the wrap dropped between each pair of lines it produced for one source
 * line. Only spaces are ever dropped, and only at a break, so every line is a
 * contiguous slice of the source in order: walking the lines back through it
 * recovers the gaps exactly — one space, or the whole run of them a break fell
 * in the middle of. (The greedy pass below joins words with a single space and
 * so cannot count the run itself.)
 *
 * Lines the pass did not mark are left alone: that is where a source line ends.
 */
function recordDropped(source: string, lines: WrappedLine[], from: number): void {
  let pos = 0;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i]!;
    const at = source.indexOf(line.text, pos);
    // Unreachable while the pass only drops spaces; leaves the marks as it set
    // them rather than inventing a join.
    if (at < 0) return;
    const prev = i > from ? lines[i - 1]! : undefined;
    if (prev?.continues !== undefined) prev.continues = source.slice(pos, at);
    pos = at + line.text.length;
  }
}

function wrapLine(line: string, width: number, out: WrappedLine[]): void {
  if (width === 0) { out.push({ text: '' }); return; }
  if (line === '') { out.push({ text: '' }); return; }

  // Every push but the last of this source line carries what the break that
  // ended it dropped — the one fact `wrapText` used to throw away. The value
  // here is the shape of the break; `recordDropped` widens it to what was
  // actually eaten.
  const push = (text: string, continues: string): void => { out.push({ text, continues }); };

  let current = '';
  let currentWidth = 0;
  for (const word of line.split(' ')) {
    const wordWidth = stringWidth(word);
    const candidateWidth = current ? currentWidth + 1 + wordWidth : wordWidth;
    if (candidateWidth <= width) {
      current = current ? current + ' ' + word : word;
      currentWidth = candidateWidth;
      continue;
    }
    // The line ends here and `word` starts the next one: the space between them
    // is what the wrap dropped.
    if (current) { push(current, ' '); current = ''; currentWidth = 0; }
    if (wordWidth > width) {
      const clusters = graphemes(word);
      let at = 0;
      while (at < clusters.length) {
        // As many clusters as fit, but at least one: a cluster wider than the
        // whole line still has to move. A wide cluster that does not fit
        // starts the next piece whole.
        const take = Math.max(1, fitClusters(clusters, width, at));
        const piece = clusters.slice(at, at + take).join('');
        at += take;
        // A cut through the middle of a word — nothing was dropped at all.
        if (at < clusters.length) push(piece, '');
        else { current = piece; currentWidth = stringWidth(piece); }
      }
    } else {
      current = word;
      currentWidth = wordWidth;
    }
  }
  if (current) out.push({ text: current });
}
