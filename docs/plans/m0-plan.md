# flowtty M0 — Renderer Core + Test Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Staging note.** This plan is authored in the `site` repo (`docs/superpowers/plans/`). It targets the **new standalone repo `mellonis/flowtty`** (to be created by Task 1 at `/Users/mellonis/Developer/mellonis-workspace/flowtty`). When that repo exists, this plan + the design spec (`2026-05-29-flowtty-design.md`) move into it. Nothing here is committed to `site`.

**Goal:** A working terminal renderer that mounts a React tree of `<Box>`/`<Text>`, lays it out with Yoga, and produces a frame — verifiable end-to-end via an in-memory test backend (string capture) and viewable on a real TTY.

**Architecture:** A custom `react-reconciler` host config whose host instances each own a Yoga node. On commit, React drives mutations → Yoga computes layout → a paint pass writes a 2-D cell buffer → a backend draws it (test backend captures it as a string; TTY backend writes ANSI). This is M0 of the larger flowtty app-framework spec; prompts, workflows, and the app shell are later milestones.

**Tech Stack:** TypeScript (ESM), React 19, `react-reconciler`, `yoga-layout` (3.x, async `loadYoga`), `vitest`, `tsup`.

---

## Scope (M0 only)

This plan delivers the renderer foundation **and nothing else**. Explicitly **out of scope** for M0 (later milestones): prompt primitives (TextInput/Select/…), the workflow/dialog layer, the app shell (panes/key-routing/menu), borders, text wrapping/truncation, frame-diffing optimization, signal lifecycle, colors beyond a basic ANSI mapping. M0's acceptance is: `render(<Box><Text>hi</Text></Box>)` produces the expected frame on the test backend.

> **Test layout convention (updated):** tests are **co-located** next to their source in `src/` (e.g. `src/cells.ts` + `src/cells.test.ts`), importing siblings via `./X.js`. Where tasks below show `test/X.test.ts` with `../src/X.js` imports, place the test at `src/X.test.ts` and import via `./X.js`. The `test/` directory is not used, and `tsconfig.json` `include` is `["src"]`.

## File Structure

```
mellonis/flowtty/   (= /Users/mellonis/Developer/mellonis-workspace/flowtty)
  package.json
  tsconfig.json
  vitest.config.ts
  tsup.config.ts
  src/
    cells.ts            # Style, Cell, Buffer (2-D grid) + NBSP-safe toString
    ansi.ts             # Style → ANSI SGR string; cursor/clear helpers
    yoga.ts             # getYoga() async singleton + enum/type re-exports
    host.ts             # Instance (box/text) + TextInstance, yoga-node lifecycle
    reconciler.ts       # react-reconciler HostConfig + container wiring
    paint.ts            # laid-out tree → Buffer
    render.ts           # public async render(element, backend)
    components.ts       # Box/Text prop types + JSX intrinsic typing
    backends/
      types.ts          # Backend (adapter) interface
      test.ts           # in-memory backend: capture frames → renderToString
      tty.ts            # minimal real-terminal backend (full-frame redraw)
    index.ts            # public entry: render, Box, Text, types
    testing.ts          # public test entry: TestBackend + helpers
  test/
    cells.test.ts
    yoga.test.ts
    host.test.ts
    reconciler.test.ts
    layout.test.ts
    paint.test.ts
    render.test.ts
    ansi.test.ts
```

Responsibilities: `cells`/`ansi` are pure (no React, no Yoga) and trivially testable. `yoga` isolates the async load. `host` owns instance + Yoga-node bookkeeping. `reconciler` is the only file touching `react-reconciler`. `paint` is pure (tree+layout → buffer). `render` wires it together. `backends/*` implement the adapter seam.

---

### Task 1: Scaffold repo + toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Test: `test/smoke.test.ts`

- [ ] **Step 1: Create the repo directory and init git**

Run:
```bash
mkdir -p /Users/mellonis/Developer/mellonis-workspace/flowtty
cd /Users/mellonis/Developer/mellonis-workspace/flowtty
git init
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "flowtty",
  "version": "0.0.0",
  "type": "module",
  "license": "MIT",
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "build": "tsup"
  },
  "peerDependencies": { "react": "^19.0.0" },
  "dependencies": {
    "react-reconciler": "^0.31.0",
    "yoga-layout": "^3.2.1"
  },
  "devDependencies": {
    "react": "^19.2.4",
    "@types/react": "^19",
    "@types/react-reconciler": "^0.28.9",
    "typescript": "^6",
    "vitest": "^4",
    "tsup": "^8"
  }
}
```

> **Version-pin note (do this now, not later):** after `npm install`, run `npm ls react react-reconciler` and confirm the installed `react-reconciler` is the one paired with the installed React 19. If npm resolved a mismatched `react-reconciler`, pin the exact compatible version (the `react-reconciler` whose own `peerDependencies.react` satisfies your React). This is the single most common source of "createContainer is not a function / wrong arity" pain — resolve it before Task 5.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Write `vitest.config.ts` and `.gitignore`**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node' },
});
```

`.gitignore`:
```
node_modules/
dist/
*.log
```

- [ ] **Step 5: Write the smoke test `test/smoke.test.ts`**

```ts
import { expect, test } from 'vitest';

test('toolchain runs', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 6: Install and run**

Run:
```bash
npm install
npm test
npm run typecheck
```
Expected: `npm test` shows 1 passing test; `typecheck` exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold flowtty (ts, vitest, tsup, react-reconciler, yoga)"
```

---

### Task 2: Cell buffer

**Files:**
- Create: `src/cells.ts`
- Test: `test/cells.test.ts`

- [ ] **Step 1: Write the failing test `test/cells.test.ts`**

```ts
import { expect, test } from 'vitest';
import { Buffer } from '../src/cells.js';

test('blank buffer renders empty lines', () => {
  const b = new Buffer(3, 2);
  expect(b.toString()).toBe('');
});

test('set places a char at x,y', () => {
  const b = new Buffer(5, 2);
  b.set(0, 0, 'h');
  b.set(1, 0, 'i');
  b.set(0, 1, 'y');
  expect(b.toString()).toBe('hi\ny');
});

test('out-of-bounds set is ignored', () => {
  const b = new Buffer(2, 1);
  b.set(5, 5, 'x');
  expect(b.toString()).toBe('');
});

test('toString trims trailing ASCII spaces but preserves NBSP', () => {
  const b = new Buffer(4, 1);
  b.set(0, 0, 'a');
  b.set(1, 0, ' '); // NBSP must survive
  expect(b.toString()).toBe('a ');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cells.test.ts`
Expected: FAIL — cannot find module `../src/cells.js`.

- [ ] **Step 3: Write `src/cells.ts`**

```ts
export interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

export interface Cell {
  char: string; // one display column (M0 assumes width-1 glyphs)
  style: Style;
}

export class Buffer {
  readonly width: number;
  readonly height: number;
  private readonly cells: Cell[];

  constructor(width: number, height: number) {
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
    this.cells = Array.from({ length: this.width * this.height }, () => ({
      char: ' ',
      style: {},
    }));
  }

  set(x: number, y: number, char: string, style: Style = {}): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y * this.width + x] = { char, style };
  }

  get(x: number, y: number): Cell {
    return this.cells[y * this.width + x] ?? { char: ' ', style: {} };
  }

  // Plain-text frame. Trailing ASCII spaces are trimmed (cosmetic), but NBSP
  // (U+00A0) and other content are preserved — NBSP-safety is a flowtty value.
  toString(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let line = '';
      for (let x = 0; x < this.width; x++) line += this.get(x, y).char;
      lines.push(line.replace(/ +$/u, '')); // ASCII space only, NOT \s
    }
    return lines.join('\n').replace(/\n+$/u, '');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cells.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cells.ts test/cells.test.ts
git commit -m "feat: cell buffer with NBSP-safe plain-text rendering"
```

---

### Task 3: Yoga init wrapper

**Files:**
- Create: `src/yoga.ts`
- Test: `test/yoga.test.ts`

- [ ] **Step 1: Write the failing test `test/yoga.test.ts`**

```ts
import { expect, test } from 'vitest';
import { getYoga } from '../src/yoga.js';

test('getYoga loads once and computes a simple layout', async () => {
  const Yoga = await getYoga();
  const root = Yoga.Node.create();
  root.setWidth(10);
  root.setHeight(4);
  root.calculateLayout(undefined, undefined);
  expect(root.getComputedWidth()).toBe(10);
  expect(root.getComputedHeight()).toBe(4);
  root.freeRecursive();
});

test('getYoga returns the same instance on repeated calls', async () => {
  const a = await getYoga();
  const b = await getYoga();
  expect(a).toBe(b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/yoga.test.ts`
Expected: FAIL — cannot find module `../src/yoga.js`.

- [ ] **Step 3: Write `src/yoga.ts`**

```ts
import { loadYoga } from 'yoga-layout/load';

export type Yoga = Awaited<ReturnType<typeof loadYoga>>;
export type YogaNode = ReturnType<Yoga['Node']['create']>;

let yogaPromise: Promise<Yoga> | null = null;

// Async because yoga-layout 3.x ships as wasm. Loaded once, cached; all
// per-frame layout calls after the first await are synchronous.
export function getYoga(): Promise<Yoga> {
  yogaPromise ??= loadYoga();
  return yogaPromise;
}

// Re-export the enums the rest of the renderer needs.
export { FlexDirection, Edge, Align, Justify } from 'yoga-layout/load';
```

> **Verify against installed package:** the type names (`Yoga`, node type) and the `yoga-layout/load` subpath are from yoga-layout 3.x. If `npm` resolved a different major, check its README for the load entry (`yoga-layout` default vs `yoga-layout/load` vs `yoga-layout/sync`) and adjust the import. The enum names (`FlexDirection`, `Edge`, `Align`, `Justify`) are stable across 3.x.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/yoga.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/yoga.ts test/yoga.test.ts
git commit -m "feat: async yoga-layout singleton loader"
```

---

### Task 4: Host instances + Yoga-node lifecycle

**Files:**
- Create: `src/host.ts`
- Test: `test/host.test.ts`

- [ ] **Step 1: Write the failing test `test/host.test.ts`**

```ts
import { expect, test } from 'vitest';
import { getYoga } from '../src/yoga.js';
import { createInstance, createTextInstance, appendChild, removeChild } from '../src/host.js';

test('box instance owns a yoga node; text instance carries text', async () => {
  const Yoga = await getYoga();
  const box = createInstance('flowtty-box', { width: 8 }, Yoga);
  const text = createTextInstance('hello', Yoga);
  expect(box.type).toBe('box');
  expect(box.yogaNode).toBeDefined();
  expect(text.type).toBe('text');
  expect(text.text).toBe('hello');
});

test('appendChild wires the yoga child; removeChild frees it', async () => {
  const Yoga = await getYoga();
  const parent = createInstance('flowtty-box', {}, Yoga);
  const child = createInstance('flowtty-box', {}, Yoga);
  appendChild(parent, child);
  expect(parent.children).toContain(child);
  expect(parent.yogaNode.getChildCount()).toBe(1);
  removeChild(parent, child);
  expect(parent.children).not.toContain(child);
  expect(parent.yogaNode.getChildCount()).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/host.test.ts`
Expected: FAIL — cannot find module `../src/host.js`.

- [ ] **Step 3: Write `src/host.ts`**

```ts
import type { Yoga, YogaNode } from './yoga.js';

export type HostType = 'flowtty-box' | 'flowtty-text';

export interface BoxProps {
  width?: number;
  height?: number;
  flexDirection?: 'row' | 'column';
}

export interface Instance {
  type: 'box';
  props: BoxProps;
  yogaNode: YogaNode;
  children: Array<Instance | TextInstance>;
}

export interface TextInstance {
  type: 'text';
  text: string;
}

export function createInstance(type: HostType, props: BoxProps, Yoga: Yoga): Instance {
  if (type !== 'flowtty-box') throw new Error(`unknown host type: ${type}`);
  const node = Yoga.Node.create();
  const inst: Instance = { type: 'box', props, yogaNode: node, children: [] };
  applyProps(inst, props, Yoga);
  return inst;
}

export function createTextInstance(text: string, _Yoga: Yoga): TextInstance {
  return { type: 'text', text };
}

export function applyProps(inst: Instance, props: BoxProps, Yoga: Yoga): void {
  inst.props = props;
  const n = inst.yogaNode;
  if (props.width !== undefined) n.setWidth(props.width);
  else n.setWidthAuto();
  if (props.height !== undefined) n.setHeight(props.height);
  else n.setHeightAuto();
  n.setFlexDirection(
    props.flexDirection === 'row' ? Yoga.FlexDirection.Row : Yoga.FlexDirection.Column,
  );
}

export function appendChild(parent: Instance, child: Instance | TextInstance): void {
  parent.children.push(child);
  if (child.type === 'box') parent.yogaNode.insertChild(child.yogaNode, parent.yogaNode.getChildCount());
}

export function removeChild(parent: Instance, child: Instance | TextInstance): void {
  const i = parent.children.indexOf(child);
  if (i >= 0) parent.children.splice(i, 1);
  if (child.type === 'box') {
    parent.yogaNode.removeChild(child.yogaNode);
    child.yogaNode.freeRecursive(); // free wasm node — required to avoid leaks
  }
}

export function insertBefore(
  parent: Instance,
  child: Instance | TextInstance,
  before: Instance | TextInstance,
): void {
  const i = parent.children.indexOf(before);
  parent.children.splice(i < 0 ? parent.children.length : i, 0, child);
  if (child.type === 'box') {
    const boxIndex = parent.children.filter((c) => c.type === 'box').indexOf(child);
    parent.yogaNode.insertChild(child.yogaNode, boxIndex);
  }
}
```

> **Note:** `Yoga.FlexDirection` is read off the loaded instance here for convenience; the enum is also exported from `./yoga.js` if you prefer the static import. `applyProps` re-applies the full prop set on update (M0 keeps it simple; diffing props is a later optimization).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/host.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/host.ts test/host.test.ts
git commit -m "feat: host instances with yoga-node lifecycle (create/append/remove/insert)"
```

---

### Task 5: react-reconciler host config + container

**Files:**
- Create: `src/reconciler.ts`
- Test: `test/reconciler.test.ts`

- [ ] **Step 1: Write the failing test `test/reconciler.test.ts`**

```ts
import { expect, test } from 'vitest';
import { createElement } from 'react';
import { getYoga } from '../src/yoga.js';
import { createReconciler, createRoot } from '../src/reconciler.js';

test('mounting <flowtty-box> builds a host tree under the container', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 6 }, createElement('flowtty-box', { height: 2 })),
  );
  expect(container.children).toHaveLength(1);
  const outer = container.children[0];
  expect(outer.type).toBe('box');
  expect(outer.children).toHaveLength(1);
  expect(outer.yogaNode.getChildCount()).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/reconciler.test.ts`
Expected: FAIL — cannot find module `../src/reconciler.js`.

- [ ] **Step 3: Write `src/reconciler.ts`**

```ts
import ReactReconciler from 'react-reconciler';
import { DefaultEventPriority } from 'react-reconciler/constants.js';
import type { Yoga } from './yoga.js';
import {
  appendChild,
  applyProps,
  createInstance,
  createTextInstance,
  insertBefore,
  removeChild,
  type HostType,
  type Instance,
  type TextInstance,
} from './host.js';

export interface Container {
  children: Instance[];
  Yoga: Yoga;
}

export function createReconciler(Yoga: Yoga) {
  return ReactReconciler<
    HostType, // Type
    Record<string, unknown>, // Props
    Container, // Container
    Instance, // Instance
    TextInstance, // TextInstance
    never, // SuspenseInstance
    never, // HydratableInstance
    Instance | TextInstance, // PublicInstance
    object, // HostContext
    true, // UpdatePayload (we re-apply full props)
    never, // ChildSet
    ReturnType<typeof setTimeout>, // TimeoutHandle
    -1 // NoTimeout
  >({
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    isPrimaryRenderer: true,
    noTimeout: -1,
    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,

    createInstance: (type, props) => createInstance(type, props as never, Yoga),
    createTextInstance: (text) => createTextInstance(text, Yoga),

    appendInitialChild: appendChild,
    appendChild,
    appendChildToContainer: (container, child) => {
      container.children.push(child as Instance);
    },
    insertBefore,
    insertInContainerBefore: (container, child, before) => {
      const i = container.children.indexOf(before as Instance);
      container.children.splice(i < 0 ? container.children.length : i, 0, child as Instance);
    },
    removeChild,
    removeChildFromContainer: (container, child) => {
      const i = container.children.indexOf(child as Instance);
      if (i >= 0) container.children.splice(i, 1);
    },

    finalizeInitialChildren: () => false,
    shouldSetTextContent: () => false,
    prepareUpdate: () => true, // always re-apply props (M0)
    commitUpdate: (instance, _payload, _type, _old, newProps) =>
      applyProps(instance, newProps as never, Yoga),
    commitTextUpdate: (textInstance, _old, newText) => {
      textInstance.text = newText;
    },

    getRootHostContext: () => ({}),
    getChildHostContext: (parent) => parent,
    getPublicInstance: (instance) => instance,
    prepareForCommit: () => null,
    resetAfterCommit: () => {},
    clearContainer: (container) => {
      container.children = [];
    },

    getCurrentEventPriority: () => DefaultEventPriority,
    detachDeletedInstance: () => {},
    // The following are required by recent react-reconciler versions as no-ops
    // for a non-suspense, non-microtask renderer. If the installed version's
    // types demand more, add them as no-ops — let the TS host-config type guide
    // you; do not fight it.
    getInstanceFromNode: () => null,
    beforeActiveInstanceBlur: () => {},
    afterActiveInstanceBlur: () => {},
    prepareScopeUpdate: () => {},
    getInstanceFromScope: () => null,
    supportsMicrotasks: true,
    scheduleMicrotask: queueMicrotask,
    maySuspendCommit: () => false,
    startSuspendingCommit: () => {},
    waitForCommitToBeReady: () => null,
    preparePortalMount: () => {},
    requestPostPaintCallback: () => {},
    shouldAttemptEagerTransition: () => false,
    resetFormInstance: () => {},
    trackSchedulerEvent: () => {},
    resolveEventType: () => null,
    resolveEventTimeStamp: () => -1.1,
  });
}

export interface Root {
  render(element: React.ReactNode): void;
  unmount(): void;
}

export function createRoot(Yoga: Yoga): { container: Container; root: Root } {
  const reconciler = createReconciler(Yoga);
  const container: Container = { children: [], Yoga };
  // NOTE: createContainer arity is VERSION-SENSITIVE. This matches
  // react-reconciler 0.31/0.32 (React 19): (containerInfo, tag, hydrationCallbacks,
  // isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix,
  // onUncaughtError, onCaughtError, onRecoverableError, transitionCallbacks).
  // If the installed version errors, check its createContainer signature.
  const fiberRoot = reconciler.createContainer(
    container,
    0, // LegacyRoot
    null,
    false,
    null,
    '',
    (err: unknown) => console.error(err),
    (err: unknown) => console.error(err),
    (err: unknown) => console.error(err),
    null,
  );
  return {
    container,
    root: {
      render(element) {
        reconciler.updateContainer(element, fiberRoot, null, null);
      },
      unmount() {
        reconciler.updateContainer(null, fiberRoot, null, null);
      },
    },
  };
}
```

> **Version-sensitivity is concentrated here on purpose.** Two spots can differ by `react-reconciler` version: the **host-config required-method set** (recent versions add no-op-able methods — the TypeScript type for the host config tells you exactly which are missing; add them as no-ops) and the **`createContainer` arity** (commented above). The mounting test in Step 1 is the proof you got both right. Resolve any mismatch here, before moving on — this is the task the version-pin note in Task 1 was protecting.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/reconciler.test.ts`
Expected: PASS — the host tree is built (`container.children[0]` is a box with one child, and its Yoga node has one child).

- [ ] **Step 5: Commit**

```bash
git add src/reconciler.ts test/reconciler.test.ts
git commit -m "feat: react-reconciler host config + container wiring"
```

---

### Task 6: Text measurement (Yoga measure func on text-bearing boxes)

**Files:**
- Modify: `src/host.ts`
- Test: `test/host.test.ts` (add cases)

Text has no Yoga node of its own (Yoga lays out boxes). A box whose only children are text gets a **measure function** so Yoga sizes it to the text. M0 measures width = longest line length, height = line count.

- [ ] **Step 1: Add the failing test to `test/host.test.ts`**

```ts
import { measureText } from '../src/host.js';

test('measureText returns longest-line width and line count', () => {
  expect(measureText('hi')).toEqual({ width: 2, height: 1 });
  expect(measureText('hi\nthere')).toEqual({ width: 5, height: 2 });
  expect(measureText('')).toEqual({ width: 0, height: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/host.test.ts`
Expected: FAIL — `measureText` is not exported.

- [ ] **Step 3: Add `measureText` and a text-measure setup to `src/host.ts`**

Add:
```ts
export function measureText(text: string): { width: number; height: number } {
  const lines = text.split('\n');
  const width = lines.reduce((m, l) => Math.max(m, [...l].length), 0);
  return { width, height: lines.length };
}

// Concatenate a box's direct text children into one string.
export function ownText(inst: Instance): string {
  return inst.children
    .filter((c): c is TextInstance => c.type === 'text')
    .map((c) => c.text)
    .join('');
}

// Install a Yoga measure func when a box's children are text-only.
export function refreshMeasure(inst: Instance, Yoga: Yoga): void {
  const hasText = inst.children.some((c) => c.type === 'text');
  const hasBox = inst.children.some((c) => c.type === 'box');
  if (hasText && !hasBox) {
    const text = ownText(inst);
    inst.yogaNode.setMeasureFunc(() => measureText(text));
  } else {
    inst.yogaNode.unsetMeasureFunc?.();
  }
}
```

Call `refreshMeasure(parent, Yoga)` at the end of `appendChild`, `removeChild`, and `insertBefore` (pass `Yoga` into those — update their signatures to accept it, and update `reconciler.ts` call sites to pass `Yoga`). Also call it in `commitTextUpdate` via the text node's parent — for M0 simplicity, instead re-run measure during the layout pass (Task 7) rather than threading parent pointers; if you prefer, add a `parent` back-reference on `TextInstance`. Choose the back-reference approach:

```ts
export interface TextInstance {
  type: 'text';
  text: string;
  parent?: Instance;
}
```
Set `child.parent = parent` in `appendChild`/`insertBefore` for text children, and in `commitTextUpdate` call `refreshMeasure(textInstance.parent, Yoga)` then mark layout dirty.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/host.test.ts`
Expected: PASS (all host tests).

- [ ] **Step 5: Commit**

```bash
git add src/host.ts test/host.test.ts
git commit -m "feat: text measurement via yoga measure func on text-only boxes"
```

---

### Task 7: Layout pass

**Files:**
- Create: `src/layout.ts`
- Test: `test/layout.test.ts`

- [ ] **Step 1: Write the failing test `test/layout.test.ts`**

```ts
import { expect, test } from 'vitest';
import { createElement } from 'react';
import { getYoga } from '../src/yoga.js';
import { createRoot } from '../src/reconciler.js';
import { computeLayout, layoutOf } from '../src/layout.js';

test('row layout places two fixed-width boxes side by side', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { flexDirection: 'row', width: 10, height: 1 },
      createElement('flowtty-box', { width: 3, height: 1 }),
      createElement('flowtty-box', { width: 3, height: 1 }),
    ),
  );
  computeLayout(container, 10, 1);
  const outer = container.children[0];
  const [a, b] = outer.children.filter((c) => c.type === 'box');
  expect(layoutOf(a)).toMatchObject({ left: 0, top: 0, width: 3, height: 1 });
  expect(layoutOf(b)).toMatchObject({ left: 3, top: 0, width: 3, height: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/layout.test.ts`
Expected: FAIL — cannot find module `../src/layout.js`.

- [ ] **Step 3: Write `src/layout.ts`**

```ts
import type { Container } from './reconciler.js';
import type { Instance } from './host.js';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function computeLayout(container: Container, width: number, height: number): void {
  for (const root of container.children) {
    // Root boxes fill the given viewport unless they set their own size.
    root.yogaNode.calculateLayout(width, height, container.Yoga.Direction.LTR);
  }
}

// Absolute rect for an instance, summing offsets up the (yoga) tree is avoided
// by reading computed left/top relative to parent and accumulating here.
export function layoutOf(inst: Instance, offsetX = 0, offsetY = 0): Rect {
  const n = inst.yogaNode;
  return {
    left: offsetX + n.getComputedLeft(),
    top: offsetY + n.getComputedTop(),
    width: n.getComputedWidth(),
    height: n.getComputedHeight(),
  };
}
```

> **Note:** `container.Yoga.Direction.LTR` reads the `Direction` enum off the loaded instance. If TS doesn't surface it there, import `Direction` from `yoga-layout/load` and re-export it via `src/yoga.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layout.ts test/layout.test.ts
git commit -m "feat: yoga layout pass + absolute box helper"
```

---

### Task 8: Paint laid-out tree into a buffer

**Files:**
- Create: `src/paint.ts`
- Test: `test/paint.test.ts`

- [ ] **Step 1: Write the failing test `test/paint.test.ts`**

```ts
import { expect, test } from 'vitest';
import { createElement } from 'react';
import { getYoga } from '../src/yoga.js';
import { createRoot } from '../src/reconciler.js';
import { computeLayout } from '../src/layout.js';
import { paint } from '../src/paint.js';

test('paints text inside a box at the box origin', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { width: 5, height: 1 }, 'hi'),
  );
  computeLayout(container, 5, 1);
  const buffer = paint(container, 5, 1);
  expect(buffer.toString()).toBe('hi');
});

test('paints two row children at their computed columns', async () => {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);
  root.render(
    createElement('flowtty-box', { flexDirection: 'row', width: 6, height: 1 },
      createElement('flowtty-box', { width: 2, height: 1 }, 'ab'),
      createElement('flowtty-box', { width: 2, height: 1 }, 'cd'),
    ),
  );
  computeLayout(container, 6, 1);
  const buffer = paint(container, 6, 1);
  expect(buffer.toString()).toBe('abcd');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/paint.test.ts`
Expected: FAIL — cannot find module `../src/paint.js`.

- [ ] **Step 3: Write `src/paint.ts`**

```ts
import { Buffer } from './cells.js';
import { layoutOf, type Rect } from './layout.js';
import { ownText, type Instance } from './host.js';
import type { Container } from './reconciler.js';

export function paint(container: Container, width: number, height: number): Buffer {
  const buffer = new Buffer(width, height);
  for (const root of container.children) paintInstance(root, buffer, 0, 0);
  return buffer;
}

function paintInstance(inst: Instance, buffer: Buffer, offsetX: number, offsetY: number): void {
  const box: Rect = layoutOf(inst, offsetX, offsetY);

  // Box background fill (only if a bg is set — none in M0 props, but the hook
  // is here for later).
  // Text content: a text-only box paints its string at the box origin.
  const text = ownText(inst);
  if (text) {
    const lines = text.split('\n');
    for (let row = 0; row < lines.length; row++) {
      const line = [...(lines[row] ?? '')];
      for (let col = 0; col < line.length; col++) {
        buffer.set(box.left + col, box.top + row, line[col]!, {});
      }
    }
  }

  for (const child of inst.children) {
    if (child.type === 'box') paintInstance(child, buffer, box.left, box.top);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/paint.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/paint.ts test/paint.test.ts
git commit -m "feat: paint laid-out host tree into a cell buffer"
```

---

### Task 9: Backend adapter interface + test backend

**Files:**
- Create: `src/backends/types.ts`, `src/backends/test.ts`
- Test: covered by Task 10's end-to-end test (the test backend has no behavior beyond capture; it's exercised via `render`).

- [ ] **Step 1: Write `src/backends/types.ts`**

```ts
import type { Buffer } from '../cells.js';

// The seam every renderer backend implements. M0 needs only size + draw.
export interface Backend {
  size(): { width: number; height: number };
  draw(buffer: Buffer): void;
  // Optional teardown (TTY restores the terminal; test backend is a no-op).
  dispose?(): void;
}
```

- [ ] **Step 2: Write `src/backends/test.ts`**

```ts
import type { Buffer } from '../cells.js';
import type { Backend } from './types.js';

export class TestBackend implements Backend {
  frames: string[] = [];
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

  // The most recent captured frame as plain text.
  get lastFrame(): string {
    return this.frames[this.frames.length - 1] ?? '';
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/backends/types.ts src/backends/test.ts
git commit -m "feat: backend adapter interface + in-memory test backend"
```

---

### Task 10: Public async `render()` end-to-end (M0 acceptance)

**Files:**
- Create: `src/render.ts`, `src/components.ts`, `src/index.ts`, `src/testing.ts`
- Test: `test/render.test.ts`

- [ ] **Step 1: Write the failing acceptance test `test/render.test.ts`**

```ts
import { expect, test } from 'vitest';
import { createElement } from 'react';
import { render } from '../src/index.js';
import { TestBackend } from '../src/testing.js';
import { Box, Text } from '../src/index.js';

test('M0 acceptance: render(<Box><Text>hi</Text></Box>) captures "hi"', async () => {
  const backend = new TestBackend(5, 1);
  await render(createElement(Box, null, createElement(Text, null, 'hi')), backend);
  expect(backend.lastFrame).toBe('hi');
});

test('row of two boxes renders side by side via JSX-style elements', async () => {
  const backend = new TestBackend(6, 1);
  await render(
    createElement(Box, { flexDirection: 'row' },
      createElement(Box, { width: 2 }, createElement(Text, null, 'ab')),
      createElement(Box, { width: 2 }, createElement(Text, null, 'cd')),
    ),
    backend,
  );
  expect(backend.lastFrame).toBe('abcd');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/render.test.ts`
Expected: FAIL — cannot find module `../src/index.js`.

- [ ] **Step 3: Write `src/components.ts`**

```ts
import type { ReactNode } from 'react';
import type { BoxProps } from './host.js';

// Box/Text are intrinsic-host wrappers. They render to the lowercase host
// types the reconciler knows. Keeping public PascalCase components means
// consumers never type the 'flowtty-box' string.
export function Box(props: BoxProps & { children?: ReactNode }): ReactNode {
  const { children, ...rest } = props;
  return { type: 'flowtty-box', props: { ...rest, children }, key: null } as never;
}

export function Text(props: { children?: ReactNode }): ReactNode {
  return { type: 'flowtty-box', props: { children: props.children }, key: null } as never;
}
```

> **Simplification for M0:** `Text` is a box whose children are strings; the text-measure path (Task 6) sizes it. A distinct `flowtty-text` host type and richer `Text` styling come in M1. Returning element-shaped objects directly is brittle — instead implement these with `createElement`:
>
> ```ts
> import { createElement, type ReactNode } from 'react';
> export const Box = ({ children, ...rest }: BoxProps & { children?: ReactNode }) =>
>   createElement('flowtty-box', rest, children);
> export const Text = ({ children }: { children?: ReactNode }) =>
>   createElement('flowtty-box', null, children);
> ```
> Use the `createElement` form (it's correct); the object-literal form above is shown only to be explicit about what an element is.

- [ ] **Step 4: Write `src/render.ts`**

```ts
import type { ReactNode } from 'react';
import { getYoga } from './yoga.js';
import { createRoot } from './reconciler.js';
import { computeLayout } from './layout.js';
import { paint } from './paint.js';
import type { Backend } from './backends/types.js';

export async function render(element: ReactNode, backend: Backend): Promise<{ unmount(): void }> {
  const Yoga = await getYoga();
  const { container, root } = createRoot(Yoga);

  const draw = () => {
    const { width, height } = backend.size();
    computeLayout(container, width, height);
    backend.draw(paint(container, width, height));
  };

  // M0: synchronous render + immediate paint. (Commit-scheduled repaint comes
  // with state/hooks in a later milestone; for now we paint once after render.)
  root.render(element);
  draw();

  return {
    unmount() {
      root.unmount();
      backend.dispose?.();
    },
  };
}
```

> **Known M0 limitation (documented, not a bug):** this paints once after the initial render. Re-painting on React state updates requires hooking `resetAfterCommit` to schedule a `draw()`. That's deliberately deferred — M0 proves static rendering end-to-end. Wire the commit→draw loop in M1 when interactivity arrives.

- [ ] **Step 5: Write `src/index.ts` and `src/testing.ts`**

`src/index.ts`:
```ts
export { render } from './render.js';
export { Box, Text } from './components.js';
export type { BoxProps } from './host.js';
export type { Backend } from './backends/types.js';
export { TestBackend } from './backends/test.js';
```

`src/testing.ts`:
```ts
export { TestBackend } from './backends/test.js';
```

- [ ] **Step 6: Run the acceptance test**

Run: `npx vitest run test/render.test.ts`
Expected: PASS (2 tests) — `backend.lastFrame` equals `'hi'` and `'abcd'`.

- [ ] **Step 7: Run the whole suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/render.ts src/components.ts src/index.ts src/testing.ts test/render.test.ts
git commit -m "feat: public render() end-to-end on test backend (M0 acceptance)"
```

---

### Task 11: ANSI serializer + minimal TTY backend

**Files:**
- Create: `src/ansi.ts`, `src/backends/tty.ts`
- Test: `test/ansi.test.ts`

- [ ] **Step 1: Write the failing test `test/ansi.test.ts`**

```ts
import { expect, test } from 'vitest';
import { sgr, RESET } from '../src/ansi.js';

test('sgr emits nothing for an empty style', () => {
  expect(sgr({})).toBe('');
});

test('sgr emits bold and a basic fg color', () => {
  expect(sgr({ bold: true })).toBe('\x1b[1m');
  expect(sgr({ fg: 'red' })).toBe('\x1b[31m');
  expect(sgr({ bold: true, fg: 'red' })).toBe('\x1b[1;31m');
});

test('RESET is the SGR reset', () => {
  expect(RESET).toBe('\x1b[0m');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ansi.test.ts`
Expected: FAIL — cannot find module `../src/ansi.js`.

- [ ] **Step 3: Write `src/ansi.ts`**

```ts
import type { Style } from './cells.js';

export const RESET = '\x1b[0m';

const FG: Record<string, number> = {
  black: 30, red: 31, green: 32, yellow: 33,
  blue: 34, magenta: 35, cyan: 36, white: 37,
};

export function sgr(style: Style): string {
  const codes: number[] = [];
  if (style.bold) codes.push(1);
  if (style.dim) codes.push(2);
  if (style.underline) codes.push(4);
  if (style.inverse) codes.push(7);
  if (style.fg && FG[style.fg] !== undefined) codes.push(FG[style.fg]!);
  return codes.length ? `\x1b[${codes.join(';')}m` : '';
}

export const HIDE_CURSOR = '\x1b[?25l';
export const SHOW_CURSOR = '\x1b[?25h';
export const CLEAR = '\x1b[2J\x1b[H';
```

- [ ] **Step 4: Write `src/backends/tty.ts`**

```ts
import type { Buffer, Style } from '../cells.js';
import { CLEAR, HIDE_CURSOR, RESET, SHOW_CURSOR, sgr } from '../ansi.js';
import type { Backend } from './types.js';

export class TtyBackend implements Backend {
  constructor(private readonly out: NodeJS.WriteStream = process.stdout) {
    this.out.write(HIDE_CURSOR);
  }

  size() {
    return { width: this.out.columns ?? 80, height: this.out.rows ?? 24 };
  }

  // M0: full-frame redraw (no diffing). Clears, then writes every line with
  // per-cell SGR. Frame-diffing is a later optimization behind this same seam.
  draw(buffer: Buffer): void {
    let outStr = CLEAR;
    for (let y = 0; y < buffer.height; y++) {
      let line = '';
      let last: Style | null = null;
      for (let x = 0; x < buffer.width; x++) {
        const cell = buffer.get(x, y);
        const styleStr = sgr(cell.style);
        if (JSON.stringify(cell.style) !== JSON.stringify(last)) {
          line += RESET + styleStr;
          last = cell.style;
        }
        line += cell.char;
      }
      outStr += line + RESET + (y < buffer.height - 1 ? '\n' : '');
    }
    this.out.write(outStr);
  }

  dispose(): void {
    this.out.write(SHOW_CURSOR + RESET);
  }
}
```

> **Note:** `TtyBackend` is not exported from `./testing` and isn't unit-tested against a real TTY (that's an integration concern). Its only pure, tested unit is the `ansi.ts` serializer. A manual smoke check is in Step 6.

- [ ] **Step 5: Run the ANSI test + suite**

Run: `npx vitest run test/ansi.test.ts && npm test`
Expected: all pass.

- [ ] **Step 6: Manual TTY smoke check**

Create `scratch/hello.ts` (gitignored, not committed):
```ts
import { createElement } from 'react';
import { render, Box, Text } from '../src/index.js';
import { TtyBackend } from '../src/backends/tty.js';

const handle = await render(
  createElement(Box, { flexDirection: 'row' },
    createElement(Box, { width: 6 }, createElement(Text, null, 'hello')),
    createElement(Box, { width: 6 }, createElement(Text, null, 'world')),
  ),
  new TtyBackend(),
);
setTimeout(() => handle.unmount(), 1500);
```
Run: `npx tsx scratch/hello.ts` (add `tsx` as a devDep if needed).
Expected: "hello world" renders in the terminal for ~1.5s, then the cursor is restored. (This is a human check, not an automated test.)

- [ ] **Step 7: Commit**

```bash
git add src/ansi.ts src/backends/tty.ts test/ansi.test.ts
git commit -m "feat: ANSI serializer + minimal full-redraw TTY backend"
```

---

### Task 12: Build config + package entries + README stub

**Files:**
- Create: `tsup.config.ts`, `README.md`
- Modify: `package.json` (point `exports` at built `dist/` for publish; keep src for dev)

- [ ] **Step 1: Write `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
});
```

- [ ] **Step 2: Build and verify output**

Run: `npm run build`
Expected: `dist/index.js`, `dist/index.d.ts`, `dist/testing.js`, `dist/testing.d.ts` exist; exit 0.

- [ ] **Step 3: Write `README.md` (honest framing)**

```md
# flowtty

A framework for building terminal apps in React. **M0:** a `react-reconciler`
host config over Yoga layout that renders `<Box>`/`<Text>` to a cell buffer and
draws it to the terminal (or captures it via the test backend).

> The renderer is a host config on top of React's reconciler + Yoga — not a
> from-scratch renderer including layout, and not a performance competitor to
> native-core renderers like OpenTUI. flowtty's value is the app + workflow
> layers built on top (later milestones).

## Status
M0 (renderer core). Not yet usable for apps. See `docs/` for the design + plan.
```

- [ ] **Step 4: Final suite + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add tsup.config.ts README.md package.json
git commit -m "chore: tsup build, package entries, README (M0)"
```

---

## Self-Review

**1. Spec coverage (M0 portion of `2026-05-29-flowtty-design.md`):**
- "Native renderer: react-reconciler + Yoga" → Tasks 3,5,7.
- "Box/Text general components" → Tasks 4,6,10 (Text is a text-only box in M0; richer Text is M1).
- "Renderer adapter (thin seam) + test backend" → Tasks 9,10.
- "cell buffer → diff → ANSI write" → Tasks 2,8,11 (diffing deferred — full redraw in M0, noted).
- "Yoga node lifecycle: free on unmount" → Task 4 (`freeRecursive` in `removeChild`).
- "NBSP-safety" → Task 2 (ASCII-space-only trim).
- "Test harness as public entry" → Task 10 (`src/testing.ts`).
- Out-of-M0 spec items (prompts, workflows, app shell, signal lifecycle, embedded dialogs, key routing) → correctly NOT in this plan; they are M1+.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Two honest *deferrals* are documented as M0 limitations (commit→repaint loop; frame diffing), not placeholders. Two *version-sensitivity callouts* (react-reconciler arity/methods; yoga type/entry names) are flagged with the verification step that resolves them.

**3. Type consistency:** `Instance`/`TextInstance`/`Container`/`Backend` names are used consistently across `host.ts`, `reconciler.ts`, `layout.ts`, `paint.ts`, `render.ts`. The earlier `Box` overload (the **component** in `components.ts` vs the **layout rect**) was resolved by renaming the layout rect to **`Rect`** (Tasks 7 + 8), so `Box` now unambiguously means the component.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-29-flowtty-m0-renderer.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
