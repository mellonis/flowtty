import React from 'react';
import { afterEach, describe, test, expect, vi } from 'vitest';
import { render } from './render.js';
import { Text } from '../components/base/Text.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

class SpyBackend extends TestBackend {
  events: string[] = [];
  override dispose(): void { this.events.push('dispose'); }
}

// `kill -TERM` (or a closed terminal, SIGHUP) must not leave the user's terminal
// in the alt screen with the cursor hidden. render() restores it, then lets the
// signal do what it would have done: re-raise, so the exit status is the signal's.
describe('render() and termination signals', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT'] as const) {
    test(`${signal}: the backend is disposed first, then the signal is re-raised`, async () => {
      const kill = vi.spyOn(process, 'kill').mockImplementation(() => { order.push('kill'); return true; });
      const order: string[] = [];
      const backend = new SpyBackend(10, 1);
      const originalDispose = backend.dispose.bind(backend);
      backend.dispose = () => { order.push('dispose'); originalDispose(); };
      const app = await render(<Text>hi</Text>, backend);
      await flushAsync(backend);

      process.emit(signal, signal);

      expect(order).toEqual(['dispose', 'kill']);
      expect(kill).toHaveBeenCalledWith(process.pid, signal);
      await app.waitUntilExit(); // the app counts as gone
      expect(process.listenerCount(signal)).toBe(0);
    });
  }

  test('unmount releases the signal handlers', async () => {
    const before = process.listenerCount('SIGTERM');
    const app = await render(<Text>hi</Text>, new SpyBackend(10, 1));
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    app.unmount();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });

  test('an app with its own handler keeps control: the terminal is restored, the signal is not re-raised', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const own = vi.fn();
    process.on('SIGTERM', own);
    const backend = new SpyBackend(10, 1);
    await render(<Text>hi</Text>, backend);
    process.emit('SIGTERM', 'SIGTERM');
    expect(backend.events).toEqual(['dispose']);
    expect(own).toHaveBeenCalledTimes(1);
    expect(kill).not.toHaveBeenCalled();
    process.removeListener('SIGTERM', own);
  });
});
