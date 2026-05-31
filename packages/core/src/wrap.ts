export type WrapMode = 'wrap' | 'truncate' | 'none';

const ELLIPSIS = '…';

/**
 * Lay out `text` into display lines fitting within `width` cells.
 * Assumes 1 code point = 1 cell (no CJK/emoji width awareness in M1d).
 *
 *  - 'wrap'     — word-wrap at spaces; any single word longer than width is char-wrapped.
 *  - 'truncate' — each source line truncated to width, with `…` in the last cell when truncated.
 *  - 'none'     — each source line preserved unchanged (caller is responsible for overflow).
 *
 * Always returns at least one line (empty input → `['']`, matching measureText's height=1 default).
 */
export function wrapText(text: string, width: number, mode: WrapMode): string[] {
  if (width < 0) width = 0;
  const out: string[] = [];

  for (const source of text.split('\n')) {
    if (mode === 'none') {
      out.push(source);
      continue;
    }
    if (mode === 'truncate') {
      out.push(truncateLine(source, width));
      continue;
    }
    // mode === 'wrap'
    wrapLine(source, width, out);
  }

  if (out.length === 0) out.push('');
  return out;
}

function truncateLine(line: string, width: number): string {
  if (width <= 0) return '';
  const chars = [...line];
  if (chars.length <= width) return line;
  if (chars[width] === ' ') return chars.slice(0, width).join('');
  if (width === 1) return ELLIPSIS;
  return chars.slice(0, width - 1).join('') + ELLIPSIS;
}

function wrapLine(line: string, width: number, out: string[]): void {
  if (width === 0) { out.push(''); return; }
  if (line === '') { out.push(''); return; }

  let current = '';
  for (const word of line.split(' ')) {
    const candidate = current ? current + ' ' + word : word;
    if ([...candidate].length <= width) {
      current = candidate;
      continue;
    }
    if (current) { out.push(current); current = ''; }
    if ([...word].length > width) {
      let remainder = [...word];
      while (remainder.length > width) {
        out.push(remainder.slice(0, width).join(''));
        remainder = remainder.slice(width);
      }
      current = remainder.join('');
    } else {
      current = word;
    }
  }
  if (current) out.push(current);
  if (out.length === 0) out.push('');
}
