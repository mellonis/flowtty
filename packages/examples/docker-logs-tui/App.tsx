/** @jsxImportSource react */
import React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text, HelpBar, TextInput, useInput, useRootAbortSignal } from '@flowtty/react';
import { ContainerList } from './ContainerList.js';
import { LogPane } from './LogPane.js';
import { stripAnsi, classifyLevel, filterLines } from './logLine.js';
import type { Container, LogLine } from './types.js';
import type { LogSource } from './logSource.js';

const MAX_LINES = 5000; // ring-buffer cap — bounds memory on chatty containers
const TAIL = 200;       // initial history seeded per container
const SCROLL_STEP = 5;  // PgUp/PgDn step

interface AppProps {
  source: LogSource;
  demo: boolean; // show the "demo mode" banner
  onExit: () => void;
}

export function App({ source, demo, onExit }: AppProps) {
  const signal = useRootAbortSignal();
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [buffer, setBuffer] = useState<LogLine[]>([]);
  const [follow, setFollow] = useState(true);
  const [topIndex, setTopIndex] = useState(0);
  const [wrap, setWrap] = useState(false);
  const [filter, setFilter] = useState('');
  const [filtering, setFiltering] = useState(false);

  const selected = containers[selectedIndex];

  // Poll the container list every 3s so status/uptime stay fresh.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const list = await source.listContainers(signal ?? undefined);
        if (active) setContainers(list);
      } catch {
        /* transient docker error — keep the last good list */
      }
    };
    void load();
    const id = setInterval(() => void load(), 3000);
    return () => { active = false; clearInterval(id); };
  }, [source, signal]);

  // Stream the selected container; re-target (and clear) on selection change.
  useEffect(() => {
    if (!selected) return;
    setBuffer([]);
    const stop = source.streamLogs(
      selected.id,
      { tail: TAIL, signal: signal ?? undefined },
      (raw) => {
        const text = stripAnsi(raw);
        const line: LogLine = { text, level: classifyLevel(text) };
        setBuffer((prev) => {
          const next = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev.slice();
          next.push(line);
          return next;
        });
      },
    );
    return stop;
  }, [selected?.id, source, signal]);

  const lines = filterLines(buffer, filter);

  // Global keys — paused while the filter field is open (the TextInput owns
  // input then, gated by its isFocused).
  useInput((key) => {
    const n = containers.length;
    if (key.name === 'up') { setSelectedIndex((i) => Math.max(0, i - 1)); setFollow(true); }
    else if (key.name === 'down') { setSelectedIndex((i) => Math.min(n - 1, i + 1)); setFollow(true); }
    else if (key.name === 'pageup') { setFollow(false); setTopIndex((t) => Math.max(0, t - SCROLL_STEP)); }
    else if (key.name === 'pagedown') { setFollow(false); setTopIndex((t) => Math.min(Math.max(0, lines.length - 1), t + SCROLL_STEP)); }
    else if (key.name === 'g') { setFollow(false); setTopIndex(0); }
    else if (key.name === 'G') { setFollow(true); }
    else if (key.name === 'f') { setFollow((s) => !s); }
    else if (key.name === 'w') { setWrap((s) => !s); }
    else if (key.name === '/') { setFiltering(true); }
    else if (key.name === 'escape') { onExit(); }
  }, { isActive: !filtering });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {demo ? <Box color="yellow">demo mode — Docker not detected (synthetic data)</Box> : null}
      <Box flexDirection="row" flexGrow={1}>
        <ContainerList containers={containers} selectedIndex={selectedIndex} />
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <LogPane lines={lines} follow={follow} topIndex={topIndex} wrap={wrap} />
          {filtering ? (
            <Box flexDirection="row">
              <Text>/</Text>
              <TextInput
                value={filter}
                isFocused
                onChange={setFilter}
                onSubmit={() => setFiltering(false)}
                onCancel={() => { setFilter(''); setFiltering(false); }}
              />
            </Box>
          ) : null}
        </Box>
      </Box>
      <HelpBar>{helpText(selected, follow, wrap, filter, lines.length)}</HelpBar>
    </Box>
  );
}

function helpText(
  selected: Container | undefined,
  follow: boolean,
  wrap: boolean,
  filter: string,
  lineCount: number,
): string {
  const name = selected ? selected.name : '(no container)';
  const state = `${follow ? 'following' : 'paused'} · ${wrap ? 'wrap' : 'truncate'}${filter ? ` · /${filter}` : ''}`;
  return `${name} · ${state} · ${lineCount} lines · ↑↓ pick · PgUp/PgDn scroll · g/G top/bottom · f follow · / filter · w wrap · Esc quit`;
}
