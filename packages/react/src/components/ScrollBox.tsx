import React, { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import type { BoxProps, Key, ScrollMetrics } from '@flowtty/core';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { useInput } from '../hooks/useInput.js';

export interface ScrollBoxHandle {
  /** Scroll to `offset` rows from the anchored edge (0 = that edge). */
  scrollTo(offset: number): void;
  /** Scroll to the first row. */
  scrollToStart(): void;
  /** Scroll to the last row. With `anchor="bottom"` this also re-pins the view,
   *  so content added later is followed. */
  scrollToEnd(): void;
}

export interface ScrollBoxProps
  extends Omit<BoxProps, 'scrollTop' | 'scrollBottom' | 'onScrollMetrics' | 'overflow'> {
  children?: ReactNode;
  /** The edge `offset` counts from, and where the view rests. `'bottom'` is the
   *  chat/log shape: the last rows show, and stay in view as content grows —
   *  until the user scrolls up, after which new content no longer moves what
   *  they are reading. Default `'top'`. */
  anchor?: 'top' | 'bottom';
  /** Controlled position: rows from the anchored edge (0 = at that edge). When
   *  set, the box never moves on its own — keys and the wheel only report the
   *  position they ask for through `onScroll`. Omit for an uncontrolled box. */
  offset?: number;
  /** A key or wheel step (or a handle call) asked for a new position. `offset`
   *  is rows from the anchored edge, already clamped. */
  onScroll?: (offset: number, metrics: ScrollMetrics) => void;
  /** Content / viewport heights changed (also fires once after mount). For a
   *  "↑ more" affordance, or a host that clamps its own `offset`. */
  onMetrics?: (metrics: ScrollMetrics) => void;
  /** Handle PgUp / PgDn and the mouse wheel. Default true. Set false when the
   *  host drives `offset` itself, or to park a box that is not the active view. */
  isActive?: boolean;
  /** Rows per wheel step. Default 3. */
  wheelStep?: number;
  /** Rows per PgUp / PgDn. Default: the viewport height minus one, so one row
   *  of context carries over between pages. */
  pageStep?: number;
  /** Draw a scrollbar in the right-hand column while the content overflows. */
  scrollbar?: boolean;
  ref?: Ref<ScrollBoxHandle>;
}

const sameMetrics = (a: ScrollMetrics | null, b: ScrollMetrics): boolean =>
  a !== null && a.contentHeight === b.contentHeight && a.viewportHeight === b.viewportHeight
  && a.scrollTop === b.scrollTop && a.maxScrollTop === b.maxScrollTop;

/**
 * A box that scrolls its children vertically. It sizes like any `<Box>` — give
 * it `flexGrow={1}` and it takes whatever the layout leaves, so the app never
 * adds up sibling heights to know how many rows fit. `position="absolute"`
 * children are overlays: they stay put while the content scrolls (a sticky
 * header row, a "new messages" badge).
 */
export function ScrollBox({
  children, anchor = 'top', offset, onScroll, onMetrics, isActive = true, wheelStep = 3, pageStep,
  scrollbar = false, ref, onLayout, ...boxProps
}: ScrollBoxProps) {
  // Uncontrolled position as an absolute scrollTop, or `null` = resting at the
  // anchored edge. Holding an absolute top (not an offset from the bottom) is
  // what keeps a scrolled-up view still while content is appended below it.
  const [top, setTop] = useState<number | null>(null);
  const metricsRef = useRef<ScrollMetrics | null>(null);
  const rectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  // Mirrored into state only for the scrollbar, which has to re-render on change.
  const [barMetrics, setBarMetrics] = useState<ScrollMetrics | null>(null);

  // Position asked for since the last paint. Several steps can land in one tick
  // (a wheel burst arrives as one stdin chunk) before paint refreshes the
  // metrics; each step builds on the previous one instead of on a stale scrollTop.
  const pendingTopRef = useRef<number | null>(null);

  const controlled = offset !== undefined;
  const fromBottom = anchor === 'bottom';

  // Ask for an absolute scrollTop: report it, and (uncontrolled) move there.
  const goTo = (wantedTop: number) => {
    const m = metricsRef.current;
    const max = m?.maxScrollTop ?? 0;
    const next = Math.max(0, Math.min(max, wantedTop));
    pendingTopRef.current = next;
    if (!controlled) setTop(fromBottom ? (next >= max ? null : next) : next);
    if (onScroll && m) onScroll(fromBottom ? max - next : next, { ...m, scrollTop: next });
  };

  useImperativeHandle(ref, () => ({
    scrollTo: (o) => goTo(fromBottom ? (metricsRef.current?.maxScrollTop ?? 0) - o : o),
    scrollToStart: () => goTo(0),
    scrollToEnd: () => goTo(Number.MAX_SAFE_INTEGER),
  }));

  useInput((key: Key) => {
    const m = metricsRef.current;
    if (!m) return;
    const from = pendingTopRef.current ?? m.scrollTop;
    const page = pageStep ?? Math.max(1, m.viewportHeight - 1);
    if (key.name === 'pageup') goTo(from - page);
    else if (key.name === 'pagedown') goTo(from + page);
    else if (key.name === 'wheelup' || key.name === 'wheeldown') {
      const r = rectRef.current;
      const inside = key.x === undefined || key.y === undefined || r === null
        || (key.x >= r.left && key.x < r.left + r.width && key.y >= r.top && key.y < r.top + r.height);
      if (inside) goTo(from + (key.name === 'wheelup' ? -wheelStep : wheelStep));
    }
  }, { isActive });

  const scrollProps: Pick<BoxProps, 'scrollTop' | 'scrollBottom'> = controlled
    ? (fromBottom ? { scrollBottom: offset } : { scrollTop: offset })
    : top === null
      ? (fromBottom ? { scrollBottom: 0 } : { scrollTop: 0 })
      : { scrollTop: top };

  const showBar = scrollbar && barMetrics !== null && barMetrics.maxScrollTop > 0;
  const basePadRight = boxProps.paddingRight ?? boxProps.paddingX ?? boxProps.padding ?? 0;

  return (
    <Box
      flexDirection="column"
      {...boxProps}
      {...scrollProps}
      paddingRight={showBar ? basePadRight + 1 : boxProps.paddingRight}
      onLayout={(r) => { rectRef.current = r; onLayout?.(r); }}
      onScrollMetrics={(m) => {
        const changed = !sameMetrics(metricsRef.current, m);
        metricsRef.current = m;
        pendingTopRef.current = null;
        if (!changed) return;
        onMetrics?.(m);
        if (scrollbar) setBarMetrics(m);
      }}
    >
      {children}
      {showBar ? <Scrollbar metrics={barMetrics} /> : null}
    </Box>
  );
}

// Thumb length is the viewport's share of the content; its position follows
// scrollTop. An absolute child, so it overlays the viewport instead of scrolling.
function Scrollbar({ metrics }: { metrics: ScrollMetrics }) {
  const { viewportHeight: vh, contentHeight, scrollTop, maxScrollTop } = metrics;
  const thumb = Math.max(1, Math.min(vh, Math.round((vh * vh) / contentHeight)));
  const start = maxScrollTop > 0 ? Math.round((scrollTop / maxScrollTop) * (vh - thumb)) : 0;
  return (
    <Box position="absolute" top={0} right={0} width={1} flexDirection="column">
      {Array.from({ length: vh }, (_, i) => (
        i >= start && i < start + thumb
          ? <Text key={i}>█</Text>
          : <Text key={i} dim>│</Text>
      ))}
    </Box>
  );
}
