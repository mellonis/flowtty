import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { MultiSelect } from './multi-select.js';

test('renders all items with [ ] or [x] + cursor marker', async () => {
  function App() {
    return createElement(MultiSelect<string>, {
      items: [
        { label: 'a', value: 'a' },
        { label: 'b', value: 'b' },
        { label: 'c', value: 'c' },
      ],
      value: ['b'],
      onChange: () => {},
      onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('▸ [ ] a\n  [x] b\n  [ ] c');
});

test('space toggles cursor item (onChange fires with updated array, original-item-order)', async () => {
  const captured: string[][] = [];
  function App() {
    const [v, setV] = useState<string[]>([]);
    captured.push(v);
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }],
      value: v, onChange: setV, onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: ' ' });
  await flush();
  expect(captured[captured.length - 1]).toEqual(['a']);
  backend.press({ name: 'down' });
  await flush();
  backend.press({ name: ' ' });
  await flush();
  expect(captured[captured.length - 1]).toEqual(['a', 'b']);
  backend.press({ name: 'up' });
  await flush();
  backend.press({ name: ' ' });
  await flush();
  expect(captured[captured.length - 1]).toEqual(['b']);
});

test('enter submits the current value array in original item order', async () => {
  const submitted: string[][] = [];
  function App() {
    const [v, setV] = useState<string[]>(['b']);
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }, { label: 'c', value: 'c' }],
      value: v, onChange: setV, onSubmit: (arr: string[]) => submitted.push(arr),
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.press({ name: ' ' }); // toggle 'a' on
  await flush();
  backend.press({ name: 'return' });
  await flush();
  expect(submitted).toEqual([['a', 'b']]);
});
