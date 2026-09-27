// Benchmark: the same chat-shaped list on a real TtyBackend over fake streams,
// fed raw SGR wheel reports in chunks, as a terminal delivers a flick.
//   NODE_ENV=production npx tsx packages/examples/bench-chat/bench-tty.tsx
import React, { useState, type ReactNode } from 'react';
import { PassThrough, Writable } from 'node:stream';
import { render, Box, Text, ScrollList, useInput, type FrameStats, type ScrollMetrics } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';

const N = Number(process.env.ROWS ?? 3000);
const W = 120; const H = 40;
interface Row { spans: { text: string; dim?: boolean; color?: string }[]; first: boolean; continues: boolean }
const LOREM = 'lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore';
const ROWS: Row[] = Array.from({ length: N }, (_, i) => ({
  first: i % 6 === 0, continues: i % 6 !== 5,
  spans: [{ text: `row ${i} ` }, { text: LOREM.slice(0, 40 + (i % 50)), color: i % 7 === 0 ? 'cyan' : undefined }, { text: ` · ${i % 13}`, dim: true }],
}));
let appRenders = 0;
function App(): ReactNode {
  const [input, setInput] = useState('');
  const [view, setView] = useState<{ top: number; height: number } | null>(null);
  appRenders += 1;
  useInput((key) => {
    if (key.name.length === 1 && !key.ctrl && !key.meta) { setInput((s) => s + key.name); return true; }
  });
  const see = (m: ScrollMetrics) => setView((v) => (v && v.top === m.scrollTop && v.height === m.viewportHeight ? v : { top: m.scrollTop, height: m.viewportHeight }));
  const rows = ROWS.slice();
  const renderRow = (row: Row) => (
    <Box flexDirection="row" flexShrink={0}>
      <Text bold={row.first} color={row.first ? 'green' : undefined}>{row.first ? 'ƒ ' : '  '}</Text>
      <Box flexDirection="row" flexShrink={0} wrapContinues={row.continues}>
        {row.spans.map((s, j) => <Text key={j} dim={s.dim} color={s.color}>{s.text}</Text>)}
      </Box>
    </Box>
  );
  return (
    <Box flexDirection="column" width={W} height={H} paddingX={1}>
      <Text bold>{`chat · ${N} rows · top ${view?.top ?? '-'}`}</Text>
      <ScrollList<Row> flexGrow={1} flexShrink={1} anchor="bottom" scrollbar items={rows} rowHeight={1} keyOf={(_r, i) => `chat-${i}`} renderItem={renderRow} onScroll={(_o, m) => see(m)} onMetrics={see} />
      <Text dim>status · idle</Text>
      <Box flexDirection="row"><Text bold color="cyan">{'› '}</Text><Text wrap="wrap">{input || ' '}</Text></Box>
    </Box>
  );
}

// Fake terminal: stdout counts frames and bytes, stdin is a pipe we write reports into.
let writes = 0; let bytes = 0; let waiters: (() => void)[] = [];
const out = new Writable({ write(chunk, _enc, cb) { writes += 1; bytes += chunk.length; for (const w of waiters.splice(0)) w(); cb(); } }) as unknown as NodeJS.WriteStream;
Object.assign(out, { columns: W, rows: H, isTTY: true });
const input = new PassThrough() as unknown as NodeJS.ReadStream;
Object.assign(input, { isTTY: false, setRawMode: () => input });
const backend = new TtyBackend(out, input, { mouse: true, colorScheme: false, captureConsole: false });
const stats: FrameStats[] = [];
const app = await render(<App />, backend, { onFrame: (f) => stats.push(f) });
const nextWrite = () => new Promise<void>((r) => waiters.push(r));
const settle = async () => { await new Promise((r) => setTimeout(r, 30)); };
await settle();
const now = () => performance.now();
const WHEEL = (up: boolean) => `\x1b[<${up ? 64 : 65};12;12M`;

console.log(`rows ${N}, ${W}x${H}, NODE_ENV=${process.env.NODE_ENV ?? 'unset'}, frames so far ${writes}`);
// A chunk of K wheel reports: time from the write to the frame that follows.
for (const K of [1, 5, 10, 30]) {
  const times: number[] = []; const renders: number[] = []; const frames: number[] = [];
  for (let r = 0; r < 12; r++) {
    const chunk = WHEEL(r % 2 === 0).repeat(K);
    const a0 = appRenders; const w0 = writes;
    const t0 = now();
    const done = nextWrite();
    input.write(chunk);
    await done;
    times.push(now() - t0); renders.push(appRenders - a0);
    await settle();
    frames.push(writes - w0);
  }
  const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length);
  const recent = stats.splice(0);
  const ms = (k: 'layoutMs' | 'paintMs' | 'drawMs') => avg(recent.map((f) => f[k])).toFixed(1);
  console.log(`chunk of ${String(K).padStart(2)} wheel steps: ${avg(times).toFixed(1)} ms to the next frame  · renders ${avg(renders).toFixed(0)}  · frames per chunk ${avg(frames).toFixed(1)}  · layout ${ms('layoutMs')} paint ${ms('paintMs')} draw ${ms('drawMs')} ms`);
}
app.unmount();
process.exit(0);
