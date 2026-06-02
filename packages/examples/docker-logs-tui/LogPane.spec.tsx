import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { LogPane } from './LogPane.js';
import type { LogLine } from './types.js';

const mk = (n: number): LogLine[] =>
  Array.from({ length: n }, (_, i) => ({
    text: `line-${String(i).padStart(2, '0')}`,
    level: 'info' as const,
  }));

describe('LogPane', () => {
  test('follow pins the newest lines to the bottom and clips the oldest', async () => {
    const backend = new TestBackend(20, 5); // 5 rows tall
    const r = await render(<LogPane lines={mk(20)} follow topIndex={0} wrap={false} />, backend);
    await flushAsync(backend);
    const frame = backend.lastFrame;
    expect(frame).toContain('line-19');     // newest, at the bottom
    expect(frame).not.toContain('line-00'); // oldest, clipped off the top
    r.unmount();
  });

  test('paused mode windows from topIndex', async () => {
    const backend = new TestBackend(20, 5);
    const r = await render(<LogPane lines={mk(20)} follow={false} topIndex={2} wrap={false} />, backend);
    await flushAsync(backend);
    const frame = backend.lastFrame;
    expect(frame).toContain('line-02');
    expect(frame).not.toContain('line-19');
    r.unmount();
  });
});
