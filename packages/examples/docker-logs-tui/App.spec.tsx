import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { App } from './App.js';
import type { LogSource } from './logSource.js';
import type { Container } from './types.js';

function fakeSource(): LogSource {
  const containers: Container[] = [
    { id: 'a', name: 'alpha', state: 'running', status: 'Up 1 hour' },
    { id: 'b', name: 'bravo', state: 'running', status: 'Up 2 hours' },
  ];
  return {
    async listContainers() { return containers; },
    streamLogs(id, _opts, onLine) {
      onLine(`[info] hello from ${id}`);
      onLine(`[error] boom in ${id}`);
      return () => {};
    },
  };
}

describe('App', () => {
  test('renders the container list and the selected container logs', async () => {
    const backend = new TestBackend(60, 12);
    const r = await render(<App source={fakeSource()} demo={false} onExit={() => {}} />, backend);
    await flushAsync(backend);
    const frame = backend.lastFrame;
    expect(frame).toContain('alpha');
    expect(frame).toContain('bravo');
    expect(frame).toContain('hello from a');
    r.unmount();
  });

  test('Down switches container and re-targets the stream', async () => {
    const backend = new TestBackend(60, 12);
    const r = await render(<App source={fakeSource()} demo={false} onExit={() => {}} />, backend);
    await flushAsync(backend);
    backend.press({ name: 'down' });
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('hello from b');
    r.unmount();
  });

  test('"/" opens a filter that narrows the visible lines', async () => {
    const backend = new TestBackend(60, 12);
    const r = await render(<App source={fakeSource()} demo={false} onExit={() => {}} />, backend);
    await flushAsync(backend);
    backend.press({ name: '/' });
    await flushAsync(backend);
    backend.type('boom');
    await flushAsync(backend);
    const frame = backend.lastFrame;
    expect(frame).toContain('boom in a');
    expect(frame).not.toContain('hello from a');
    r.unmount();
  });
});
