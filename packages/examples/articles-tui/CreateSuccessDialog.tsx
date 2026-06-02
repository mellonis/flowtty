/** @jsxImportSource react */
import { Box, Button, useDialog } from '@flowtty/react';

// ─── CreateSuccessDialog ─────────────────────────────────────────────────────
// Chrome via openDialog({ title: CREATE_SUCCESS_DIALOG_TITLE, floating, ... }).

export const CREATE_SUCCESS_DIALOG_TITLE = 'Article created';

interface CreateSuccessDialogProps {
  slug: string;
}

export function CreateSuccessDialog({ slug }: CreateSuccessDialogProps) {
  const { done, cancel } = useDialog();
  return (
    <>
      <Box>{`Slug: ${slug}`}</Box>
      <Box>{''}</Box>
      {/* Buttons sit side-by-side in a row. Tab cycles focus; Enter fires focused;
          shortcuts fire regardless of focus. */}
      <Box flexDirection="row" gap={2}>
        <Button
          label="Open"
          shortcut="o"
          onPress={() => done({ action: 'open' })}
        />
        <Button
          label="Close"
          shortcut="escape"
          onPress={() => cancel()}
        />
      </Box>
    </>
  );
}
