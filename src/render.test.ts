import { describe, expect, test, vi } from 'vitest';
import { createElement, useEffect, useState } from 'react';
import { render, Box, Text } from './index.js';
import { TestBackend, flush, flushAsync } from './testing.js';
import { useInput } from './use-input.js';

test('M0 acceptance: render(<Box><Text>hi</Text></Box>) captures "hi"', async () => {
  const backend = new TestBackend(5, 1);
  const handle = await render(createElement(Box, null, createElement(Text, null, 'hi')), backend);
  expect(backend.lastFrame).toBe('hi');
  handle.unmount();
});

test('row of two boxes renders side by side', async () => {
  const backend = new TestBackend(6, 1);
  const handle = await render(
    createElement(Box, { flexDirection: 'row' },
      createElement(Box, { width: 2 }, createElement(Text, null, 'ab')),
      createElement(Box, { width: 2 }, createElement(Text, null, 'cd')),
    ),
    backend,
  );
  expect(backend.lastFrame).toBe('abcd');
  handle.unmount();
});

test('M1a acceptance: counter increments on key press and the test backend captures the repaint', async () => {
  function Counter() {
    const [n, setN] = useState(0);
    useInput((key) => { if (key.name === 'i') setN((x) => x + 1); });
    return createElement(Box, null, createElement(Text, null, String(n)));
  }
  const backend = new TestBackend(3, 1);
  const handle = await render(createElement(Counter), backend);
  expect(backend.lastFrame).toBe('0');
  backend.press({ name: 'i' });
  await flush();
  expect(backend.lastFrame).toBe('1');
  backend.press({ name: 'i' });
  backend.press({ name: 'i' });
  await flush();
  expect(backend.lastFrame).toBe('3');
  handle.unmount();
});

describe('render error handling', () => {
  test('render-thrown error calls onError with source="react" and disposes backend', async () => {
    const backend = new TestBackend(10, 3);
    const dispose = vi.spyOn(backend, 'dispose');
    const onError = vi.fn();
    function Boom(): never { throw new Error('render boom'); }
    await render(createElement(Boom), backend, { onError });
    await flushAsync();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]!.source).toBe('react');
    expect(String(onError.mock.calls[0]![0]!.error)).toContain('render boom');
    expect(dispose).toHaveBeenCalled();
  });

  test('useEffect-thrown error caught with source="react"', async () => {
    const backend = new TestBackend(10, 3);
    const onError = vi.fn();
    function Boom() {
      useEffect(() => { throw new Error('effect boom'); }, []);
      return createElement('flowtty-box', { width: 1, height: 1 });
    }
    await render(createElement(Boom), backend, { onError });
    await flushAsync();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]!.source).toBe('react');
  });

  test('process uncaughtException routes to onError with source="uncaughtException"', async () => {
    const backend = new TestBackend(10, 3);
    const onError = vi.fn();
    const handle = await render(createElement('flowtty-box', { width: 1, height: 1 }), backend, { onError });
    await flushAsync();
    process.emit('uncaughtException', new Error('uncaught boom'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]!.source).toBe('uncaughtException');
    expect(String(onError.mock.calls[0]![0]!.error)).toContain('uncaught boom');
    handle.unmount();
  });

  test('process unhandledRejection routes to onError with source="unhandledRejection"', async () => {
    const backend = new TestBackend(10, 3);
    const onError = vi.fn();
    const handle = await render(createElement('flowtty-box', { width: 1, height: 1 }), backend, { onError });
    await flushAsync();
    process.emit('unhandledRejection', new Error('promise boom'), Promise.resolve());
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]!.source).toBe('unhandledRejection');
    handle.unmount();
  });

  test('cleanup is single-shot (multiple errors → onError fires once)', async () => {
    const backend = new TestBackend(10, 3);
    const onError = vi.fn();
    const handle = await render(createElement('flowtty-box', { width: 1, height: 1 }), backend, { onError });
    await flushAsync();
    process.emit('uncaughtException', new Error('first'));
    process.emit('uncaughtException', new Error('second'));
    process.emit('unhandledRejection', new Error('third'), Promise.resolve());
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0]![0]!.error)).toContain('first');
    handle.unmount();
  });

  test('unmount removes process error listeners', async () => {
    const backend = new TestBackend(10, 3);
    const onError = vi.fn();
    const handle = await render(createElement('flowtty-box', { width: 1, height: 1 }), backend, { onError });
    await flushAsync();
    handle.unmount();
    // After unmount, emit shouldn't reach onError
    process.emit('uncaughtException', new Error('after-unmount'));
    expect(onError).not.toHaveBeenCalled();
  });
});
