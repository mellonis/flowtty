// Adapter-facing internals: the primitives a framework adapter (react-reconciler
// config, vue createRenderer config, etc.) needs to wire its own component
// lifecycle onto flowtty's Instance tree + paint pipeline.
//
// App authors should NOT import from here — `@flowtty/core` exposes the
// app-facing surface (Buffer, types, utilities). This subpath is for the
// people writing new adapters.

// Tree node types
export type { Instance, TextInstance, Container, HostType, WrapContinuation } from './host.js';

// Tree construction + mutation
export {
  createInstance,
  createTextInstance,
  applyProps,
  appendChild,
  removeChild,
  insertBefore,
  refreshMeasure,
  ownText,
  measureText,
} from './host.js';

// Yoga wrapper (rarely needed by adapters directly; exposed for advanced cases)
export { getYoga } from './yoga.js';
export type { Yoga, YogaNode } from './yoga.js';

// Layout pass + rect type
export { computeLayout, contentHeight, layoutOf } from './layout.js';
export type { Rect } from './layout.js';

// Paint pass: Instance tree + size → Buffer
export { paint } from './paint.js';

// Box geometry the paint pass uses, for adapters that have to reproduce it
// (hit-testing a pointer against the committed frame, measuring a viewport).
export {
  contentRectOf, paddingRectOf, intersectRects, rectContains, isScrollViewport, scrollStateOf,
} from './geometry.js';

// Hit-testing: which box is under a cell, in paint order.
export { hitTest, unselectableProbe, unselectableRects } from './hitTest.js';
export type { HitBox, UnselectableRegion } from './hitTest.js';

// Drag-to-select over the committed frame. See docs/input.md (selection).
export {
  SelectionController, applySelection, clampToRect, rowContinuation, rowSeparator,
  selectedStyle, selectionRows, selectionScopeAt, selectionSegments, selectionText, wordAt, lineAt,
} from './selection.js';
export type {
  Point, SelectionHost, SelectionRange, SelectionRow, SelectionScope, SelectionSegment,
} from './selection.js';

// Border glyph table (used when adapters render borders themselves; the paint
// pass already uses this internally).
export { BORDER_CHARS } from './borders.js';
