import React from 'react';
import { afterEach, expect, test } from 'vitest';
import { Buffer, type Backend } from '@flowtty/core';
import { render, Box, Text, useTerminalSize } from '../index.js';

afterEach(() => {
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
});

// A surface with no height of its own: every frame is as tall as its content.
class UnboundedBackend implements Backend {
  last: Buffer | null = null;
  readonly fullScreen = false;
  constructor(private readonly cols = 20) {}
  size(): { width: number; height: number } {
    return { width: this.cols, height: Infinity };
  }
  draw(buffer: Buffer): void {
    this.last = buffer;
  }
}

test('a column taller than any screen is painted in full', async () => {
  const backend = new UnboundedBackend(20);
  const app = await render(
    <Box flexDirection="column">
      {Array.from({ length: 30 }, (_, i) => <Text key={i}>{`line ${i}`}</Text>)}
    </Box>,
    backend,
  );
  expect(backend.last?.height).toBe(30);
  expect(backend.last?.toString().split('\n')).toHaveLength(30);
  expect(backend.last?.toString().split('\n')[29]).toBe('line 29');
  app.unmount();
});

test('a bordered box is exactly as tall as its content, not stretched', async () => {
  const backend = new UnboundedBackend(9);
  const app = await render(
    <Box border="single" width={9}>
      <Text>hi</Text>
    </Box>,
    backend,
  );
  expect(backend.last?.toString()).toBe(
    [
      '┌───────┐',
      '│hi     │',
      '└───────┘',
    ].join('\n'),
  );
  expect(backend.last?.height).toBe(3);
  app.unmount();
});

test('useTerminalSize reports the unbounded height', async () => {
  const backend = new UnboundedBackend(20);
  let seen: number | null = null;
  function Probe(): React.ReactNode {
    seen = useTerminalSize().height;
    return <Text>ok</Text>;
  }
  const app = await render(<Probe />, backend);
  expect(seen).toBe(Infinity);
  app.unmount();
});

test('an empty tree paints an empty buffer rather than hanging', async () => {
  const backend = new UnboundedBackend(20);
  const app = await render(<Box height={0} />, backend);
  expect(backend.last?.height).toBe(0);
  expect(backend.last?.toString()).toBe('');
  app.unmount();
});
