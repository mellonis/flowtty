// Geometry of a multi-line text field: how a value breaks into visual rows at a
// given width, and where the caret sits among them. Pure, shared by the editor
// reducer (up/down movement) and by whatever renders the field.
//
// Units: `cursor` and `InputRow.start` are UTF-16 indices into the value (so
// `value.slice(0, cursor)` works), while widths and the caret's `col` are
// display COLUMNS (`stringWidth`) — the grid's unit. Rows break at words, the
// way the output prints them, but keep what was typed: only a word wider than
// the width is cut, at clusters, and a wide cluster (an ideograph, an emoji
// with its modifiers) is never split across rows. A cursor is always on a
// cluster boundary (the editor keeps it so).
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

// One source line broken at words, the positions kept true to the source. The
// breaks are the ones the output wrap makes, but what a row SHOWS is what was
// typed: a source line's leading run of spaces is content (the break before it
// is the author's `\n`), and a run of spaces within the line stays with the rows
// as far as it fits, the rest belonging to the break before the next row.
//
// Every row's text is a contiguous slice of the source starting at `start`, so
// the spaces a break swallowed are exactly `next.start − (start + text.length)`
// — a copy that joins rows with those gaps rejoins the line as typed. A word
// wider than the width is cut at clusters and a wide cluster is never split.
function wrapLineRows(line: string, width: number): InputRow[] {
  if (line === '') return [{ text: '', start: 0, continuation: false }];
  const rows: InputRow[] = [];
  let current: string | undefined;
  let currentWidth = 0;
  let rowStart = 0;
  // A soft break drops the run of spaces it lands in: their empties go with the
  // break and the next word opens its row bare (2026-11-22).
  let droppedRun = false;
  let pos = 0;
  const words = line.split(' ');
  for (const [index, word] of words.entries()) {
    const wordWidth = stringWidth(word);
    const wordStart = pos;
    pos += word.length + 1;
    if (droppedRun && word === '') continue;
    if (current !== undefined) {
      const candidateWidth = currentWidth + 1 + wordWidth;
      if (candidateWidth <= width) {
        current = current + ' ' + word;
        currentWidth = candidateWidth;
        continue;
      }
      rows.push({ text: current, start: rowStart, continuation: rows.length > 0 });
      current = undefined;
      currentWidth = 0;
      droppedRun = true;
      // The overflow is itself a space of the run: it goes with the break.
      if (word === '') continue;
      droppedRun = false;
    }
    // A fresh row opens with the word bare, empty at the line's own start —
    // or hard-cut, a word wider than the width.
    if (index === 0 || word !== '') {
      if (wordWidth > width) {
        const clusters = graphemes(word);
        let at = 0;
        let pieceStart = wordStart;
        while (at < clusters.length) {
          const take = Math.max(1, fitClusters(clusters, width, at));
          const piece = clusters.slice(at, at + take).join('');
          at += take;
          if (at < clusters.length) {
            rows.push({ text: piece, start: pieceStart, continuation: rows.length > 0 });
            pieceStart += piece.length;
          } else {
            current = piece;
            currentWidth = stringWidth(piece);
            rowStart = pieceStart;
            droppedRun = false;
          }
        }
      } else {
        current = word;
        currentWidth = wordWidth;
        rowStart = wordStart;
        droppedRun = false;
      }
    }
  }
  if (current !== undefined) rows.push({ text: current, start: rowStart, continuation: rows.length > 0 });
  return rows;
}

export function inputRows(value: string, width: number, cursor?: number): InputRow[] {
  const w = Math.max(1, Math.floor(width));
  const rows: InputRow[] = [];
  let lineStart = 0;
  for (const line of value.split('\n')) {
    // The field's own breaking of a source line — at words like the output
    // prints them, but the rows keep what was typed (wrapLineRows).
    const pieces = wrapLineRows(line, w);
    pieces.forEach((piece, index) => {
      rows.push({ text: piece.text, start: lineStart + piece.start, continuation: index > 0 });
    });
    // The caret parked after a row that exactly fills the width, or in a run of
    // spaces the wrap dropped at the value's end, needs a row to stand on.
    const lineEnd = lineStart + line.length;
    const last = rows[rows.length - 1]!;
    const droppedTail = lineEnd - (last.start + last.text.length);
    if (cursor === lineEnd && (droppedTail > 0 || stringWidth(last.text) >= w && last.start + last.text.length === lineEnd)) {
      rows.push({ text: '', start: cursor, continuation: true });
    }
    lineStart = lineEnd + 1;
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
  // from the end makes a soft-wrap boundary resolve to the next row's col 0. A row
  // holds the caret through the run of spaces the wrap dropped before the next row
  // — the caret stands at the end of the words the row shows (2026-11-22).
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r]!;
    const end = row.start + row.text.length;
    const next = rows[r + 1];
    const holdEnd = next && next.continuation ? next.start : end;
    if (row.start <= c && c <= holdEnd) {
      return { row: r, col: stringWidth(value.slice(row.start, Math.min(c, end))) };
    }
  }
  return { row: 0, col: 0 };
}
