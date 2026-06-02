/** @jsxImportSource react */
import { useEffect, useState, useCallback } from 'react';
import { Box, useInput, useDialog, useDialogHost, Table, type TableColumn, Title, HelpBar, useRootAbortSignal } from '@flowtty/react';
import { listThings, setToken, ApiError } from './api.js';
import type { ThingSummary } from './types.js';
import { ThingDetailView } from './ThingDetailView.js';
import { displayThingTitle } from './helpers.js';

interface AllThingsViewProps {
  onLogout: () => void;
}

export function AllThingsView({ onLogout }: AllThingsViewProps) {
  const { cancel } = useDialog();
  const { openDialog } = useDialogHost();
  // Whole-app teardown signal: when the root unmounts (or errors out), the
  // in-flight fetch is aborted at the network layer instead of resolving into
  // a dead tree. Per-view unmount is still handled by React's normal cleanup.
  const signal = useRootAbortSignal();
  const [things, setThings] = useState<ThingSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listThings(signal ?? undefined);
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
  }, [onLogout, signal]);

  useEffect(() => { void reload(); }, [reload]);

  useInput((key) => {
    if (loading || !things) return;
    if (error) {
      if (key.name === 'r') void reload();
      else if (key.name === 'escape') cancel();
      return;
    }
    const n = things.length;
    if (n === 0) { if (key.name === 'escape') cancel(); return; }
    if (key.name === 'up' || key.name === 'k') setCursor((c) => (c - 1 + n) % n);
    else if (key.name === 'down' || key.name === 'j') setCursor((c) => (c + 1) % n);
    else if (key.name === 'return') {
      const t = things[cursor];
      if (t) {
        void openDialog(
          <ThingDetailView id={t.thingId} onLogout={onLogout} />,
          { title: displayThingTitle(t.title, t.firstLines, t.thingId) },
        );
      }
    } else if (key.name === 'escape') cancel();
    else if (key.name === 'r') void reload();
  });

  if (loading) return <Box>Loading things…</Box>;
  if (error) {
    return (
      <Box flexDirection="column">
        <Box color="red">Error: {error}</Box>
        <Box>Press &apos;r&apos; to retry, Esc to back.</Box>
      </Box>
    );
  }
  if (!things || things.length === 0) return <Box>No things found.</Box>;

  const columns: TableColumn<ThingSummary>[] = [
    { accessor: (t) => String(t.thingId), header: 'thingId' },
    { accessor: (t) => displayThingTitle(t.title, t.firstLines, t.thingId), header: 'title' },
  ];

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Title>All things · {things.length}</Title>
      <Table data={things} columns={columns} selectedIndex={cursor} scrollable />
      <HelpBar>{`↑↓/jk navigate · Enter open · r refresh · Esc back · ${cursor + 1}/${things.length}`}</HelpBar>
    </Box>
  );
}
