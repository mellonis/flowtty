import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './index.js';
import { TestBackend, flush, flushAsync } from './testing.js';
import { Box, Text } from './components.js';
import { TextInput } from './text-input.js';
import { useInput } from './use-input.js';
import { DialogHost } from './dialog-host.js';
import { useDialog, useDialogHost } from './use-dialog.js';
import type { DialogResult } from './dialog-context.js';
import { MultiSelect } from './multi-select.js';

function NamePromptDialog() {
  const { done, cancel } = useDialog();
  const [v, setV] = useState('');
  return createElement(Box, null,
    createElement(Text, null, 'name: '),
    createElement(TextInput, {
      value: v, onChange: setV,
      onSubmit: () => done(v),
      onCancel: () => cancel(),
    }),
  );
}

test('openDialog resolves with done(value) when dialog calls done', async () => {
  let result: DialogResult<string> | null = null;
  function App() {
    const host = useDialogHost();
    useInput((key) => {
      if (key.name === 'o') host.openDialog<string>(createElement(NamePromptDialog)).then((r) => { result = r; });
    });
    return createElement(Text, null, 'host');
  }
  const backend = new TestBackend(40, 4);
  await render(createElement(DialogHost, null, createElement(App)), backend);
  await flushAsync();
  backend.press({ name: 'o' });
  await flushAsync();
  backend.type('alice');
  await flush();
  backend.press({ name: 'return' });
  await flushAsync();
  expect(result).toEqual({ status: 'done', value: 'alice' });
});

test('openDialog resolves with cancelled when dialog calls cancel', async () => {
  let result: DialogResult<string> | null = null;
  function App() {
    const host = useDialogHost();
    useInput((key) => {
      if (key.name === 'o') host.openDialog<string>(createElement(NamePromptDialog)).then((r) => { result = r; });
    });
    return createElement(Text, null, 'host');
  }
  const backend = new TestBackend(40, 4);
  await render(createElement(DialogHost, null, createElement(App)), backend);
  await flushAsync();
  backend.press({ name: 'o' });
  await flushAsync();
  backend.press({ name: 'escape' });
  await flushAsync();
  expect(result).toEqual({ status: 'cancelled' });
});

test('while dialog is open, host useInput subscribers receive no keys (gated)', async () => {
  const hostKeys: string[] = [];
  function App() {
    const host = useDialogHost();
    useInput((key) => {
      hostKeys.push(key.name);
      if (key.name === 'o') host.openDialog<string>(createElement(NamePromptDialog));
    });
    return createElement(Text, null, 'host');
  }
  const backend = new TestBackend(40, 4);
  await render(createElement(DialogHost, null, createElement(App)), backend);
  await flushAsync();
  backend.press({ name: 'o' });   // host receives 'o' and triggers openDialog
  await flushAsync();
  backend.type('x');              // dialog open → host should NOT see 'x'
  await flush();
  backend.press({ name: 'escape' });  // dialog closes
  await flushAsync();
  backend.press({ name: 'q' });   // host should see 'q' again
  await flush();
  expect(hostKeys).toEqual(['o', 'q']);   // 'x' consumed by dialog only
});

test('after dialog closes, host resumes receiving keys', async () => {
  const hostKeys: string[] = [];
  function App() {
    const host = useDialogHost();
    useInput((key) => {
      hostKeys.push(key.name);
      if (key.name === 'o') host.openDialog<string>(createElement(NamePromptDialog));
    });
    return createElement(Text, null, 'host');
  }
  const backend = new TestBackend(40, 4);
  await render(createElement(DialogHost, null, createElement(App)), backend);
  await flushAsync();
  backend.press({ name: 'o' });
  await flushAsync();
  backend.press({ name: 'escape' });
  await flushAsync();
  backend.press({ name: 'a' });
  backend.press({ name: 'b' });
  await flush();
  expect(hostKeys).toEqual(['o', 'a', 'b']);
});

test('M1c.4 acceptance: MultiSelect+add-new opens dialog, dialog submit appends and selects', async () => {
  function App() {
    const host = useDialogHost();
    const [items, setItems] = useState<{ label: string; value: string }[]>([
      { label: 'apple', value: 'apple' },
      { label: 'banana', value: 'banana' },
    ]);
    const [selected, setSelected] = useState<string[]>([]);
    return createElement(MultiSelect<string>, {
      items,
      value: selected,
      onChange: setSelected,
      onSubmit: () => {},
      onAddNew: async () => {
        const r = await host.openDialog<string>(createElement(NamePromptDialog));
        if (r.status === 'done' && r.value) {
          const newItem = { label: r.value, value: r.value };
          setItems((prev) => [...prev, newItem]);
          setSelected((prev) => [...prev, r.value]);
        }
      },
    });
  }
  const backend = new TestBackend(40, 6);
  await render(createElement(DialogHost, null, createElement(App)), backend);
  await flushAsync();

  // Cursor 0 = 'apple'; move to '+ add new' row (index 2 = items.length 2)
  backend.press({ name: 'down' });
  await flush();
  backend.press({ name: 'down' });
  await flush();

  // Enter on add-new → opens dialog
  backend.press({ name: 'return' });
  await flushAsync();

  // Dialog mounted; host muted. Type 'cherry' into its TextInput.
  backend.type('cherry');
  await flush();
  backend.press({ name: 'return' });  // dialog calls done('cherry')
  await flushAsync();

  // Dialog closes; MultiSelect re-renders with appended 'cherry' selected.
  expect(backend.lastFrame).toContain('[x] cherry');
  expect(backend.lastFrame).toContain('+ add new');
});

test('M1f acceptance: dialog renders as a centered overlay ON TOP of the host content (frame fits in host row count)', async () => {
  function HostApp() {
    const host = useDialogHost();
    useInput((key) => {
      if (key.name === 'o') host.openDialog<string>(createElement(NamePromptDialog));
    });
    return createElement(Box, { width: 30, height: 5 },
      createElement(Text, null, 'HOST CONTENT ROW 1'),
      createElement(Text, null, 'HOST CONTENT ROW 2'),
      createElement(Text, null, 'HOST CONTENT ROW 3'),
      createElement(Text, null, 'HOST CONTENT ROW 4'),
      createElement(Text, null, 'HOST CONTENT ROW 5'),
    );
  }
  const backend = new TestBackend(30, 5);
  await render(createElement(DialogHost, null, createElement(HostApp)), backend);
  await flushAsync();
  backend.press({ name: 'o' });
  await flushAsync();
  // The dialog overlay sits INSIDE the 5-row frame; the dialog's "name: " prompt is visible.
  expect(backend.lastFrame.split('\n').length).toBeLessThanOrEqual(5);
  expect(backend.lastFrame).toContain('name:');
});
