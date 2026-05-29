export { TestBackend } from './backends/test.js';

/**
 * Resolve after React's scheduler and repaint have settled. Use after
 * `backend.press(...)` to wait for React's state update + the scheduled repaint:
 *
 *     backend.press({ name: 'a' });
 *     await flush();
 *     expect(backend.lastFrame).toBe('a');
 *
 * Note: input-triggered state updates (`useInput` → `setState`) are scheduled
 * by React's Scheduler on a macrotask (MessageChannel/setTimeout), not a
 * microtask. A single `setTimeout(0)` round lets the Scheduler drain, after
 * which the commit fires `resetAfterCommit` → `queueMicrotask(draw)`. The two
 * trailing microtask rounds ensure that paint microtask completes.
 *
 * TODO: replace with discrete-priority input delivery (M1b) so that key events
 * flush synchronously and this macrotask round is no longer necessary.
 */
export async function flush(): Promise<void> {
  // Let React's Scheduler drain (macrotask).
  await new Promise<void>((r) => setTimeout(r, 0));
  // Let the repaint microtask (queueMicrotask in schedulePaint) complete.
  await Promise.resolve();
  await Promise.resolve();
}
