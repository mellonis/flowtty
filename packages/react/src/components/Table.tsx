import React from 'react';
import { useState } from 'react';
import { DEFAULT_BORDER_STYLE, GRID_CHARS, windowAround, type BorderStyle } from '@flowtty/core';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

export type TableAlign = 'left' | 'right' | 'center';

export interface TableColumn<T> {
  /** Property key on the row, or a function deriving the cell text. */
  accessor: keyof T | ((row: T, index: number) => string);
  /** Header label. Defaults to `String(accessor)` when the accessor is a key. */
  header?: string;
  /** Horizontal alignment of header + cell content. Default 'left'. */
  align?: TableAlign;
  /** Fixed content width (cells, excluding padding). Auto-sized to content when omitted. */
  width?: number;
  /** Lower / upper bounds for auto-sizing (cells). */
  minWidth?: number;
  maxWidth?: number;
}

export interface TableProps<T> {
  data: readonly T[];
  columns: readonly TableColumn<T>[];
  /** Box-drawing style for the grid, or 'none' for whitespace-separated columns. Default 'round'. */
  border?: BorderStyle | 'none';
  /** Color for the rule glyphs (named / #rrggbb / rgb(...)). */
  borderColor?: string;
  /** Spaces on each side of cell content. Default 1. */
  cellPadding?: number;
  /** Render the header row. Default true. */
  showHeader?: boolean;
  /** Color for header cells. */
  headerColor?: string;
  /** Bold header cells. Default true. */
  headerBold?: boolean;
  /**
   * Fixed total width budget (cells). Omit to fit the container: the table
   * measures its allocated width via onLayout and shrinks columns (widest
   * first, with `…` truncation) to fit. Before the first layout it falls back
   * to the terminal width.
   */
  width?: number;
  /**
   * Absolute index into `data` of the highlighted row (the cursor). The row is
   * drawn inverse. Selection state lives in the caller — Table only paints it.
   * Omit for a non-selectable table.
   */
  selectedIndex?: number;
  /**
   * Grow to fill the available height and scroll: only the rows that fit are
   * rendered, windowed around `selectedIndex`, while the header + rules stay
   * pinned (sticky). Columns are still sized from the *full* `data`, so widths
   * don't jitter as rows scroll into view. The caller owns the cursor + key
   * handling and passes `selectedIndex`. Place inside a flex column with height.
   */
  scrollable?: boolean;
}

const cpLen = (s: string): number => [...s].length;

// Truncate to `width` code points with a trailing ellipsis, then pad to exactly
// `width` per `align`. Measured in code points to match the paint grid (see
// docs/plans/table.md — the painter is one cell per code point).
function fitCell(raw: string, width: number, align: TableAlign): string {
  if (width <= 0) return '';
  const chars = [...raw];
  let body: string;
  if (chars.length > width) {
    body = width === 1 ? '…' : chars.slice(0, width - 1).join('') + '…';
  } else {
    body = raw;
  }
  const deficit = width - cpLen(body);
  if (deficit <= 0) return body;
  if (align === 'right') return ' '.repeat(deficit) + body;
  if (align === 'center') {
    const left = deficit >> 1;
    return ' '.repeat(left) + body + ' '.repeat(deficit - left);
  }
  return body + ' '.repeat(deficit);
}

function cellTextOf<T>(col: TableColumn<T>, row: T, index: number): string {
  const v = typeof col.accessor === 'function' ? col.accessor(row, index) : row[col.accessor];
  // Cells are single-line; fold newlines so a stray \n can't break row alignment.
  return (v == null ? '' : String(v)).replace(/\n/g, ' ');
}

function headerTextOf<T>(col: TableColumn<T>): string {
  if (col.header !== undefined) return col.header;
  return typeof col.accessor === 'function' ? '' : String(col.accessor);
}

// Distribute a width budget across columns: start at natural content widths,
// then shrink the widest *non-fixed* column by 1 repeatedly until the row fits
// or every shrinkable column is at its floor. Never stretches columns up.
function fitColumns<T>(
  columns: readonly TableColumn<T>[],
  natural: number[],
  contentBudget: number,
): number[] {
  const widths = natural.slice();
  const floor = (i: number): number => Math.max(columns[i]!.minWidth ?? 1, 1);
  const shrinkable = (i: number): boolean => columns[i]!.width === undefined && widths[i]! > floor(i);

  let total = widths.reduce((a, b) => a + b, 0);
  while (total > contentBudget) {
    // Pick the widest shrinkable column.
    let pick = -1;
    for (let i = 0; i < widths.length; i++) {
      if (shrinkable(i) && (pick === -1 || widths[i]! > widths[pick]!)) pick = i;
    }
    if (pick === -1) break; // nothing left to shrink — overflow, clipped by the terminal
    widths[pick]!--;
    total--;
  }
  return widths;
}

/**
 * A declarative data grid. Rows come from `data`; `columns` define how each row
 * maps to a cell (a key or a function), with optional per-column header, align,
 * and width bounds. Drawn with box-drawing rules (`border`) or whitespace
 * (`border="none"`).
 *
 * Fit-to-width: with no `width`, the table measures its container and shrinks
 * the widest columns (truncating cells with `…`) so the grid never exceeds the
 * available width. (Horizontal scroll for over-wide tables is a planned
 * follow-up.)
 *
 * Selectable + scrollable: pass `selectedIndex` to inverse-highlight the cursor
 * row, and `scrollable` to grow into the available height and vertically window
 * the rows around the cursor with a sticky header. Cursor state + key handling
 * stay in the caller.
 */
export function Table<T>({
  data, columns,
  border = DEFAULT_BORDER_STYLE, borderColor,
  cellPadding = 1, showHeader = true, headerColor, headerBold = true,
  width, selectedIndex, scrollable = false,
}: TableProps<T>) {
  const term = useTerminalSize();
  const [measured, setMeasured] = useState(0);
  const [measuredH, setMeasuredH] = useState(0);
  const fixed = typeof width === 'number';
  // Budget: explicit prop > measured container > terminal width (pre-layout fallback).
  const budget = fixed ? width : (measured > 0 ? measured : term.width);

  const bordered = border !== 'none';
  const chars = bordered ? GRID_CHARS[border] : null;
  const pad = Math.max(0, cellPadding);
  const ncols = columns.length;

  // Natural content width per column (code points), honoring explicit width / bounds.
  const natural = columns.map((col, c) => {
    if (typeof col.width === 'number') return Math.max(0, col.width);
    let w = cpLen(headerTextOf(col));
    for (let i = 0; i < data.length; i++) w = Math.max(w, cpLen(cellTextOf(col, data[i]!, i)));
    if (col.minWidth !== undefined) w = Math.max(w, col.minWidth);
    if (col.maxWidth !== undefined) w = Math.min(w, col.maxWidth);
    return Math.max(0, w);
  });

  // Chrome that doesn't shrink: verticals + per-cell padding.
  const verticals = bordered ? ncols + 1 : 0;
  const fixedChrome = verticals + ncols * 2 * pad;
  const contentBudget = Math.max(ncols, budget - fixedChrome);
  const colWidths = fitColumns(columns, natural, contentBudget);
  // Paddings live in the cell text; the rule segment width per column = content + 2*pad.
  const segWidths = colWidths.map((w) => w + 2 * pad);

  // Highlighted row, clamped into range (-1 = no selection).
  const selIdx = selectedIndex == null ? -1 : Math.max(0, Math.min(data.length - 1, selectedIndex));

  // Scrolling: render only the rows that fit the measured viewport, windowed
  // around the cursor. Header + rules stay pinned because they're emitted every
  // frame regardless of the window. Chrome = top/bottom rules + (header row +
  // its mid rule). Pre-measure, fall back to the terminal height (clipped by
  // overflow:hidden) so the first frame isn't a one-row flash.
  const chromeLines = (bordered ? 2 : 0) + (showHeader ? (bordered ? 2 : 1) : 0);
  const viewportH = measuredH > 0 ? measuredH : term.height;
  const capacity = Math.max(1, viewportH - chromeLines);
  let renderStart = 0;
  let rows: readonly T[] = data;
  if (scrollable && data.length > 0) {
    const w = windowAround(data, selIdx < 0 ? 0 : selIdx, capacity);
    renderStart = w.start;
    rows = w.items;
  }

  const rule = (kind: 'top' | 'mid' | 'bottom'): string => {
    const c = chars!;
    const left = kind === 'top' ? c.tl : kind === 'bottom' ? c.bl : c.tRight;
    const mid = kind === 'top' ? c.tDown : kind === 'bottom' ? c.tUp : c.cross;
    const right = kind === 'top' ? c.tr : kind === 'bottom' ? c.br : c.tLeft;
    return left + segWidths.map((w) => c.h.repeat(w)).join(mid) + right;
  };

  const padStr = ' '.repeat(pad);
  // `selected` inverts the whole row — cells and the verticals between/around
  // them — so the highlight reads as one continuous bar edge-to-edge.
  const renderRow = (cells: string[], header: boolean, selected = false) => {
    const spans: React.ReactNode[] = [];
    if (bordered) spans.push(<Text key="l" color={borderColor} inverse={selected}>{chars!.v}</Text>);
    for (let c = 0; c < ncols; c++) {
      const content = padStr + fitCell(cells[c] ?? '', colWidths[c]!, columns[c]!.align ?? 'left') + padStr;
      spans.push(
        header
          ? <Text key={`c${c}`} bold={headerBold} color={headerColor}>{content}</Text>
          : <Text key={`c${c}`} bold={selected} inverse={selected}>{content}</Text>,
      );
      if (bordered) spans.push(<Text key={`v${c}`} color={borderColor} inverse={selected}>{chars!.v}</Text>);
    }
    return <Box flexDirection="row">{spans}</Box>;
  };

  const headerCells = columns.map((col) => headerTextOf(col));
  const grid = (
    <>
      {bordered && <Text color={borderColor}>{rule('top')}</Text>}
      {showHeader && renderRow(headerCells, true)}
      {showHeader && bordered && <Text color={borderColor}>{rule('mid')}</Text>}
      {rows.map((row, i) => {
        const abs = renderStart + i;
        return (
          <React.Fragment key={abs}>
            {renderRow(columns.map((col) => cellTextOf(col, row, abs)), false, abs === selIdx)}
          </React.Fragment>
        );
      })}
      {bordered && <Text color={borderColor}>{rule('bottom')}</Text>}
    </>
  );

  // Measure the allocated width (when not fixed) and — for a scrollable table —
  // the allocated height. The outer column box stretches to the parent's
  // cross-axis by default (Yoga alignItems: stretch), so onLayout reports the
  // available width; `flexGrow` makes it claim the available height to scroll
  // within. `flexShrink` is the load-bearing half: Yoga defaults it to 0, so
  // without it the box refuses to shrink below its content and — because the
  // first frame renders at the term-height fallback — it would self-stabilize
  // at the full screen height (over-tall, clipping its own bottom border). With
  // flexShrink it collapses to its flex allocation and the row window fits.
  // Diff before setState — onLayout fires on every paint.
  const measureWidth = !fixed;
  const measure = measureWidth || scrollable;
  return (
    <Box
      flexDirection="column"
      overflow="hidden"
      flexGrow={scrollable ? 1 : undefined}
      flexShrink={scrollable ? 1 : undefined}
      onLayout={measure ? (r) => {
        if (measureWidth && r.width !== measured) setMeasured(r.width);
        if (scrollable && r.height !== measuredH) setMeasuredH(r.height);
      } : undefined}
    >
      {grid}
    </Box>
  );
}
