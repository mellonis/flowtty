// Framework-agnostic core: the data model + interfaces that every adapter
// (React, Svelte) and every backend (TTY, Test, Electron) shares.
//
// No React, no yoga, no node-specific globals — pure TS.
export { Buffer } from './cells.js';
export type { Cell, Style } from './cells.js';
export type { Key } from './keys.js';
export type { Backend } from './backend.js';

// Text wrap utility (used by host measureFunc + paint).
export { wrapText } from './wrap.js';
export type { WrapMode } from './wrap.js';

// Border glyph table + types (used by paint).
export { BORDER_CHARS } from './borders.js';
export type { BorderStyle, BorderChars } from './borders.js';

// Visual-line pagination + cursor windowing utilities (used by app code).
export { splitVisualLines } from './visualLines.js';
export type { VisualLine } from './visualLines.js';
export { windowAround } from './windowAround.js';

// Reducers shared by adapter components.
// Each reducer module exports a `reduce` function; re-export them under
// distinct public names so a single import surface doesn't collide.
export { reduce as editorReducer } from './editor.js';
export type { EditorState, EditorAction } from './editor.js';

export { reduce as selectReducer, visibleIndices } from './selectReducer.js';
export type { SelectItem, SelectState, SelectAction } from './selectReducer.js';

export { reduce as multiSelectReducer } from './multiSelectReducer.js';
export type { MultiSelectState, MultiSelectAction } from './multiSelectReducer.js';

// Yoga loader + types. Adapter authors don't typically touch these directly;
// they're exported because `reconciler` in @flowtty/react needs the Yoga type
// to thread through the host-config closure.
export { getYoga } from './yoga.js';
export type { Yoga, YogaNode } from './yoga.js';

// Host: the Yoga-backed render tree. Adapter authors build a Container by
// calling createInstance / createTextInstance / appendChild / etc., then hand
// the Container to computeLayout + paint.
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
export type {
  BoxProps,
  HostType,
  Instance,
  TextInstance,
  Container,
} from './host.js';

// Layout + paint: the per-frame rendering pipeline. Call computeLayout(container,
// w, h) then paint(container, w, h) → Buffer.
export { computeLayout, layoutOf } from './layout.js';
export type { Rect } from './layout.js';
export { paint } from './paint.js';
