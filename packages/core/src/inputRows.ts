// Geometry of a multi-line text field: how a value breaks into visual rows at a
// given width, and where the caret sits among them. Pure, shared by the editor
// reducer (up/down movement) and by whatever renders the field.
//
// Rows hard-wrap at the cell boundary (code points, like the rest of the grid).
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
    if (line.length === 0) {
      rows.push({ text: '', start: lineStart, continuation: false });
    } else {
      for (let at = 0; at < line.length; at += w) {
        rows.push({ text: line.slice(at, at + w), start: lineStart + at, continuation: at > 0 });
      }
      // The caret parked after a line that exactly fills its last row needs a row.
      if (cursor === lineStart + line.length && line.length % w === 0) {
        rows.push({ text: '', start: cursor, continuation: true });
      }
    }
    lineStart += line.length + 1;
  }
  return rows;
}

export function caretPosition(value: string, cursor: number, width: number): { row: number; col: number } {
  const c = Math.max(0, Math.min(value.length, cursor));
  const rows = inputRows(value, width, c);
  // The LAST row that starts at or before the caret and can hold it. Scanning
  // from the end makes a soft-wrap boundary resolve to the next row's col 0.
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r]!;
    if (row.start <= c && c <= row.start + row.text.length) return { row: r, col: c - row.start };
  }
  return { row: 0, col: 0 };
}
