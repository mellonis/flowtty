/** @jsxImportSource react */
import { useState } from 'react';
import { Box, MultiSelect, useDialogHost } from '@flowtty/react';
import type { SelectItem } from '@flowtty/react';
import { loadRegisteredTags, readFrontmatter, writeArticleTags } from './helpers.js';
import { AddTagDialog, ADD_TAG_DIALOG_TITLE } from './AddTagDialog.js';

// ─── EditArticleTagsView ──────────────────────────────────────────────────────
//
// Multi-select tag picker pre-checked with the article's current tags.
// On submit: calls writeArticleTags (writes BOTH en.md and ru.md).
// On Esc: returns without saving.
// The 'add-tag' sub-step is now a nested AddTagDialog opened via openDialog,
// proving the nested-dialog pattern works even when this view is NOT a dialog.

interface EditArticleTagsViewProps {
  id: string;
  onDone: () => void;
}

export function EditArticleTagsView({ id, onDone }: EditArticleTagsViewProps) {
  const { openDialog } = useDialogHost();
  const [knownTags, setKnownTags] = useState<string[]>(() => {
    return loadRegisteredTags() as string[];
  });

  // Parse current tags from frontmatter (prefer en.md, fall back to ru.md).
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const fm =
      readFrontmatter(id, 'en') ??
      readFrontmatter(id, 'ru') ??
      {};
    const raw = ((fm as Record<string, string>).tags ?? '').replace(/^\[|\]$/g, '');
    return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
  });

  const tagItems: SelectItem<string>[] = knownTags.map((t: string) => ({ label: t, value: t }));

  return (
    <Box flexDirection="column">
      <Box>{`tags for ${id} (Space toggle, Enter confirm, Esc cancel):`}</Box>
      <MultiSelect<string>
        items={tagItems}
        value={selectedTags}
        onChange={(v) => setSelectedTags(v)}
        onSubmit={(v) => {
          writeArticleTags(id, v);
          onDone();
        }}
        onCancel={() => onDone()}
        // onAddNew opens a nested AddTagDialog; the async Promise floats intentionally.
        onAddNew={() => {
          void openDialog<string>(
            <AddTagDialog existingTags={knownTags} />,
            { title: ADD_TAG_DIALOG_TITLE, floating: true, minWidth: 40, padding: 1 },
          ).then((result) => {
            if (result.status === 'done') {
              setKnownTags((prev: string[]) => [...prev, result.value]);
              setSelectedTags((prev: string[]) => [...prev, result.value]);
            }
          });
        }}
      />
    </Box>
  );
}
