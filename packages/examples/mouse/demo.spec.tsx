// The demo screen mounts headlessly and hover reaches the nested boxes — so
// the file cannot rot between the manual runs it exists for.
import React from 'react';
import { expect, test } from 'vitest';
import { render } from '@flowtty/react';
import { TestBackend, flush, flushAsync } from '@flowtty/core/testing';
import { App } from './app.js';

test('the mouse demo renders, and a move over a card lights the card and the panel', async () => {
  const backend = new TestBackend(110, 40);
  const r = await render(<App />, backend);
  await flushAsync(backend);
  const frame = backend.lastFrame;
  for (const s of ['nested hover', 'nested clicks', 'ScrollList', 'ListSelect', 'hover trace']) expect(frame).toContain(s);
  const rows = frame.split('\n');
  const y = rows.findIndex((l) => l.includes('alpha'));
  const x = rows[y]!.indexOf('alpha');
  backend.mouse('move', x, y);
  await flush();
  expect(backend.lastFrame).toContain('alpha: enter');
  expect(backend.lastFrame).toContain('pointer is inside the panel');
  backend.mouse('leave');
  await flush();
  expect(backend.lastFrame).toContain('alpha: leave');
  r.unmount();
});
