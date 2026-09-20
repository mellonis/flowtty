import React from "react";
import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from '../index.js';
import { TestBackend, flush, flushAsync } from '@flowtty/core/testing';
import { MultiSelect } from './MultiSelect.js';

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

test('onAddNew prop adds a "+ add new" row at the bottom (after items)', async () => {
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: () => {}, onSubmit: () => {},
      onAddNew: () => {},
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('▸ [ ] a\n  + add new');
});

test('Enter on "+ add new" row calls onAddNew (NOT onSubmit)', async () => {
  let addCalled = false;
  const submits: string[][] = [];
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: () => {}, onSubmit: (v) => submits.push(v),
      onAddNew: () => { addCalled = true; },
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });   // cursor → '+ add new'
  await flush();
  backend.press({ name: 'return' });
  await flush();
  expect(addCalled).toBe(true);
  expect(submits).toEqual([]);
});

test('Space on "+ add new" row is a noop (no onChange)', async () => {
  let toggled = false;
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: (v: string[]) => { toggled = v.length > 0; }, onSubmit: () => {},
      onAddNew: () => {},
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });   // cursor → '+ add new'
  await flush();
  backend.press({ name: ' ' });
  await flush();
  expect(toggled).toBe(false);
});

test('without onAddNew, no "+ add new" row (back-compat)', async () => {
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: () => {}, onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('▸ [ ] a');
});

// ─── onAddNew with a result ──────────────────────────────────────────────────

test('onAddNew resolving with a value selects the new item and moves the cursor onto it', async () => {
  let resolveAdd!: (v: string | null) => void;
  let selected: string[] = [];
  function App() {
    const [items, setItems] = useState([{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }]);
    const [value, setValue] = useState<string[]>(['b']);
    selected = value;
    return createElement(MultiSelect<string>, {
      items, value, onChange: setValue, onSubmit: () => {},
      onAddNew: () => new Promise<string | null>((resolve) => {
        resolveAdd = (v) => { if (v) setItems((cur) => [...cur, { label: v, value: v }]); resolve(v); };
      }),
    });
  }
  const backend = new TestBackend(20, 4);
  await render(createElement(App), backend);
  backend.press({ name: 'down' }); backend.press({ name: 'down' }); // → '+ add new'
  await flush();
  backend.press({ name: 'return' });
  await flush();
  resolveAdd('c');
  await flushAsync(backend);
  expect(selected).toEqual(['b', 'c']);
  expect(backend.lastFrame).toBe('  [ ] a\n  [x] b\n▸ [x] c\n  + add new');
});

test('onAddNew resolving with null (the sub-prompt was cancelled) changes nothing', async () => {
  const changes: string[][] = [];
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }], value: [], onChange: (v: string[]) => changes.push(v), onSubmit: () => {},
      onAddNew: async () => null,
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });
  await flush();
  backend.press({ name: 'return' });
  await flushAsync(backend);
  expect(changes).toEqual([]);
  expect(backend.lastFrame).toBe('  [ ] a\n▸ + add new');
});

test('onAddNew may also return the value synchronously', async () => {
  let selected: string[] = [];
  function App() {
    const [items, setItems] = useState([{ label: 'a', value: 'a' }]);
    const [value, setValue] = useState<string[]>([]);
    selected = value;
    return createElement(MultiSelect<string>, {
      items, value, onChange: setValue, onSubmit: () => {},
      onAddNew: () => { setItems((cur) => [...cur, { label: 'z', value: 'z' }]); return 'z'; },
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });
  await flush();
  backend.press({ name: 'return' });
  await flushAsync(backend);
  expect(selected).toEqual(['z']);
  expect(backend.lastFrame).toBe('  [ ] a\n▸ [x] z\n  + add new');
});
