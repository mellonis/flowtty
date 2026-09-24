import React, { useState, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { render } from '../internal/render.js';
import { Box } from './base/Box.js';
import { FocusGroup } from './FocusGroup.js';
import { TextInput } from './TextInput.js';
import { Checkbox, type CheckboxState } from './Checkbox.js';

async function mount(el: ReactNode, w = 24, h = 4) {
  const backend = new TestBackend(w, h);
  const r = await render(<FocusGroup><Box flexDirection="column">{el}</Box></FocusGroup>, backend);
  await flushAsync(backend);
  const frame = async () => { await flushAsync(backend); return backend.lastFrame.split('\n'); };
  return { backend, frame, unmount: r.unmount };
}

/** A controlled checkbox with its state in the fixture. */
function Boxed({ initial, onChange, frame }: { initial: CheckboxState; onChange?: (v: boolean) => void; frame?: 'brackets' | 'none' }) {
  const [checked, setChecked] = useState<CheckboxState>(initial);
  return <Checkbox label="notify me" checked={checked} onChange={(v) => { setChecked(v); onChange?.(v); }} {...(frame ? { frame } : {})} />;
}

describe('Checkbox', () => {
  test('renders the three states in brackets, the checked marker green', async () => {
    for (const [state, text] of [[false, '[ ] notify me'], [true, '[x] notify me'], ['mixed', '[-] notify me']] as const) {
      const { backend, frame, unmount } = await mount(<Boxed initial={state} />);
      expect((await frame())[0]).toBe(text);
      // Focused, so the marker is cyan; the green shows once focus leaves (next test).
      expect(backend.lastBuffer!.get(0, 0).style.fg).toBe('cyan');
      unmount();
    }
  });

  test('frame="none" is one glyph', async () => {
    for (const [state, text] of [[false, '☐ notify me'], [true, '☑ notify me'], ['mixed', '⊟ notify me']] as const) {
      const { frame, unmount } = await mount(<Boxed initial={state} frame="none" />);
      expect((await frame())[0]).toBe(text);
      unmount();
    }
  });

  test('focus shows: marker bold and cyan, label bold; unfocused: a dim marker, a checked one green', async () => {
    const { backend, frame, unmount } = await mount(
      <>
        <Boxed initial={true} />
        <TextInput value="" onChange={() => {}} />
      </>,
    );
    await frame();
    expect(backend.lastBuffer!.get(0, 0).style).toMatchObject({ fg: 'cyan', bold: true });
    expect(backend.lastBuffer!.get(4, 0).style.bold).toBe(true);
    backend.press({ name: 'tab' });
    await frame();
    expect(backend.lastBuffer!.get(0, 0).style.fg).toBe('green');
    expect(backend.lastBuffer!.get(0, 0).style.bold).toBeFalsy();
    expect(backend.lastBuffer!.get(4, 0).style.bold).toBeFalsy();
    unmount();

    const off = await mount(
      <>
        <Boxed initial={false} />
        <TextInput value="" onChange={() => {}} />
      </>,
    );
    off.backend.press({ name: 'tab' });
    await off.frame();
    expect(off.backend.lastBuffer!.get(0, 0).style.dim).toBe(true);
    off.unmount();
  });

  test('Space toggles, is consumed, and mixed goes to true', async () => {
    const onChange = vi.fn();
    const { backend, frame, unmount } = await mount(<Boxed initial={false} onChange={onChange} />);
    expect(backend.press({ name: ' ' })).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect((await frame())[0]).toBe('[x] notify me');
    backend.press({ name: ' ' });
    expect(onChange).toHaveBeenLastCalledWith(false);
    unmount();

    const mixed = await mount(<Boxed initial="mixed" onChange={onChange} />);
    mixed.backend.press({ name: ' ' });
    expect(onChange).toHaveBeenLastCalledWith(true);
    mixed.unmount();
  });

  test('Enter and Tab are not the checkbox\'s: neither toggles nor is consumed', async () => {
    const onChange = vi.fn();
    const { backend, unmount } = await mount(<Boxed initial={false} onChange={onChange} />);
    expect(backend.press({ name: 'return' })).toBe(false);
    expect(backend.press({ name: 'tab' })).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    unmount();
  });

  test('a press inside the checkbox toggles it even while another field has focus', async () => {
    const onChange = vi.fn();
    const { backend, frame, unmount } = await mount(
      <>
        <Boxed initial={false} onChange={onChange} />
        <TextInput value="" onChange={() => {}} />
      </>,
    );
    backend.press({ name: 'tab' });          // focus on the TextInput
    await frame();
    backend.mouse('down', 6, 0);
    backend.mouse('up', 6, 0);
    expect(onChange).toHaveBeenCalledWith(true);
    expect((await frame())[0]).toBe('[x] notify me');
    backend.mouse('down', 6, 2);             // outside: nothing
    backend.mouse('up', 6, 2);
    expect(onChange).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('isFocused={false} overrides the group: Space does nothing', async () => {
    const onChange = vi.fn();
    const { backend, unmount } = await mount(<Checkbox label="x" checked={false} onChange={onChange} isFocused={false} />);
    expect(backend.press({ name: ' ' })).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    unmount();
  });
});
