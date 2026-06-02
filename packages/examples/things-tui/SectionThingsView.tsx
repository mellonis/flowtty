/** @jsxImportSource react */
import { useEffect, useState, useCallback } from 'react';
import { Box, useInput, useDialog, useDialogHost, Table, type TableColumn, Title, HRule, HelpBar, useRootAbortSignal } from '@flowtty/react';
import { getSectionThings, setToken, ApiError } from './api.js';
import type { SectionThing } from './types.js';
import { ThingDetailView } from './ThingDetailView.js';
import { displayThingTitle } from './helpers.js';

interface SectionThingsViewProps {
  sectionId: number;
  sectionTitle: string;
  onLogout: () => void;
}

export function SectionThingsView({
  sectionId, sectionTitle, onLogout,
}: SectionThingsViewProps) {
  const { cancel } = useDialog();
  const { openDialog } = useDialogHost();
  const signal = useRootAbortSignal();
  const [things, setThings] = useState<SectionThing[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getSectionThings(sectionId, signal ?? undefined);
      // The API already returns them in `position` order, but sort defensively.
      list.sort((a, b) => a.position - b.position);
      setThings(list);
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
  }, [sectionId, onLogout, signal]);

  useEffect(() => { void reload(); }, [reload]);

  useInput((key) => {
    if (loading || !things) return;
    if (error) {
      if (key.name === 'r') void reload();
      else if (key.name === 'escape') cancel();
      return;
    }
    const rowCount = things.length;
    if (rowCount === 0) {
      if (key.name === 'escape') cancel();
      return;
    }
    if (key.name === 'up' || key.name === 'k') {
      setCursor((c) => (c - 1 + rowCount) % rowCount);
    } else if (key.name === 'down' || key.name === 'j') {
      setCursor((c) => (c + 1) % rowCount);
    } else if (key.name === 'return') {
      const t = things[cursor];
      if (t) {
        // Open detail as a dialog over this list — list stays mounted, cursor
        // preserved naturally when the dialog closes.
        void openDialog(
          <ThingDetailView id={t.thingId} onLogout={onLogout} />,
          { title: displayThingTitle(t.title, t.firstLines, t.thingId) },
        );
      }
    } else if (key.name === 'escape') {
      cancel();
    } else if (key.name === 'r') {
      void reload();
    }
  });

  if (loading) return <Box>Loading section #{sectionId}…</Box>;

  if (error) {
    return (
      <Box flexDirection="column">
        <Box color="red">Error: {error}</Box>
        <Box>Press &apos;r&apos; to retry, Esc to back.</Box>
      </Box>
    );
  }

  if (!things || things.length === 0) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Title>{sectionTitle}</Title>
        <HRule />
        <Box flexGrow={1}>No things in this section.</Box>
        <HelpBar>Esc back</HelpBar>
      </Box>
    );
  }

  const columns: TableColumn<SectionThing>[] = [
    { accessor: (t) => String(t.position), header: 'pos' },
    { accessor: (t) => String(t.thingId), header: 'thingId' },
    { accessor: (t) => displayThingTitle(t.title, t.firstLines, t.thingId), header: 'title' },
  ];

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Title>{sectionTitle} · {things.length}</Title>
      <Table data={things} columns={columns} selectedIndex={cursor} scrollable />
      <HelpBar>{`↑↓/jk navigate · Enter open · r refresh · Esc back · ${cursor + 1}/${things.length}`}</HelpBar>
    </Box>
  );
}
