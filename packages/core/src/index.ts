// Public API for app code AND component authors.
//
// Framework-agnostic — no React, no yoga, no node-specific globals (yoga is
// hidden behind the host primitives; app code never sees it).
//
// Adapter authors (people writing a renderer config for React, Vue, Svelte,
// etc.) should import from `@flowtty/core/host` instead — that subpath
// exposes Instance / createInstance / appendChild / paint / computeLayout
// and the rest of the host primitives.

// ─── Data model + Backend interface ──────────────────────────────────────────
export { Buffer } from './cells.js';
export type { Cell, Style } from './cells.js';
export type { Key } from './keys.js';
export type { Backend } from './backend.js';

// ─── Component-author types ──────────────────────────────────────────────────
// Component authors building Box-shaped widgets reach for BoxProps;
// chrome helpers reach for the wrap / border / visual-line types.
export type { BoxProps } from './host/host.js';
export type { BorderStyle, BorderChars } from './host/borders.js';
export type { WrapMode } from './wrap.js';
export type { VisualLine } from './visualLines.js';

// ─── Pure utilities for app code ─────────────────────────────────────────────
export { wrapText } from './wrap.js';
export { splitVisualLines } from './visualLines.js';
export { windowAround } from './windowAround.js';

// ─── Reducer exports (for advanced widget authors) ───────────────────────────
// Each reducer module exports a `reduce` function; re-export them under
// distinct public names so a single import surface doesn't collide.
export { reduce as editorReducer } from './editor.js';
export type { EditorState, EditorAction } from './editor.js';

export { reduce as selectReducer, visibleIndices } from './selectReducer.js';
export type { SelectItem, SelectState, SelectAction } from './selectReducer.js';

export { reduce as multiSelectReducer } from './multiSelectReducer.js';
export type { MultiSelectState, MultiSelectAction } from './multiSelectReducer.js';
