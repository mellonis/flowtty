# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

flowtty is a React-for-the-terminal library (Ink-shaped): a `react-reconciler`
host config that lays out `<Box>`/`<Text>` with Yoga flexbox, paints them into a
cell `Buffer`, and writes that buffer to a backend (a real TTY, an inline live
region, or an in-memory test surface). The renderer rides on React + Yoga — it is
deliberately **not** a from-scratch layout engine or a native-core perf competitor
(see README's note re: OpenTUI). The intended value is the component/workflow
layer on top.

## Commands

```bash
npm test                  # vitest run — whole workspace (~40 spec files)
npm run test:watch        # vitest watch
npx vitest run packages/core/src/wrap.spec.ts        # single file
npx vitest run -t "wraps on word boundary"           # single test by name
npm run typecheck         # tsc --noEmit across all packages (root tsconfig)
npm run build             # tsup build every package that has a build script

# Run example apps (tsx, no build needed):
npm run articles-tui      # reads from ../../site/scripts/articles.mjs (abs path)
npm run things-tui        # hits a poetry API; things-tui:ddev for local DDEV
npm run inline-build-log  # demos <Static> + InlineTtyBackend
```

There is no lint step. Correctness gates are `npm test` + `npm run typecheck`.

## Package graph (acyclic — respect the direction)

```
@flowtty/core            framework-free: Buffer/Cell/Style/Key, Backend interface,
  │                      pure utils (wrap, visualLines, windowAround), reducers.
  │                      Subpath ./host = adapter-facing (yoga, layout, paint,
  │                      host Instance + create/append/removeChild). Subpath
  │                      ./testing = TestBackend. NO react, NO node globals in `.`.
  ├── @flowtty/react        react-reconciler config + components + hooks + DialogHost.
  │     │                   Imports host primitives from @flowtty/core/host.
  │     ├── @flowtty/tty-backend        real TTY: stdout paint w/ frame diff, raw
  │     │     │                         input + key parsing, ANSI helpers.
  │     │     └── @flowtty/inline-tty-backend   redrawable live region + append-only
  │     │                                       log lines above (the <Static> pattern).
  │     └── (examples depend on react + both backends)
  └── ...
```

Rule: `core` must never import react/yoga-in-public-surface/node. Adapters depend
on `core`; backends depend on `core` (+ `tty-backend` for the inline one). Nothing
depends on `react` except adapters and examples. Keep it a DAG.

## The render pipeline (how a keystroke becomes bytes)

`render(element, backend, opts)` in `packages/react/src/internal/render.ts`:

1. `await getYoga()` (yoga-layout is async/wasm).
2. `createRoot(Yoga, draw)` builds the reconciler; `draw()` is the commit hook.
3. Tree is wrapped (innermost→out): `InputContext` (if `backend.onKey`) →
   `ErrorBoundary` → `BackendContext.Provider` → `TerminalSizeProvider`.
4. On every commit, the reconciler schedules `draw` via `queueMicrotask` (coalesced
   — one paint per microtask, not per mutation).
5. `draw()` = `computeLayout(container, w, h)` (Yoga) → `paint(container, w, h)`
   (→ `Buffer`) → `backend.draw(buffer)`.
6. Keys: `backend.onKey` → `root.flushSync(() => handler(key))` so state updates
   land synchronously and only the repaint defers to a microtask.

The host has **one** element type, `flowtty-box` — `<Text>` is sugar that sets text
props on a Box. See `packages/core/src/host/host.ts`.

## Backend contract + capability flags

`Backend` (`packages/core/src/backend.ts`) is the seam between framework and output.
Required: `size()`, `draw(buffer)`. Optional (feature-detected, not assumed):
`onKey`, `onResize`, `dispose`, `printStatic(lines)`, and the `fullScreen` flag.

- `fullScreen` omitted/true → alt-screen, full-frame apps (TtyBackend).
- `fullScreen === false` → inline mode (InlineTtyBackend). Components that need a
  full screen must guard: `useFullScreenBackend(name)` (hard-refuse, e.g. `Menu`
  renders null) or a soft `console.warn` (e.g. `DialogHost.openDialog` without
  `{ floating: true }`). When adding a component that only makes sense full-screen,
  wire one of these — call ALL hooks first, then `return null` after, to keep hook
  order stable.
- `<Static>` calls `backend.printStatic?.(...)`; it no-ops if the backend lacks it.

## Non-obvious invariants (will bite you)

**Dev resolves to source, publish flips to dist.** Workspaces run straight off
`src/*.ts` — no build needed for tests/examples/typecheck. This depends on THREE
files staying in sync; change one path, change all three:
- `tsconfig.base.json` `paths`
- `vitest.config.ts` `resolve.alias`
- each package's `package.json` `exports` (currently point at `./src/index.ts`;
  the publish flow flips them to `dist/`).
Adding a new `@flowtty/*` package or subpath means editing all three.

**`.tsx` files need `import React from 'react'`.** tsx (the example runner) uses
*classic* JSX and ignores `jsx: react-jsx` from tsconfig — missing the import is a
runtime "React is not defined", not a compile error. vitest/tsup honor the
automatic runtime, so tests pass while `npm run articles-tui` crashes. Every `.tsx`
component imports React explicitly.

**`packages/examples/tsconfig.json` is FLAT, not `extends`.** tsx can't follow the
extends chain, so that file duplicates compilerOptions, `types: ["node"]`, and the
full `paths` map. New aliases must be added there too, or the IDE flags phantom
errors (e.g. `Cannot find name 'setInterval'`).

**Yoga defaults ≠ CSS defaults.** `flexShrink` defaults to `0` (CSS uses `1`), so
children overflow instead of shrinking unless you set `flexShrink={1}`.
`alignContent` defaults to `flex-start` (CSS flex uses `stretch`). README documents
the full prop set + every deliberate deviation.

**`onLayout` fires every paint — diff before `setState`** or you infinite-loop.

**Workspace deps use `"*"`, not `"workspace:*"`** (npm workspaces, not pnpm).

## Recurring environment bug

npm workspaces + esbuild's platform-specific optional deps occasionally desync,
giving `Cannot find module '@esbuild/darwin-arm64'` (or similar) when running tsx /
vitest. Fix: `rm -rf node_modules package-lock.json && npm install`. This is an
install-state problem, not a code problem.

## Conventions

- **File naming:** PascalCase for files whose primary export is a class or React
  component (`Button.tsx`, `InlineTtyBackend.ts`); camelCase otherwise
  (`useField.ts`, `wrap.ts`). Tests are `*.spec.ts` / `*.spec.tsx` colocated with
  source.
- **react/src layout:** `components/` (with `base/` for the Box/Text intrinsics),
  `hooks/`, `context/`, `internal/` (reconciler + render — not part of public API).
- **Public surface** is the `exports`/`index.ts` of each package. `@flowtty/react`
  re-exports the core types app authors need so consumers have one import. Adapter
  authors import host primitives from `@flowtty/core/host`.
- `docs/plans/*.md` holds the per-feature design notes (one per milestone/feature);
  `docs/design.md` is the overview. Read the relevant plan before extending a
  feature — they capture the why behind the deviations.
