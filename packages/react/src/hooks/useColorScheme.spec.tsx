import React from 'react';
import { describe, expect, test } from 'vitest';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { render } from '../internal/render.js';
import { Text } from '../components/base/Text.js';
import { useColorScheme } from './useColorScheme.js';
import { useApp } from './useApp.js';

function Reader() {
  const { scheme, background } = useColorScheme();
  return <Text>{scheme}{background ? ` ${background}` : ''}</Text>;
}

describe('useColorScheme', () => {
  test("unknown until the backend answers, then re-renders on every change", async () => {
    const backend = new TestBackend(20, 1);
    const app = await render(<Reader />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('unknown');

    backend.setColorScheme('dark', '#000000');
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('dark #000000');

    backend.setColorScheme('light');
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('light');
    app.unmount();
  });

  test('an answer that arrived before the first render is the initial value', async () => {
    const backend = new TestBackend(20, 1);
    backend.setColorScheme('light', '#fdf6e3');
    const app = await render(<Reader />, backend);
    await flushAsync(backend);
    expect(backend.lastFrame.trim()).toBe('light #fdf6e3');
    app.unmount();
  });

  test('useApp().colorScheme reads the same answer, without a re-render of its own', async () => {
    const backend = new TestBackend(20, 1);
    let seen: string | undefined;
    function Probe() {
      const app = useApp();
      seen = app.colorScheme.scheme;
      return <Text>x</Text>;
    }
    const app = await render(<Probe />, backend);
    await flushAsync(backend);
    expect(seen).toBe('unknown');
    backend.setColorScheme('dark');
    expect(app.colorScheme).toEqual({ scheme: 'dark' });
    app.unmount();
  });
});
