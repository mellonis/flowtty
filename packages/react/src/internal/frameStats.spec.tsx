import React, { useState } from 'react';
import { expect, test } from 'vitest';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { render, type FrameStats } from './render.js';
import { Box } from '../components/base/Box.js';
import { Text } from '../components/base/Text.js';
import { useInput } from '../hooks/useInput.js';

function App() {
  const [n, setN] = useState(0);
  useInput((key) => { if (key.name === 'x') { setN((v) => v + 1); return true; } });
  return (
    <Box flexDirection="column">
      <Text>{`count ${n}`}</Text>
      <Box width={10}><Text dim>static</Text></Box>
    </Box>
  );
}

test('onFrame reports the commits, the boxes applied and skipped, and the timings of every frame', async () => {
  const backend = new TestBackend(20, 4);
  const frames: FrameStats[] = [];
  const r = await render(<App />, backend, { onFrame: (f) => frames.push(f) });
  await flushAsync(backend);
  expect(frames.length).toBeGreaterThanOrEqual(1);
  const first = frames[0]!;
  expect(first.commits).toBe(1);
  expect(first.applied).toBe(4); // the column, the text, the box, its text
  expect(first.skipped).toBe(0);

  // Three keys in one chunk: three commits, one frame.
  frames.length = 0;
  backend.press({ name: 'x' }); backend.press({ name: 'x' }); backend.press({ name: 'x' });
  await flushAsync(backend);
  expect(frames.length).toBe(1);
  const next = frames[0]!;
  expect(next.commits).toBe(3);
  // Only the text that changed was re-applied (once per commit); the rest skipped.
  expect(next.applied).toBe(0);
  expect(next.skipped).toBeGreaterThanOrEqual(3);
  for (const ms of [next.layoutMs, next.paintMs, next.drawMs]) {
    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(0);
  }
  expect(backend.lastFrame).toContain('count 3');
  r.unmount();
});

test('a throwing onFrame does not break the frame', async () => {
  const backend = new TestBackend(20, 4);
  let calls = 0;
  const r = await render(<App />, backend, { onFrame: () => { calls += 1; throw new Error('boom'); }, onError: () => {} });
  await flushAsync(backend);
  expect(calls).toBeGreaterThanOrEqual(1);
  expect(backend.lastFrame).toContain('count 0');
  r.unmount();
});
