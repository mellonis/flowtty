# flowtty Error Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** prevent unhandled errors in user code (or in flowtty itself) from leaving the terminal in a broken state — alt-screen still on, raw mode still engaged, cursor hidden, user stuck. Catch errors at two layers + ALWAYS run `backend.dispose()` before the process exits:

1. **React errors** (thrown in render, commit, or sync useEffect bodies) via a class `ErrorBoundary` wrapped around the user's tree.
2. **Process-level errors** (uncaught exceptions, unhandled rejections, errors thrown from event handlers or setTimeout callbacks) via `process.on('uncaughtException')` + `process.on('unhandledRejection')` registered in `render.ts`.

In both cases: call `backend.dispose()` (restores terminal), then either invoke the user-provided `onError` callback OR print a clean stack trace to stderr + exit(1). User can override exit behavior via `onError` returning a "handled" indicator (TBD shape).

**Architecture:**
- New file `src/error-boundary.ts` exports `ErrorBoundary` class component (React's only catch mechanism). Catches errors in its subtree via `componentDidCatch`. On catch, invokes an `onError` callback prop (no internal cleanup — defers to render.ts).
- `src/render.ts`:
  - Wraps user tree in `ErrorBoundary` (innermost wrap, INSIDE `InputContext.Provider` + `TerminalSizeProvider` so the providers' state is consistent with the boundary's view).
  - Registers process-level handlers on mount; unregisters on unmount.
  - Single shared cleanup path: `handleError(error, source)` → `backend.dispose()` (once) → call user's `options.onError?.({ error, source })` OR default behavior (`console.error(error)` to stderr + `process.exit(1)`).
  - `source: 'react' | 'uncaughtException' | 'unhandledRejection'` — diagnostic context.
- `render()` API gets a third optional `options?: RenderOptions` arg. `RenderOptions = { onError?: (info: { error: unknown; source: ErrorSource }) => void }`.
- The cleanup runs at most ONCE per render handle even if multiple errors fire (a single `cleanedUp` boolean guard).

**Tech Stack:** Same as recent — TypeScript ESM, React 19, Vitest 4.

**Out of scope:**
- Error recovery / boundary reset (user re-renders different content after catching). Default = exit. Adding recovery means: don't auto-exit; expose an API for the user to call `handle.reset()` to remount the original tree. Defer to a separate plan if requested.
- Per-component error boundaries exposed as a public API (user wraps subtrees themselves). Out of scope; the global boundary suffices for terminal-safety.
- Better error formatting (colorized, component stack). Out of scope; raw stack trace is enough for v1.

---

## Scope check

Two cooperating layers (React boundary + process handlers) + API addition + cleanup-once invariant. **3 tasks**: React boundary, process handlers + cleanup orchestrator, README+build.

---

## File Structure

```
src/
  error-boundary.ts        # NEW — ErrorBoundary class component
  error-boundary.test.ts   # NEW — boundary catches render/effect errors; invokes onError
  render.ts                # MODIFY — wrap tree in boundary; register process handlers; orchestrate cleanup; add options arg
  render.test.ts           # NEW (or MODIFY if exists) — integration tests using TestBackend
  index.ts                 # MODIFY — re-export types (ErrorSource, RenderOptions) if user-facing
README.md                  # MODIFY — document error handling + onError opt
```

---

### Task 1: ErrorBoundary class component

**Files:**
- Create: `src/error-boundary.ts`
- Create: `src/error-boundary.test.ts`

- [ ] **Step 1: Read first** — `src/index.ts` (to see export style for components/types), `src/testing.ts` (for `flush` / `flushAsync` helpers), `src/render.ts` (to plan the wrap order in Task 2).

- [ ] **Step 2: Create `src/error-boundary.ts`:**

```ts
import { Component, type ReactNode } from 'react';

export type ErrorSource = 'react' | 'uncaughtException' | 'unhandledRejection';

interface ErrorBoundaryProps {
  /** Fires when an error is caught from the subtree. Receives the error and which path caught it ('react' here). */
  onError: (info: { error: unknown; source: ErrorSource }) => void;
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** React class boundary for the user tree. Catches errors thrown during render,
 *  commit (via react-reconciler's error callbacks — see render.ts), and inside
 *  useEffect bodies. Does NOT perform cleanup itself — defers to the parent
 *  render.ts handler so all error paths share one orchestration. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_error: unknown): ErrorBoundaryState {
    // Switch to fallback (null) so the broken subtree stops trying to render.
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError({ error, source: 'react' });
  }

  render() {
    // After an error, render nothing — keep the buffer in whatever state it was
    // pre-error. Cleanup (dispose, exit) happens in onError handler, not here.
    if (this.state.hasError) return null;
    return this.props.children ?? null;
  }
}
```

- [ ] **Step 3: Create `src/error-boundary.test.ts`** — unit-style tests against the boundary in isolation (no render.ts integration; that's Task 2):

```ts
import { describe, test, expect, vi } from 'vitest';
import { createElement, useEffect } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { ErrorBoundary } from './error-boundary.js';
import { flush, flushAsync } from './testing.js';

describe('ErrorBoundary', () => {
  test('catches errors thrown during render and calls onError with source="react"', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    const onError = vi.fn();
    function Boom() { throw new Error('render boom'); }
    root.render(
      createElement(ErrorBoundary, { onError },
        createElement(Boom),
      ),
    );
    await flushAsync();
    expect(onError).toHaveBeenCalledTimes(1);
    const call = onError.mock.calls[0][0];
    expect(call.source).toBe('react');
    expect(String(call.error)).toContain('render boom');
  });

  test('catches errors thrown inside useEffect', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    const onError = vi.fn();
    function Boom() {
      useEffect(() => { throw new Error('effect boom'); }, []);
      return createElement('flowtty-box', { width: 1, height: 1 });
    }
    root.render(
      createElement(ErrorBoundary, { onError },
        createElement(Boom),
      ),
    );
    await flushAsync();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].source).toBe('react');
    expect(String(onError.mock.calls[0][0].error)).toContain('effect boom');
  });

  test('renders children normally when no error', async () => {
    const Yoga = await getYoga();
    const { container, root } = createRoot(Yoga);
    const onError = vi.fn();
    root.render(
      createElement(ErrorBoundary, { onError },
        createElement('flowtty-box', { width: 5, height: 1 }),
      ),
    );
    await flushAsync();
    expect(onError).not.toHaveBeenCalled();
    // Container has the box child (proxy for "rendered normally")
    expect(container.children.length).toBe(1);
  });
});
```

- [ ] **Step 4: Verify**
  - `npx vitest run src/error-boundary.test.ts` — passes (3 tests).
  - `npx vitest run` — full suite green (264 + 3 = 267).
  - `npm run typecheck` — clean.

Common pitfalls:
- **`componentDidCatch` vs `getDerivedStateFromError`**: both are needed. `getDerivedStateFromError` updates state synchronously during render (returns the new state); `componentDidCatch` is a lifecycle that fires after, where side effects (onError call) are safe.
- **react-reconciler error callbacks**: react-reconciler 0.31's `createContainer` has 3 error callbacks (per M0 plan summary). Those handle errors at the reconciler level — different from class ErrorBoundary. Task 2 wires those too if needed. Task 1 only covers the class boundary.
- **`useEffect` thrown errors**: React forwards effect errors to the nearest ErrorBoundary's componentDidCatch. The test pins this; if it doesn't fire, the effect is async-detached somehow (shouldn't be, but watch).

- [ ] **Step 5: Commit**
```bash
git add src/error-boundary.ts src/error-boundary.test.ts
git commit -m "feat: ErrorBoundary class component for catching subtree errors"
```

---

### Task 2: render.ts integration — boundary + process handlers + cleanup orchestrator + onError API

**Files:**
- Modify: `src/render.ts`
- Create: `src/render.test.ts` (or modify if already exists)
- Modify: `src/index.ts` (re-export types if user-facing)

- [ ] **Step 1: Read first** — `src/render.ts` current state (terminal-size-provider wrap is the outermost, InputContext.Provider inside that). Plan the new wrap order: TerminalSize → InputContext → ErrorBoundary → user tree.

- [ ] **Step 2: Modify `src/render.ts`** — add the options arg, the boundary wrap, the process handlers, and the cleanup orchestrator.

Add imports:
```ts
import { ErrorBoundary, type ErrorSource } from './error-boundary.js';
```

Define the options type near the top of the file:
```ts
export interface RenderOptions {
  /** Called when an error is caught at ANY layer (React boundary, process-level handler).
   *  After this fires, flowtty has already called backend.dispose(); the terminal is restored.
   *  Default behavior (when onError not provided): print error to stderr + process.exit(1). */
  onError?: (info: { error: unknown; source: ErrorSource }) => void;
}
```

Change the `render` signature:
```ts
export async function render(
  element: ReactNode,
  backend: Backend,
  options: RenderOptions = {},
): Promise<{ unmount(): void }>
```

In the body, before `root.render(tree)`:

```ts
let cleanedUp = false;
const handleError = (error: unknown, source: ErrorSource) => {
  if (cleanedUp) return;
  cleanedUp = true;
  // Restore terminal FIRST so any stderr that follows is readable.
  try { backend.dispose?.(); } catch { /* ignore — dispose must not mask the real error */ }
  if (options.onError) {
    try { options.onError({ error, source }); } catch { /* user's onError can't break the path */ }
  } else {
    // Default: print to stderr (after dispose, so the trace is visible) + exit non-zero.
    console.error(error);
    process.exit(1);
  }
};

const onUncaughtException = (error: unknown) => handleError(error, 'uncaughtException');
const onUnhandledRejection = (reason: unknown) => handleError(reason, 'unhandledRejection');
process.on('uncaughtException', onUncaughtException);
process.on('unhandledRejection', onUnhandledRejection);
```

Wrap the existing `innerTree` in the boundary. Find the existing `tree = createElement(TerminalSizeProvider, { backend }, innerTree)` and adjust:
```ts
const boundedTree = createElement(ErrorBoundary, {
  onError: ({ error, source }) => handleError(error, source),
}, innerTree);
const tree = createElement(TerminalSizeProvider, { backend }, boundedTree);
```

(Order: TerminalSize OUTSIDE InputContext OUTSIDE ErrorBoundary OUTSIDE user tree. The boundary needs to be inside the providers so children can use hooks.)

Update the returned `unmount`:
```ts
return {
  unmount() {
    if (unmounted) return;
    unmounted = true;
    unsubResize?.();
    process.removeListener('uncaughtException', onUncaughtException);
    process.removeListener('unhandledRejection', onUnhandledRejection);
    root.unmount();
    backend.dispose?.();
  },
};
```

- [ ] **Step 3: Create `src/render.test.ts`** — integration tests using TestBackend (which doesn't actually `process.exit` so we can observe behavior):

```ts
import { describe, test, expect, vi } from 'vitest';
import { createElement, useEffect } from 'react';
import { render } from './render.js';
import { TestBackend } from './backends/test.js';
import { flushAsync } from './testing.js';

describe('render error handling', () => {
  test('render-thrown error calls onError with source="react" and disposes backend', async () => {
    const backend = new TestBackend(10, 3);
    const dispose = vi.spyOn(backend, 'dispose');
    const onError = vi.fn();
    function Boom() { throw new Error('render boom'); }
    await render(createElement(Boom), backend, { onError });
    await flushAsync();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].source).toBe('react');
    expect(String(onError.mock.calls[0][0].error)).toContain('render boom');
    expect(dispose).toHaveBeenCalled();
  });

  test('useEffect-thrown error caught with source="react"', async () => {
    const backend = new TestBackend(10, 3);
    const onError = vi.fn();
    function Boom() {
      useEffect(() => { throw new Error('effect boom'); }, []);
      return createElement('flowtty-box', { width: 1, height: 1 });
    }
    await render(createElement(Boom), backend, { onError });
    await flushAsync();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].source).toBe('react');
  });

  test('process uncaughtException routes to onError with source="uncaughtException"', async () => {
    const backend = new TestBackend(10, 3);
    const onError = vi.fn();
    const handle = await render(createElement('flowtty-box', { width: 1, height: 1 }), backend, { onError });
    await flushAsync();
    process.emit('uncaughtException', new Error('uncaught boom'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].source).toBe('uncaughtException');
    expect(String(onError.mock.calls[0][0].error)).toContain('uncaught boom');
    handle.unmount();
  });

  test('process unhandledRejection routes to onError with source="unhandledRejection"', async () => {
    const backend = new TestBackend(10, 3);
    const onError = vi.fn();
    const handle = await render(createElement('flowtty-box', { width: 1, height: 1 }), backend, { onError });
    await flushAsync();
    process.emit('unhandledRejection', new Error('promise boom'), Promise.resolve());
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].source).toBe('unhandledRejection');
    handle.unmount();
  });

  test('cleanup is single-shot (multiple errors → onError fires once)', async () => {
    const backend = new TestBackend(10, 3);
    const onError = vi.fn();
    const handle = await render(createElement('flowtty-box', { width: 1, height: 1 }), backend, { onError });
    await flushAsync();
    process.emit('uncaughtException', new Error('first'));
    process.emit('uncaughtException', new Error('second'));
    process.emit('unhandledRejection', new Error('third'), Promise.resolve());
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0].error)).toContain('first');
    handle.unmount();
  });

  test('unmount removes process error listeners', async () => {
    const backend = new TestBackend(10, 3);
    const onError = vi.fn();
    const handle = await render(createElement('flowtty-box', { width: 1, height: 1 }), backend, { onError });
    await flushAsync();
    handle.unmount();
    // After unmount, emit shouldn't reach onError
    process.emit('uncaughtException', new Error('after-unmount'));
    expect(onError).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Modify `src/index.ts`** — re-export the new types:

```ts
export type { RenderOptions } from './render.js';
export type { ErrorSource } from './error-boundary.js';
```

- [ ] **Step 5: Verify**
  - `npx vitest run src/render.test.ts` — passes (6 tests).
  - `npx vitest run` — full suite green (267 + 6 = 273).
  - `npm run typecheck` — clean.

Common pitfalls:
- **Default `onError` calls `process.exit(1)`**: this would kill the Vitest test process. Tests MUST provide an `onError` to override the default. The "default behavior" path isn't unit-tested here (would require subprocess); document the behavior and rely on integration testing.
- **`process.emit('uncaughtException', err)`**: works in Node but emits synchronously. If the test's onError is async, the assertion runs before async work completes — keep onError synchronous in tests.
- **`process.removeListener` after unmount**: critical. Otherwise the listeners outlive the render handle and may catch errors from completely unrelated code in a later test or another render call.
- **Backend.dispose throws**: wrapped in try/catch so dispose errors don't shadow the original error. The dispose error is silently swallowed — accept the trade-off; the original error is more important.

- [ ] **Step 6: Commit**
```bash
git add src/render.ts src/render.test.ts src/index.ts
git commit -m "feat: render() onError + process-level error handlers + auto-dispose"
```

---

### Task 3: README + final build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read `README.md`** — find a logical place to add an error-handling section.

- [ ] **Step 2: Add a `### Error handling` subsection** under `## Status` (after `### Size awareness`):

```md
### Error handling

flowtty wraps the user tree in a React error boundary AND registers process-level
`uncaughtException` / `unhandledRejection` handlers. When ANY error is caught,
flowtty calls `backend.dispose()` first (restores the terminal) and then either:

- invokes the `onError` callback if provided in `render(element, backend, { onError })`, OR
- prints the error to stderr and exits with code 1 (default).

```tsx
await render(<App />, backend, {
  onError: ({ error, source }) => {
    // source: 'react' | 'uncaughtException' | 'unhandledRejection'
    console.error(`[${source}]`, error);
    process.exit(1);
  },
});
```

The cleanup runs at most ONCE per render handle — subsequent errors after the
first are ignored to avoid double-disposal. Process error listeners are removed
when `handle.unmount()` is called, so multiple `render()` calls in sequence
(e.g. in tests) don't leak listeners.

Without this safety net, an unhandled error during render or in a useEffect would
leave the terminal in alt-screen mode with raw input still enabled — recovery
would require killing the shell or running `reset`.
```

- [ ] **Step 3: Final verification + commit:**
```bash
npx vitest run      # all pass (273)
npm run typecheck   # clean
npm run build       # ESM + dts succeed, no warnings
git add README.md
git commit -m "docs: document error handling + onError option"
```

## Report:
- **Status:** DONE | BLOCKED
- Final test count
- Commit SHAs

---

## Self-Review

**1. Spec coverage:**
- React errors via class boundary → Task 1.
- Process-level errors via process.on handlers → Task 2.
- Always-dispose-first cleanup → Task 2 (`handleError` orchestrator).
- Single-shot cleanup → Task 2 (test pins it).
- `onError` user API → Task 2.
- Default behavior (stderr + exit) → Task 2 (not unit-tested due to process.exit; documented).
- Listener cleanup on unmount → Task 2 (test pins it).
- README → Task 3.

**2. Placeholder scan:** none.

**3. Type consistency:**
- `ErrorSource = 'react' | 'uncaughtException' | 'unhandledRejection'` exported from error-boundary.ts.
- `RenderOptions = { onError?: (info: { error: unknown; source: ErrorSource }) => void }` exported from render.ts.
- `error: unknown` (not `Error`) — match what process emits + componentDidCatch receives.

**Risks worth flagging:**

1. **`unhandledRejection` global handler hijack**: registering this handler intercepts ALL unhandled promise rejections in the process, not just ones from flowtty's tree. If a user has a separate library that fires rejections, flowtty will catch them and dispose the terminal — potentially confusing. Trade-off: terminal safety wins. Document.

2. **`process.exit(1)` in default path is unfriendly to libraries that wrap flowtty**: if flowtty is a sub-component of a larger app, killing the whole process on first error is heavy-handed. The `onError` opt-out is the escape hatch. Document prominently.

3. **react-reconciler 0.31 error callbacks**: the createContainer 10-arg form passes 3 error callbacks (per the M0 history). If THOSE need wiring to handleError, Task 2 also needs reconciler.ts changes. The plan currently doesn't touch reconciler.ts — the class ErrorBoundary catches most error cases; if integration tests reveal commit-phase errors slipping through, add reconciler error callbacks in a Task 2 amendment.

4. **dispose() error swallowed**: if backend.dispose throws, we silently catch and proceed. The terminal might be partially broken (e.g. alt-screen off but raw mode still on). Accept — original error is more important to surface. Document.

5. **Test interaction**: the integration tests register process handlers. If one test fails mid-flow and leaves a listener registered, subsequent tests might see unexpected catches. The "unmount removes listeners" test exercises cleanup; the other tests should also call `handle.unmount()` at the end. Adding `afterEach(() => process.removeAllListeners('uncaughtException'))` to the test file is defensive but risks masking real listener bugs — prefer explicit unmount.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/error-boundary.md`. Subagent-driven execution per your request — Task 1 (Sonnet, isolated class component) → Task 2 (Sonnet, render.ts integration is the meat) → Task 3 (Haiku, README + build). Each task tested in flowtty repo; no site repo changes.

After this plan merges, the articles dogfood resumes with a safer foundation — any error during the remaining dogfood tasks will produce a clean stderr trace and a restored terminal instead of a hung session.
