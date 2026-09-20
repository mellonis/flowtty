import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from './render.js';
import { Text } from '../components/base/Text.js';
import { useInput } from '../hooks/useInput.js';
import { useApp } from '../hooks/useApp.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

class SpyBackend extends TestBackend {
  events: string[] = [];
  override dispose(): void { this.events.push('dispose'); }
}

describe('render() lifecycle', () => {
  test('waitUntilExit resolves after unmount, once the backend has restored the terminal', async () => {
    const backend = new SpyBackend(10, 1);
    const app = await render(<Text>hi</Text>, backend);
    let settled = false;
    const done = app.waitUntilExit().then(() => { settled = true; backend.events.push('resolved'); });
    await flushAsync(backend);
    expect(settled).toBe(false);
    app.unmount();
    await done;
    expect(backend.events).toEqual(['dispose', 'resolved']);
  });

  test('waitUntilExit called after the app is gone resolves immediately', async () => {
    const backend = new SpyBackend(10, 1);
    const app = await render(<Text>hi</Text>, backend);
    app.unmount();
    await app.waitUntilExit();
  });

  test('useApp().exit() quits from inside a component — here from a key handler', async () => {
    function App() {
      const { exit } = useApp();
      useInput((key) => { if (key.name === 'q') exit(); });
      return <Text>press q</Text>;
    }
    const backend = new SpyBackend(10, 1);
    const app = await render(<App />, backend);
    backend.press({ name: 'q' });
    await app.waitUntilExit();
    expect(backend.events).toEqual(['dispose']);
    // Already gone: a second unmount is a no-op, not a second dispose.
    app.unmount();
    expect(backend.events).toEqual(['dispose']);
  });

  test('exit(value) hands a result to waitUntilExit', async () => {
    function App() {
      const { exit } = useApp();
      useInput(() => exit({ picked: 'b' }));
      return <Text>pick</Text>;
    }
    const backend = new SpyBackend(10, 1);
    const app = await render(<App />, backend);
    backend.press({ name: 'return' });
    expect(await app.waitUntilExit()).toEqual({ picked: 'b' });
  });
});
