/** @jsxImportSource react */
import { useState, useCallback } from 'react';
import { Box, TextInput, useDialog } from '@flowtty/react';
import { SLUG_RE, addArticleTagToContent } from './helpers.js';

// ─── AddTagDialog ─────────────────────────────────────────────────────────────
// Chrome via openDialog({ title: ADD_TAG_DIALOG_TITLE, floating, ... }).

export const ADD_TAG_DIALOG_TITLE = 'New tag';

interface AddTagDialogProps {
  existingTags: string[];
}

export function AddTagDialog({ existingTags }: AddTagDialogProps) {
  const { done, cancel } = useDialog();
  const [value, setValue] = useState('');

  const validate = useCallback((v: string): string | null | undefined => {
    if (!v.trim()) return 'required';
    if (!(SLUG_RE as RegExp).test(v)) return 'must be kebab-case [a-z0-9-]';
    if (existingTags.includes(v)) return 'tag already exists';
    return null;
  }, [existingTags]);

  // Validation error (re-computed each render from the current value, so it
  // updates live as the user types — clears when they fix the input).
  const error = validate(value);

  return (
    <>
      <Box>{'tag id (kebab-case):'}</Box>
      <TextInput
        value={value}
        onChange={(v: string) => setValue(v)}
        validate={validate}
        onSubmit={(v: string) => {
          addArticleTagToContent(v);
          done(v);
        }}
        onCancel={() => cancel()}
      />
      {value !== '' && error ? <Box dim>{error}</Box> : null}
    </>
  );
}
