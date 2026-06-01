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
 * Wait for React scheduler-driven re-renders triggered by `setState` inside
 * `useEffect` (e.g. a Form field registering, then the group auto-focusing the
 * first field) to fully commit.
 *
 * A passive-effect `setState` lands on React's default lane, which the
 * production Scheduler only drains on a macrotask — there is no synchronous
 * escape hatch in react-reconciler. A single `setTimeout(0)` (the old impl)
 * therefore advances only ONE step of a multi-step effect cascade and can also
 * lose the race against the Scheduler's own MessageChannel macrotask; both
 * surface as a stale/empty `lastFrame`.
 *
 * Passing the `TestBackend` makes this deterministic: each round yields one
 * macrotask (draining the Scheduler, which flushes that commit's passive
 * effects exactly as in production) plus a microtask pair (for the coalesced
 * repaint), and we stop once two consecutive rounds add no new frame. Two
 * rounds — not one — so a single macrotask-ordering inversion (Scheduler work
 * landing just after our `setTimeout`) can't read as premature quiescence.
 *
 * Called with no backend it falls back to a single macrotask round (the legacy
 * behavior) for callers that don't need cascade-settling.
 */
export async function flushAsync(backend?: { readonly frames: readonly unknown[] }): Promise<void> {
  if (!backend) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return;
  }
  const MAX_ROUNDS = 20;
  let stableRounds = 0;
  for (let i = 0; i < MAX_ROUNDS && stableRounds < 2; i++) {
    const before = backend.frames.length;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await Promise.resolve();
    stableRounds = backend.frames.length === before ? stableRounds + 1 : 0;
  }
}
