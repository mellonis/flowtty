// Adapter-facing internals: the primitives a framework adapter (react-reconciler
// config, vue createRenderer config, etc.) needs to wire its own component
// lifecycle onto flowtty's Instance tree + paint pipeline.
//
// App authors should NOT import from here — `@flowtty/core` exposes the
// app-facing surface (Buffer, types, utilities). This subpath is for the
// people writing new adapters.

// Tree node types
export type { Instance, TextInstance, Container, HostType } from './host.js';

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
export { computeLayout, layoutOf } from './layout.js';
export type { Rect } from './layout.js';

// Paint pass: Instance tree + size → Buffer
export { paint } from './paint.js';

// Border glyph table (used when adapters render borders themselves; the paint
// pass already uses this internally).
export { BORDER_CHARS } from './borders.js';
