/** @jsxImportSource react */
import { useEffect, useState, useCallback } from 'react';
import { Box, useInput, useDialog, useDialogHost, Table, type TableColumn, Title, HelpBar, useRootAbortSignal } from '@flowtty/react';
import { listSections, setToken, ApiError } from './api.js';
import type { Section } from './types.js';
import { SectionThingsView } from './SectionThingsView.js';

interface SectionsListViewProps {
  // 401 path only — bubbles past all stacked dialogs to App's login state.
  onLogout: () => void;
}

export function SectionsListView({ onLogout }: SectionsListViewProps) {
  const { cancel } = useDialog();
  const { openDialog } = useDialogHost();
  const signal = useRootAbortSignal();
  const [sections, setSections] = useState<Section[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSections(signal ?? undefined);
      list.sort((a, b) => a.order - b.order);
      setSections(list);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      if (e instanceof ApiError && e.status === 401) {
        setToken(null);
        onLogout();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onLogout, signal]);

  useEffect(() => { void reload(); }, [reload]);

  useInput((key) => {
    if (loading || !sections) return;
    if (error) {
      if (key.name === 'r') void reload();
      else if (key.name === 'escape') cancel();
      return;
    }
    const rowCount = sections.length;
    if (rowCount === 0) return;
    if (key.name === 'up' || key.name === 'k') {
      setCursor((c) => (c - 1 + rowCount) % rowCount);
    } else if (key.name === 'down' || key.name === 'j') {
      setCursor((c) => (c + 1) % rowCount);
    } else if (key.name === 'return') {
      const s = sections[cursor];
      if (s) void openDialog(
        <SectionThingsView sectionId={s.id} sectionTitle={s.title} onLogout={onLogout} />,
      );
    } else if (key.name === 'escape') {
      cancel();
    } else if (key.name === 'r') {
      void reload();
    }
  });

  if (loading) return <Box>Loading sections…</Box>;

  if (error) {
    return (
      <Box flexDirection="column">
        <Box color="red">Error: {error}</Box>
        <Box>Press &apos;r&apos; to retry, Esc to back.</Box>
      </Box>
    );
  }

  if (!sections || sections.length === 0) return <Box>No sections found.</Box>;

  const columns: TableColumn<Section>[] = [
    { accessor: (s) => String(s.id), header: 'id' },
    { accessor: 'identifier', header: 'identifier' },
    { accessor: 'title', header: 'title' },
  ];

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Title>Sections · {sections.length}</Title>
      <Table data={sections} columns={columns} selectedIndex={cursor} scrollable />
      <HelpBar>{`↑↓/jk navigate · Enter open · r refresh · Esc back · ${cursor + 1}/${sections.length}`}</HelpBar>
    </Box>
  );
}
