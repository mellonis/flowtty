import React, { useRef, useState, type ReactNode } from 'react';
import type { ScrollMetrics } from '@flowtty/core';
import { Box } from './base/Box.js';
import { ScrollBox, type ScrollBoxProps } from './ScrollBox.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

export interface ScrollListProps<T> extends Omit<ScrollBoxProps, 'children'> {
  /** The rows, in order. The array is read, never copied or wrapped: hand over
   *  the same array while nothing changed and the list re-renders nothing. */
  items: readonly T[];
  /** Draw one row. Called only for rows inside the rendered window. The result
   *  is clipped to `rowHeight` rows. */
  renderItem: (item: T, index: number) => ReactNode;
  /** A stable key per row, so React keeps a row's subtree while the window
   *  moves. Default: the index — fine while rows are only appended. */
  keyOf?: (item: T, index: number) => string | number;
  /** Rows of the terminal every item takes. Default 1. */
  rowHeight?: number;
  /** Rows rendered beyond each edge of the viewport, so a small scroll step
   *  finds its rows already there and re-renders nothing: the window moves
   *  only once the viewport gets within half this many rows of its edge, so
   *  up to half as many again may be rendered. Default: one viewport height. */
  overscan?: number;
  /** Overlays only: `position="absolute"` children that stay put while the
   *  list scrolls, as in `<ScrollBox>`. Rows come from `items`. */
  children?: ReactNode;
}

/** Rows `[start, end)` that cover `[top, top + viewportHeight)` widened by
 *  at least `overscan` on each side, clamped to the list. */
interface Window { start: number; end: number }

function windowOf(top: number, viewportHeight: number, count: number, rowHeight: number, overscan: number): Window {
  const first = Math.floor(top / rowHeight);
  const last = Math.ceil((top + viewportHeight) / rowHeight);
  // The edges snap to a grid half the overscan wide, so a small scroll step
  // keeps the window — and the list re-renders nothing. Widened exactly by
  // `overscan`, the window would move with every row scrolled, and every step
  // would re-render all of it: the overscan would buy no render at all.
  const grid = Math.max(1, Math.floor(overscan / 2));
  return {
    start: Math.max(0, Math.min(count, Math.floor((first - overscan) / grid) * grid)),
    end: Math.max(0, Math.min(count, Math.ceil((last + overscan) / grid) * grid)),
  };
}

const sameWindow = (a: Window, b: Window): boolean => a.start === b.start && a.end === b.end;

/** What the last paint (or the last scroll request) said about the view. */
interface View {
  scrollTop: number;
  viewportHeight: number;
  /** Resting at the end: the view follows appended rows. Read only with
   *  `anchor="bottom"`, uncontrolled. */
  pinned: boolean;
}

/**
 * A `<ScrollBox>` for long lists of equal-height rows: only the rows near the
 * viewport are rendered, the rest is two spacers of the right height. The
 * content is exactly `items.length * rowHeight` rows tall, so the box's
 * anchoring, metrics and scrollbar are exact. See docs/layout.md (ScrollList).
 */
export function ScrollList<T>({
  items, renderItem, keyOf, rowHeight = 1, overscan, children,
  anchor = 'top', offset, onScroll, onMetrics, ...scrollBoxProps
}: ScrollListProps<T>): ReactNode {
  const terminal = useTerminalSize();
  const [view, setView] = useState<View | null>(null);
  const count = items.length;
  const controlled = offset !== undefined;
  const fromBottom = anchor === 'bottom';

  // Before the first paint there are no metrics: guess the viewport from the
  // box's own `height` or the terminal's, so the first frame has its rows.
  const guessedHeight = typeof scrollBoxProps.height === 'number' && scrollBoxProps.height > 0
    ? scrollBoxProps.height
    : Number.isFinite(terminal.height) && terminal.height > 0 ? terminal.height : 24;
  const viewportHeight = view?.viewportHeight ?? guessedHeight;
  const rows = overscan ?? Math.ceil(viewportHeight / rowHeight);
  const maxTop = Math.max(0, count * rowHeight - viewportHeight);

  // The scroll position the next paint will use. Controlled: from `offset`.
  // Pinned to the bottom: the end, whatever the count is now — so an append
  // renders its rows in the same frame the box scrolls to them. Otherwise the
  // last known position, clamped in case the content shrank.
  const top = controlled
    ? Math.max(0, Math.min(maxTop, fromBottom ? maxTop - offset : offset))
    : view === null
      ? (fromBottom ? maxTop : 0)
      : (fromBottom && view.pinned ? maxTop : Math.max(0, Math.min(maxTop, view.scrollTop)));

  const win = windowOf(top, viewportHeight, count, rowHeight, rows);

  // What this render shows, for the callbacks to compare against: they set
  // state only when the window (or what it is derived from) would change.
  const shownRef = useRef<{ window: Window; view: View | null; count: number; rows: number }>({ window: win, view, count, rows });
  shownRef.current = { window: win, view, count, rows };

  const update = (m: ScrollMetrics) => {
    const shown = shownRef.current;
    const pinned = m.scrollTop >= m.maxScrollTop;
    const next: View = { scrollTop: m.scrollTop, viewportHeight: m.viewportHeight, pinned };
    if (shown.view !== null && shown.view.viewportHeight === next.viewportHeight
      && shown.view.pinned === next.pinned
      && sameWindow(shown.window, windowOf(next.scrollTop, next.viewportHeight, shown.count, rowHeight, shown.rows))) return;
    setView(next);
  };

  const spacerTop = win.start * rowHeight;
  const spacerBottom = (count - win.end) * rowHeight;
  const rendered: ReactNode[] = [];
  for (let i = win.start; i < win.end; i++) {
    const item = items[i] as T;
    rendered.push(
      // A fixed height, so a row that would be taller cannot push the ones
      // below it and break the arithmetic. NOT a clip (`overflow="hidden"`):
      // a continuation mark (`wrapContinues`) is dropped when the row below
      // lies outside the box's clip, and under a one-row clip it always would
      // — a wrapped paragraph would copy as several lines. A taller item
      // spills under the next row, which paints over it.
      <Box key={keyOf ? keyOf(item, i) : i} height={rowHeight} flexShrink={0} flexGrow={0}>
        {renderItem(item, i)}
      </Box>,
    );
  }

  return (
    <ScrollBox
      {...scrollBoxProps}
      anchor={anchor}
      offset={offset}
      // A scroll request names the position the next paint will use: moving
      // the window here, in the same batch, means that paint has its rows.
      onScroll={(o, m) => { update(m); onScroll?.(o, m); }}
      onMetrics={(m) => { update(m); onMetrics?.(m); }}
    >
      {spacerTop > 0 ? <Box height={spacerTop} flexShrink={0} /> : null}
      {rendered}
      {spacerBottom > 0 ? <Box height={spacerBottom} flexShrink={0} /> : null}
      {children}
    </ScrollBox>
  );
}
