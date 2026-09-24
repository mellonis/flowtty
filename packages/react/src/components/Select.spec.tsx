import React, { useState, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { render } from '../internal/render.js';
import { Box } from './base/Box.js';
import { Text } from './base/Text.js';
import { DialogHost } from './DialogHost.js';
import { FocusGroup } from './FocusGroup.js';
import { TextInput } from './TextInput.js';
import { Select, type SelectItem } from './Select.js';

const PLANS: SelectItem<string>[] = [
  { label: 'Hobby', value: 'hobby' },
  { label: 'Team', value: 'team' },
  { label: 'Business', value: 'business' },
];

async function mount(el: ReactNode, w = 30, h = 10) {
  const backend = new TestBackend(w, h);
  const r = await render(el, backend);
  await flushAsync(backend);
  const frame = async () => { await flushAsync(backend); return backend.lastFrame.split('\n'); };
  return { backend, frame, unmount: r.unmount };
}

/** A single Select under a DialogHost, with its `onChange` wired to state. */
function Single({ initial = 'team', onChange, ...rest }: { initial?: string | null; onChange?: (v: string) => void; width?: number | null; frame?: 'field' | 'none' | 'border'; filter?: boolean; maxRows?: number; items?: SelectItem<string>[]; placeholder?: string }) {
  const [value, setValue] = useState<string | undefined>(initial ?? undefined);
  return (
    <DialogHost>
      <FocusGroup>
        <Box flexDirection="column">
        <Select
          items={rest.items ?? PLANS}
          value={value}
          onChange={(v) => { setValue(v); onChange?.(v); }}
          {...(rest.width === null ? {} : { width: rest.width ?? 20 })}
          {...(rest.frame !== undefined ? { frame: rest.frame } : {})}
          {...(rest.filter !== undefined ? { filter: rest.filter } : {})}
          {...(rest.maxRows !== undefined ? { maxRows: rest.maxRows } : {})}
          {...(rest.placeholder !== undefined ? { placeholder: rest.placeholder } : {})}
        />
        </Box>
      </FocusGroup>
    </DialogHost>
  );
}

const row = (lines: string[], text: string) => lines.find((l) => l.includes(text));

describe('Select — the closed field', () => {
  test('shows the chosen label and an arrow on a field band, padded to width', async () => {
    const { backend, frame, unmount } = await mount(<Single />);
    const lines = await frame();
    expect(lines[0]).toBe('Team               ▾');
    // The band: the field's background, the cells past the text included.
    expect(backend.lastBuffer!.get(10, 0).style.bg).toBe('rgb(211,211,211)');
    expect(backend.lastBuffer!.get(25, 0).style.bg).toBeUndefined();
    unmount();
  });

  test('a placeholder when nothing is chosen; frame="none" is bare text; frame="border" is a box', async () => {
    const none = await mount(<Single initial={null} width={null} frame="none" placeholder="any" />);
    const bare = await none.frame();
    expect(bare[0]!.trimEnd()).toBe('any ▾');
    expect(none.backend.lastBuffer!.get(0, 0).style.bg).toBeUndefined();
    none.unmount();
    const bordered = await mount(<Single frame="border" />);
    const lines = await bordered.frame();
    expect(lines[0]!.trimEnd().length).toBe(20);
    expect(lines[1]).toContain('Team');
    expect(lines[2]!.trimEnd().length).toBe(20);
    bordered.unmount();
  });

  test('focus shows: bold value and a cyan arrow when focused, plain when not', async () => {
    function Two() {
      const [v, setV] = useState<string | undefined>('team');
      return (
        <DialogHost>
          <FocusGroup>
            <Box flexDirection="column">
              <Select items={PLANS} value={v} onChange={setV} width={20} />
              <TextInput value="" onChange={() => {}} />
            </Box>
          </FocusGroup>
        </DialogHost>
      );
    }
    const { backend, frame, unmount } = await mount(<Two />);
    await frame();
    expect(backend.lastBuffer!.get(0, 0).style.bold).toBe(true);
    expect(backend.lastBuffer!.get(19, 0).style.fg).toBe('cyan');
    backend.press({ name: 'tab' });
    await frame();
    expect(backend.lastBuffer!.get(0, 0).style.bold).toBeFalsy();
    expect(backend.lastBuffer!.get(19, 0).style.fg).not.toBe('cyan');
    unmount();
  });
});

describe('Select — the popup', () => {
  test('Enter opens the popup under the field with the cursor on the current value; Escape closes it unchanged', async () => {
    const onChange = vi.fn();
    const { backend, frame, unmount } = await mount(<Single onChange={onChange} />);
    expect(backend.press({ name: 'return' })).toBe(true);
    let lines = await frame();
    expect(lines[0]).toContain('▴');
    expect(row(lines, 'Hobby')).toBeDefined();
    expect(row(lines, '▸ Team')).toBeDefined();
    expect(row(lines, 'Business')).toBeDefined();
    expect(lines.findIndex((l) => l.includes('Hobby'))).toBe(2); // border on row 1, first option on row 2
    backend.press({ name: 'escape' });
    lines = await frame();
    expect(row(lines, 'Hobby')).toBeUndefined();
    expect(lines[0]).toContain('▾');
    expect(onChange).not.toHaveBeenCalled();
    unmount();
  });

  test('↓ ↓ Enter picks the next value and closes', async () => {
    const onChange = vi.fn();
    const { backend, frame, unmount } = await mount(<Single initial="hobby" onChange={onChange} />);
    backend.press({ name: 'return' });
    await frame();
    backend.press({ name: 'down' });
    backend.press({ name: 'down' });
    backend.press({ name: 'return' });
    const lines = await frame();
    expect(onChange).toHaveBeenCalledWith('business');
    expect(lines[0]).toContain('Business');
    expect(row(lines, 'Hobby')).toBeUndefined();
    unmount();
  });

  test('typing narrows the list and shows the filter; Backspace widens; filter={false} ignores letters', async () => {
    const { backend, frame, unmount } = await mount(<Single />);
    backend.press({ name: 'return' });
    await frame();
    backend.type('bu');
    let lines = await frame();
    expect(row(lines, 'filter: bu')).toBeDefined();
    expect(row(lines, 'Hobby')).toBeUndefined();
    expect(row(lines, '▸ Business')).toBeDefined();
    backend.press({ name: 'backspace' });
    backend.press({ name: 'backspace' });
    lines = await frame();
    expect(row(lines, 'Hobby')).toBeDefined();
    unmount();

    const off = await mount(<Single filter={false} />);
    off.backend.press({ name: 'return' });
    await off.frame();
    off.backend.type('bu');
    lines = await off.frame();
    expect(row(lines, 'filter:')).toBeUndefined();
    expect(row(lines, 'Hobby')).toBeDefined();
    off.unmount();
  });

  test('opens above the field when there is no room below', async () => {
    function Bottom() {
      const [v, setV] = useState<string | undefined>('team');
      return (
        <DialogHost>
          <Box flexDirection="column" height={10} justifyContent="flex-end">
            <Select items={PLANS} value={v} onChange={setV} width={20} />
          </Box>
        </DialogHost>
      );
    }
    const { backend, frame, unmount } = await mount(<Bottom />);
    backend.press({ name: 'return' });
    const lines = await frame();
    expect(lines[9]).toContain('Team');                 // the field, last row
    expect(lines.findIndex((l) => l.includes('Hobby'))).toBe(5); // popup rows 4..8 above it
    unmount();
  });

  test('more items than maxRows: the popup shows maxRows and scrolls to keep the cursor visible', async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ label: `Item ${i}`, value: `i${i}` }));
    const { backend, frame, unmount } = await mount(<Single items={items} initial="i0" maxRows={4} />, 30, 14);
    backend.press({ name: 'return' });
    let lines = await frame();
    expect(lines.slice(1).filter((l) => l.includes('Item ')).length).toBe(4); // the field itself shows one
    for (let i = 0; i < 5; i++) backend.press({ name: 'down' });
    lines = await frame();
    expect(row(lines, '▸ Item 5')).toBeDefined();
    expect(row(lines, 'Item 1')).toBeUndefined();
    unmount();
  });

  test('keys the closed focused field does not use fall through; Tab is not consumed', async () => {
    const { backend, unmount } = await mount(<Single />);
    expect(backend.press({ name: 'x' })).toBe(false);
    expect(backend.press({ name: 'tab' })).toBe(false);
    unmount();
  });

  test('without a DialogHost the field warns once and opens nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      function Bare() {
        const [v, setV] = useState<string | undefined>('team');
        return <Box flexDirection="column"><Select items={PLANS} value={v} onChange={setV} width={20} /></Box>;
      }
      const { backend, frame, unmount } = await mount(<Bare />);
      backend.press({ name: 'return' });
      backend.press({ name: 'return' });
      const lines = await frame();
      expect(row(lines, 'Hobby')).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('DialogHost');
      unmount();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('Select — focus', () => {
  test('after the popup closes the field is still the focused one: Tab moves on from it', async () => {
    function Two() {
      const [v, setV] = useState<string | undefined>('team');
      const [t, setT] = useState('');
      return (
        <DialogHost>
          <FocusGroup>
            <Box flexDirection="column">
              <Select items={PLANS} value={v} onChange={setV} width={20} />
              <TextInput value={t} onChange={setT} />
            </Box>
          </FocusGroup>
        </DialogHost>
      );
    }
    const { backend, frame, unmount } = await mount(<Two />);
    backend.press({ name: 'return' });
    await frame();
    backend.press({ name: 'down' });
    backend.press({ name: 'return' });
    await frame();
    expect(backend.lastBuffer!.get(19, 0).style.fg).toBe('cyan'); // still focused
    backend.press({ name: 'tab' });
    backend.type('hi');
    const lines = await frame();
    expect(lines[0]).toContain('Business');
    expect(lines[1]).toContain('hi');
    unmount();
  });
});

describe('Select — mouse', () => {
  test('a press on the field opens; a press on a row picks it; a press outside closes', async () => {
    const onChange = vi.fn();
    const { backend, frame, unmount } = await mount(<Single initial="hobby" onChange={onChange} />);
    backend.mouse('down', 3, 0); backend.mouse('up', 3, 0);
    let lines = await frame();
    expect(row(lines, 'Team')).toBeDefined();
    const y = lines.findIndex((l) => l.includes('Business'));
    backend.mouse('down', 4, y); backend.mouse('up', 4, y);
    lines = await frame();
    expect(onChange).toHaveBeenCalledWith('business');
    expect(row(lines, 'Hobby')).toBeUndefined();

    backend.mouse('down', 3, 0); backend.mouse('up', 3, 0);
    lines = await frame();
    expect(row(lines, 'Hobby')).toBeDefined();
    backend.mouse('down', 28, 9); backend.mouse('up', 28, 9); // far from the popup
    lines = await frame();
    expect(row(lines, 'Hobby')).toBeUndefined();
    expect(onChange).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe('Select multiple', () => {
  function Multi({ onChange, width = 20, onAddNew, initialItems = PLANS }: { onChange?: (v: string[]) => void; width?: number; onAddNew?: () => string; initialItems?: SelectItem<string>[] }) {
    const [value, setValue] = useState<string[]>(['team']);
    const [items, setItems] = useState(initialItems);
    return (
      <DialogHost>
        <FocusGroup>
          <Box flexDirection="column">
          <Select
            multiple
            items={items}
            value={value}
            onChange={(v) => { setValue(v); onChange?.(v); }}
            width={width}
            {...(onAddNew ? { onAddNew: () => { const v = onAddNew(); setItems((cur) => [...cur, { label: v, value: v }]); return v; } } : {})}
          />
          </Box>
        </FocusGroup>
      </DialogHost>
    );
  }

  test('Space toggles and reports the array in item order; the field lists the labels; Enter closes', async () => {
    const onChange = vi.fn();
    const { backend, frame, unmount } = await mount(<Multi onChange={onChange} width={30} />, 40, 10);
    backend.press({ name: 'return' });
    let lines = await frame();
    expect(row(lines, '[x] Team')).toBeDefined();
    backend.press({ name: 'down' });
    backend.press({ name: 'down' });
    backend.press({ name: ' ' });          // Business on
    lines = await frame();
    expect(onChange).toHaveBeenLastCalledWith(['team', 'business']);
    expect(row(lines, '[x] Business')).toBeDefined();
    backend.press({ name: 'up' });
    backend.press({ name: 'up' });
    backend.press({ name: ' ' });          // Hobby on → item order
    expect(onChange).toHaveBeenLastCalledWith(['hobby', 'team', 'business']);
    backend.press({ name: 'return' });
    lines = await frame();
    expect(lines[0]).toContain('Hobby, Team, Business');
    expect(row(lines, '[x]')).toBeUndefined();
    unmount();
  });

  test('checkboxFrame="none" draws the popup rows with glyphs', async () => {
    function Glyphs() {
      const [value, setValue] = useState<string[]>(['team']);
      return (
        <DialogHost>
          <Box flexDirection="column">
            <Select multiple items={PLANS} value={value} onChange={setValue} width={20} checkboxFrame="none" />
          </Box>
        </DialogHost>
      );
    }
    const { backend, frame, unmount } = await mount(<Glyphs />);
    backend.press({ name: 'return' });
    const lines = await frame();
    expect(row(lines, '☑ Team')).toBeDefined();
    expect(row(lines, '☐ Hobby')).toBeDefined();
    unmount();
  });

  test('a narrow field says how many are selected instead of listing them', async () => {
    const { backend, frame, unmount } = await mount(<Multi width={12} />);
    backend.press({ name: 'return' });
    backend.press({ name: ' ' });          // Hobby on as well
    backend.press({ name: 'return' });
    const lines = await frame();
    expect(lines[0]).toContain('2 selected');
    unmount();
  });

  test('onAddNew adds a row; Enter on it adds the item and selects it', async () => {
    const onChange = vi.fn();
    const { backend, frame, unmount } = await mount(<Multi onChange={onChange} onAddNew={() => 'extra'} />);
    backend.press({ name: 'return' });
    let lines = await frame();
    expect(row(lines, '+ add new')).toBeDefined();
    backend.press({ name: 'up' });         // wraps to the last row: + add new
    backend.press({ name: 'return' });
    lines = await frame();
    expect(onChange).toHaveBeenLastCalledWith(['team', 'extra']);
    expect(row(lines, '▸ [x] extra')).toBeDefined();
    unmount();
  });
});
