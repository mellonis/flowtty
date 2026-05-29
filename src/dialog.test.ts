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
