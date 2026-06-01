import { useContext } from 'react';
import type { Backend } from '@flowtty/core';
import { BackendContext } from '../context/backendContext.js';

/**
 * Returns the Backend instance the current render is bound to, or null if
 * there isn't one (rare — happens in some test setups). Use this to
 * feature-detect optional backend capabilities like `printStatic` at runtime:
 *
 *     const backend = useBackend();
 *     if (backend?.printStatic) {
 *       backend.printStatic([...]);
 *     }
 */
export function useBackend(): Backend | null {
  return useContext(BackendContext);
}
