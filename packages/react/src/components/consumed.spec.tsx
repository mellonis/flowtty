import React, { useState, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { render } from '../internal/render.js';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { FocusGroup } from './FocusGroup.js';
import { TextInput } from './TextInput.js';
import { TextArea } from './TextArea.js';
import { ListSelect } from './ListSelect.js';
import { ListMultiSelect } from './ListMultiSelect.js';
import { Button } from './Button.js';
import { ScrollBox } from './ScrollBox.js';
import { Menu } from './Menu.js';
import { useInput } from '../hooks/useInput.js';

// The built-in components consume the keys they act on: a key a focused field
// used does not go on to a handler behind it, and press() says so.

async function mount(el: ReactNode, w = 30, h = 8) {
  const backend = new TestBackend(w, h);
  const r = await render(<FocusGroup><Box flexDirection="column">{el}</Box></FocusGroup>, backend);
  await flushAsync(backend);
  return { backend, unmount: r.unmount, settle: () => flushAsync(backend) };
}

const ITEMS = [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }];

describe('consumed keys — fields', () => {
  test('TextInput consumes what edits and moves; Tab, and Enter / Escape with nothing to call, fall through', async () => {
    const { backend, unmount } = await mount(<TextInput value="ab" onChange={() => {}} />);
    expect(backend.press({ name: 'x' })).toBe(true);
    expect(backend.press({ name: 'backspace' })).toBe(true);
    expect(backend.press({ name: 'left' })).toBe(true);
    expect(backend.press({ name: 'home' })).toBe(true);
    expect(backend.press({ name: 'tab' })).toBe(false);
    expect(backend.press({ name: 'return' })).toBe(false);
    expect(backend.press({ name: 'escape' })).toBe(false);
    unmount();
    const wired = await mount(<TextInput value="ab" onChange={() => {}} onSubmit={() => {}} onCancel={() => {}} />);
    expect(wired.backend.press({ name: 'return' })).toBe(true);
    expect(wired.backend.press({ name: 'escape' })).toBe(true);
    wired.unmount();
  });

  test('an app-level shortcut does not fire while a focused TextInput is typed into, and does from a Button', async () => {
    const quit = vi.fn();
    function App() {
      const [v, setV] = useState('');
      useInput((key) => { if (key.name === 'q') quit(); });
      return (
        <>
          <TextInput value={v} onChange={setV} />
          <Button label="Save" onPress={() => {}} />
        </>
      );
    }
    const { backend, settle, unmount } = await mount(<App />);
    backend.type('q');
    expect(quit).not.toHaveBeenCalled();
    backend.press({ name: 'tab' });
    await settle();
    backend.type('q');
    expect(quit).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('TextArea consumes edits and the multiline Enter; Tab falls through', async () => {
    const { backend, unmount } = await mount(<TextArea value="" onChange={() => {}} />);
    expect(backend.press({ name: 'x' })).toBe(true);
    expect(backend.press({ name: 'return', shift: true })).toBe(true);
    expect(backend.press({ name: 'tab' })).toBe(false);
    unmount();
  });

  test('the lists consume navigation, the filter, Space, Enter; Tab falls through', async () => {
    const single = await mount(<ListSelect items={ITEMS} value="a" onChange={() => {}} onSubmit={() => {}} />);
    expect(single.backend.press({ name: 'down' })).toBe(true);
    expect(single.backend.press({ name: 'b' })).toBe(true);   // the filter
    expect(single.backend.press({ name: 'return' })).toBe(true);
    expect(single.backend.press({ name: 'tab' })).toBe(false);
    single.unmount();
    const multi = await mount(<ListMultiSelect items={ITEMS} value={[]} onChange={() => {}} onSubmit={() => {}} />);
    expect(multi.backend.press({ name: 'down' })).toBe(true);
    expect(multi.backend.press({ name: 'j' })).toBe(true);
    expect(multi.backend.press({ name: ' ' })).toBe(true);
    expect(multi.backend.press({ name: 'return' })).toBe(true);
    expect(multi.backend.press({ name: 'x' })).toBe(false);
    multi.unmount();
  });

  test('Button consumes Enter when focused and its shortcut from anywhere', async () => {
    const { backend, unmount } = await mount(<Button label="Save" shortcut="s" onPress={() => {}} />);
    expect(backend.press({ name: 'return' })).toBe(true);
    expect(backend.press({ name: 's' })).toBe(true);
    expect(backend.press({ name: 'x' })).toBe(false);
    unmount();
  });

  test('FocusGroup consumes Tab when it moved focus, not when there is nothing to move to', async () => {
    const two = await mount(<><Button label="a" onPress={() => {}} /><Button label="b" onPress={() => {}} /></>);
    expect(two.backend.press({ name: 'tab' })).toBe(true);
    two.unmount();
    const none = await mount(<Text>nothing focusable</Text>);
    expect(none.backend.press({ name: 'tab' })).toBe(false);
    none.unmount();
  });
});

describe('consumed keys — scrolling and the menu', () => {
  test('ScrollBox consumes a page key and a wheel step over it; a wheel step elsewhere falls through', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => <Text key={i}>{`row ${i}`}</Text>);
    const { backend, unmount } = await mount(<ScrollBox height={4}>{rows}</ScrollBox>, 20, 8);
    expect(backend.press({ name: 'pagedown' })).toBe(true);
    expect(backend.press({ name: 'wheeldown', x: 2, y: 1 })).toBe(true);
    expect(backend.press({ name: 'wheeldown', x: 2, y: 7 })).toBe(false);
    unmount();
  });

  test('Menu consumes F10, and its navigation while engaged; disengaged, an arrow falls through', async () => {
    const backend = new TestBackend(40, 6);
    const r = await render(
      <Menu items={[{ key: 'f', label: 'File', submenu: [{ key: 'o', label: 'Open', onSelect: () => {} }] }, { key: 'e', label: 'Edit', submenu: [] }]}>
        <Text>page</Text>
      </Menu>,
      backend,
    );
    await flushAsync(backend);
    expect(backend.press({ name: 'right' })).toBe(false);
    expect(backend.press({ name: 'f10' })).toBe(true);
    await flushAsync(backend);
    expect(backend.press({ name: 'right' })).toBe(true);
    r.unmount();
  });
});
