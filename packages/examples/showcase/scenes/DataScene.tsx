import React, { useState } from 'react';
import { Box, Text, Table, Markdown, useInput } from '@flowtty/react';

interface Pkg { name: string; role: string; size: string; deps: number; notes: string }

const PACKAGES: Pkg[] = [
  { name: 'core', role: 'buffer · layout · paint', size: '17 kB', deps: 1, notes: 'Framework-free. Yoga is the only dependency.' },
  { name: 'react', role: 'reconciler · components', size: '224 kB', deps: 1, notes: 'Bundles `react-reconciler`; React itself is a peer.' },
  { name: 'tty-backend', role: 'alt screen · keys · mouse', size: '8 kB', deps: 1, notes: 'Frame diff: a no-op repaint writes **nothing**.' },
  { name: 'inline-tty-backend', role: 'live region + log', size: '5 kB', deps: 2, notes: 'The `<Static>` pattern: a log above, a live area below.' },
  { name: 'testing', role: 'TestBackend', size: '—', deps: 0, notes: 'Frames as strings, cells with styles, `press` / `paste` / `wheel`.' },
];

export function DataScene() {
  const [row, setRow] = useState(0);
  useInput((key) => {
    if (key.name === 'down') setRow((r) => Math.min(PACKAGES.length - 1, r + 1));
    if (key.name === 'up') setRow((r) => Math.max(0, r - 1));
  });
  const pkg = PACKAGES[row]!;
  const md = [
    `## @flowtty/${pkg.name}`,
    '',
    pkg.notes,
    '',
    '| field | value |',
    '| :-- | --: |',
    `| role | ${pkg.role} |`,
    `| size | ${pkg.size} |`,
    `| deps | ${pkg.deps} |`,
    '',
    '1. rendered by `<Markdown>`',
    '2. tables, nested lists',
    '   - and code:',
    '',
    '```ts',
    `import { render } from '@flowtty/react';`,
    '```',
  ].join('\n');
  return (
    <Box flexDirection="row" gap={2} flexGrow={1} flexShrink={1}>
      <Box flexDirection="column" flexShrink={0}>
        <Text dim>{'<Table>'} — ↑/↓ moves the selection</Text>
        <Table
          data={PACKAGES} selectedIndex={row}
          columns={[
            { accessor: 'name', header: 'package' },
            { accessor: 'role', header: 'role' },
            { accessor: 'size', header: 'size', align: 'right' },
            { accessor: 'deps', header: 'deps', align: 'right' },
          ]}
        />
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} border="round" borderTitle=" <Markdown> " paddingX={1}>
        <Markdown>{md}</Markdown>
      </Box>
    </Box>
  );
}
