import { fitClusters, graphemes, stringWidth } from './graphemes.js';

/**
 * Split a multi-line source text into visual lines for paginated rendering
 * with an optional line-number gutter.
 *
 * - 'nowrap': one visual line per source line (caller is responsible for
 *   horizontal clipping — typically via wrap='truncate' on the rendering Box).
 * - 'wrap':   source lines longer than `width` are hard-wrapped at the cell
 *   boundary; continuation visual-lines carry `lineNum: null` so the gutter
 *   stays blank for them and only the first visual line shows the source line
 *   number.
 *
 * Width is in display columns (`stringWidth`); a wide cluster is never split.
 *
 * Typical use:
 * ```ts
 * const lines = splitVisualLines(bodyText, wrapMode, effectiveBodyWidth);
 * const page  = lines.slice(pageIdx * pageH, (pageIdx + 1) * pageH);
 * page.map(({ text, lineNum }) => ...);
 * ```
 */

export interface VisualLine {
  text: string;
  /** Source-file line number for the first visual line of a wrapped source line; null for continuation lines. 1-based. */
  lineNum: number | null;
}

export function splitVisualLines(
  text: string,
  mode: 'wrap' | 'nowrap',
  width: number,
): VisualLine[] {
  const sources = text.split('\n');
  if (mode === 'nowrap' || width <= 0) {
    return sources.map((line, i) => ({ text: line, lineNum: i + 1 }));
  }
  const out: VisualLine[] = [];
  for (let i = 0; i < sources.length; i++) {
    const line = sources[i]!;
    if (stringWidth(line) <= width) {
      out.push({ text: line, lineNum: i + 1 });
      continue;
    }
    const clusters = graphemes(line);
    let first = true;
    let at = 0;
    while (at < clusters.length) {
      const take = Math.max(1, fitClusters(clusters, width, at));
      out.push({ text: clusters.slice(at, at + take).join(''), lineNum: first ? i + 1 : null });
      at += take;
      first = false;
    }
  }
  return out;
}
