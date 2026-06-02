/** @jsxImportSource react */
import { useState, useMemo, type ReactNode } from 'react';
import { Box, useInput, useTerminalSize, useDialogHost } from '@flowtty/react';
import { loadRegisteredTags, listFolders, readFrontmatter } from './helpers.js';
import { AddTagDialog, ADD_TAG_DIALOG_TITLE } from './AddTagDialog.js';

// ─── TagsListView ─────────────────────────────────────────────────────────────
//
// Browse-only table of all registered tags + usage count. Esc returns to list.
// No selection or actions — matches the original tagsListView.

interface TagsListViewProps {
  onDone: () => void;
}

export function TagsListView({ onDone }: TagsListViewProps) {
  // Bump on add-tag → re-read tags from disk (loadRegisteredTags reads fresh).
  const [bump, setBump] = useState(0);
  const tags: string[] = useMemo(() => loadRegisteredTags() as string[], [bump]);
  const folders: string[] = listFolders() as string[];
  const { width: termWidth } = useTerminalSize();
  const { openDialog } = useDialogHost();

  // Cursor: row 0 = "+ new tag", rows 1..N = sorted tags
  const [cursor, setCursor] = useState(0);
  const sorted = [...tags].sort();
  const rowCount = sorted.length + 1;
  const idx = Math.min(Math.max(0, cursor), rowCount - 1);

  // Count usage: each article is counted AT MOST ONCE per tag.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const tag of tags) map.set(tag, 0);
    for (const folder of folders) {
      const tagsInFolder = new Set<string>();
      for (const lang of ['en', 'ru'] as const) {
        const fm = readFrontmatter(folder, lang);
        if (!fm) continue;
        const raw = (fm.tags ?? '').replace(/^\[|\]$/g, '');
        for (const t of raw.split(',').map((s: string) => s.trim()).filter(Boolean)) {
          tagsInFolder.add(t);
        }
      }
      for (const t of tagsInFolder) {
        if (map.has(t)) map.set(t, (map.get(t) ?? 0) + 1);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump]);

  useInput((key) => {
    if (key.name === 'up' || key.name === 'k') {
      setCursor((c) => (c - 1 + rowCount) % rowCount);
    } else if (key.name === 'down' || key.name === 'j') {
      setCursor((c) => (c + 1) % rowCount);
    } else if (key.name === 'return') {
      if (idx === 0) {
        // Open AddTagDialog; on success, bump to re-read tags.
        void openDialog<string>(
          <AddTagDialog existingTags={tags} />,
          { title: ADD_TAG_DIALOG_TITLE, floating: true, minWidth: 40, padding: 1 },
        ).then((r) => {
          if (r.status === 'done') setBump((b) => b + 1);
        });
      }
    } else if (key.name === 'escape') {
      onDone();
    }
  });

  const tagW = Math.max(13, ...sorted.map((t) => t.length)); // '+ new tag' is 11 chars; reserve 13 for cursor margin

  const rows: ReactNode[] = [
    <Box key="__header" flexDirection="row">
      <Box width={2}>{'  '}</Box>
      <Box width={tagW + 2} bold>{'tag'.padEnd(tagW)}</Box>
      <Box bold>{'count'}</Box>
    </Box>,
    <Box key="__rule" dim>{'─'.repeat(Math.max(0, termWidth))}</Box>,
  ];

  // Row 0: "+ new tag"
  {
    const sel = idx === 0;
    rows.push(
      <Box key="__new" flexDirection="row">
        <Box width={2}>{sel ? '▸ ' : '  '}</Box>
        <Box bold={sel}>{'+ new tag'}</Box>
      </Box>,
    );
  }
  // Rows 1..N: existing tags
  for (let i = 0; i < sorted.length; i++) {
    const tag = sorted[i]!;
    const sel = i + 1 === idx;
    const count = counts.get(tag) ?? 0;
    rows.push(
      <Box key={tag} flexDirection="row">
        <Box width={2}>{sel ? '▸ ' : '  '}</Box>
        <Box width={tagW + 2} bold={sel}>{tag.padEnd(tagW)}</Box>
        <Box bold={sel}>{String(count)}</Box>
      </Box>,
    );
  }

  const helpText = idx === 0
    ? '↑↓/jk navigate · Enter new · Esc back'
    : '↑↓/jk navigate · Esc back';

  return (
    <Box flexDirection="column" height="100%">
      {/* Page title — centered, bold. */}
      <Box justifyContent="center">
        <Box bold>{'Tags'}</Box>
      </Box>
      <Box dim>{'─'.repeat(Math.max(0, termWidth))}</Box>
      {/* Content takes all available height; help is pinned at the bottom. */}
      <Box flexDirection="column" flexGrow={1}>
        {rows}
      </Box>
      <Box inverse wrap="truncate">{helpText.padEnd(termWidth)}</Box>
    </Box>
  );
}
