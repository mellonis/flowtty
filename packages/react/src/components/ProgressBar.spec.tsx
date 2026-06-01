import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { ProgressBar } from './ProgressBar.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

describe('ProgressBar', () => {
  test('fills the fixed width proportionally to the fraction', async () => {
    const backend = new TestBackend(20, 1);
    const r = await render(<ProgressBar value={0.5} width={10} />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('█████░░░░░');
    r.unmount();
  });

  test('derives the fraction from value/total', async () => {
    const backend = new TestBackend(20, 1);
    const r = await render(<ProgressBar value={3} total={4} width={8} />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('██████░░'); // round(0.75*8)=6
    r.unmount();
  });

  test('clamps out-of-range values', async () => {
    const over = new TestBackend(20, 1);
    const ro = await render(<ProgressBar value={5} total={4} width={6} />, over);
    await flushAsync(over);
    expect(over.lastFrame.trim()).toBe('██████');
    ro.unmount();

    const under = new TestBackend(20, 1);
    const ru = await render(<ProgressBar value={-1} width={6} />, under);
    await flushAsync(under);
    expect(under.lastFrame.trim()).toBe('░░░░░░');
    ru.unmount();
  });

  test('appends a percent readout when showPercent is set', async () => {
    const backend = new TestBackend(20, 1);
    const r = await render(<ProgressBar value={0.42} width={10} showPercent />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('42%');
    r.unmount();
  });

  test('fills the row when no width is given (onLayout-measured)', async () => {
    const backend = new TestBackend(10, 1);
    const r = await render(<ProgressBar value={1} />, backend);
    await flushAsync(backend);
    // Full progress across the whole 10-cell row.
    expect(backend.lastFrame.trim()).toBe('██████████');
    r.unmount();
  });
});
