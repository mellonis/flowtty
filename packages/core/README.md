# @flowtty/core

The framework-free core of [flowtty](https://github.com/mellonis/flowtty) — a library for building terminal apps in React.

This package has **no React and no Node dependency** in its main surface. It is the shared data model every adapter (React, future Svelte) and every backend (TTY, inline, test) depends on:

- `Buffer`, `Cell`, `Style`, `Key` — the cell-grid model a renderer paints into.
- `Backend` — the interface between a framework adapter and its output (a real TTY, an inline live region, an in-memory test surface).
- Pure utilities — `wrap`, `splitVisualLines`, `windowAround`, and the input/state reducers.

Most app authors don't install this directly — they use [`@flowtty/react`](https://github.com/mellonis/flowtty/tree/master/packages/react), which re-exports the core types you need. Install `@flowtty/core` directly when **writing an adapter or a backend**.

## Install

```bash
npm install @flowtty/core
```

## Subpaths

```ts
import { type Backend, type Buffer } from '@flowtty/core';        // public data model
import { /* Instance, paint, layout */ } from '@flowtty/core/host'; // adapter-facing internals
import { TestBackend } from '@flowtty/core/testing';              // headless test surface
```

- `.` — the framework-free public surface (types + pure utils). No React, no Node.
- `./host` — the primitives a framework adapter wires its component lifecycle onto (`Instance` tree, paint pipeline, layout).
- `./testing` — `TestBackend`, an in-memory backend that captures frames and injects keys for unit tests.

## See also

- [`@flowtty/react`](https://github.com/mellonis/flowtty/tree/master/packages/react) — the React adapter.
- [`@flowtty/tty-backend`](https://github.com/mellonis/flowtty/tree/master/packages/tty-backend) — the canonical TTY backend.
- [flowtty on GitHub](https://github.com/mellonis/flowtty) — full docs and examples.
