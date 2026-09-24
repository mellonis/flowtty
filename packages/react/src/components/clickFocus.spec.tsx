import React, { useState, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { render } from '../internal/render.js';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { FocusGroup } from './FocusGroup.js';
import { TextInput } from './TextInput.js';
import { Button } from './Button.js';
import { Checkbox } from './Checkbox.js';
import { ListSelect } from './ListSelect.js';
import { useFocus } from '../hooks/useFocus.js';

async function mount(el: ReactNode, w = 30, h = 8) {
  const backend = new TestBackend(w, h);
  const r = await render(<FocusGroup><Box flexDirection="column">{el}</Box></FocusGroup>, backend);
  await flushAsync(backend);
  const frame = async () => { await flushAsync(backend); return backend.lastFrame.split('\n'); };
  return { backend, frame, unmount: r.unmount };
}

const click = (backend: TestBackend, x: number, y: number) => { backend.mouse('down', x, y); backend.mouse('up', x, y); };

describe('focus by click', () => {
  test('useFocus().focus() moves the group\'s focus to the caller', async () => {
    function Probe({ label }: { label: string }): ReactNode {
      const { isFocused, focus } = useFocus();
      // Any key named after the label focuses this one — a stand-in for a click.
      React.useEffect(() => { (globalThis as Record<string, unknown>)[`focus_${label}`] = focus; }, [focus, label]);
      return <Text bold={isFocused}>{isFocused ? `[${label}]` : ` ${label} `}</Text>;
    }
    const { backend, frame, unmount } = await mount(<><Probe label="a" /><Probe label="b" /></>);
    expect((await frame())[0]).toBe('[a]');
    ((globalThis as Record<string, unknown>).focus_b as () => void)();
    expect((await frame())[1]).toBe('[b]');
    backend.press({ name: 'tab' });
    expect((await frame())[0]).toBe('[a]'); // Tab continues from b
    unmount();
  });

  test('a click on the second TextInput focuses it, and Tab continues from there', async () => {
    function Two() {
      const [a, setA] = useState('');
      const [b, setB] = useState('');
      return <><TextInput value={a} onChange={setA} /><TextInput value={b} onChange={setB} /><Button label="ok" onPress={() => {}} /></>;
    }
    const { backend, frame, unmount } = await mount(<Two />);
    click(backend, 3, 1);
    backend.type('hi');
    let lines = await frame();
    expect(lines[1]).toContain('hi');
    expect(lines[0]!.trim()).toBe('');
    backend.press({ name: 'tab' });
    backend.press({ name: 'return' });     // the Button, now focused
    lines = await frame();
    expect(lines[2]).toContain('[ ok ]');
    unmount();
  });

  test('a click on a Button presses it and focuses it', async () => {
    const onPress = vi.fn();
    function Two() {
      const [a, setA] = useState('');
      return <><TextInput value={a} onChange={setA} /><Button label="go" onPress={onPress} /></>;
    }
    const { backend, frame, unmount } = await mount(<Two />);
    click(backend, 2, 1);
    expect(onPress).toHaveBeenCalledTimes(1);
    backend.press({ name: 'return' });     // focused now: Enter presses again
    expect(onPress).toHaveBeenCalledTimes(2);
    await frame();
    unmount();
  });

  test('a click on a Checkbox toggles and focuses; on a ListSelect focuses the list', async () => {
    function Three() {
      const [a, setA] = useState('');
      const [c, setC] = useState(false);
      const [v, setV] = useState('a');
      return (
        <>
          <TextInput value={a} onChange={setA} />
          <Checkbox label="flag" checked={c} onChange={setC} />
          <ListSelect items={[{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }]} value={v} onChange={setV} onSubmit={() => {}} />
        </>
      );
    }
    const { backend, frame, unmount } = await mount(<Three />);
    click(backend, 2, 1);
    let lines = await frame();
    expect(lines[1]).toBe('[x] flag');
    expect(backend.lastBuffer!.get(0, 1).style.fg).toBe('cyan'); // focused
    click(backend, 3, 3);                  // the list's second row
    backend.press({ name: 'down' });       // the list has focus: the cursor moves
    lines = await frame();
    expect(lines[3]).toContain('▸ b');
    unmount();
  });

  test('a click outside every field changes nothing', async () => {
    function Two() {
      const [a, setA] = useState('');
      return <><TextInput value={a} onChange={setA} /><Button label="go" onPress={() => {}} /></>;
    }
    const { backend, frame, unmount } = await mount(<Two />);
    expect(backend.press({ name: 'mousedown', x: 25, y: 6, button: 'left' })).toBe(false);
    backend.type('x');
    expect((await frame())[0]).toContain('x'); // the first field still has focus
    unmount();
  });
});
