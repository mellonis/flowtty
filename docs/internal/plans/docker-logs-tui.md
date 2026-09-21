# docker-logs-tui (Dozzle-style container log viewer)

**Goal:** another full example app — a full-screen, split-pane Docker **log viewer**:
a container list on the left, an auto-tailing scrollable log pane on the right.
Different stress profile than the existing examples (articles-tui = local files,
things-tui = authenticated HTTP, inline-build-log = `<Static>` append-above):
this one exercises **multi-pane flexbox layout + a live-updating scrollable pane
+ a long-lived child-process stream torn down via `useRootAbortSignal`** — the
streaming/`TtyBackend` story none of the others cover.

It is *Dozzle-shaped* (the recognizable container-list ⇆ log-tail layout), not a
reimplementation of Dozzle. Named `docker-logs-tui` to avoid the trademark and
describe the function.

## Decisions confirmed

- **Backend:** `TtyBackend` (full-screen / alt-screen, `fullScreen: true`). NOT
  the inline `<Static>` path — that's `fullScreen: false` and cannot host a
  split-pane layout (it already has its own example, inline-build-log).
- **Data source:** Docker CLI via `child_process` (no Docker SDK), with a
  zero-setup **demo fallback**. Both sit behind one `LogSource` interface so the
  UI never knows which it's talking to. `pickSource()` probes `docker version`
  and falls back to the synthetic source, or honors `--demo`.
- **v1 features:** container list + switch · auto-tailing log pane · follow
  toggle · manual scroll when paused · stream teardown on quit/switch · substring
  filter · log-level coloring · wrap/truncate toggle · a stats column.
- **Stats column scope:** the container `STATUS`/uptime that `docker ps` already
  returns — NOT live CPU/mem. Live stats would be a second `docker stats --stream`
  source; deferred past v1.
- **Log-pane rendering — approach A ("bottom-anchored overflow clip"):** the pane
  is a measured `flexGrow:1` `overflow:hidden` column. Follow mode renders the
  last ~H entries with `justifyContent:flex-end` so the newest pin to the bottom
  and overflow clips off the top (true tail behavior). Paused mode uses a
  `topIndex` window with `flex-start`. Per-line color + wrap/truncate come from
  `<Box wrap>`; no manual visual-line math, uses only `<Box>`/`<Text>`. (Precise
  visual-line windowing via core's `wrapText`/`splitVisualLines`, and reusing
  `<Table>` single-column, were both considered and rejected as overkill / wrong
  shape for free-text logs.)

## Architecture

- Pure TS+JSX (`.tsx`), `tsx` runtime, `/** @jsxImportSource react */` pragma +
  explicit `import React` (tsx uses classic JSX — see CLAUDE.md).
- Imports flowtty via the published package names (`@flowtty/react`,
  `@flowtty/tty-backend`); no new workspace deps (approach A needs only
  `<Box>`/`<Text>` for the pane and `<Table>` for the list, all already available).
- **`LogSource` seam** isolates all I/O from the UI:

  ```ts
  interface LogSource {
    listContainers(signal?: AbortSignal): Promise<Container[]>;
    // Streams lines until stopped; returns a stop() that kills the child.
    streamLogs(
      id: string,
      opts: { tail: number; signal?: AbortSignal },
      onLine: (raw: string) => void,
    ): () => void;
  }
  ```

  - `DockerCliSource` — `docker ps --format '{{json .}}'` for the list;
    `docker logs --follow --tail 200 <id>` (spawned child) for the stream. No
    `--timestamps` (avoids double timestamps; lines render as-is).
  - `DemoSource` — a handful of invented containers + a `setInterval` log
    generator emitting mixed-level lines. Fully deterministic, good for a
    screen recording.
  - `pickSource()` — `try docker version` → `DockerCliSource`, else `DemoSource`
    (also forced by `--demo`).

- **Pure helpers (`logLine.ts`), unit-tested:**
  - `stripAnsi(s)` — removes ANSI/control escapes. The painter is cell-based;
    embedded raw escapes would corrupt layout, so incoming lines are sanitized
    before they enter the buffer.
  - `classifyLevel(s): Level` — case-insensitive regex: `error|fatal` → `error`,
    `warn` → `warn`, `debug|trace` → `debug`, else `info`.

- **State** lives in `App.tsx`: `{ selected, follow, filter, wrap, buffer }`.
  - An effect keyed on `selected` spawns `source.streamLogs`, clears the buffer,
    and returns a cleanup that calls `stop()`. `useRootAbortSignal` tears the
    whole thing down on quit.
  - Incoming line → `stripAnsi` → `classifyLevel` → push into a **ring buffer
    capped at 5,000 lines** (drop oldest) to bound memory on chatty containers.
  - `listContainers` polled every 3s to refresh status/uptime (demo source fakes
    a ticking uptime).

## Keymap

| Key | Action |
| --- | --- |
| `↑` / `↓` | move container selection (re-targets the stream) |
| `PgUp` / `PgDn` | scroll the log pane (auto-pauses follow) |
| `g` / `G` | jump to top / bottom (`G` re-enables follow) |
| `f` | toggle follow |
| `/` | inline filter field — live filter; Enter keeps, Esc clears+closes |
| `w` | wrap ⇆ truncate long lines |
| `Esc` | quit (or close the filter field if open) |

Filter text **persists** across container switches (compare a query across
containers); the log buffer **clears** on switch.

## Error handling

- No Docker detected → auto demo mode with a one-line banner.
- Stream ends / container exits → status line in the pane; container stays
  re-selectable.
- Empty filter match / empty container list → inline message in the pane/list.

## Testing

Example specs run under the root vitest config (default glob; no `include`
override — verified). Plan:
- `logLine.spec.ts` — `stripAnsi` + `classifyLevel` table-driven cases.
- `LogPane.spec.tsx` — render into `TestBackend`: assert follow pins newest lines
  to the bottom, paused window honors `topIndex`, and filtering hides non-matches.

The React/TTY integration (raw input, alt-screen, live child stream) is validated
by running `docker-logs-tui:demo` interactively — it can't be driven from a headless
test or by the agent (no TTY for raw mode); that visual confirmation is the
user's.

## Out of scope (v1)

- Live CPU/mem stats (`docker stats --stream`) — only `docker ps` status/uptime.
- Multi-container merged tail.
- Docker Engine API over the unix socket (CLI only for v1).
- Log persistence / export, pause-and-clear, regex (vs substring) filter.
- Mouse interaction, horizontal scroll.

## Scope check

Single subdir, ~8 small files. Roughly 3 implementation slices: (1) `LogSource`
interface + `DemoSource` + `pickSource` + `logLine` helpers + specs; (2) `App`
layout + `ContainerList` + stream lifecycle; (3) `LogPane` (approach A) + filter +
wrap + level color + `DockerCliSource` + run scripts.

## File structure

```
packages/examples/docker-logs-tui/
  index.tsx          — entry; render(<App/>, new TtyBackend())
  types.ts           — Container, LogLine, Level
  logSource.ts       — LogSource interface + DockerCliSource + DemoSource + pickSource()
  logLine.ts         — stripAnsi(), classifyLevel()  (pure)
  logLine.spec.ts    — unit tests for the pure helpers
  App.tsx            — state, stream lifecycle, key routing, row layout, HelpBar
  ContainerList.tsx  — left pane: <Table> (name/status/uptime), selectedIndex
  LogPane.tsx        — right pane: approach A; filter + wrap + per-line color
  LogPane.spec.tsx   — TestBackend render: tail/scroll/filter
package.json         — add scripts: "docker-logs-tui", "docker-logs-tui:demo"
```

Root `package.json` gets the matching `docker-logs-tui` / `:demo` passthrough
scripts (mirrors the other examples).
