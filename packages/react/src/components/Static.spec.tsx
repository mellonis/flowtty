import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { useState, useEffect } from 'react';
import { render } from '../internal/render.js';
import { Static } from './Static.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import type { Backend } from '@flowtty/core';

describe('Static', () => {
  test('no-op against a backend without printStatic (TestBackend)', async () => {
    // Mounting Static against TestBackend must not throw or crash.
    const backend = new TestBackend(20, 5);
    const r = await render(<Static items={['a', 'b']} />, backend);
    await flushAsync(backend);
    r.unmount();
  });

  test('calls printStatic with new items only — previously-seen items are not re-sent', async () => {
    const printStatic = vi.fn();
    // Minimal backend stub with printStatic + the required Backend surface.
    // `drawn` records each commit's paint so flushAsync has a quiescence signal
    // (the stub has no TestBackend.frames to key the deterministic pump off of).
    const drawn: unknown[] = [];
    const backend: Backend = {
      size: () => ({ width: 20, height: 5 }),
      draw: () => { drawn.push(1); },
      printStatic,
    };

    let setItems: (v: string[]) => void = () => {};
    function App() {
      const [items, set] = useState<string[]>(['x', 'y']);
      setItems = set;
      return <Static items={items} />;
    }

    const r = await render(<App />, backend);
    await flushAsync({ frames: drawn });

    expect(printStatic).toHaveBeenCalledTimes(1);
    expect(printStatic).toHaveBeenLastCalledWith(['x', 'y']);

    // Append two items — only the new ones flow through.
    setItems(['x', 'y', 'z', 'w']);
    await flushAsync({ frames: drawn });
    expect(printStatic).toHaveBeenCalledTimes(2);
    expect(printStatic).toHaveBeenLastCalledWith(['z', 'w']);

    // Same array length → no call.
    setItems(['x', 'y', 'z', 'w']);
    await flushAsync({ frames: drawn });
    expect(printStatic).toHaveBeenCalledTimes(2);

    r.unmount();
  });

  test('renders nothing in the live region', async () => {
    const backend = new TestBackend(10, 2);
    const r = await render(<Static items={['x']} />, backend);
    await flushAsync(backend);
    // TestBackend captures painted Buffer frames. Static returns null, so the
    // frame should be all-blank.
    expect(backend.lastFrame.trim()).toBe('');
    r.unmount();
  });
});
