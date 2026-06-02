/** @jsxImportSource react */
import { useState, useCallback } from 'react';
import { TextInput, useDialog } from '@flowtty/react';
import { SLUG_RE } from './helpers.js';

// ─── SlugDialog ───────────────────────────────────────────────────────────────
// Chrome supplied by openDialog({ title: SLUG_DIALOG_TITLE, floating, ... }).

export const SLUG_DIALOG_TITLE = 'Article URL slug';

interface SlugDialogProps {
  defaultValue: string;
  existingSlugs: Set<string>;
  editingCurrentSlug?: string;
}

export function SlugDialog({ defaultValue, existingSlugs, editingCurrentSlug }: SlugDialogProps) {
  const { done, cancel } = useDialog();
  const [value, setValue] = useState(defaultValue);

  const validate = useCallback((v: string): string | null | undefined => {
    if (!v.trim()) return 'required';
    if (!(SLUG_RE as RegExp).test(v)) return 'must be kebab-case [a-z0-9-]';
    if (existingSlugs.has(v) && v !== editingCurrentSlug) return 'slug already exists';
    return null;
  }, [existingSlugs, editingCurrentSlug]);

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
