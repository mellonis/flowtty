import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { useRootAbortSignal } from './useRootAbortSignal.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

describe('useRootAbortSignal', () => {
  test('provides a live (non-aborted) signal during render', async () => {
    const backend = new TestBackend(10, 2);
    let captured: AbortSignal | null = null;
    function App() {
      captured = useRootAbortSignal();
      return null;
    }
    const r = await render(<App />, backend);
    await flushAsync(backend);

    expect(captured).not.toBeNull();
    expect(captured!.aborted).toBe(false);
    r.unmount();
  });

  test('aborts the signal on unmount', async () => {
    const backend = new TestBackend(10, 2);
    let captured: AbortSignal | null = null;
    let fired = false;
    function App() {
      captured = useRootAbortSignal();
      return null;
    }
    const r = await render(<App />, backend);
    await flushAsync(backend);
    captured!.addEventListener('abort', () => { fired = true; });

    expect(captured!.aborted).toBe(false);
    r.unmount();
    expect(captured!.aborted).toBe(true);
    expect(fired).toBe(true);
  });

  test('exposes a read-only signal — no controller reaches user code', async () => {
    const backend = new TestBackend(10, 2);
    let captured: AbortSignal | null = null;
    function App() {
      captured = useRootAbortSignal();
      return null;
    }
    const r = await render(<App />, backend);
    await flushAsync(backend);

    // The hook hands back an AbortSignal, which has no abort() — only the
    // private controller can fire it, so nested components cannot tear the tree down.
    expect(captured).toBeInstanceOf(AbortSignal);
    expect((captured as unknown as { abort?: unknown }).abort).toBeUndefined();
    r.unmount();
  });

  test('aborts on the error teardown path (custom onError)', async () => {
    const backend = new TestBackend(10, 2);
    let captured: AbortSignal | null = null;
    function Boom(): React.ReactNode {
      captured = useRootAbortSignal();
      throw new Error('boom');
    }
    await render(<Boom />, backend, { onError: () => {} });
    await flushAsync(backend);

    expect(captured).not.toBeNull();
    expect(captured!.aborted).toBe(true);
  });
});
