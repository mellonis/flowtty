import { useEffect, useState } from 'react';
import { useRootAbortSignal } from './useRootAbortSignal.js';

export interface UseTickerOptions {
  /** Milliseconds between ticks. Default 80 (a common animation cadence). */
  interval?: number;
  /** When false the ticker is paused — no interval runs and the count holds at
   *  its current value. Flipping back to true resumes (does not reset). Default true. */
  active?: boolean;
}

/**
 * A monotonically increasing frame counter that advances by one every
 * `interval` ms while `active`. Returns the current count (starts at 0). The
 * base primitive under <Spinner>, <ProgressBar>, elapsed-time displays, etc.
 *
 * The interval is torn down on unmount (effect cleanup) AND the moment the
 * render root's AbortSignal fires (whole-app teardown) — so an animation can
 * never keep ticking, or keep the event loop alive, past the tree it belongs
 * to. This is the canonical "interval that respects the root abort signal".
 */
export function useTicker(options: UseTickerOptions = {}): number {
  const { interval = 80, active = true } = options;
  const [count, setCount] = useState(0);
  const signal = useRootAbortSignal();

  useEffect(() => {
    if (!active || signal?.aborted) return;
    const id = setInterval(() => setCount((c) => c + 1), interval);
    const stop = () => clearInterval(id);
    // Stop immediately on root teardown: the React unmount is deferred to a
    // microtask on the error path, so the signal beats the effect cleanup.
    signal?.addEventListener('abort', stop, { once: true });
    return () => {
      clearInterval(id);
      signal?.removeEventListener('abort', stop);
    };
  }, [interval, active, signal]);

  return count;
}
