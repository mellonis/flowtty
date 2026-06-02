/** @jsxImportSource react */
import { useState, useCallback } from 'react';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { Box, TextInput, useDialog } from '@flowtty/react';

// ─── DeleteConfirmDialog ──────────────────────────────────────────────────────
// Chrome via openDialog({ title: DELETE_CONFIRM_DIALOG_TITLE, floating, ... }).

export const DELETE_CONFIRM_DIALOG_TITLE = '[DANGER] Delete article';

interface DeleteConfirmDialogProps {
  id: string;
}

export function DeleteConfirmDialog({ id }: DeleteConfirmDialogProps) {
  const { done, cancel } = useDialog();
  const [value, setValue] = useState('');

  const validate = useCallback((v: string): string | null | undefined => {
    if (v !== id) return 'must match the article id exactly';
    return null;
  }, [id]);

  return (
    <>
      <Box bold color="red">{`Permanently deletes content/articles/${id}/`}</Box>
      <Box>{''}</Box>
      <Box>{'Type the article id to confirm:'}</Box>
      <TextInput
        value={value}
        onChange={(v: string) => setValue(v)}
        validate={validate}
        onSubmit={(v: string) => {
          // validate guarantees v === id here
          rmSync(join('content/articles', v), { recursive: true, force: true });
          done({ deleted: true });
        }}
        onCancel={() => cancel()}
      />
    </>
  );
}
