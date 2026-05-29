import { expect, test } from 'vitest';
import { createElement } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { Confirm } from './confirm.js';

test('renders message with default=yes hint (Y/n)', async () => {
  function App() {
    return createElement(Confirm, { message: 'continue?', onSubmit: () => {} });
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('continue? (Y/n)');
});

test('default=no renders (y/N)', async () => {
  function App() {
    return createElement(Confirm, { message: 'delete?', defaultValue: 'no', onSubmit: () => {} });
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('delete? (y/N)');
});

test('y/Y → onSubmit(true)', async () => {
  const captured: boolean[] = [];
  function App() {
    return createElement(Confirm, { message: 'ok?', onSubmit: (yes: boolean) => captured.push(yes) });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.press({ name: 'y' });
  await flush();
  expect(captured).toEqual([true]);
});

test('n/N → onSubmit(false)', async () => {
  const captured: boolean[] = [];
  function App() {
    return createElement(Confirm, { message: 'ok?', onSubmit: (yes: boolean) => captured.push(yes) });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.press({ name: 'n' });
  await flush();
  expect(captured).toEqual([false]);
});

test('Enter takes the default (yes by default, no when defaultValue=no)', async () => {
  const a: boolean[] = [];
  const b: boolean[] = [];
  function AppYes() {
    return createElement(Confirm, { message: '?', onSubmit: (yes: boolean) => a.push(yes) });
  }
  function AppNo() {
    return createElement(Confirm, { message: '?', defaultValue: 'no', onSubmit: (yes: boolean) => b.push(yes) });
  }
  const back1 = new TestBackend(10, 1);
  await render(createElement(AppYes), back1);
  back1.press({ name: 'return' });
  await flush();
  expect(a).toEqual([true]);

  const back2 = new TestBackend(10, 1);
  await render(createElement(AppNo), back2);
  back2.press({ name: 'return' });
  await flush();
  expect(b).toEqual([false]);
});

test('Esc calls onCancel', async () => {
  let cancelled = false;
  function App() {
    return createElement(Confirm, { message: '?', onSubmit: () => {}, onCancel: () => { cancelled = true; } });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.press({ name: 'escape' });
  await flush();
  expect(cancelled).toBe(true);
});
