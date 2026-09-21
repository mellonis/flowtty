// Box geometry shared by the paint pass and anything that has to reproduce it
// without painting — hit-testing a pointer against the committed frame, for
// one. Everything here is pure: it reads Yoga's computed values and the box's
// props, and fires no callbacks. (A hit test that fired `onScrollMetrics` would
// drive a `setState` on every mouse press.)
import { Edge } from './yoga.js';
import type { Instance, ScrollMetrics } from './host.js';
import type { Rect } from './layout.js';

// Inner content rect (padding + border subtracted). Yoga's computed values are
// only valid AFTER computeLayout, so this must be called inside a pass over the
// laid-out tree, not at applyProps time. Border cells and padding cells are
// reserved by Yoga in the LAYOUT phase (so children land inside the content
// rect automatically), but own-text painting still needs the inset coordinates
// explicitly.
export function contentRectOf(inst: Instance, box: Rect): Rect {
  const n = inst.yogaNode;
  const padT = n.getComputedPadding(Edge.Top)    + n.getComputedBorder(Edge.Top);
  const padR = n.getComputedPadding(Edge.Right)  + n.getComputedBorder(Edge.Right);
  const padB = n.getComputedPadding(Edge.Bottom) + n.getComputedBorder(Edge.Bottom);
  const padL = n.getComputedPadding(Edge.Left)   + n.getComputedBorder(Edge.Left);
  return {
    left:   box.left + padL,
    top:    box.top  + padT,
    width:  Math.max(0, box.width  - padL - padR),
    height: Math.max(0, box.height - padT - padB),
  };
}

// The box minus its border ring (padding included).
export function paddingRectOf(inst: Instance, box: Rect): Rect {
  const n = inst.yogaNode;
  const t = n.getComputedBorder(Edge.Top);
  const r = n.getComputedBorder(Edge.Right);
  const b = n.getComputedBorder(Edge.Bottom);
  const l = n.getComputedBorder(Edge.Left);
  return { left: box.left + l, top: box.top + t, width: Math.max(0, box.width - l - r), height: Math.max(0, box.height - t - b) };
}

// Intersection of two rects. Null treated as "no clip" (returns the other rect).
// Returns an empty (width:0 / height:0) rect when there's no overlap — callers
// gate every write on it, so an empty rect means "nothing passes".
export function intersectRects(a: Rect | null, b: Rect): Rect {
  if (a === null) return b;
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return { left, top, width: 0, height: 0 };
  return { left, top, width: right - left, height: bottom - top };
}

/** Whether (x, y) falls inside a rect. */
export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && y >= rect.top && x < rect.left + rect.width && y < rect.top + rect.height;
}

/** A scroll prop turns the box into a scroll viewport: it clips like
 *  `overflow: 'hidden'` and paints its flow children shifted. */
export function isScrollViewport(inst: Instance): boolean {
  return inst.props.scrollTop !== undefined || inst.props.scrollBottom !== undefined;
}

// Resolve the effective scroll offset against THIS frame's layout, so a pinned
// view (scrollBottom: 0) follows growing content without a catch-up frame.
// See docs/layout.md (scrolling).
export function scrollStateOf(inst: Instance, box: Rect): { scrollTop: number; metrics: ScrollMetrics } {
  const viewport = contentRectOf(inst, box);
  // Content height = the lowest bottom edge among flow children, measured from
  // the content rect's top. Absolute children are overlays and don't count.
  let contentBottom = 0;
  for (const child of inst.children) {
    if (child.type !== 'box' || child.props.position === 'absolute' || child.props.display === 'none') continue;
    const n = child.yogaNode;
    contentBottom = Math.max(contentBottom, n.getComputedTop() + n.getComputedHeight() + n.getComputedMargin(Edge.Bottom));
  }
  const contentHeight = Math.max(0, contentBottom - (viewport.top - box.top));
  const maxScrollTop = Math.max(0, contentHeight - viewport.height);
  const wanted = inst.props.scrollBottom !== undefined
    ? maxScrollTop - inst.props.scrollBottom
    : inst.props.scrollTop ?? 0;
  const scrollTop = Math.max(0, Math.min(maxScrollTop, Math.round(wanted)));
  return { scrollTop, metrics: { contentHeight, viewportHeight: viewport.height, scrollTop, maxScrollTop } };
}
