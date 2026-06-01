import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../internal/render.js';
import { Spinner } from './Spinner.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

// Fake only the interval timer; flushAsync + wasm + microtasks stay real.
beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
afterEach(() => vi.useRealTimers());

describe('Spinner', () => {
  test('renders the first frame of the default set, then advances', async () => {
    const backend = new TestBackend(6, 1);
    const r = await render(<Spinner />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('⠋');

    vi.advanceTimersByTime(80);
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('⠙');

    r.unmount();
  });

  test('honors a custom frame set and interval', async () => {
    const backend = new TestBackend(6, 1);
    const r = await render(<Spinner frames={['a', 'b', 'c']} interval={50} />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('a');

    vi.advanceTimersByTime(50);
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('b');

    vi.advanceTimersByTime(100); // wraps c -> a
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('a');

    r.unmount();
  });

  test('renders a label after the glyph', async () => {
    const backend = new TestBackend(20, 1);
    const r = await render(<Spinner label="Loading" />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('Loading');
    expect(backend.lastFrame.trim().startsWith('⠋')).toBe(true);

    r.unmount();
  });

  test('freezes once unmounted', async () => {
    const backend = new TestBackend(6, 1);
    const r = await render(<Spinner />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('⠋');

    r.unmount();
    const framesAfter = backend.frames.length;
    vi.advanceTimersByTime(1000);
    await flushAsync(backend);
    expect(backend.frames.length).toBe(framesAfter); // no new paints
  });
});
