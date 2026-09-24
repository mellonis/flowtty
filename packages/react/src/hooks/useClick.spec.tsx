import React, { useRef, type ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import type { Rect } from '@flowtty/core/host';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { render } from '../internal/render.js';
import { Box } from '../components/base/Box.js';
import { Text } from '../components/base/Text.js';
import { useClick } from './useClick.js';
import { useInput } from './useInput.js';

function Clickable({ onClick, children }: { onClick: () => void; children?: ReactNode }): ReactNode {
  const rect = useRef<Rect | null>(null);
  useClick(rect, onClick);
  return <Box onLayout={(r) => { rect.current = r; }}>{children}</Box>;
}

test('useClick fires for a press inside the rect, consumes it, and ignores presses elsewhere', async () => {
  const onClick = vi.fn();
  const backend = new TestBackend(20, 4);
  function App() {
    useInput(() => {});
    return (
      <Box flexDirection="column">
        <Text>header</Text>
        <Clickable onClick={onClick}><Text>▸ collapsed item</Text></Clickable>
      </Box>
    );
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  // A click is a press and a release on the item, nothing in between.
  expect(backend.press({ name: 'mousedown', x: 3, y: 1, button: 'left' })).toBe(true);
  expect(onClick).not.toHaveBeenCalled();
  expect(backend.press({ name: 'mouseup', x: 3, y: 1, button: 'left' })).toBe(true);
  expect(onClick).toHaveBeenCalledTimes(1);
  // Elsewhere: neither the press nor the release is the item's.
  expect(backend.press({ name: 'mousedown', x: 3, y: 0, button: 'left' })).toBe(false);
  expect(backend.press({ name: 'mouseup', x: 3, y: 0, button: 'left' })).toBe(false);
  expect(backend.press({ name: 'mousedown', x: 3, y: 2, button: 'left' })).toBe(false);  // below it
  // A release with no press before it is not a click either.
  expect(backend.press({ name: 'mouseup', x: 3, y: 1, button: 'left' })).toBe(false);
  expect(onClick).toHaveBeenCalledTimes(1);
  r.unmount();
});

test('a drag that starts on the item is a selection, not a click', async () => {
  const onClick = vi.fn();
  const backend = new TestBackend(20, 4);
  function App() {
    useInput(() => {});
    return <Box flexDirection="column"><Clickable onClick={onClick}><Text>item</Text></Clickable></Box>;
  }
  const r = await render(<App />, backend);
  await flushAsync(backend);
  backend.mouse('down', 1, 0);
  backend.mouse('drag', 3, 0);
  backend.mouse('up', 3, 0);
  expect(onClick).not.toHaveBeenCalled();
  backend.mouse('down', 1, 0);
  backend.mouse('up', 1, 0);
  expect(onClick).toHaveBeenCalledTimes(1);
  r.unmount();
});
