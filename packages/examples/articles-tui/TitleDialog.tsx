/** @jsxImportSource react */
import { useState, useCallback } from 'react';
import { TextInput, useDialog } from '@flowtty/react';

// ─── TitleDialog ─────────────────────────────────────────────────────────────
// Chrome supplied by openDialog({ title: TITLE_DIALOG_TITLE, floating, ... }).

export const TITLE_DIALOG_TITLE = 'Article title';

interface TitleDialogProps {
  initialValue?: string;
}

export function TitleDialog({ initialValue = '' }: TitleDialogProps) {
  const { done, cancel } = useDialog();
  const [value, setValue] = useState(initialValue);

  const validate = useCallback((v: string): string | null | undefined =>
    v.trim() === '' ? 'required' : null, []);

  return (
    <TextInput
      value={value}
      onChange={(v: string) => setValue(v)}
      validate={validate}
      onSubmit={(v: string) => done(v)}
      onCancel={() => cancel()}
    />
  );
}
