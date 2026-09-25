import React from 'react';
import { test, expect } from 'vitest';
import { render } from '../internal/render.js';
import { HelpBar } from './HelpBar.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

test('the help bar pads by display column: a wide glyph does not push its text into the ellipsis', async () => {
  const backend = new TestBackend(12, 1);
  const r = await render(<HelpBar>{'日本語 help'}</HelpBar>, backend);
  await flushAsync(backend);
  expect(backend.lastFrame).toBe('日本語 help');
  // The inverse band reaches the last column: the padding is exactly the width.
  expect(backend.lastBuffer!.get(11, 0).style.inverse).toBe(true);
  r.unmount();
});
