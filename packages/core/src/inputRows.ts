// Geometry of a multi-line text field: how a value breaks into visual rows at a
// given width, and where the caret sits among them. Pure, shared by the editor
// reducer (up/down movement) and by whatever renders the field.
//
// Units: `cursor` and `InputRow.start` are UTF-16 indices into the value (so
// `value.slice(0, cursor)` works), while widths and the caret's `col` count
// CHARACTERS (code points) — the grid's unit. Rows hard-wrap by character, so an
// astral character (an emoji is two UTF-16 units) is never split across rows.
// Caret rules:
//  - at the end of a line that is followed by a line break, it stays on that line;
//  - on a blank line it has a row to stand on;
//  - at a soft wrap it opens the next row (col 0), never trails off the full one;
//  - at the very end of a line that exactly fills the width there IS no next row
//    yet, so one is added for it — pass `cursor` to inputRows to get that row.

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
    const chars = [...line];
    if (chars.length === 0) {
      rows.push({ text: '', start: lineStart, continuation: false });
    } else {
      let start = lineStart;
      for (let at = 0; at < chars.length; at += w) {
        const text = chars.slice(at, at + w).join('');
        rows.push({ text, start, continuation: at > 0 });
        start += text.length;
      }
      // The caret parked after a line that exactly fills its last row needs a row.
      if (cursor === lineStart + line.length && chars.length % w === 0) {
        rows.push({ text: '', start: cursor, continuation: true });
      }
    }
    lineStart += line.length + 1;
  }
  return rows;
}

/** UTF-16 index of character column `col` within `row` (clamped to its end). */
export function rowIndexAt(row: InputRow, col: number): number {
  return row.start + [...row.text].slice(0, Math.max(0, col)).join('').length;
}

export function caretPosition(value: string, cursor: number, width: number): { row: number; col: number } {
  const c = Math.max(0, Math.min(value.length, cursor));
  const rows = inputRows(value, width, c);
  // The LAST row that starts at or before the caret and can hold it. Scanning
  // from the end makes a soft-wrap boundary resolve to the next row's col 0.
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r]!;
    if (row.start <= c && c <= row.start + row.text.length) {
      return { row: r, col: [...value.slice(row.start, c)].length };
    }
  }
  return { row: 0, col: 0 };
}
