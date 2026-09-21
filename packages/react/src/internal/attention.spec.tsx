import React, { useEffect } from 'react';
import { describe, test, expect } from 'vitest';
import { render } from './render.js';
import { Text } from '../components/base/Text.js';
import { useInput } from '../hooks/useInput.js';
import { useApp } from '../hooks/useApp.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import type { Backend, Buffer } from '@flowtty/core';
import type { AppApi } from '../context/appContext.js';

// A backend with neither capability — the passive/headless case.
class SilentBackend implements Backend {
  frames: string[] = [];
  size(): { width: number; height: number } { return { width: 10, height: 1 }; }
  draw(buffer: Buffer): void { this.frames.push(buffer.toString()); }
}

describe('getting attention', () => {
  test('useApp().bell() and .notify() reach the backend', async () => {
    function App() {
      const { bell, notify } = useApp();
      useInput((key) => {
        if (key.name === 'b') bell();
        if (key.name === 'n') notify('Build', 'done');
        if (key.name === 'r') notify('Reminder');
      });
      return <Text>hi</Text>;
    }
    const backend = new TestBackend(10, 1);
    const app = await render(<App />, backend);
    backend.press({ name: 'b' });
    backend.press({ name: 'n' });
    backend.press({ name: 'r' });
    await flushAsync(backend);
    expect(backend.bells).toBe(1);
    expect(backend.notifications).toEqual([{ title: 'Build', body: 'done' }, { title: 'Reminder' }]);
    app.unmount();
  });

  test('they work from an effect too', async () => {
    function App() {
      const { notify } = useApp();
      useEffect(() => { notify('Ready'); }, [notify]);
      return <Text>hi</Text>;
    }
    const backend = new TestBackend(10, 1);
    const app = await render(<App />, backend);
    await flushAsync(backend);
    expect(backend.notifications).toEqual([{ title: 'Ready' }]);
    app.unmount();
  });

  test('the render handle carries the same two', async () => {
    const backend = new TestBackend(10, 1);
    const app = await render(<Text>hi</Text>, backend);
    app.bell();
    app.notify('Build', 'done');
    expect(backend.bells).toBe(1);
    expect(backend.notifications).toEqual([{ title: 'Build', body: 'done' }]);
    app.unmount();
  });

  test('after unmount they do nothing', async () => {
    const captured: { api: AppApi | null } = { api: null };
    function App() {
      captured.api = useApp();
      return <Text>hi</Text>;
    }
    const backend = new TestBackend(10, 1);
    const app = await render(<App />, backend);
    await flushAsync(backend);
    app.unmount();
    app.bell();
    app.notify('Too late');
    captured.api?.bell();
    captured.api?.notify('Too late');
    expect(backend.bells).toBe(0);
    expect(backend.notifications).toEqual([]);
  });

  test('a backend without the capabilities makes them silent no-ops', async () => {
    function App() {
      const { bell, notify } = useApp();
      useEffect(() => { bell(); notify('Ready'); }, [bell, notify]);
      return <Text>hi</Text>;
    }
    const backend = new SilentBackend();
    const app = await render(<App />, backend);
    await flushAsync(backend);
    app.bell();
    app.notify('Ready');
    expect(backend.frames.at(-1)).toBe('hi');
    app.unmount();
  });
});
