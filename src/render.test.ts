import { expect, test } from 'vitest';
import { createElement } from 'react';
import { render, Box, Text } from './index.js';
import { TestBackend } from './testing.js';

test('M0 acceptance: render(<Box><Text>hi</Text></Box>) captures "hi"', async () => {
  const backend = new TestBackend(5, 1);
  await render(createElement(Box, null, createElement(Text, null, 'hi')), backend);
  expect(backend.lastFrame).toBe('hi');
});

test('row of two boxes renders side by side', async () => {
  const backend = new TestBackend(6, 1);
  await render(
    createElement(Box, { flexDirection: 'row' },
      createElement(Box, { width: 2 }, createElement(Text, null, 'ab')),
      createElement(Box, { width: 2 }, createElement(Text, null, 'cd')),
    ),
    backend,
  );
  expect(backend.lastFrame).toBe('abcd');
});
