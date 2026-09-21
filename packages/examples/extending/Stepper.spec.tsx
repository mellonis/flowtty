import React, { useState } from 'react';
import { test, expect } from 'vitest';
import { render } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { Stepper } from './Stepper.js';

function Host({ focused = true }: { focused?: boolean }) {
  const [v, setV] = useState(5);
  return <Stepper value={v} onChange={setV} isFocused={focused} />;
}

test('→ fills the bar, ← empties it, and the value stays within bounds', async () => {
  const backend = new TestBackend(16, 1);
  const app = await render(<Host />, backend);
  await flushAsync(backend);                       // the bar measures itself first
  expect(backend.lastFrame).toBe('▸ ██████░░░░░  5');

  backend.press({ name: 'right' });
  await flushAsync(backend);
  expect(backend.lastFrame).toBe('▸ ███████░░░░  6');

  for (let i = 0; i < 20; i++) backend.press({ name: 'right' });
  await flushAsync(backend);
  expect(backend.lastFrame).toBe('▸ ███████████ 10'); // clamped at max
  app.unmount();
});

test('unfocused: no marker, keys ignored', async () => {
  const backend = new TestBackend(16, 1);
  const app = await render(<Host focused={false} />, backend);
  await flushAsync(backend);
  backend.press({ name: 'right' });
  await flushAsync(backend);
  expect(backend.lastFrame).toBe('  ██████░░░░░  5');
  // Style lives in the cells: the filled part is cyan, the rest dim.
  expect(backend.lastBuffer!.get(2, 0).style.fg).toBe('cyan');
  expect(backend.lastBuffer!.get(8, 0).style.dim).toBe(true);
  app.unmount();
});
