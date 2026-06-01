import { createContext } from 'react';
import type { Backend } from '@flowtty/core';

/**
 * The Backend instance the current render is bound to. Null when no backend
 * is in scope (e.g., tests using bare React render without flowtty's render()).
 *
 * Components that depend on backend capabilities (e.g. `<Static>` needs
 * `printStatic`) read this via `useBackend()` and feature-detect the
 * optional methods at runtime.
 */
export const BackendContext = createContext<Backend | null>(null);
