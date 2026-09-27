// Benchmark: a chat-shaped <ScrollList> (one-line cached rows, a
// fresh `items` array per render, index keys, the field and the scroll metrics
// as parent state), driven through TestBackend the way a TTY chunk would.
//   NODE_ENV=production npx tsx packages/examples/bench-chat/bench.tsx
import React, { useState, type ReactNode } from 'react';
import { render, Box, Text, ScrollList, useInput, type ScrollMetrics } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';

const N = Number(process.env.ROWS ?? 3000);
const W = 120;
const H = 40;
const F = (k: string) => process.env[k] !== '0';
const PHASES = (process.env.PHASES ?? 'typing,wheel,burst,mid').split(',');

interface Row { spans: { text: string; dim?: boolean; color?: string }[]; first: boolean; continues: boolean }
const LOREM = 'lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore';
const ROWS: Row[] = Array.from({ length: N }, (_, i) => ({
  first: i % 6 === 0,
  continues: i % 6 !== 5,
  spans: [
    { text: `row ${i} ` },
    { text: LOREM.slice(0, 40 + (i % 50)), color: i % 7 === 0 ? 'cyan' : undefined },
    { text: ` · ${i % 13}`, dim: true },
  ],
}));

let appRenders = 0;
let rowRenders = 0;

function App(): ReactNode {
  const [input, setInput] = useState('');
  const [view, setView] = useState<{ top: number; height: number } | null>(null);
  appRenders += 1;
  useInput((key) => {
    if (key.name.length === 1 && !key.ctrl && !key.meta) { setInput((s) => s + key.name); return true; }
    if (key.name === 'backspace') { setInput((s) => s.slice(0, -1)); return true; }
  });
  const see = (m: ScrollMetrics) => setView((v) => (v && v.top === m.scrollTop && v.height === m.viewportHeight ? v : { top: m.scrollTop, height: m.viewportHeight }));
  const rows = ROWS.slice(); // a new array each render, as chatRows(...).flat() hands over
  const renderRow = (row: Row, _i: number) => {
    rowRenders += 1;
    return (
      <Box flexDirection="row" flexShrink={0}>
        <Text bold={row.first} color={row.first ? 'green' : undefined}>{row.first ? 'ƒ ' : '  '}</Text>
        <Box flexDirection="row" flexShrink={0} wrapContinues={row.continues}>
          {row.spans.map((s, j) => <Text key={j} dim={s.dim} color={s.color}>{s.text}</Text>)}
        </Box>
      </Box>
    );
  };
  return (
    <Box flexDirection="column" width={W} height={H} paddingX={1}>
      <Text bold>{`chat · ${N} rows · top ${view?.top ?? '-'} · h ${view?.height ?? '-'}`}</Text>
      <ScrollList<Row>
        flexGrow={1} flexShrink={1} anchor="bottom" scrollbar={F('SCROLLBAR')}
        items={rows} rowHeight={1} keyOf={(_r, i) => `chat-${i}`} renderItem={renderRow}
        onScroll={F('SEE') ? (_o, m) => see(m) : undefined} onMetrics={F('SEE') ? see : undefined}
      />
      <Text dim>status · idle</Text>
      <Box flexDirection="row"><Text bold color="cyan">{'› '}</Text><Text wrap="wrap">{input || ' '}</Text></Box>
    </Box>
  );
}

const now = () => performance.now();
const backend = new TestBackend(W, H);
if (process.env.NODRAW === '1') { let n = 0; (backend as { draw: unknown }).draw = () => { n += 1; backend.frames.push(String(n)); }; }
await render(<App />, backend, { selection: F('SELECTION'), mouse: F('MOUSE') });
await flushAsync(backend);

interface Sample { press: number; settle: number; frames: number; app: number; rows: number }
async function step(keys: () => void): Promise<Sample> {
  const app0 = appRenders; const rows0 = rowRenders; const frames0 = 0;
  const a = now(); keys(); const b = now();
  await flushAsync(backend);
  const c = now();
  const frames = backend.frames.length - frames0;
  backend.frames.length = 0; // the test backend keeps every frame: not what is measured
  return { press: b - a, settle: c - a, frames, app: appRenders - app0, rows: rowRenders - rows0 };
}
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? 0;
const fmt = (label: string, s: Sample[]) => console.log(
  `${label.padEnd(28)} press avg ${avg(s.map((x) => x.press)).toFixed(2)} ms  p95 ${p95(s.map((x) => x.press)).toFixed(2)}`
  + `  | settle avg ${avg(s.map((x) => x.settle)).toFixed(2)}  | frames/step ${avg(s.map((x) => x.frames)).toFixed(1)}`
  + `  app renders/step ${avg(s.map((x) => x.app)).toFixed(1)}  rows rendered/step ${avg(s.map((x) => x.rows)).toFixed(0)}`);
const heap = () => { (globalThis as { gc?: () => void }).gc?.(); return (process.memoryUsage().heapUsed / 1048576).toFixed(1); };

console.log(`rows ${N}, ${W}x${H}, NODE_ENV=${process.env.NODE_ENV ?? 'unset'}, heap ${heap()} MB`);

// 1. Typing: a long message, one key at a time, each settled before the next.
if (PHASES.includes('typing')) {
  const text = ('the quick brown fox jumps over the lazy dog ').repeat(8);
  const samples: Sample[] = [];
  for (const ch of text) samples.push(await step(() => backend.press({ name: ch })));
  fmt('typing: first 60 keys', samples.slice(0, 60));
  fmt('typing: last 60 keys', samples.slice(-60));
  console.log(`  heap after typing ${heap()} MB`);
  for (let i = 0; i < text.length; i++) backend.press({ name: 'backspace' });
  await flushAsync(backend);
}

// 2. Slow wheel: alternate 20 up / 20 down, each step settled, many rounds —
//    does a step get slower with time?
if (PHASES.includes('wheel')) {
  const rounds: Sample[][] = [];
  const h0 = heap();
  for (let r = 0; r < 30; r++) {
    const samples: Sample[] = [];
    for (let i = 0; i < 20; i++) samples.push(await step(() => backend.press({ name: 'wheelup', x: 10, y: 10 })));
    for (let i = 0; i < 20; i++) samples.push(await step(() => backend.press({ name: 'wheeldown', x: 10, y: 10 })));
    rounds.push(samples);
  }
  fmt('wheel settled: round 1', rounds[0]!);
  fmt('wheel settled: round 15', rounds[14]!);
  fmt('wheel settled: round 30', rounds[29]!);
  console.log(`  heap before ${h0} MB, after ${heap()} MB`);
}

// 3. Wheel bursts: 10 steps in one chunk (pressed back to back, no settle
//    between), as a fast flick delivers them.
if (PHASES.includes('burst')) {
  const samples: Sample[] = [];
  for (let r = 0; r < 20; r++) {
    const name = r % 2 === 0 ? 'wheelup' : 'wheeldown';
    samples.push(await step(() => { for (let i = 0; i < 10; i++) backend.press({ name, x: 10, y: 10 }); }));
  }
  fmt('wheel burst of 10 (per burst)', samples);
  console.log(`  heap after bursts ${heap()} MB`);
}

// 4. Same, far from the end (the window moves through the middle of the list).
if (PHASES.includes('mid')) {
  for (let i = 0; i < 50; i++) backend.press({ name: 'pageup' });
  await flushAsync(backend);
  const samples: Sample[] = [];
  for (let r = 0; r < 20; r++) {
    const name = r % 2 === 0 ? 'wheelup' : 'wheeldown';
    samples.push(await step(() => { for (let i = 0; i < 10; i++) backend.press({ name, x: 10, y: 10 }); }));
  }
  fmt('burst of 10, mid-list', samples);
}
process.exit(0);
