import { createElement, useState } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render } from './render.js';
import { Box } from './components.js';
import { useInput } from './use-input.js';
import { TestBackend } from './backends/test.js';

function flushAsync(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe('Box inert prop', () => {
  test('inert={true} suppresses useInput subscribers in the subtree', async () => {
    const cb = vi.fn();
    function Sub() { useInput(cb); return null; }
    const backend = new TestBackend(10, 1);
    await render(
      createElement(Box, { inert: true },
        createElement(Sub),
      ),
      backend,
    );
    await flushAsync();
    backend.press({ name: 'a' });
    await flushAsync();
    expect(cb).not.toHaveBeenCalled();
  });

  test('inert={false} (default) does NOT suppress input', async () => {
    const cb = vi.fn();
    function Sub() { useInput(cb); return null; }
    const backend = new TestBackend(10, 1);
    await render(
      createElement(Box, null,
        createElement(Sub),
      ),
      backend,
    );
    await flushAsync();
    backend.press({ name: 'a' });
    await flushAsync();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('toggling inert from false to true mutes ongoing input', async () => {
    const cb = vi.fn();
    function Sub() { useInput(cb); return null; }
    let setInert!: (v: boolean) => void;
    function Host() {
      const [inert, set] = useState(false);
      setInert = set;
      return createElement(Box, { inert },
        createElement(Sub),
      );
    }
    const backend = new TestBackend(10, 1);
    await render(createElement(Host), backend);
    await flushAsync();
    backend.press({ name: 'a' });
    await flushAsync();
    expect(cb).toHaveBeenCalledTimes(1);
    setInert(true);
    await flushAsync();
    backend.press({ name: 'b' });
    await flushAsync();
    expect(cb).toHaveBeenCalledTimes(1);  // still 1, ignored
  });
});
