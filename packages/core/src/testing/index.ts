export { TestBackend } from './test-backend.js';

/**
 * Resolve after pending microtasks have drained. Use after `backend.press(...)`
 * to wait for React's state update + the scheduled repaint:
 *
 *     backend.press({ name: 'a' });
 *     await flush();
 *     expect(backend.lastFrame).toBe('a');
 */
export async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Resolve after a macrotask (setTimeout 0) so that React scheduler-driven
 * re-renders triggered by setState inside useEffect have fully committed and
 * probe components have re-read context. Use this in tests where state changes
 * are initiated from useEffect callbacks rather than from flushSync-wrapped key
 * presses.
 */
export async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
