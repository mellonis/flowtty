// Framework-agnostic core: the data model + interfaces that every adapter
// (React, Svelte) and every backend (TTY, Test, Electron) shares.
//
// No React, no yoga, no node-specific globals — pure TS.
export { Buffer } from './cells.js';
export type { Cell, Style } from './cells.js';
export type { Key } from './keys.js';
export type { Backend } from './backend.js';
