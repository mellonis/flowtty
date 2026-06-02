/**
 * Center a `visible`-sized window of items around `cursor`, clamped so the
 * window never starts before 0 or extends past the end of the list. Returns
 * the start index and the sliced items.
 *
 * Typical use — list views that scroll a cursor through long data:
 * ```ts
 * const { start, items } = windowAround(rows, cursor, termHeight - chrome);
 * items.map((row, i) => {
 *   const sel = (start + i) === cursor;
 *   ...
 * });
 * ```
 *
 * The window prefers to center the cursor; near the edges it sticks to the
 * top/bottom so the cursor remains visible without empty padding.
 */
export function windowAround<T>(
  items: readonly T[],
  cursor: number,
  visible: number,
): { start: number; items: T[] } {
  const v = Math.max(1, visible);
  const start = Math.max(0, Math.min(items.length - v, cursor - Math.floor(v / 2)));
  return { start, items: items.slice(start, start + v) };
}
