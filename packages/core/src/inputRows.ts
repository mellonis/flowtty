// Geometry of a multi-line text field: how a value breaks into visual rows at a
// given width, and where the caret sits among them. Pure, shared by the editor
// reducer (up/down movement) and by whatever renders the field.
//
// Units: `cursor` and `InputRow.start` are UTF-16 indices into the value (so
// `value.slice(0, cursor)` works), while widths and the caret's `col` are
// display COLUMNS (`stringWidth`) — the grid's unit. Rows break by cluster, so
// a wide cluster (an ideograph, an emoji with its modifiers) is never split
// across rows; one that does not fit the row's last column moves whole to the
// next row. A cursor is always on a cluster boundary (the editor keeps it so).
// Caret rules:
//  - at the end of a line that is followed by a line break, it stays on that line;
//  - on a blank line it has a row to stand on;
//  - at a soft wrap it opens the next row (col 0), never trails off the full one;
//  - at the very end of a line that exactly fills the width there IS no next row
//    yet, so one is added for it — pass `cursor` to inputRows to get that row.

import { clusterWidth, fitClusters, graphemes, stringWidth } from './graphemes.js';

export interface InputRow {
  /** Text of this visual row (no line break). */
  text: string;
  /** Index into the value where this row starts. */
  start: number;
  /** True for a soft-wrap continuation of the previous row's source line. */
  continuation: boolean;
}

export function inputRows(value: string, width: number, cursor?: number): InputRow[] {
  const w = Math.max(1, Math.floor(width));
  const rows: InputRow[] = [];
  let lineStart = 0;
  for (const line of value.split('\n')) {
    const clusters = graphemes(line);
    if (clusters.length === 0) {
      rows.push({ text: '', start: lineStart, continuation: false });
    } else {
      let start = lineStart;
      let at = 0;
      let lastRowFull = false;
      while (at < clusters.length) {
        const take = Math.max(1, fitClusters(clusters, w, at));
        const text = clusters.slice(at, at + take).join('');
        rows.push({ text, start, continuation: at > 0 });
        start += text.length;
        at += take;
        lastRowFull = stringWidth(text) >= w;
      }
      // The caret parked after a line that exactly fills its last row needs a row.
      if (cursor === lineStart + line.length && lastRowFull) {
        rows.push({ text: '', start: cursor, continuation: true });
      }
    }
    lineStart += line.length + 1;
  }
  return rows;
}

/** UTF-16 index of display column `col` within `row` (clamped to its end). A column inside a wide cluster resolves to after it. */
export function rowIndexAt(row: InputRow, col: number): number {
  let width = 0;
  let index = row.start;
  for (const g of graphemes(row.text)) {
    if (width >= col) break;
    width += clusterWidth(g);
    index += g.length;
  }
  return index;
}

export function caretPosition(value: string, cursor: number, width: number): { row: number; col: number } {
  const c = Math.max(0, Math.min(value.length, cursor));
  const rows = inputRows(value, width, c);
  // The LAST row that starts at or before the caret and can hold it. Scanning
  // from the end makes a soft-wrap boundary resolve to the next row's col 0.
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r]!;
    if (row.start <= c && c <= row.start + row.text.length) {
      return { row: r, col: stringWidth(value.slice(row.start, c)) };
    }
  }
  return { row: 0, col: 0 };
}
