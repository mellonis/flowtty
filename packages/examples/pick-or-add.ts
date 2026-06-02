import { createElement, useState } from 'react';
import {
  render, Box, Text,
  DialogHost, useDialogHost, useDialog,
  MultiSelect, TextInput,
} from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

function NamePromptDialog() {
  const { done, cancel } = useDialog();
  const [v, setV] = useState('');
  return createElement(Box, null,
    createElement(Text, null, 'new label: '),
    createElement(TextInput, {
      value: v, onChange: setV,
      onSubmit: () => done(v),
      onCancel: () => cancel(),
    }),
  );
}

function App() {
  const host = useDialogHost();
  const [items, setItems] = useState<{ label: string; value: string }[]>([
    { label: 'apple', value: 'apple' },
    { label: 'banana', value: 'banana' },
    { label: 'cherry', value: 'cherry' },
  ]);
  const [selected, setSelected] = useState<string[]>([]);
  const [done, setDone] = useState<string[] | null>(null);

  if (done) {
    return createElement(Box, null,
      createElement(Text, null, `picked: ${done.join(', ')}`),
    );
  }
  return createElement(Box, { flexDirection: 'column' },
    createElement(Text, null, 'Space toggle · ↑↓ navigate · Enter on "+ add new" to add · Enter on item to submit · Esc/Ctrl-C exit'),
    createElement(MultiSelect<string>, {
      items, value: selected,
      onChange: setSelected,
      onSubmit: (final) => setDone(final),
      onAddNew: async () => {
        const r = await host.openDialog<string>(createElement(NamePromptDialog));
        if (r.status === 'done' && r.value) {
          const item = { label: r.value, value: r.value };
          setItems((prev) => [...prev, item]);
          setSelected((prev) => [...prev, r.value]);
        }
      },
    }),
  );
}

await render(createElement(DialogHost, null, createElement(App)), new TtyBackend());
