# flowtty M1a — Interactivity Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make flowtty render interactively — React state updates trigger repaints, raw keyboard events flow to components via a `useInput` hook (driven by the test backend's synthetic-key injection), and root Yoga nodes are freed on unmount. Acceptance is an end-to-end test where a `useState` + `useInput` counter increments on key press and the test backend captures the updated frame.

**Architecture:** Plumb an `onCommit` callback into the `react-reconciler` host config so `resetAfterCommit` schedules a coalesced paint (via `queueMicrotask`). Add a `Backend.onKey(handler) → unsubscribe` source method, implement it on `TestBackend` with synchronous `press`/`type` helpers, and distribute keys to subscribed components via a React `InputContext` provider wrapped around the user's element in `render()`. Fix the M0 leak by freeing the Yoga node in `removeChildFromContainer` and `clearContainer`.

**Tech Stack:** Same as M0 — TypeScript ESM, React 19, `react-reconciler@0.31.0` (already verified), `yoga-layout@3.2.1`, Vitest 4, tsup.

**Out of scope** (each gets its own later plan): the line-editor port for `<TextInput>` (NBSP / emacs / `OPT_MAP` typography / word ops), `<Select>` / `<MultiSelect>` / `<Confirm>`, intra-form focus ring + `<Form>`, TTY-backend stdin raw-mode + key parsing.

---

## Scope check

This is the first of ~3 plans for the M1 milestone:

- **M1a (this plan):** repaint-on-commit + raw key delivery via `useInput` + test-backend key injection + unmount Yoga free. Acceptance = interactive counter.
- **M1b (next):** `<TextInput>` — ports the `articles.mjs` line editor (emacs, OPT_MAP, NBSP, word ops, masking, validate) on top of `useInput`. Acceptance = type into TextInput, captured frame shows the text, Enter submits.
- **M1c (after):** `<Select>` / `<MultiSelect>` / `<Confirm>` + intra-form focus ring + TTY backend stdin wiring. Acceptance = the Form benchmark in the design spec.

Each plan produces working, testable software on its own. M1a explicitly does **not** include TTY-backend keyboard wiring — that ships with M1c so the TTY backend goes interactive as a single coherent change.

---

## File Structure

```
src/
  keys.ts                # NEW — Key type (interface only; the parser ships with M1c TTY wiring)
  input-context.ts       # NEW — InputContext, InputSource, KeySubscriber
  use-input.ts           # NEW — useInput(handler, opts?) hook
  use-input.test.ts      # NEW — hook subscribe/unsubscribe test
  reconciler.ts          # MODIFY — createReconciler/createRoot accept onCommit; resetAfterCommit schedules paint; removeChildFromContainer + clearContainer free yoga nodes
  reconciler.test.ts     # ADD — resetAfterCommit fires onCommit; unmount frees root yoga nodes
  render.ts              # MODIFY — pass scheduled draw as onCommit; wrap element in InputContext.Provider; await initial paint
  render.test.ts         # ADD — M1a acceptance: interactive counter
  testing.ts             # MODIFY — export `flush()` helper
  index.ts               # MODIFY — export useInput, Key, InputSource, KeySubscriber
  backends/
    types.ts             # MODIFY — add optional onKey method to Backend
    test.ts              # MODIFY — implement onKey + add press/type
    test.test.ts         # NEW — TestBackend onKey/press/type subscriber behavior
```

Responsibilities:

- `keys.ts` owns only the `Key` type shape — the parser belongs with the TTY input layer (M1c). Test/synthetic keys construct `Key` values directly.
- `input-context.ts` is the seam between any backend's key source and component subscribers — pure React context plumbing, no I/O.
- `use-input.ts` is the only thing components import; it never touches the backend directly.
- The reconciler stays the **only** file touching `react-reconciler`; the repaint scheduler lives inside `createReconciler` so it's a closure over the right state.
- `render.ts` is the wiring layer — it provides the scheduler (so the reconciler can call back) and the InputContext value (so subscribers receive backend keys).

---

### Task 1: Key type

**Files:** Create `src/keys.ts`.

There's no parser yet (synthetic-only sources for M1a). This is a one-file interface so everything else can refer to it.

- [ ] **Step 1: Write `src/keys.ts`**

```ts
// A normalized terminal key event. Backends may construct Key values directly
// (synthetic keys for the test backend) or produce them from parsed raw bytes
// (the TTY backend, shipping in a later plan).
export interface Key {
  /**
   * Canonical name of the key. For printable ASCII characters this is the
   * character itself ('a', '!', ' '). For named keys: 'return', 'escape',
   * 'tab', 'backspace', 'delete', 'up', 'down', 'left', 'right', 'home',
   * 'end', 'pageup', 'pagedown'.
   */
  name: string;
  /** Raw byte sequence as received from the source (empty for synthetic keys). */
  sequence: string;
  ctrl: boolean;
  meta: boolean; // Option / Alt
  shift: boolean;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/mellonis/Developer/mellonis-workspace/flowtty && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/keys.ts
git commit -m "feat: Key event type for the input layer"
```

---

### Task 2: Backend.onKey + TestBackend press/type

**Files:**
- Modify: `src/backends/types.ts`
- Modify: `src/backends/test.ts`
- Create: `src/backends/test.test.ts`

- [ ] **Step 1: Write the failing test `src/backends/test.test.ts`**

```ts
import { expect, test } from 'vitest';
import { TestBackend } from './test.js';
import type { Key } from '../keys.js';

test('onKey returns an unsubscribe; subscribers receive press()', () => {
  const b = new TestBackend(10, 1);
  const received: Key[] = [];
  const unsubscribe = b.onKey((k) => received.push(k));
  b.press({ name: 'a' });
  b.press({ name: 'return' });
  expect(received).toHaveLength(2);
  expect(received[0]).toMatchObject({ name: 'a', ctrl: false, meta: false, shift: false });
  expect(received[1]).toMatchObject({ name: 'return' });
  unsubscribe();
  b.press({ name: 'b' });
  expect(received).toHaveLength(2); // no new event after unsubscribe
});

test('type() emits one Key per character', () => {
  const b = new TestBackend(10, 1);
  const names: string[] = [];
  b.onKey((k) => names.push(k.name));
  b.type('hi');
  expect(names).toEqual(['h', 'i']);
});

test('multiple subscribers all receive each press', () => {
  const b = new TestBackend(10, 1);
  const a: Key[] = [];
  const c: Key[] = [];
  b.onKey((k) => a.push(k));
  b.onKey((k) => c.push(k));
  b.press({ name: 'x' });
  expect(a).toHaveLength(1);
  expect(c).toHaveLength(1);
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run src/backends/test.test.ts`
Expected: FAIL — `onKey`, `press`, `type` undefined.

- [ ] **Step 3: Modify `src/backends/types.ts`** to add the optional `onKey` method:

```ts
import type { Buffer } from '../cells.js';
import type { Key } from '../keys.js';

// The seam every renderer backend implements. Drawing is required; key input
// is optional (a passive view backend may render without ever sending keys).
export interface Backend {
  size(): { width: number; height: number };
  draw(buffer: Buffer): void;
  /**
   * Subscribe to raw key events. Returns an unsubscribe function.
   * Backends without an input source omit this method.
   */
  onKey?(handler: (key: Key) => void): () => void;
  dispose?(): void;
}
```

- [ ] **Step 4: Modify `src/backends/test.ts`** to implement onKey + press + type:

```ts
import type { Buffer } from '../cells.js';
import type { Key } from '../keys.js';
import type { Backend } from './types.js';

export class TestBackend implements Backend {
  frames: string[] = [];
  private readonly subscribers = new Set<(key: Key) => void>();

  constructor(
    private readonly cols = 40,
    private readonly rows = 10,
  ) {}

  size() {
    return { width: this.cols, height: this.rows };
  }

  draw(buffer: Buffer): void {
    this.frames.push(buffer.toString());
  }

  get lastFrame(): string {
    return this.frames[this.frames.length - 1] ?? '';
  }

  onKey(handler: (key: Key) => void): () => void {
    this.subscribers.add(handler);
    return () => { this.subscribers.delete(handler); };
  }

  /** Synchronously deliver one Key to every subscriber. */
  press(key: Partial<Key> & { name: string }): void {
    const k: Key = {
      sequence: key.sequence ?? '',
      ctrl: key.ctrl ?? false,
      meta: key.meta ?? false,
      shift: key.shift ?? false,
      name: key.name,
    };
    for (const h of [...this.subscribers]) h(k);
  }

  /** Emit one Key per character; printable chars only. */
  type(text: string): void {
    for (const ch of text) this.press({ name: ch, sequence: ch });
  }
}
```

- [ ] **Step 5: Run, verify PASS + full suite green**

Run: `npx vitest run src/backends/test.test.ts && npx vitest run && npm run typecheck`
Expected: 3 new pass; full suite all green; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/backends/types.ts src/backends/test.ts src/backends/test.test.ts
git commit -m "feat: Backend.onKey + TestBackend press/type for synthetic key input"
```

---

### Task 3: InputContext + useInput hook

**Files:**
- Create: `src/input-context.ts`
- Create: `src/use-input.ts`
- Create: `src/use-input.test.ts`

- [ ] **Step 1: Write the failing test `src/use-input.test.ts`**

```ts
import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { useInput } from './use-input.js';
import { InputContext, type KeySubscriber } from './input-context.js';
import type { Key } from './keys.js';

test('useInput subscribes via context and receives dispatched keys', async () => {
  const subscribers = new Set<KeySubscriber>();
  const source = {
    subscribe(h: KeySubscriber) { subscribers.add(h); return () => { subscribers.delete(h); }; },
  };
  const seen: string[] = [];
  function Probe() {
    useInput((k) => seen.push(k.name));
    return createElement('flowtty-box');
  }
  const Yoga = await getYoga();
  const { root } = createRoot(Yoga);
  root.render(
    createElement(InputContext.Provider, { value: source }, createElement(Probe)),
  );
  // Effects (subscriptions) flush in a microtask; await one round.
  await Promise.resolve();
  // Dispatch a key to all subscribers
  const k: Key = { name: 'a', sequence: 'a', ctrl: false, meta: false, shift: false };
  for (const h of [...subscribers]) h(k);
  expect(seen).toEqual(['a']);
  root.unmount();
  // After unmount, the cleanup should have removed the subscriber
  await Promise.resolve();
  for (const h of [...subscribers]) h({ ...k, name: 'b' });
  expect(seen).toEqual(['a']); // no new event after unmount
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run src/use-input.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/input-context.ts`**

```ts
import { createContext } from 'react';
import type { Key } from './keys.js';

export type KeySubscriber = (key: Key) => void;

export interface InputSource {
  subscribe(handler: KeySubscriber): () => void;
}

// No-op default: a tree rendered without an InputContext.Provider receives no
// keys (passive view), and useInput's subscribe is a no-op unsubscribe.
const noopSource: InputSource = { subscribe: () => () => {} };

export const InputContext = createContext<InputSource>(noopSource);
```

- [ ] **Step 4: Write `src/use-input.ts`**

```ts
import { useContext, useEffect, useRef } from 'react';
import { InputContext } from './input-context.js';
import type { Key } from './keys.js';

export interface UseInputOptions {
  /** When false, the subscription is paused (handler is not called). Default true. */
  isActive?: boolean;
}

/**
 * Subscribe to keyboard events from the surrounding InputContext.
 *
 * The handler ref is updated on each render, so closures capture the latest
 * state without re-subscribing — only `isActive` toggles or context changes
 * (un)subscribe. Cleanup runs on unmount.
 */
export function useInput(handler: (key: Key) => void, opts: UseInputOptions = {}): void {
  const source = useContext(InputContext);
  const ref = useRef(handler);
  ref.current = handler;
  const isActive = opts.isActive !== false;
  useEffect(() => {
    if (!isActive) return;
    const unsubscribe = source.subscribe((key) => ref.current(key));
    return unsubscribe;
  }, [source, isActive]);
}
```

- [ ] **Step 5: Run, verify PASS + full suite**

Run: `npx vitest run src/use-input.test.ts && npx vitest run && npm run typecheck`
Expected: new test passes; full suite green; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/input-context.ts src/use-input.ts src/use-input.test.ts
git commit -m "feat: InputContext + useInput hook for keyboard subscriptions"
```

---

### Task 4: Free root Yoga nodes on unmount (M0 deferral fix)

**Files:**
- Modify: `src/reconciler.ts`
- Modify: `src/reconciler.test.ts`

- [ ] **Step 1: Add a failing test to `src/reconciler.test.ts`**

Append:
```ts
test('unmount frees root Yoga nodes (calls freeRecursive on each root box)', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(createElement('flowtty-box', { width: 4 }));
  const node = container.children[0]!.yogaNode;
  let freed = false;
  const originalFree = node.freeRecursive.bind(node);
  // Spy: replace freeRecursive with a wrapper that records the call, then
  // delegates so the actual wasm-node free still happens (no leak in test).
  (node as { freeRecursive: () => void }).freeRecursive = () => { freed = true; originalFree(); };
  root.unmount();
  expect(container.children).toHaveLength(0);
  expect(freed).toBe(true);
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run src/reconciler.test.ts`
Expected: FAIL — `freed` stays false (M0's `removeChildFromContainer`/`clearContainer` don't free).

- [ ] **Step 3: Modify `src/reconciler.ts`** — update the two container-mutating methods (find them in the host-config object and replace):

```ts
removeChildFromContainer: (container, child) => {
  const i = container.children.indexOf(child as Instance);
  if (i >= 0) container.children.splice(i, 1);
  if ((child as { type: string }).type === 'box') {
    (child as Instance).yogaNode.freeRecursive();
  }
},
// ...
clearContainer: (container) => {
  for (const c of container.children) c.yogaNode.freeRecursive();
  container.children = [];
},
```

(Leave every other method unchanged. Both `removeChildFromContainer` and `clearContainer` may be called on unmount depending on how react-reconciler tears down the tree; covering both is correct and idempotent.)

- [ ] **Step 4: Run, verify PASS + full suite green**

Run: `npx vitest run src/reconciler.test.ts && npx vitest run && npm run typecheck`
Expected: new test passes; full suite green; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/reconciler.ts src/reconciler.test.ts
git commit -m "fix: free root yoga nodes on unmount (M0 leak fix)"
```

---

### Task 5: Commit→repaint scheduler (onCommit param)

**Files:**
- Modify: `src/reconciler.ts`
- Modify: `src/reconciler.test.ts`

- [ ] **Step 1: Add a failing test to `src/reconciler.test.ts`**

Append:
```ts
test('resetAfterCommit schedules onCommit (coalesces multiple commits)', async () => {
  const Yoga = await getYoga();
  let commits = 0;
  const { root } = createRoot(Yoga, () => { commits++; });
  root.render(createElement('flowtty-box'));
  root.render(createElement('flowtty-box', { width: 3 }));
  root.render(createElement('flowtty-box', { width: 4 }));
  // Multiple synchronous commits should coalesce into a single scheduled call.
  await Promise.resolve();
  await Promise.resolve();
  expect(commits).toBe(1);
});

test('createRoot without onCommit does not throw and does not schedule', async () => {
  const Yoga = await getYoga();
  const { root } = createRoot(Yoga);
  expect(() => root.render(createElement('flowtty-box'))).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run src/reconciler.test.ts`
Expected: FAIL — `createRoot` does not accept a 2nd argument.

- [ ] **Step 3: Modify `src/reconciler.ts`** — thread `onCommit` through `createReconciler` and `createRoot`, and have `resetAfterCommit` schedule it via `queueMicrotask` with a pending-flag dedupe.

Change the `createReconciler` signature and add the scheduler:
```ts
export function createReconciler(Yoga: Yoga, onCommit?: () => void) {
  let pending = false;
  const schedulePaint = () => {
    if (pending || !onCommit) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      onCommit();
    });
  };
  return ReactReconciler<
    // ... existing type params unchanged
  >({
    // ... existing methods unchanged EXCEPT:
    resetAfterCommit: () => { schedulePaint(); },
    // ...
  });
}
```
(`prepareForCommit` stays `() => null` — the scheduling all happens in `resetAfterCommit`, which is the React-side post-commit hook.)

And the `createRoot` signature:
```ts
export function createRoot(Yoga: Yoga, onCommit?: () => void): { container: Container; root: Root } {
  const reconciler = createReconciler(Yoga, onCommit);
  // ...rest unchanged
}
```

- [ ] **Step 4: Run, verify PASS + full suite green**

Run: `npx vitest run src/reconciler.test.ts && npx vitest run && npm run typecheck`
Expected: 2 new tests pass; full suite green; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/reconciler.ts src/reconciler.test.ts
git commit -m "feat: schedule a coalesced onCommit after each React commit"
```

---

### Task 6: render() wires the scheduler + InputContext.Provider + flush helper

**Files:**
- Modify: `src/render.ts`
- Modify: `src/testing.ts`

- [ ] **Step 1: Rewrite `src/render.ts`**

```ts
import { createElement, type ReactNode } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { computeLayout } from './layout.js';
import { paint } from './paint.js';
import type { Backend } from './backends/types.js';
import { InputContext, type InputSource } from './input-context.js';

export async function render(element: ReactNode, backend: Backend): Promise<{ unmount(): void }> {
  const Yoga = await getYoga();

  let unmounted = false;
  const draw = () => {
    if (unmounted) return;
    const { width, height } = backend.size();
    computeLayout(container, width, height);
    backend.draw(paint(container, width, height));
  };

  const { container, root } = createRoot(Yoga, draw);

  // Build an InputSource from the backend's onKey, if present. If not, the
  // tree falls back to the no-op default in InputContext.
  const tree = backend.onKey
    ? createElement(
        InputContext.Provider,
        { value: { subscribe: backend.onKey.bind(backend) } as InputSource },
        element,
      )
    : element;

  root.render(tree);
  // Wait for the initial scheduled paint to run before resolving.
  await Promise.resolve();
  await Promise.resolve();

  return {
    unmount() {
      unmounted = true;
      root.unmount();
      backend.dispose?.();
    },
  };
}
```

- [ ] **Step 2: Modify `src/testing.ts`** — add a `flush()` helper that lets the test author drain microtasks after dispatching a key:

```ts
export { TestBackend } from './backends/test.js';

/**
 * Resolve after pending microtasks have drained. Use after `backend.press(...)`
 * to wait for React's state update + the scheduled repaint:
 *
 *     backend.press({ name: 'a' });
 *     await flush();
 *     expect(backend.lastFrame).toBe('a');
 */
export async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
```

- [ ] **Step 3: Run full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all existing tests still pass (the M0 acceptance test in `src/render.test.ts` should still see `'hi'` and `'abcd'` — the await-microtasks delay is harmless).

- [ ] **Step 4: Commit**

```bash
git add src/render.ts src/testing.ts
git commit -m "feat: render() schedules paint per commit + wraps tree in InputContext.Provider"
```

---

### Task 7: M1a acceptance — interactive counter end-to-end

**Files:**
- Modify: `src/render.test.ts`

- [ ] **Step 1: Append the failing acceptance test to `src/render.test.ts`**

```ts
import { useState } from 'react';
import { useInput } from './use-input.js';
import { flush } from './testing.js';

test('M1a acceptance: counter increments on key press and the test backend captures the repaint', async () => {
  function Counter() {
    const [n, setN] = useState(0);
    useInput((key) => { if (key.name === 'i') setN((x) => x + 1); });
    return createElement(Box, null, createElement(Text, null, String(n)));
  }
  const backend = new TestBackend(3, 1);
  await render(createElement(Counter), backend);
  expect(backend.lastFrame).toBe('0');
  backend.press({ name: 'i' });
  await flush();
  expect(backend.lastFrame).toBe('1');
  backend.press({ name: 'i' });
  backend.press({ name: 'i' });
  await flush();
  expect(backend.lastFrame).toBe('3');
});
```

(The existing M0 acceptance test in this file stays — confirm both still pass.)

- [ ] **Step 2: Run, verify PASS**

Run: `npx vitest run src/render.test.ts`
Expected: the new test plus the two existing M0 acceptance tests all pass.

- [ ] **Step 3: Run full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/render.test.ts
git commit -m "test: interactive counter (M1a acceptance) — state + useInput + repaint end-to-end"
```

---

### Task 8: Public exports + build + README deferred-list update

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Update `src/index.ts`** to export the new public surface:

```ts
export { render } from './render.js';
export { Box, Text } from './components.js';
export type { BoxProps } from './host.js';
export type { Backend } from './backends/types.js';
export { TtyBackend } from './backends/tty.js';
export { useInput } from './use-input.js';
export type { UseInputOptions } from './use-input.js';
export type { Key } from './keys.js';
export type { InputSource, KeySubscriber } from './input-context.js';
```

(Note: `TestBackend` deliberately stays in `flowtty/testing` only — not re-exported here.)

- [ ] **Step 2: Update `README.md`** — replace the M0 deferred-list with the M1a state. Find the existing `## M0 limitations` block and replace it with:

```md
## Status

M1a (interactivity infrastructure). Keyboard input now reaches components via
`useInput`, React state updates trigger repaints automatically, and the test
backend (`flowtty/testing`) can inject synthetic keys with `press`/`type` +
`flush`. Root Yoga nodes are freed on `unmount` (the M0 leak is fixed).

### Still deferred (will land in later milestones)

- TTY-backend stdin raw-mode + key parsing — synthetic keys via TestBackend
  work today; real-terminal interactivity ships with M1c.
- Frame diffing — the TTY backend still does a full redraw each `draw()`.
- `<Text>` ignores layout props (sized by a Yoga measure func).
- Element-level styling — the React → paint path still hardcodes empty style;
  cell `Style` + `sgr()` + TTY SGR output remain reachable only from a
  hand-built `Buffer`.
- `<TextInput>` / `<Select>` / `<MultiSelect>` / `<Confirm>` / `<Form>` —
  prompt primitives ship in M1b and M1c.
```

- [ ] **Step 3: Final verification**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all tests pass; typecheck clean; `dist/index.js`, `dist/index.d.ts`, `dist/testing.js`, `dist/testing.d.ts` rebuilt; no warnings.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts README.md
git commit -m "chore: export useInput + key types; document M1a state and deferred items"
```

---

## Self-Review

**1. Spec coverage** (M1 portion of `docs/design.md` that this plan addresses):
- "Input layer + intra-form focus ring" → input layer covered by Tasks 1–3, 6 (focus ring is out of scope for M1a, lands in M1c).
- "Workflow / dialog layer (runWorkflow, useWorkflow, embedded)" → out of scope (M2).
- "Prompt primitives" (TextInput, Select, MultiSelect, Confirm) → out of scope (M1b, M1c).
- Implicit but design-listed: commit→repaint loop → Tasks 5, 6.
- Implicit M0 deferral: free root Yoga on unmount → Task 4.

**2. Placeholder scan:** no "TBD" / "implement later" / vague guidance. Each step shows the exact code or exact command. The only deferrals (TTY input wiring, line editor, etc.) are explicitly named with their owning milestone.

**3. Type consistency:** `Key`, `KeySubscriber`, `InputSource`, `UseInputOptions`, `Backend.onKey` shape are used consistently across `keys.ts`, `input-context.ts`, `use-input.ts`, `backends/types.ts`, `backends/test.ts`, `render.ts`. `createRoot`/`createReconciler` gain a single optional `onCommit?: () => void` parameter referenced identically in both signatures and the consumer (`render.ts`).

**Two risks worth flagging up front for the implementer (not blockers):**

1. The spy approach in Task 4 (`originalFree.bind(node)`; replace `freeRecursive` before unmount) relies on react-reconciler calling `freeRecursive` exactly once per root child. If 0.31.0's teardown path calls both `removeChildFromContainer` and then `clearContainer`, the same node could see two free attempts and crash. If the test fails with a wasm double-free, change `clearContainer` to track which nodes have been freed (or skip freeing nodes already removed). This is a minor robustness concern, not an architectural one.

2. `await Promise.resolve()` twice (in `render.ts` and `flush()`) is sufficient for one React commit + one queueMicrotask, but a chain of cascading state-updates-in-effects could need more rounds. If the counter acceptance test (Task 7) ever flakes, expose a `microtasks?: number` option on `flush()` and bump as needed; do **not** switch to `setTimeout`-based waits (those reorder relative to React's microtask-based scheduler).

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/m1a-interactivity.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Same flow as M0.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
