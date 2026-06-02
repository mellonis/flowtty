/** @jsxImportSource react */
import { useState } from 'react';
import { Box, MultiSelect, useDialog, useDialogHost } from '@flowtty/react';
import type { SelectItem } from '@flowtty/react';
import { AddTagDialog, ADD_TAG_DIALOG_TITLE } from './AddTagDialog.js';

// ─── TagsDialog ───────────────────────────────────────────────────────────────
// Chrome via openDialog({ title: TAGS_DIALOG_TITLE, floating, ... }).

export const TAGS_DIALOG_TITLE = 'Article tags';

interface TagsDialogProps {
  knownTags: string[];
  preSelected: string[];
}

export function TagsDialog({ knownTags: initialKnownTags, preSelected }: TagsDialogProps) {
  const { done, cancel } = useDialog();
  const { openDialog } = useDialogHost();
  const [knownTags, setKnownTags] = useState(initialKnownTags);
  const [selected, setSelected] = useState<string[]>(preSelected);

  const tagItems: SelectItem<string>[] = knownTags.map((t: string) => ({ label: t, value: t }));

  return (
    <>
      <Box dim>{'Space toggle · Enter confirm · + add new'}</Box>
      <MultiSelect<string>
        items={tagItems}
        value={selected}
        onChange={(v) => setSelected(v)}
        onSubmit={(v) => done(v)}
        onCancel={() => cancel()}
        onAddNew={() => {
          void openDialog<string>(
            <AddTagDialog existingTags={knownTags} />,
            { title: ADD_TAG_DIALOG_TITLE, floating: true, minWidth: 40, padding: 1 },
          ).then((result) => {
            if (result.status === 'done') {
              setKnownTags((prev: string[]) => [...prev, result.value]);
              setSelected((prev: string[]) => [...prev, result.value]);
            }
          });
        }}
      />
    </>
  );
}
