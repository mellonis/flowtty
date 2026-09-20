import React, { useState } from 'react';
import { Box, Text, TextInput, Confirm, useDialog, useDialogHost, useInput } from '@flowtty/react';

function RenameDialog({ current }: { current: string }) {
  const { done, cancel } = useDialog();
  const [value, setValue] = useState(current);
  return (
    <>
      <Text dim>New name — Enter saves, Esc cancels</Text>
      <TextInput value={value} onChange={setValue} isFocused validate={(v) => (v.trim() ? null : 'cannot be empty')} onSubmit={(v) => done(v.trim())} onCancel={cancel} />
    </>
  );
}

function DeleteDialog({ name }: { name: string }) {
  const { done, cancel } = useDialog();
  return <Confirm message={`Delete “${name}”?`} defaultValue="no" isFocused onSubmit={(yes) => done(yes)} onCancel={cancel} />;
}

export function DialogScene() {
  const { openDialog } = useDialogHost();
  const [items, setItems] = useState(['draft.md', 'notes.md', 'release-plan.md', 'todo.md']);
  const [cursor, setCursor] = useState(0);
  const [toast, setToast] = useState('r renames · d deletes · both open a dialog over the list');

  useInput((key) => {
    if (key.name === 'down') setCursor((c) => Math.min(items.length - 1, c + 1));
    else if (key.name === 'up') setCursor((c) => Math.max(0, c - 1));
    else if (key.name === 'r' && items[cursor]) {
      const from = items[cursor]!;
      void openDialog<string>(<RenameDialog current={from} />, { title: 'Rename', floating: true, minWidth: 40 }).then((res) => {
        if (res.status !== 'done') { setToast('rename cancelled'); return; }
        setItems((cur) => cur.map((it) => (it === from ? res.value : it)));
        setToast(`renamed to ${res.value}`);
      });
    } else if (key.name === 'd' && items[cursor]) {
      const name = items[cursor]!;
      void openDialog<boolean>(<DeleteDialog name={name} />, { title: 'Confirm', floating: true, minWidth: 40 }).then((res) => {
        if (res.status !== 'done' || !res.value) { setToast('kept'); return; }
        setItems((cur) => cur.filter((it) => it !== name));
        setCursor((c) => Math.max(0, Math.min(c, items.length - 2)));
        setToast(`deleted ${name}`);
      });
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} gap={1}>
      <Box flexDirection="column" border="round" borderTitle=" files " paddingX={1} width={50}>
        {items.map((it, i) => <Text key={it} inverse={i === cursor}>{` ${it} `}</Text>)}
        {items.length === 0 ? <Text dim>(empty)</Text> : null}
      </Box>
      <Text color="yellow">{toast}</Text>
      <Text dim wrap="wrap">While a dialog is open the list underneath stops receiving keys and — with the DialogHost backdrop on — dims; a dialog resolves a promise, so the caller just awaits the answer.</Text>
    </Box>
  );
}
