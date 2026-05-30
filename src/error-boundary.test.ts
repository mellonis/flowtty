import { describe, test, expect, vi } from 'vitest';
import { createElement, useEffect } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { ErrorBoundary } from './error-boundary.js';
import { flushAsync } from './testing.js';

describe('ErrorBoundary', () => {
  test('catches errors thrown during render and calls onError with source="react"', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    const onError = vi.fn();
    function Boom(): never { throw new Error('render boom'); }
    root.render(
      createElement(ErrorBoundary, { onError },
        createElement(Boom as unknown as () => null),
      ),
    );
    await flushAsync();
    expect(onError).toHaveBeenCalledTimes(1);
    const call = onError.mock.calls[0]?.[0];
    expect(call?.source).toBe('react');
    expect(String(call?.error)).toContain('render boom');
  });

  test('catches errors thrown inside useEffect', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    const onError = vi.fn();
    function Boom() {
      useEffect(() => { throw new Error('effect boom'); }, []);
      return createElement('flowtty-box', { width: 1, height: 1 });
    }
    root.render(
      createElement(ErrorBoundary, { onError },
        createElement(Boom),
      ),
    );
    await flushAsync();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].source).toBe('react');
    expect(String(onError.mock.calls[0]?.[0].error)).toContain('effect boom');
  });

  test('renders children normally when no error', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    const onError = vi.fn();
    root.render(
      createElement(ErrorBoundary, { onError },
        createElement('flowtty-box', { width: 5, height: 1 }),
      ),
    );
    await flushAsync();
    expect(onError).not.toHaveBeenCalled();
    // Container has the box child (proxy for "rendered normally")
    expect(container.children.length).toBe(1);
  });
});
