/** @jsxImportSource react */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, useInput, useDialog, useDialogHost, Table, type TableColumn, Title, HRule, HelpBar, useRootAbortSignal } from '@flowtty/react';
import { listThingsOfTheDayCalendar, setToken, ApiError } from './api.js';
import type { CalendarEntry, ThingsOfTheDayCalendar } from './types.js';
import { ThingDetailView } from './ThingDetailView.js';
import { displayThingTitle } from './helpers.js';

interface ThingsOfTheDayViewProps {
  onLogout: () => void;
}

// Flattened row: a single calendar entry tied to its date.
interface Row {
  date: string;        // YYYY-MM-DD
  entry: CalendarEntry;
}

// Flatten the date→entries record into a date-sorted row list.
function flatten(cal: ThingsOfTheDayCalendar): Row[] {
  const rows: Row[] = [];
  const dates = Object.keys(cal).sort();
  for (const date of dates) {
    for (const entry of cal[date] ?? []) {
      rows.push({ date, entry });
    }
  }
  return rows;
}

export function ThingsOfTheDayView({ onLogout }: ThingsOfTheDayViewProps) {
  const { cancel } = useDialog();
  const { openDialog } = useDialogHost();
  const signal = useRootAbortSignal();
  const [calendar, setCalendar] = useState<ThingsOfTheDayCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cal = await listThingsOfTheDayCalendar(signal ?? undefined);
      setCalendar(cal);
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

  const rows = useMemo(() => (calendar ? flatten(calendar) : []), [calendar]);

  useInput((key) => {
    if (loading || !calendar) return;
    if (error) {
      if (key.name === 'r') void reload();
      else if (key.name === 'escape') cancel();
      return;
    }
    const n = rows.length;
    if (n === 0) { if (key.name === 'escape') cancel(); return; }
    if (key.name === 'up' || key.name === 'k') setCursor((c) => (c - 1 + n) % n);
    else if (key.name === 'down' || key.name === 'j') setCursor((c) => (c + 1) % n);
    else if (key.name === 'return') {
      const r = rows[cursor];
      if (r) void openDialog(
        <ThingDetailView id={r.entry.id} onLogout={onLogout} />,
        { title: displayThingTitle(r.entry.title, r.entry.firstLines, r.entry.id) },
      );
    } else if (key.name === 'escape') cancel();
    else if (key.name === 'r') void reload();
  });

  if (loading) return <Box>Loading things of the day calendar…</Box>;
  if (error) {
    return (
      <Box flexDirection="column">
        <Box color="red">Error: {error}</Box>
        <Box>Press &apos;r&apos; to retry, Esc to back.</Box>
      </Box>
    );
  }
  if (!calendar || rows.length === 0) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Title>Things of the day</Title>
        <HRule />
        <Box flexGrow={1}>No entries.</Box>
        <HelpBar>Esc back</HelpBar>
      </Box>
    );
  }

  const columns: TableColumn<Row>[] = [
    { accessor: (r) => r.date, header: 'date', width: 10 },
    {
      accessor: (r) => r.entry.kind,
      header: 'kind',
      cellStyle: (r) => (r.entry.kind === 'fallback' ? { dim: true } : undefined),
    },
    { accessor: (r) => String(r.entry.id), header: 'id' },
    {
      accessor: (r) => {
        const title = displayThingTitle(r.entry.title, r.entry.firstLines, r.entry.id);
        const label = r.entry.sections.map((s) => s.id).join(', ');
        return title + (label ? `  [${label}]` : '');
      },
      header: 'title · sections',
    },
  ];

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Title>Things of the day · {rows.length} entries · {Object.keys(calendar).length} days</Title>
      <Table data={rows} columns={columns} selectedIndex={cursor} scrollable />
      <HelpBar>{`↑↓/jk navigate · Enter open · r refresh · Esc back · ${cursor + 1}/${rows.length}`}</HelpBar>
    </Box>
  );
}
