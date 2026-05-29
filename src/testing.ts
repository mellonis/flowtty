export { TestBackend } from './backends/test.js';

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
