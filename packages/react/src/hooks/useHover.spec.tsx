import React from 'react';
import { expect, test } from 'vitest';
import { TestBackend, flush, flushAsync } from '@flowtty/core/testing';
import { render } from '../internal/render.js';
import { Box } from '../components/base/Box.js';
import { Text } from '../components/base/Text.js';
import { useHover } from './useHover.js';

test('useHover flips on enter and leave, and the component renders once per flip', async () => {
  const backend = new TestBackend(20, 4);
  let renders = 0;
  function Row({ label }: { label: string }) {
    const [hovered, hover] = useHover();
    renders += 1;
    return <Text {...hover} dim={!hovered}>{label}</Text>;
  }
  const r = await render(<Box flexDirection="column"><Row label="one" /><Row label="two" /></Box>, backend);
  await flushAsync(backend);
  const after = renders;
  backend.mouse('move', 1, 0);
  await flush();
  expect(backend.lastBuffer!.get(0, 0).style.dim).toBeUndefined();
  expect(backend.lastBuffer!.get(0, 1).style.dim).toBe(true);
  backend.mouse('move', 2, 0);
  await flush();
  expect(renders).toBe(after + 1);
  backend.mouse('move', 2, 1);
  await flush();
  expect(backend.lastBuffer!.get(0, 0).style.dim).toBe(true);
  expect(backend.lastBuffer!.get(0, 1).style.dim).toBeUndefined();
  expect(renders).toBe(after + 3);
  backend.mouse('leave');
  await flush();
  expect(backend.lastBuffer!.get(0, 1).style.dim).toBe(true);
  r.unmount();
});
