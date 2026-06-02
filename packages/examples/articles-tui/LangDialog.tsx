/** @jsxImportSource react */
import { useState } from 'react';
import { Select, useDialog } from '@flowtty/react';
import type { SelectItem } from '@flowtty/react';

// ─── LangDialog ──────────────────────────────────────────────────────────────
// Chrome (border + title + sizing) is provided by openDialog({ title, floating, ... }).
// This component renders just the inner content.

interface LangDialogProps {
  initialValue?: 'en' | 'ru';
}

export const LANG_DIALOG_TITLE = 'Article original language';

const langItems: SelectItem<'en' | 'ru'>[] = [
  { label: 'en', value: 'en' },
  { label: 'ru', value: 'ru' },
];

export function LangDialog({ initialValue = 'en' }: LangDialogProps) {
  const { done, cancel } = useDialog();
  const [value, setValue] = useState<'en' | 'ru'>(initialValue);
  return (
    <Select<'en' | 'ru'>
      items={langItems}
      value={value}
      onChange={(v) => setValue(v)}
      onSubmit={(v) => done(v)}
      onCancel={() => cancel()}
    />
  );
}
