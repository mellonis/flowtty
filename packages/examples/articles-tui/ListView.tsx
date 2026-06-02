/** @jsxImportSource react */
import { Box, Table, type TableColumn, useInput, useTerminalSize } from '@flowtty/react';
import { listFolders, buildRows, statusOf } from './helpers.js';
import type { ListAction } from './types.js';

// ─── ListView ─────────────────────────────────────────────────────────────────

interface ListViewProps {
  cursor: number;
  onCursorChange: (n: number) => void;
  onAction: (action: ListAction | null) => void;
  statusMessage: string | null | undefined;
}

export function ListView({ cursor, onCursorChange, onAction, statusMessage }: ListViewProps) {
  const folders: string[] = listFolders();
  const rows: Array<{ id: string; status: string; date: string; title: string }> = buildRows(folders);
  const rowCount = folders.length + 1; // row 0 = "+ new article"
  const { width: termWidth } = useTerminalSize();

  const idx = Math.min(Math.max(0, cursor), rowCount - 1);

  let helpText: string;
  if (idx === 0) {
    helpText = '↑↓/jk navigate · Enter new · t tags · Esc quit';
  } else {
    const st: string = statusOf(folders[idx - 1]!);
    const parts = ['↑↓/jk navigate', 'Enter open'];
    if (st !== 'published') parts.push('p publish');
    if (st !== 'draft') parts.push('w withdraw');
    parts.push('d delete', 't tags', 'Esc quit');
    helpText = parts.join(' · ');
  }

  useInput((key) => {
    if (key.name === 'up' || key.name === 'k') {
      onCursorChange((idx - 1 + rowCount) % rowCount);
    } else if (key.name === 'down' || key.name === 'j') {
      onCursorChange((idx + 1) % rowCount);
    } else if (key.name === 'return') {
      if (idx === 0) onAction({ kind: 'create' });
      else onAction({ kind: 'view', id: folders[idx - 1]! });
    } else if (key.name === 'd') {
      if (idx > 0) onAction({ kind: 'delete', id: folders[idx - 1]! });
    } else if (key.name === 'p') {
      if (idx > 0 && statusOf(folders[idx - 1]!) !== 'published') {
        onAction({ kind: 'publish', id: folders[idx - 1]! });
      }
    } else if (key.name === 'w') {
      if (idx > 0 && statusOf(folders[idx - 1]!) !== 'draft') {
        onAction({ kind: 'withdraw', id: folders[idx - 1]! });
      }
    } else if (key.name === 't') {
      onAction({ kind: 'tags-list' });
    } else if (key.name === 'escape') {
      onAction(null);
    }
  });

  const columns: TableColumn<(typeof rows)[number]>[] = [
    { accessor: 'id', header: 'id' },
    { accessor: 'status', header: 'status' },
    { accessor: 'date', header: 'date', width: 10 },
    { accessor: 'title', header: 'title' },
  ];

  const debugLine = statusMessage ?? '';

  return (
    <Box flexDirection="column" height="100%">
      {/* Page title — centered, bold. */}
      <Box justifyContent="center">
        <Box bold>{'Articles'}</Box>
      </Box>
      {/* Row 0 is the "+ new article" action — kept outside the grid (it isn't a
          data row) but highlighted inverse like a selected row for consistency. */}
      <Box inverse={idx === 0}>{'+ new article'}</Box>
      {/* Article grid: fills the remaining height and scrolls its rows; the
          header + rules stay pinned. selectedIndex maps cursor→data (offset by
          the "+ new" row at index 0). */}
      <Table
        data={rows}
        columns={columns}
        selectedIndex={idx > 0 ? idx - 1 : undefined}
        scrollable
      />
      <Box dim>{debugLine}</Box>
      <Box inverse wrap="truncate">{helpText.padEnd(termWidth)}</Box>
    </Box>
  );
}
