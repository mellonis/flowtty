# docker-logs-tui Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build the `docker-logs-tui` example — a full-screen, split-pane Docker log viewer (container list ⇆ auto-tailing log pane) on `TtyBackend`, runnable with zero setup via a demo fallback.

**Architecture:** all I/O sits behind a `LogSource` interface (a Docker-CLI implementation + a synthetic demo implementation; `pickSource()` chooses). Pure helpers (`stripAnsi`, `classifyLevel`, `filterLines`) are unit-tested. The UI is three React components — `ContainerList` (left, a `<Table>`), `LogPane` (right, "bottom-anchored overflow clip" tailing), and `App` (state, stream lifecycle, key routing). `App` takes the source as a prop so it's testable with a fake.

**Tech Stack:** TypeScript ESM `.tsx` (tsx runtime, classic-JSX pragma), React 19, flowtty (`@flowtty/react` + `@flowtty/tty-backend`), Node `child_process`/`readline`, vitest + `TestBackend`.

**Design note:** `docs/plans/docker-logs-tui.md` (read it first — it has the keymap, data flow, and scope decisions).

**Repo conventions that bite (from CLAUDE.md):**
- Every `.tsx` component starts with `/** @jsxImportSource react */` AND `import React from 'react'` — tsx uses classic JSX; a missing import is a *runtime* crash, not a compile error.
- `.spec.ts(x)` files run under the root vitest config (default glob, no `include`). They import `render` from `@flowtty/react` and `TestBackend`/`flushAsync` from `@flowtty/core/testing`.
- This example adds **no** new `@flowtty/*` package or path alias, so the "three files in sync" rule does **not** apply. No change to `tsconfig.base.json`, `vitest.config.ts`, or `packages/examples/tsconfig.json` (it already has `types: ["node"]` + the alias map).
- `flexShrink` defaults to `0` (not CSS's `1`) — a `flexGrow` box won't collapse below its content without `flexShrink={1}`. Both the right column and `LogPane` set it.

---

## File Structure

```
packages/examples/docker-logs-tui/
  index.tsx          — entry; pickSource() then render(<App/>, new TtyBackend())
  types.ts           — Level, Container, LogLine
  logLine.ts         — stripAnsi(), classifyLevel(), filterLines()   (pure)
  logLine.spec.ts    — unit tests for the pure helpers
  logSource.ts       — LogSource interface; makeDemoSource(); makeDockerCliSource(); dockerAvailable(); pickSource()
  logSource.spec.ts  — DemoSource + pickSource(['--demo']) tests
  ContainerList.tsx  — left pane: <Table> name+status, dims stopped via cellStyle
  ContainerList.spec.tsx
  LogPane.tsx        — right pane: bottom-anchored tail; per-line color; wrap toggle
  LogPane.spec.tsx
  App.tsx            — state, stream lifecycle, polling, key routing, layout, HelpBar
  App.spec.tsx       — render + key-driven tests with a fake LogSource
```

Plus `packages/examples/package.json` and root `package.json` gain run scripts.

---

## Task 1: Scaffold — types + run scripts

**Files:**
- Create: `packages/examples/docker-logs-tui/types.ts`
- Modify: `packages/examples/package.json` (scripts)
- Modify: `package.json` (root scripts)

- [ ] **Step 1: Create the shared types**

`packages/examples/docker-logs-tui/types.ts`:

```ts
export type Level = 'error' | 'warn' | 'info' | 'debug';

// One container as surfaced by `docker ps -a --format '{{json .}}'`.
// `state` is the machine state ('running' | 'exited' | …); `status` is the
// human string ('Up 3 hours', 'Exited (0) 5 minutes ago') — that's the "stats".
export interface Container {
  id: string;
  name: string;
  state: string;
  status: string;
}

export interface LogLine {
  text: string;
  level: Level;
}
```

- [ ] **Step 2: Add the example run scripts**

In `packages/examples/package.json`, add to `"scripts"` (after `inline-build-log`):

```json
    "docker-logs-tui": "tsx docker-logs-tui/index.tsx",
    "docker-logs-tui:demo": "tsx docker-logs-tui/index.tsx --demo"
```

In the root `package.json`, add to `"scripts"` (after `inline-build-log`):

```json
    "docker-logs-tui": "npm run docker-logs-tui -w @flowtty/examples",
    "docker-logs-tui:demo": "npm run docker-logs-tui:demo -w @flowtty/examples"
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/examples/docker-logs-tui/types.ts packages/examples/package.json package.json
git commit -m "feat(examples): scaffold docker-logs-tui (types + run scripts)"
```

---

## Task 2: Pure log-line helpers (TDD)

**Files:**
- Create: `packages/examples/docker-logs-tui/logLine.ts`
- Test: `packages/examples/docker-logs-tui/logLine.spec.ts`

- [ ] **Step 1: Write the failing test**

`packages/examples/docker-logs-tui/logLine.spec.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { stripAnsi, classifyLevel, filterLines } from './logLine.js';
import type { LogLine } from './types.js';

describe('stripAnsi', () => {
  test('removes CSI color sequences but keeps the text', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });
  test('passes plain text through unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });
});

describe('classifyLevel', () => {
  test.each([
    ['2026-01-01 ERROR boom', 'error'],
    ['fatal: disk full', 'error'],
    ['warn: slow query', 'warn'],
    ['DEBUG connecting', 'debug'],
    ['just an ordinary line', 'info'],
  ] as const)('%s -> %s', (line, level) => {
    expect(classifyLevel(line)).toBe(level);
  });
});

describe('filterLines', () => {
  const lines: LogLine[] = [
    { text: 'connection accepted', level: 'info' },
    { text: 'slow query 412ms', level: 'warn' },
  ];
  test('empty query returns all lines', () => {
    expect(filterLines(lines, '')).toHaveLength(2);
  });
  test('matches case-insensitive substrings', () => {
    expect(filterLines(lines, 'QUERY').map((l) => l.text)).toEqual(['slow query 412ms']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/examples/docker-logs-tui/logLine.spec.ts`
Expected: FAIL — cannot find module `./logLine.js`.

- [ ] **Step 3: Implement the helpers**

`packages/examples/docker-logs-tui/logLine.ts`:

```ts
import type { Level, LogLine } from './types.js';

// Strip ANSI escape sequences (CSI color codes + two-char ESC sequences). The
// painter is cell-based; raw escapes embedded in a line would corrupt layout,
// so sanitize before lines enter the buffer.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-Z\\\]^_]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '');
}

const ERROR_RE = /\b(error|err|fatal|panic)\b/i;
const WARN_RE = /\b(warn|warning)\b/i;
const DEBUG_RE = /\b(debug|trace)\b/i;

export function classifyLevel(s: string): Level {
  if (ERROR_RE.test(s)) return 'error';
  if (WARN_RE.test(s)) return 'warn';
  if (DEBUG_RE.test(s)) return 'debug';
  return 'info';
}

export function filterLines(lines: readonly LogLine[], query: string): LogLine[] {
  if (query === '') return lines.slice();
  const q = query.toLowerCase();
  return lines.filter((l) => l.text.toLowerCase().includes(q));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/examples/docker-logs-tui/logLine.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/examples/docker-logs-tui/logLine.ts packages/examples/docker-logs-tui/logLine.spec.ts
git commit -m "feat(examples): docker-logs-tui pure log-line helpers"
```

---

## Task 3: LogSource interface + DemoSource (TDD)

**Files:**
- Create: `packages/examples/docker-logs-tui/logSource.ts`
- Test: `packages/examples/docker-logs-tui/logSource.spec.ts`

(`makeDockerCliSource` + `pickSource` are added to this same file in Task 7.)

- [ ] **Step 1: Write the failing test**

`packages/examples/docker-logs-tui/logSource.spec.ts`:

```ts
import { describe, test, expect, vi } from 'vitest';
import { makeDemoSource } from './logSource.js';

describe('makeDemoSource', () => {
  test('listContainers returns the demo set including a stopped container', async () => {
    const src = makeDemoSource();
    const list = await src.listContainers();
    expect(list.map((c) => c.name)).toContain('poetry-mysql');
    expect(list.some((c) => c.state === 'exited')).toBe(true);
  });

  test('streamLogs seeds tail lines synchronously, then streams; stop() halts it', () => {
    vi.useFakeTimers();
    try {
      const src = makeDemoSource();
      const got: string[] = [];
      const stop = src.streamLogs('c2', { tail: 3 }, (l) => got.push(l));
      expect(got).toHaveLength(3);          // seeded synchronously
      vi.advanceTimersByTime(900);           // two more at 400ms each
      expect(got).toHaveLength(5);
      stop();
      vi.advanceTimersByTime(2000);
      expect(got).toHaveLength(5);           // nothing after stop()
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/examples/docker-logs-tui/logSource.spec.ts`
Expected: FAIL — cannot find module `./logSource.js`.

- [ ] **Step 3: Implement the interface + DemoSource**

`packages/examples/docker-logs-tui/logSource.ts`:

```ts
import type { Container } from './types.js';

// The seam between the UI and "where logs come from". streamLogs returns a
// stop() that tears down the underlying stream (kills the child / clears the
// timer). Both implementations honor an optional AbortSignal for root teardown.
export interface LogSource {
  listContainers(signal?: AbortSignal): Promise<Container[]>;
  streamLogs(
    id: string,
    opts: { tail: number; signal?: AbortSignal },
    onLine: (raw: string) => void,
  ): () => void;
}

const DEMO_CONTAINERS: Container[] = [
  { id: 'c1', name: 'poetry-nextjs', state: 'running', status: 'Up 3 hours' },
  { id: 'c2', name: 'poetry-mysql', state: 'running', status: 'Up 3 hours' },
  { id: 'c3', name: 'meilisearch', state: 'running', status: 'Up 2 days' },
  { id: 'c4', name: 'dozzle', state: 'exited', status: 'Exited (0) 5 minutes ago' },
];

const DEMO_MESSAGES = [
  '[info] connection accepted',
  '[warn] slow query 412ms',
  '[info] flush complete',
  '[error] deadlock detected, retrying',
  '[debug] heartbeat ok',
];

export function makeDemoSource(): LogSource {
  return {
    async listContainers() {
      return DEMO_CONTAINERS.map((c) => ({ ...c }));
    },
    streamLogs(id, opts, onLine) {
      const stamp = () => new Date().toISOString().slice(11, 19);
      const emit = (i: number) => onLine(`${stamp()} ${DEMO_MESSAGES[i % DEMO_MESSAGES.length]} (${id})`);
      // Seed up to `tail` recent lines synchronously (cap at the message set).
      const seed = Math.min(opts.tail, 8);
      for (let i = 0; i < seed; i++) emit(i);
      let n = seed;
      const timer = setInterval(() => emit(n++), 400);
      const onAbort = () => clearInterval(timer);
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      return () => {
        clearInterval(timer);
        opts.signal?.removeEventListener('abort', onAbort);
      };
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/examples/docker-logs-tui/logSource.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/examples/docker-logs-tui/logSource.ts packages/examples/docker-logs-tui/logSource.spec.ts
git commit -m "feat(examples): docker-logs-tui LogSource interface + demo source"
```

---

## Task 4: ContainerList component (TDD)

**Files:**
- Create: `packages/examples/docker-logs-tui/ContainerList.tsx`
- Test: `packages/examples/docker-logs-tui/ContainerList.spec.tsx`

- [ ] **Step 1: Write the failing test**

`packages/examples/docker-logs-tui/ContainerList.spec.tsx`:

```tsx
import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { ContainerList } from './ContainerList.js';
import type { Container } from './types.js';

const containers: Container[] = [
  { id: 'c1', name: 'poetry-nextjs', state: 'running', status: 'Up 3 hours' },
  { id: 'c2', name: 'dozzle', state: 'exited', status: 'Exited (0) 5 minutes ago' },
];

describe('ContainerList', () => {
  test('renders container names and the status column', async () => {
    const backend = new TestBackend(44, 8);
    const r = await render(
      <ContainerList containers={containers} selectedIndex={0} width={44} />,
      backend,
    );
    await flushAsync(backend);
    const frame = backend.lastFrame;
    expect(frame).toContain('poetry-nextjs');
    expect(frame).toContain('dozzle');
    expect(frame).toContain('Up 3 hours');
    r.unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/examples/docker-logs-tui/ContainerList.spec.tsx`
Expected: FAIL — cannot find module `./ContainerList.js`.

- [ ] **Step 3: Implement the component**

`packages/examples/docker-logs-tui/ContainerList.tsx`:

```tsx
/** @jsxImportSource react */
import React from 'react';
import { Box, Table, type TableColumn, type TableCellStyle } from '@flowtty/react';
import type { Container } from './types.js';

interface ContainerListProps {
  containers: Container[];
  selectedIndex: number;
  width?: number;
}

export function ContainerList({ containers, selectedIndex, width = 30 }: ContainerListProps) {
  // Dim everything but running containers, so stopped ones read as inactive.
  const dimIfStopped = (c: Container): TableCellStyle | undefined =>
    c.state === 'running' ? undefined : { dim: true };

  const columns: TableColumn<Container>[] = [
    { accessor: 'name', header: 'container', cellStyle: dimIfStopped },
    { accessor: 'status', header: 'status', cellStyle: dimIfStopped },
  ];

  return (
    <Box flexDirection="column" width={width} height="100%">
      <Table data={containers} columns={columns} selectedIndex={selectedIndex} scrollable />
    </Box>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/examples/docker-logs-tui/ContainerList.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/examples/docker-logs-tui/ContainerList.tsx packages/examples/docker-logs-tui/ContainerList.spec.tsx
git commit -m "feat(examples): docker-logs-tui container list pane"
```

---

## Task 5: LogPane component (TDD) — bottom-anchored tail

**Files:**
- Create: `packages/examples/docker-logs-tui/LogPane.tsx`
- Test: `packages/examples/docker-logs-tui/LogPane.spec.tsx`

- [ ] **Step 1: Write the failing test**

`packages/examples/docker-logs-tui/LogPane.spec.tsx`:

```tsx
import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { LogPane } from './LogPane.js';
import type { LogLine } from './types.js';

const mk = (n: number): LogLine[] =>
  Array.from({ length: n }, (_, i) => ({
    text: `line-${String(i).padStart(2, '0')}`,
    level: 'info' as const,
  }));

describe('LogPane', () => {
  test('follow pins the newest lines to the bottom and clips the oldest', async () => {
    const backend = new TestBackend(20, 5); // 5 rows tall
    const r = await render(<LogPane lines={mk(20)} follow topIndex={0} wrap={false} />, backend);
    await flushAsync(backend);
    const frame = backend.lastFrame;
    expect(frame).toContain('line-19');     // newest, at the bottom
    expect(frame).not.toContain('line-00'); // oldest, clipped off the top
    r.unmount();
  });

  test('paused mode windows from topIndex', async () => {
    const backend = new TestBackend(20, 5);
    const r = await render(<LogPane lines={mk(20)} follow={false} topIndex={2} wrap={false} />, backend);
    await flushAsync(backend);
    const frame = backend.lastFrame;
    expect(frame).toContain('line-02');
    expect(frame).not.toContain('line-19');
    r.unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/examples/docker-logs-tui/LogPane.spec.tsx`
Expected: FAIL — cannot find module `./LogPane.js`.

- [ ] **Step 3: Implement the component**

`packages/examples/docker-logs-tui/LogPane.tsx`:

```tsx
/** @jsxImportSource react */
import React from 'react';
import { useState } from 'react';
import { Box, Text } from '@flowtty/react';
import type { LogLine, Level } from './types.js';

const LEVEL_COLOR: Record<Level, string | undefined> = {
  error: 'red',
  warn: 'yellow',
  info: undefined,
  debug: undefined, // rendered dim instead of colored
};

interface LogPaneProps {
  lines: LogLine[]; // already filtered by the caller
  follow: boolean;
  topIndex: number; // window start when paused (!follow)
  wrap: boolean;
}

export function LogPane({ lines, follow, topIndex, wrap }: LogPaneProps) {
  const [height, setHeight] = useState(0);
  const h = height > 0 ? height : 1; // pre-layout fallback (one-frame)

  // Follow: render the last ~h entries and pin them to the bottom — any overflow
  // (wrapped entries spanning >1 row) clips off the TOP, which is exactly tail
  // behavior. Paused: a plain top-anchored window from topIndex.
  const visible = follow
    ? lines.slice(Math.max(0, lines.length - h))
    : lines.slice(topIndex, topIndex + h);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      overflow="hidden"
      justifyContent={follow ? 'flex-end' : 'flex-start'}
      onLayout={(r) => { if (r.height !== height) setHeight(r.height); }}
    >
      {visible.map((ln, i) => (
        <Box key={i} flexDirection="row">
          <Text
            color={LEVEL_COLOR[ln.level]}
            dim={ln.level === 'debug'}
            wrap={wrap ? 'wrap' : 'truncate'}
          >
            {ln.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/examples/docker-logs-tui/LogPane.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/examples/docker-logs-tui/LogPane.tsx packages/examples/docker-logs-tui/LogPane.spec.tsx
git commit -m "feat(examples): docker-logs-tui log pane (bottom-anchored tail)"
```

---

## Task 6: App — state, stream lifecycle, keymap, layout (TDD)

**Files:**
- Create: `packages/examples/docker-logs-tui/App.tsx`
- Test: `packages/examples/docker-logs-tui/App.spec.tsx`

- [ ] **Step 1: Write the failing test**

`packages/examples/docker-logs-tui/App.spec.tsx`:

```tsx
import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@flowtty/react';
import { TestBackend, flushAsync } from '@flowtty/core/testing';
import { App } from './App.js';
import type { LogSource } from './logSource.js';
import type { Container } from './types.js';

function fakeSource(): LogSource {
  const containers: Container[] = [
    { id: 'a', name: 'alpha', state: 'running', status: 'Up 1 hour' },
    { id: 'b', name: 'bravo', state: 'running', status: 'Up 2 hours' },
  ];
  return {
    async listContainers() { return containers; },
    streamLogs(id, _opts, onLine) {
      onLine(`[info] hello from ${id}`);
      onLine(`[error] boom in ${id}`);
      return () => {};
    },
  };
}

describe('App', () => {
  test('renders the container list and the selected container logs', async () => {
    const backend = new TestBackend(60, 12);
    const r = await render(<App source={fakeSource()} demo={false} onExit={() => {}} />, backend);
    await flushAsync(backend);
    const frame = backend.lastFrame;
    expect(frame).toContain('alpha');
    expect(frame).toContain('bravo');
    expect(frame).toContain('hello from a');
    r.unmount();
  });

  test('Down switches container and re-targets the stream', async () => {
    const backend = new TestBackend(60, 12);
    const r = await render(<App source={fakeSource()} demo={false} onExit={() => {}} />, backend);
    await flushAsync(backend);
    backend.press({ name: 'down' });
    await flushAsync(backend);
    expect(backend.lastFrame).toContain('hello from b');
    r.unmount();
  });

  test('"/" opens a filter that narrows the visible lines', async () => {
    const backend = new TestBackend(60, 12);
    const r = await render(<App source={fakeSource()} demo={false} onExit={() => {}} />, backend);
    await flushAsync(backend);
    backend.press({ name: '/' });
    await flushAsync(backend);
    backend.type('boom');
    await flushAsync(backend);
    const frame = backend.lastFrame;
    expect(frame).toContain('boom in a');
    expect(frame).not.toContain('hello from a');
    r.unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/examples/docker-logs-tui/App.spec.tsx`
Expected: FAIL — cannot find module `./App.js`.

- [ ] **Step 3: Implement App**

`packages/examples/docker-logs-tui/App.tsx`:

```tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/examples/docker-logs-tui/App.spec.tsx`
Expected: PASS (all three tests).

If the filter test is flaky on subscription timing, add one extra `await flushAsync(backend);` immediately after `backend.press({ name: '/' })` before typing — the App must unsubscribe and the TextInput subscribe between the two.

- [ ] **Step 5: Commit**

```bash
git add packages/examples/docker-logs-tui/App.tsx packages/examples/docker-logs-tui/App.spec.tsx
git commit -m "feat(examples): docker-logs-tui App — lifecycle, keymap, layout"
```

---

## Task 7: Docker CLI source + pickSource + entry point

**Files:**
- Modify: `packages/examples/docker-logs-tui/logSource.ts` (append)
- Modify: `packages/examples/docker-logs-tui/logSource.spec.ts` (append a pickSource test)
- Create: `packages/examples/docker-logs-tui/index.tsx`

- [ ] **Step 1: Write the failing test (append)**

Append to `packages/examples/docker-logs-tui/logSource.spec.ts`:

```ts
import { pickSource } from './logSource.js';

describe('pickSource', () => {
  test('--demo forces the synthetic source and the demo banner', async () => {
    const { source, demo } = pickSource(['--demo']);
    expect(demo).toBe(true);
    const list = await source.listContainers();
    expect(list.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/examples/docker-logs-tui/logSource.spec.ts`
Expected: FAIL — `pickSource` is not exported.

- [ ] **Step 3: Implement the Docker CLI source + pickSource (append)**

Append to `packages/examples/docker-logs-tui/logSource.ts`:

```ts
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

interface DockerPsJson { ID: string; Names: string; State: string; Status: string; }

export function makeDockerCliSource(): LogSource {
  return {
    async listContainers(signal) {
      const out = await execText('docker', ['ps', '-a', '--format', '{{json .}}'], signal);
      const containers: Container[] = [];
      for (const line of out.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          const j = JSON.parse(t) as DockerPsJson;
          containers.push({ id: j.ID, name: j.Names, state: j.State, status: j.Status });
        } catch {
          /* skip a malformed line */
        }
      }
      return containers;
    },
    streamLogs(id, opts, onLine) {
      const child = spawn('docker', ['logs', '--follow', '--tail', String(opts.tail), id], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      // Many containers log to stderr — tail both, line-buffered.
      const rlOut = createInterface({ input: child.stdout });
      const rlErr = createInterface({ input: child.stderr });
      rlOut.on('line', onLine);
      rlErr.on('line', onLine);
      const onAbort = () => child.kill();
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      return () => {
        opts.signal?.removeEventListener('abort', onAbort);
        rlOut.close();
        rlErr.close();
        child.kill();
      };
    },
  };
}

function execText(cmd: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('error', reject);
    child.on('close', () => resolve(out));
    signal?.addEventListener('abort', () => child.kill(), { once: true });
  });
}

function dockerAvailable(): boolean {
  try {
    const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

// Choose the source: real Docker when present (and not forced to demo), else the
// synthetic source. `demo` drives the on-screen banner.
export function pickSource(argv: string[]): { source: LogSource; demo: boolean } {
  if (!argv.includes('--demo') && dockerAvailable()) {
    return { source: makeDockerCliSource(), demo: false };
  }
  return { source: makeDemoSource(), demo: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/examples/docker-logs-tui/logSource.spec.ts`
Expected: PASS (DemoSource + pickSource).

- [ ] **Step 5: Create the entry point**

`packages/examples/docker-logs-tui/index.tsx`:

```tsx
/** @jsxImportSource react */
import React from 'react';
import { render } from '@flowtty/react';
import { TtyBackend } from '@flowtty/tty-backend';
import { App } from './App.js';
import { pickSource } from './logSource.js';

const { source, demo } = pickSource(process.argv.slice(2));

let handle: { unmount: () => void } | null = null;
handle = await render(
  <App source={source} demo={demo} onExit={() => handle?.unmount()} />,
  new TtyBackend(),
);
```

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: PASS (typecheck clean; all specs including the four new docker-logs-tui specs green).

- [ ] **Step 7: Commit**

```bash
git add packages/examples/docker-logs-tui/logSource.ts packages/examples/docker-logs-tui/logSource.spec.ts packages/examples/docker-logs-tui/index.tsx
git commit -m "feat(examples): docker-logs-tui Docker CLI source + entry point"
```

---

## Task 8: Manual verification (interactive — not automatable here)

The renderer/TTY integration (alt-screen, raw key input, a live child stream) can't be driven from a headless test or by the agent (no TTY for raw mode). Run it by hand:

- [ ] **Step 1: Demo mode (zero setup)**

Run: `npm run docker-logs-tui:demo`
Expected: a yellow "demo mode" banner; a container list (incl. a dimmed `dozzle` stopped row); the right pane tailing synthetic lines (error red, warn yellow, debug dim). Try `↑↓` (switch container), `f` (pause/resume — newest stop pinning), `PgUp`/`PgDn` + `g`/`G` (scroll history / jump), `/` then type (filter narrows live; Esc clears), `w` (wrap vs truncate a long line), `Esc` (quit cleanly, terminal restored, no stray child processes).

- [ ] **Step 2: Real Docker (if available)**

Run: `npm run docker-logs-tui` with some containers running.
Expected: real `docker ps -a` list + live `docker logs` tail for the selected container; switching kills the previous stream (check `ps aux | grep 'docker logs'` shows no leak after switching/quitting).

---

## Self-Review

**Spec coverage** (against `docs/plans/docker-logs-tui.md`):
- TtyBackend full-screen split-pane → Task 6 layout + Task 7 `index.tsx`. ✓
- LogSource seam (CLI + demo + pickSource) → Tasks 3, 7. ✓
- Approach-A bottom-anchored log pane → Task 5. ✓
- Container list + switch + stats column + dim-stopped → Tasks 4, 6. ✓
- Auto-tail / follow toggle / manual scroll / g·G → Task 6 keymap + Task 5 windowing. ✓
- Stream teardown on quit/switch via useRootAbortSignal → Task 6 effect cleanup + signal wiring; sources honor `signal` (Tasks 3, 7). ✓
- Substring filter (live, persists across switch, buffer clears) → Task 6 (`filter` not reset on selection change; `setBuffer([])` on switch). ✓
- Level coloring → Task 5 `LEVEL_COLOR` + `dim` debug. ✓
- Wrap toggle → Task 5 `wrap` prop + Task 6 `w` key. ✓
- ANSI strip + ring-buffer cap (5000) → Task 2 `stripAnsi` + Task 6 `MAX_LINES`. ✓
- Errors: no-Docker auto-demo banner (Task 7 `pickSource` + Task 6 banner); transient docker error keeps last list (Task 6 catch). ✓
- Testing: pure-helper specs + component render specs + key-driven App specs → Tasks 2–6. ✓
- No new package/alias (Task 1 note). ✓

**Placeholder scan:** none — every code/step is concrete.

**Type consistency:** `Container { id, name, state, status }`, `LogLine { text, level }`, `Level` used identically across Tasks 1–7. `LogSource.streamLogs(id, { tail, signal }, onLine) => () => void` and `listContainers(signal?)` match between the interface (Task 3), both implementations (Tasks 3, 7), the fake (Task 6), and `App` (Task 6). `pickSource(argv) => { source, demo }` matches `index.tsx` usage. Component prop names (`containers`/`selectedIndex`/`width`; `lines`/`follow`/`topIndex`/`wrap`; `source`/`demo`/`onExit`) match call sites.
