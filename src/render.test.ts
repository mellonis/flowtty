import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render, Box, Text } from './index.js';
import { TestBackend, flush } from './testing.js';
import { useInput } from './use-input.js';

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

test('M1a acceptance: counter increments on key press and the test backend captures the repaint', async () => {
  function Counter() {
    const [n, setN] = useState(0);
    useInput((key) => { if (key.name === 'i') setN((x) => x + 1); });
    return createElement(Box, null, createElement(Text, null, String(n)));
  }
  const backend = new TestBackend(3, 1);
  await render(createElement(Counter), backend);
  expect(backend.lastFrame).toBe('0');
  backend.press({ name: 'i' });
  await flush();
  expect(backend.lastFrame).toBe('1');
  backend.press({ name: 'i' });
  backend.press({ name: 'i' });
  await flush();
  expect(backend.lastFrame).toBe('3');
});
