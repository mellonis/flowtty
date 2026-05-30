import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render, Box, Text } from './index.js';
import { TestBackend, flush } from './testing.js';
import { TextInput } from './text-input.js';

test('TextInput renders the value with a trailing cursor bar', async () => {
  function App() {
    return createElement(TextInput, { value: 'hi', onChange: () => {} });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  // Cursor defaults to end of value → 'hi' + inverse-space cursor (trims to 'hi')
  expect(backend.lastFrame).toBe('hi');
});

test('typing appends characters and onChange fires per key', async () => {
  let captured = '';
  function App() {
    const [v, setV] = useState('');
    captured = v;
    return createElement(TextInput, { value: v, onChange: setV });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.type('hi');
  await flush();
  expect(captured).toBe('hi');
  expect(backend.lastFrame).toBe('hi');
});

test('backspace removes the char before cursor', async () => {
  function App() {
    const [v, setV] = useState('hello');
    return createElement(TextInput, { value: v, onChange: setV });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.press({ name: 'backspace' });
  await flush();
  expect(backend.lastFrame).toBe('hell');
});

test('mask renders bullets instead of characters', async () => {
  function App() {
    return createElement(TextInput, { value: 'secret', onChange: () => {}, mask: true });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('••••••'); // six bullets + cursor bar
});

test('isFocused: false suppresses key handling (value unchanged)', async () => {
  let captured = '';
  function App() {
    const [v, setV] = useState('a');
    captured = v;
    return createElement(TextInput, { value: v, onChange: setV, isFocused: false });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.type('xy');
  await flush();
  expect(captured).toBe('a');
});

test('M1b acceptance: type, edit with cursor moves, validate-gated submit, then cancel', async () => {
  const events: string[] = [];
  function App() {
    const [v, setV] = useState('');
    return createElement(TextInput, {
      value: v,
      onChange: setV,
      validate: (x: string) => (x.length < 3 ? 'too short' : null),
      onSubmit: (final: string) => { events.push(`submit:${final}`); },
      onCancel: () => { events.push('cancel'); },
    });
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);

  // Type "helo"
  backend.type('helo');
  await flush();
  expect(backend.lastFrame).toBe('helo');

  // Move cursor back one and insert 'l' to make "hello".
  // The cursor is now rendered as the actual character with inverse style (not
  // a separate cursor glyph), so the visible content is just the value chars.
  backend.press({ name: 'left' });
  await flush();
  expect(backend.lastFrame).toBe('helo');
  backend.press({ name: 'l', sequence: 'l' });
  await flush();
  expect(backend.lastFrame).toBe('hello');

  // Submit — validate passes (length 5 >= 3) → onSubmit fires with "hello"
  backend.press({ name: 'return' });
  await flush();
  expect(events).toEqual(['submit:hello']);

  // Clear with Ctrl-A (home) then Ctrl-K (kill to end), then try submit with a too-short value
  backend.press({ name: 'a', ctrl: true });    // home
  backend.press({ name: 'k', ctrl: true });    // kill to end → empty
  await flush();
  backend.type('hi');
  await flush();
  backend.press({ name: 'return' });           // validate fails (length 2 < 3) → no submit
  await flush();
  expect(events).toEqual(['submit:hello']);    // unchanged — second submit blocked

  // Cancel
  backend.press({ name: 'escape' });
  await flush();
  expect(events).toEqual(['submit:hello', 'cancel']);
});

test('M1d acceptance: <Box width=10 backgroundColor=blue><Text color=red bold wrap>hello world</Text></Box>', async () => {
  function App() {
    return createElement(Box, { width: 10, height: 3, backgroundColor: 'blue' },
      createElement(Text, { color: 'red', bold: true, wrap: 'wrap' }, 'hello world'),
    );
  }
  const backend = new TestBackend(10, 3);
  await render(createElement(App), backend);
  // Plain text frame: text wraps to two rows; bg fills the third row.
  expect(backend.lastFrame).toBe('hello\nworld');
  // Cell-level style: text cells red+bold over blue; bg-only cells just blue.
  const buf = backend.lastBuffer!;
  expect(buf.get(0, 0)).toEqual({ char: 'h', style: { fg: 'red', bold: true, bg: 'blue' } });
  expect(buf.get(4, 0)).toEqual({ char: 'o', style: { fg: 'red', bold: true, bg: 'blue' } });
  expect(buf.get(5, 0)).toEqual({ char: ' ', style: { bg: 'blue' } });
  expect(buf.get(0, 2)).toEqual({ char: ' ', style: { bg: 'blue' } });
});
