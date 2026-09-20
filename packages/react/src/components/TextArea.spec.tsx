import React, { useState } from 'react';
import { describe, test, expect } from 'vitest';
import type { Key } from '@flowtty/core';
import { render } from '../internal/render.js';
import { Text } from './base/Text.js';
import { TextArea, type TextAreaProps } from './TextArea.js';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

// Mount a TextArea holding its own value; expose the latest value/cursor and the frame.
async function mount(initial: string, props: Partial<TextAreaProps> = {}, w = 12, h = 8) {
  const seen = { value: initial, cursor: -1, submitted: null as string | null, set: (_: string) => {} };
  function App() {
    const [v, setV] = useState(initial);
    seen.value = v;
    seen.set = setV;
    return (
      <TextArea
        value={v} onChange={setV} isFocused
        onCursorChange={(c) => { seen.cursor = c; }}
        onSubmit={(x) => { seen.submitted = x; }}
        {...props}
      />
    );
  }
  const backend = new TestBackend(w, h);
  const r = await render(<App />, backend);
  await flushAsync(backend);
  const frame = async () => { await flushAsync(backend); return backend.lastFrame.split('\n'); };
  const caret = async () => {
    await flushAsync(backend);
    const buf = backend.lastBuffer!;
    for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.get(x, y).style.inverse) return { x, y };
    return null;
  };
  return { backend, seen, frame, caret, unmount: r.unmount };
}

describe('TextArea', () => {
  test('renders one row per line, blank lines included', async () => {
    const { frame, unmount } = await mount('one\n\ntwo');
    expect(await frame()).toEqual(['one', '', 'two']);
    unmount();
  });

  test('soft-wraps a long line to the field width', async () => {
    const { frame, unmount } = await mount('abcdefghijklmnop', {}, 10);
    expect(await frame()).toEqual(['abcdefghij', 'klmnop']);
    unmount();
  });

  test('typing inserts at the caret; the caret starts at the end', async () => {
    const { backend, seen, frame, unmount } = await mount('ab');
    backend.type('c');
    expect(await frame()).toEqual(['abc']);
    expect(seen.value).toBe('abc');
    unmount();
  });

  test('Enter submits; Alt+Enter and backslash-Enter add a line instead', async () => {
    const { backend, seen, frame, unmount } = await mount('one');
    backend.press({ name: 'return', meta: true });
    backend.type('two\\');
    await frame();
    backend.press({ name: 'return' });
    expect(await frame()).toEqual(['one', 'two']);
    expect(seen.submitted).toBeNull();
    backend.press({ name: 'return' });
    await frame();
    expect(seen.submitted).toBe('one\ntwo\n');
    unmount();
  });

  test('a paste keeps its line breaks', async () => {
    const { backend, seen, frame, unmount } = await mount('');
    backend.paste('a\n\nb');
    expect(await frame()).toEqual(['a', '', 'b']);
    expect(seen.value).toBe('a\n\nb');
    expect(seen.submitted).toBeNull();
    unmount();
  });

  test('the caret can stand on a blank line, and stays on a line that ends with a break', async () => {
    const { backend, caret, unmount } = await mount('one\n\ntwo');
    backend.press({ name: 'up' });
    expect(await caret()).toEqual({ x: 0, y: 1 });
    backend.press({ name: 'up' });
    expect(await caret()).toEqual({ x: 0, y: 0 });
    backend.press({ name: 'end' });
    expect(await caret()).toEqual({ x: 3, y: 0 });
    unmount();
  });

  test('onKey runs first and can consume a key; unconsumed keys reach the field', async () => {
    const got: string[] = [];
    const onKey = (k: Key) => { got.push(k.name); return k.name === 'tab' || k.name === 'x'; };
    const { backend, seen, frame, unmount } = await mount('', { onKey });
    backend.type('xy');
    backend.press({ name: 'tab' });
    await frame();
    expect(got).toEqual(['x', 'y', 'tab']);
    expect(seen.value).toBe('y');
    unmount();
  });

  test('a value replaced from outside puts the caret at its end', async () => {
    const { backend, seen, caret, unmount } = await mount('abc');
    backend.press({ name: 'home' });
    expect(await caret()).toEqual({ x: 0, y: 0 });
    seen.set('history entry');
    expect(await caret()).toEqual({ x: 1, y: 1 }); // width 12: "history entr" / "y" + caret
    unmount();
  });

  test('controlled caret: `cursor` places it and movement only reports through onCursorChange', async () => {
    const { backend, seen, caret, unmount } = await mount('hello', { cursor: 2 });
    expect(await caret()).toEqual({ x: 2, y: 0 });
    backend.press({ name: 'right' });
    expect(await caret()).toEqual({ x: 2, y: 0 });
    expect(seen.cursor).toBe(3);
    unmount();
  });

  test('prefix on the first row, continuationPrefix on the rest; text wraps in what is left', async () => {
    const { frame, unmount } = await mount('abcdefghijkl\nz', { prefix: '› ', continuationPrefix: '  ' }, 10);
    expect(await frame()).toEqual(['› abcdefgh', '  ijkl', '  z']);
    unmount();
  });

  test('maxRows windows the rows around the caret', async () => {
    const { backend, frame, unmount } = await mount('r0\nr1\nr2\nr3\nr4', { maxRows: 3 });
    expect(await frame()).toEqual(['r2', 'r3', 'r4']);
    backend.press({ name: 'up' }); backend.press({ name: 'up' }); backend.press({ name: 'up' });
    expect(await frame()).toEqual(['r1', 'r2', 'r3']);
    unmount();
  });

  test('ghost text follows the caret at the end of the value, dim, with the caret on its first character', async () => {
    const { backend, frame, caret, unmount } = await mount('/he', { ghost: 'lp me' });
    expect(await frame()).toEqual(['/help me']);
    expect(await caret()).toEqual({ x: 3, y: 0 });
    const buf = backend.lastBuffer!;
    expect(buf.get(3, 0).char).toBe('l');
    expect(buf.get(4, 0).style.dim).toBe(true);
    expect(buf.get(1, 0).style.dim).toBeFalsy(); // typed text is never dimmed
    backend.press({ name: 'left' });
    expect(await frame()).toEqual(['/he']); // ghost only shows with the caret at the end
    unmount();
  });

  test('suffix renders after the text (and ghost) when the caret is at the end', async () => {
    const { frame, unmount } = await mount('/he', { ghost: 'lp', suffix: <Text dim> ⇥</Text> }, 20);
    expect(await frame()).toEqual(['/help ⇥']);
    unmount();
  });

  test('placeholder shows while the value is empty', async () => {
    const { backend, frame, unmount } = await mount('', { placeholder: 'say it' });
    expect(await frame()).toEqual(['say it']);
    backend.type('x');
    expect(await frame()).toEqual(['x']);
    unmount();
  });

  test('unfocused: no caret, keys ignored', async () => {
    const { backend, seen, caret, unmount } = await mount('abc', { isFocused: false });
    backend.type('z');
    expect(await caret()).toBeNull();
    expect(seen.value).toBe('abc');
    unmount();
  });
});
