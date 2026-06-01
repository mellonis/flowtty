import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../internal/render.js';
import { useTicker, type UseTickerOptions } from './useTicker.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

// Fake ONLY setInterval/clearInterval — flushAsync, the yoga wasm load, and the
// reconciler's microtask repaint all rely on real setTimeout/Promise/queueMicrotask.
beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
afterEach(() => vi.useRealTimers());

function Probe({ opts, sink }: { opts?: UseTickerOptions; sink: (n: number) => void }) {
  sink(useTicker(opts));
  return null;
}

describe('useTicker', () => {
  test('starts at 0 and advances one per interval while active', async () => {
    const backend = new TestBackend(10, 1);
    let count = -1;
    const r = await render(<Probe opts={{ interval: 100 }} sink={(n) => { count = n; }} />, backend);
    await flushAsync(backend);
    expect(count).toBe(0);

    vi.advanceTimersByTime(100);
    await flushAsync(backend);
    expect(count).toBe(1);

    vi.advanceTimersByTime(250); // crosses two more boundaries (200, 300), not 400
    await flushAsync(backend);
    expect(count).toBe(3);

    r.unmount();
  });

  test('does not tick while paused (active: false)', async () => {
    const backend = new TestBackend(10, 1);
    let count = -1;
    const r = await render(<Probe opts={{ interval: 100, active: false }} sink={(n) => { count = n; }} />, backend);
    await flushAsync(backend);

    vi.advanceTimersByTime(500);
    await flushAsync(backend);
    expect(count).toBe(0);

    r.unmount();
  });

  test('freezes after unmount (interval cleared on teardown / root abort)', async () => {
    const backend = new TestBackend(10, 1);
    let count = -1;
    const r = await render(<Probe opts={{ interval: 100 }} sink={(n) => { count = n; }} />, backend);
    await flushAsync(backend);

    vi.advanceTimersByTime(100);
    await flushAsync(backend);
    expect(count).toBe(1);

    // unmount() aborts the root signal (clears the interval via the abort
    // listener) and then unmounts (effect cleanup clears it again, harmlessly).
    r.unmount();
    vi.advanceTimersByTime(1000);
    await flushAsync(backend);
    expect(count).toBe(1);
  });
});
