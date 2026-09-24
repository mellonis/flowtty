# Word / line selection and selection from code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a double-click selects the word under the pointer and a triple-click the line (a soft-wrapped paragraph as one), through the existing copy-on-select path; and an app can make the same selections from code — `select(anchor, head)`, `selectWord(x, y)`, `selectLine(x, y)`, `clearSelection()` on `useApp()` and the render handle.

**Architecture:** the TTY backend counts presses (same button, same cell, within 500 ms → 1, 2, 3, then 1 again) and puts the count on the `mousedown` key as `clicks`; `TestBackend.mouse()` takes it as an option. `SelectionController.press` reads `clicks`: 2 → the word at the cell, 3 → the line, computed by two pure functions next to `selectionRows` / `selectionText` that respect the same `clip` / `excluded` rules and continuation marks. The selection is complete on the press itself (no drag), and its text goes out through `onSelect` like a finished drag. The code API calls the same controller methods with `source: 'api'` on the copy event.

**Tech Stack:** TypeScript ESM, Vitest, no new dependencies.

**Spec:** flowtty issues #36 (double / triple click) and #40 (selection from code), with the decisions taken in chat: click counting lives in the backend and travels on the `Key`; the interval is a fixed 500 ms; a fourth press starts over at 1; drag-extension after a double-click is out of scope; the code API takes frame cells (a `<Box ref>` form is a later step).

## Global Constraints

- Published surfaces cite `docs/*.md` pages only — never this note, never issue numbers.
- Exported functions carry explicit return types (oxc dts). `.tsx` files import React.
- `core` stays free of node globals and timers: counting (which needs a clock) lives in `tty-backend`.
- A word is a run of non-space cells; punctuation counts as word characters (refine later).
- The overlay path is unchanged: no layout, no re-render, `present()` redraws the same frame.

---

## File Structure

```
packages/core/src/keys.ts                             # MODIFY — Key.clicks
packages/core/src/testing/test-backend.ts             # MODIFY — mouse(…, { clicks })
packages/core/src/host/selection.ts                   # MODIFY — wordAt, lineAt, controller: press by clicks + select/selectWord/selectLine
packages/core/src/host/selection.spec.ts              # MODIFY — wordAt / lineAt geometry
packages/core/src/host/index.ts                       # MODIFY — export wordAt, lineAt (adapter surface)
packages/tty-backend/src/clickCounter.ts              # CREATE — createClickCounter(now?)
packages/tty-backend/src/clickCounter.spec.ts         # CREATE
packages/tty-backend/src/tty.ts                       # MODIFY — count presses in inputDataHandler
packages/tty-backend/src/tty.spec.ts                  # MODIFY — two SGR presses → clicks: 2
packages/tty-backend/src/index.ts                     # MODIFY — export createClickCounter
packages/react/src/context/appContext.ts              # MODIFY — select / selectWord / selectLine / clearSelection
packages/react/src/hooks/useApp.ts                    # MODIFY — doc
packages/react/src/internal/render.ts                 # MODIFY — the four on appApi and handle; source: 'api'
packages/react/src/internal/selection.spec.tsx        # MODIFY — clicks through render; the code API
docs/input.md, docs/app.md, docs/testing.md           # MODIFY
CHANGELOG.md                                          # MODIFY
```

---

### Task 1: `Key.clicks` and the click counter in `tty-backend`

**Files:**
- Modify: `packages/core/src/keys.ts` (after `button?`)
- Modify: `packages/core/src/testing/test-backend.ts` (`mouse` options)
- Create: `packages/tty-backend/src/clickCounter.ts`, `packages/tty-backend/src/clickCounter.spec.ts`
- Modify: `packages/tty-backend/src/tty.ts`, `packages/tty-backend/src/tty.spec.ts`, `packages/tty-backend/src/index.ts`

**Interfaces:**
- Produces: `Key.clicks?: number`; `TestBackend.mouse(kind, x, y, { clicks })`; `createClickCounter(now = Date.now): { count(key: Key): Key }`; `DOUBLE_CLICK_MS = 500`.

- [ ] **Step 1: Failing tests** — `clickCounter.spec.ts`:

```ts
import { expect, test } from 'vitest';
import type { Key } from '@flowtty/core';
import { createClickCounter } from './clickCounter.js';

const down = (x: number, y: number, button: Key['button'] = 'left'): Key =>
  ({ name: 'mousedown', x, y, button, sequence: '', ctrl: false, meta: false, shift: false });

test('presses on the same cell within the interval count 1, 2, 3, then start over', () => {
  let t = 0;
  const counter = createClickCounter(() => t);
  expect(counter.count(down(3, 1)).clicks).toBe(1);
  t += 200; expect(counter.count(down(3, 1)).clicks).toBe(2);
  t += 200; expect(counter.count(down(3, 1)).clicks).toBe(3);
  t += 200; expect(counter.count(down(3, 1)).clicks).toBe(1);
});

test('another cell, another button, or too long a pause is a first press again', () => {
  let t = 0;
  const counter = createClickCounter(() => t);
  counter.count(down(3, 1));
  t += 100; expect(counter.count(down(4, 1)).clicks).toBe(1);
  t += 100; expect(counter.count(down(4, 1, 'right')).clicks).toBe(1);
  t += 600; expect(counter.count(down(4, 1, 'right')).clicks).toBe(1);
});

test('keys other than mousedown pass through untouched', () => {
  const counter = createClickCounter(() => 0);
  const up: Key = { ...down(3, 1), name: 'mouseup' };
  expect(counter.count(up)).toBe(up);
  expect(counter.count(up).clicks).toBeUndefined();
});
```

and in `tty.spec.ts`:

```ts
test('two left presses on the same cell in quick succession arrive as clicks 1 and 2', () => {
  const { stub } = makeStub();
  const stdin = makeStdinStub();
  const b = new TtyBackend(stub, stdin, { mouse: true, colorScheme: false });
  const clicks: (number | undefined)[] = [];
  b.onKey((k) => { if (k.name === 'mousedown') clicks.push(k.clicks); });
  stdin.emit('data', '\x1b[<0;5;3M');
  stdin.emit('data', '\x1b[<0;5;3m');
  stdin.emit('data', '\x1b[<0;5;3M');
  expect(clicks).toEqual([1, 2]);
  b.dispose();
});
```

- [ ] **Step 2: Run** — expected: FAIL (module missing; `clicks` undefined).

- [ ] **Step 3: Implement**

`keys.ts`, after `button?`:

```ts
  /**
   * How many presses in a row this 'mousedown' is: 1 for a single press, 2 for
   * a second on the same cell with the same button within the double-click
   * interval, 3 for a third; a fourth starts over at 1. The TTY backend counts
   * (`createClickCounter`); a backend that does not sets nothing, which reads
   * as 1. Undefined for every other key. See docs/input.md (selection).
   */
  clicks?: number;
```

`clickCounter.ts`:

```ts
import type { Key } from '@flowtty/core';

/** Presses this close together on the same cell count as one multi-click. */
export const DOUBLE_CLICK_MS = 500;

export interface ClickCounter {
  /** A 'mousedown' comes back with `clicks` set; any other key comes back as is. */
  count(key: Key): Key;
}

/**
 * Count presses the way a terminal does for its own double- and triple-click:
 * the same button on the same cell within `DOUBLE_CLICK_MS` of the previous
 * press raises the count, 1 → 2 → 3, and a fourth starts over. Anything else —
 * another cell, another button, a pause — is a first press. `now` is
 * injectable for tests.
 */
export function createClickCounter(now: () => number = Date.now): ClickCounter {
  let last: { x: number; y: number; button: Key['button']; at: number; clicks: number } | null = null;
  return {
    count(key) {
      if (key.name !== 'mousedown' || key.x === undefined || key.y === undefined) return key;
      const at = now();
      const again = last !== null && last.x === key.x && last.y === key.y && last.button === key.button
        && at - last.at <= DOUBLE_CLICK_MS && last.clicks < 3;
      const clicks = again ? last!.clicks + 1 : 1;
      last = { x: key.x, y: key.y, button: key.button, at, clicks };
      return { ...key, clicks };
    },
  };
}
```

`tty.ts`: a field `private readonly clicks = createClickCounter();` and in `inputDataHandler`, `for (const raw of keys) { const key = this.clicks.count(raw); …` (rename the loop variable; everything below uses `key`). `index.ts`: export `createClickCounter`, `DOUBLE_CLICK_MS`, `type ClickCounter`.

`test-backend.ts`: `mouse` options gain `clicks?: number`; on `'down'` the key gets `clicks: options.clicks ?? 1` (only on `'down'`).

- [ ] **Step 4: Run** — `npx vitest run packages/tty-backend packages/core` — expected: PASS.

---

### Task 2: `wordAt` / `lineAt` and the controller's double / triple click

**Files:**
- Modify: `packages/core/src/host/selection.ts`, `packages/core/src/host/selection.spec.ts`, `packages/core/src/host/index.ts`
- Test (through render): `packages/react/src/internal/selection.spec.tsx`

**Interfaces:**
- Produces: `wordAt(buffer, scope, x, y): SelectionRange | null`, `lineAt(buffer, scope, x, y): SelectionRange | null` (exported from `@flowtty/core/host`); `SelectionController` handles `clicks` 2 / 3 on `mousedown`.

- [ ] **Step 1: Failing tests** — `selection.spec.ts` (pure geometry):

```ts
import { lineAt, wordAt } from './selection.js';

test('wordAt: the run of non-space cells around the cell, within the scope', () => {
  const b = bufferOf(['hello world', '']);
  const scope = { clip: { left: 0, top: 0, width: 11, height: 2 }, excluded: [] };
  expect(wordAt(b, scope, 7, 0)).toEqual(range([6, 0], [10, 0], scope.clip));
  expect(wordAt(b, scope, 5, 0)).toBeNull();          // a blank cell is no word
  expect(wordAt(b, scope, 0, 1)).toBeNull();          // an empty row
});

test('wordAt stops at an excluded region and at the clip', () => {
  const b = bufferOf(['abcdefgh']);
  const scope = { clip: { left: 2, top: 0, width: 6, height: 1 }, excluded: [{ left: 5, top: 0, width: 1, height: 1 }] };
  expect(wordAt(b, scope, 3, 0)).toEqual(range([2, 0], [4, 0], scope.clip, scope.excluded));
  expect(wordAt(b, scope, 6, 0)).toEqual(range([6, 0], [7, 0], scope.clip, scope.excluded));
  expect(wordAt(b, scope, 5, 0)).toBeNull();          // the excluded cell itself
});

test('lineAt: the row, extended over the rows a soft wrap joins to it', () => {
  const b = bufferOf(['aaa bbb', 'ccc ddd', 'eee']);
  b.markContinuation({ y: 0, x0: 0, x1: 7, join: ' ' });   // row 0 wraps into row 1
  const scope = { clip: { left: 0, top: 0, width: 7, height: 3 }, excluded: [] };
  expect(lineAt(b, scope, 5, 1)).toEqual(range([0, 0], [6, 1], scope.clip));
  expect(lineAt(b, scope, 1, 2)).toEqual(range([0, 2], [6, 2], scope.clip));
  expect(selectionText(b, lineAt(b, scope, 5, 1)!)).toBe('aaa bbb ccc ddd');
});
```

(`range` is the spec's helper; `bufferOf` too.) And through render, in `selection.spec.tsx` (inside the existing `describe`, using its `Listening`, `inverseCells` helpers):

```ts
  test('a double-click selects the word under the pointer and copies it', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(createElement(Listening, null, createElement(Text, null, 'hello world')), backend, { onCopy });
    await flushAsync(backend);
    backend.mouse('down', 7, 0, { clicks: 2 });
    backend.mouse('up', 7, 0);
    await flush();
    expect(inverseCells(backend)).toEqual(['6,0', '7,0', '8,0', '9,0', '10,0']);
    expect(onCopy).toHaveBeenCalledWith({ text: 'world', delivered: true, source: 'selection' });
  });

  test('a triple-click on a wrapped paragraph copies it as one line', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(8, 3);
    await render(createElement(Listening, null, createElement(Box, { width: 8 }, createElement(Text, { wrap: 'wrap' }, 'aaa bbb ccc ddd'))), backend, { onCopy });
    await flushAsync(backend);
    backend.mouse('down', 1, 1, { clicks: 3 });
    backend.mouse('up', 1, 1);
    await flush();
    expect(onCopy).toHaveBeenCalledWith({ text: 'aaa bbb ccc ddd', delivered: true, source: 'selection' });
  });

  test('a double-click straddling a selectable={false} gutter stops at it', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    await render(
      createElement(Listening, null,
        createElement(Box, { flexDirection: 'row' },
          createElement(Text, null, 'abc'),
          createElement(Text, { selectable: false }, '│'),
          createElement(Text, null, 'def'))),
      backend, { onCopy },
    );
    await flushAsync(backend);
    backend.mouse('down', 5, 0, { clicks: 2 });
    backend.mouse('up', 5, 0);
    await flush();
    expect(onCopy).toHaveBeenCalledWith({ text: 'def', delivered: true, source: 'selection' });
  });

  test('a single press after a double-click drops the word', async () => {
    const backend = new TestBackend(12, 1);
    await render(createElement(Listening, null, createElement(Text, null, 'hello world')), backend);
    await flushAsync(backend);
    backend.mouse('down', 7, 0, { clicks: 2 }); backend.mouse('up', 7, 0);
    await flush();
    expect(inverseCells(backend)).toHaveLength(5);
    backend.mouse('down', 1, 0); backend.mouse('up', 1, 0);
    await flush();
    expect(inverseCells(backend)).toEqual([]);
  });
```

- [ ] **Step 2: Run** — expected: FAIL (`wordAt` not exported; double-click selects nothing).

- [ ] **Step 3: Implement** — in `selection.ts`, after `selectionSegments`:

```ts
// The selectable parts of one full row of the scope: the clip's width with
// the excluded rects taken out — what a word or a line is bounded by.
function rowParts(scope: SelectionScope, y: number): SelectionSegment[] {
  const { clip } = scope;
  if (y < clip.top || y >= clip.top + clip.height) return [];
  const [row] = selectionRows({ anchor: { x: clip.left, y }, head: { x: clip.left + clip.width - 1, y }, clip, excluded: scope.excluded });
  return row ? [...row.parts] : [];
}

/**
 * The word under a cell: the run of non-space cells around it on that row,
 * bounded by the scope's clip and its excluded regions — the range a
 * double-click selects. Null on a blank cell, and on a cell nothing selectable
 * covers. Punctuation counts as word characters.
 * See docs/input.md (selection).
 */
export function wordAt(buffer: Buffer, scope: SelectionScope, x: number, y: number): SelectionRange | null {
  const part = rowParts(scope, y).find((p) => x >= p.x0 && x < p.x1);
  if (part === undefined || buffer.get(x, y).char === ' ') return null;
  let x0 = x;
  while (x0 > part.x0 && buffer.get(x0 - 1, y).char !== ' ') x0--;
  let x1 = x;
  while (x1 + 1 < part.x1 && buffer.get(x1 + 1, y).char !== ' ') x1++;
  return { anchor: { x: x0, y }, head: { x: x1, y }, clip: scope.clip, excluded: scope.excluded };
}

/**
 * The line under a cell: the whole row within the scope, extended up and down
 * over the rows a soft wrap joins to it (see {@link rowContinuation}), so a
 * wrapped paragraph is one line — the range a triple-click selects. Null on a
 * row nothing selectable covers. See docs/input.md (selection).
 */
export function lineAt(buffer: Buffer, scope: SelectionScope, x: number, y: number): SelectionRange | null {
  const { clip } = scope;
  const rowAt = (row: number): SelectionRow | null => {
    const parts = rowParts(scope, row);
    return parts.length === 0 ? null : { y: row, parts };
  };
  if (rowAt(y) === null || x < clip.left || x >= clip.left + clip.width) return null;
  let top = y;
  for (;;) {
    const above = rowAt(top - 1);
    if (above === null || rowContinuation(buffer, above, rowAt(top)!) === null) break;
    top--;
  }
  let bottom = y;
  for (;;) {
    const below = rowAt(bottom + 1);
    if (below === null || rowContinuation(buffer, rowAt(bottom)!, below) === null) break;
    bottom++;
  }
  return {
    anchor: { x: clip.left, y: top },
    head: { x: clip.left + clip.width - 1, y: bottom },
    clip, excluded: scope.excluded,
  };
}
```

Controller — `press` becomes:

```ts
  private press(key: Key): void {
    this.drop(); // a new press always starts from nothing
    if (key.button !== undefined && key.button !== 'left') return;
    if (key.x === undefined || key.y === undefined) return;
    const scope = this.scopeAt(key.x, key.y);
    if (scope === null) return;
    // A double-click takes the word and a triple-click the line: the selection
    // is complete on the press, and the release that follows has nothing to do.
    if (key.clicks === 2 || key.clicks === 3) {
      const frame = this.host.frame()!;
      const range = key.clicks === 2 ? wordAt(frame, scope, key.x, key.y) : lineAt(frame, scope, key.x, key.y);
      this.apply(range);
      return;
    }
    // The press may have landed on the scope's own border or padding; the
    // anchor belongs inside its content rect either way.
    const anchor = clampToRect({ x: key.x, y: key.y }, scope.clip);
    this.range = { anchor, head: anchor, clip: scope.clip, excluded: scope.excluded };
    this.dragging = true;
  }

  // The scope a press at (x, y) selects within, or null with no frame yet.
  private scopeAt(x: number, y: number): SelectionScope | null {
    const frame = this.host.frame();
    if (frame === null) return null;
    return selectionScopeAt(this.host.container, x, y, { left: 0, top: 0, width: frame.width, height: frame.height });
  }

  // Show `range` as the finished selection and report its text; null (or a
  // range over nothing) shows and reports nothing. Returns the text.
  private apply(range: SelectionRange | null): string {
    this.dragging = false;
    this.range = range;
    this.recompute();
    if (this.cached.length === 0) { this.range = null; return ''; }
    this.host.present();
    const frame = this.host.frame();
    const text = frame === null ? '' : selectionText(frame, range!);
    this.host.onSelect?.(text);
    return text;
  }
```

(`release()` is unchanged: `dragging` is false after a double-click, so it returns.) Export `wordAt`, `lineAt` from `host/index.ts` next to the other selection exports.

- [ ] **Step 4: Run** — `npx vitest run packages/core packages/react` — expected: PASS.

---

### Task 3: selection from code — `select`, `selectWord`, `selectLine`, `clearSelection`

**Files:**
- Modify: `packages/core/src/host/selection.ts` (public methods on the controller)
- Modify: `packages/react/src/context/appContext.ts`, `packages/react/src/hooks/useApp.ts`, `packages/react/src/internal/render.ts`
- Test: `packages/react/src/internal/selection.spec.tsx`

**Interfaces:**
- Produces on `SelectionController`: `select(anchor: Point, head: Point): string`, `selectWord(x, y): string`, `selectLine(x, y): string` (each returns the text, `''` when nothing), plus the existing `clear()`.
- Produces on `AppApi` and `RenderHandle`: `select(anchor: Point, head: Point): string`, `selectWord(x: number, y: number): string`, `selectLine(x: number, y: number): string`, `clearSelection(): void`. `Point` is re-exported from `@flowtty/react` (it comes from `@flowtty/core/host`; re-export the type from core's `index.ts` too if it is not there yet).

- [ ] **Step 1: Failing tests** — in `selection.spec.tsx`:

```ts
  test('select(anchor, head) from code highlights the range and copies with source api', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 1);
    const app = await render(createElement(Listening, null, createElement(Text, null, 'hello world')), backend, { onCopy });
    await flushAsync(backend);
    expect(app.select({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe('hello');
    await flush();
    expect(inverseCells(backend)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
    expect(onCopy).toHaveBeenCalledWith({ text: 'hello', delivered: true, source: 'api' });
    app.clearSelection();
    await flush();
    expect(inverseCells(backend)).toEqual([]);
  });

  test('selectWord / selectLine from useApp follow the click rules; nothing selectable gives an empty string', async () => {
    const onCopy = vi.fn();
    const backend = new TestBackend(12, 2);
    let api!: ReturnType<typeof useApp>;
    function Probe() { api = useApp(); return null; }
    await render(
      createElement(Listening, null, createElement(Probe), createElement(Text, null, 'hello world')),
      backend, { onCopy },
    );
    await flushAsync(backend);
    expect(api.selectWord(7, 0)).toBe('world');
    expect(api.selectLine(2, 0)).toBe('hello world');
    expect(api.selectWord(5, 0)).toBe('');   // a blank cell
    expect(api.selectWord(0, 1)).toBe('');   // an empty row
    expect(onCopy).toHaveBeenCalledTimes(2);
  });

  test('with selection: false the code API is inert', async () => {
    const backend = new TestBackend(12, 1);
    const app = await render(createElement(Listening, null, createElement(Text, null, 'hello')), backend, { selection: false });
    await flushAsync(backend);
    expect(app.select({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe('');
    await flush();
    expect(inverseCells(backend)).toEqual([]);
  });
```

- [ ] **Step 2: Run** — expected: FAIL (`app.select is not a function`).

- [ ] **Step 3: Implement**

Controller, public, after `clear()`:

```ts
  /** Select from `anchor` to `head` (frame cells, both inclusive) the way a
   *  drag between them would, within the anchor's scope, and report the text
   *  through `onSelect`. Returns the text; `''` when nothing there is
   *  selectable. See docs/app.md (selecting from code). */
  select(anchor: Point, head: Point): string {
    this.drop();
    const scope = this.scopeAt(anchor.x, anchor.y);
    if (scope === null) return '';
    return this.apply({
      anchor: clampToRect(anchor, scope.clip), head: clampToRect(head, scope.clip),
      clip: scope.clip, excluded: scope.excluded,
    });
  }

  /** Select the word under a cell — the double-click rule. */
  selectWord(x: number, y: number): string {
    this.drop();
    const scope = this.scopeAt(x, y);
    return scope === null ? '' : this.apply(wordAt(this.host.frame()!, scope, x, y));
  }

  /** Select the line under a cell, a wrapped paragraph as one — the triple-click rule. */
  selectLine(x: number, y: number): string {
    this.drop();
    const scope = this.scopeAt(x, y);
    return scope === null ? '' : this.apply(lineAt(this.host.frame()!, scope, x, y));
  }
```

`render.ts`: the selection host's `onSelect` sets `pendingCopy`, which is delivered after the key dispatch — for the code API there is no key, so deliver right away with `source: 'api'`. Add a `let selectSource: 'selection' | 'api' = 'selection';` next to `pendingCopy`; `deliverCopy` uses `source: selectSource`. The four functions:

```ts
  // Selection from code: the same controller a drag drives, told the source is
  // the app. Delivered at once — there is no key dispatch to wait for — and
  // through the same overlay path (`flushOverlay`), so a call from a key
  // handler still paints once.
  const selectFrom = (make: () => string): string => {
    if (unmounted || selection === null) return '';
    selectSource = 'api';
    try {
      const text = make();
      flushOverlay();
      deliverCopy();
      return text;
    } finally {
      selectSource = 'selection';
    }
  };
  const select = (anchor: Point, head: Point): string => selectFrom(() => selection!.select(anchor, head));
  const selectWord = (x: number, y: number): string => selectFrom(() => selection!.selectWord(x, y));
  const selectLine = (x: number, y: number): string => selectFrom(() => selection!.selectLine(x, y));
  const clearSelection = (): void => {
    if (unmounted || selection === null) return;
    selection.clear();
    overlayStale = true;
    flushOverlay();
  };
```

Careful with `drop()`: it calls `host.present()` which sets `overlayStale = true`; `flushOverlay` queues the redraw. `clearSelection` must present too — `clear()` does not (it is the resize path), hence the explicit `overlayStale = true`.

`AppApi` (with doc comments citing docs/app.md (selecting from code)) and the default context (`select: () => ''`, `selectWord: () => ''`, `selectLine: () => ''`, `clearSelection: () => {}`); `RenderHandle` the same four; both `appApi` and `handle` objects get them. `useApp.ts` doc: one clause. Export `type Point` from `@flowtty/react`'s index if `Point` is not already on the public surface (check `packages/react/src/index.ts`; `SelectionRange`/`Point` may already be re-exported).

- [ ] **Step 4: Run** — `npm test && npm run typecheck` — expected: PASS.

---

### Task 4: docs and changelog

- [ ] `docs/input.md` (selection), after the "Scopes" paragraph: a **Double- and triple-click.** paragraph — the word (run of non-space cells, punctuation included, stopped by the scope and by `selectable={false}`), the line (the row, a soft-wrapped paragraph as one, via the continuation marks), that the selection is made on the press and the release does nothing, that a drag after a double-click does not extend it (yet), that the TTY backend counts presses within 500 ms on the same cell (`Key.clicks`), and that a custom backend that sets nothing gets single clicks.
- [ ] `docs/app.md`: a section **Selecting from code** after "The clipboard": the four calls, frame cells (a component has its rect from `onLayout`), same rules as a drag, `onCopy` with `source: 'api'`, return value, `selection: false` makes them inert.
- [ ] `docs/testing.md`: `mouse()` options gain `clicks` ("`{ clicks: 2 }` on a `'down'` is a double-click; the TTY backend counts them for you"); one line that `handle.select(…)` works against a `TestBackend` too.
- [ ] `CHANGELOG.md` Unreleased / Added: two bullets (double / triple click; selection from code) and `Key.clicks`.
- [ ] Run `npm test && npm run typecheck`.

---

## Self-review

- #36: counting (T1), ranges and rules (T2), tests from the issue (T2), docs (T4). Out: drag-extension by words.
- #40: the four calls on `useApp()` and the handle, `source: 'api'`, return text, inert with `selection: false` (T3), docs (T4). Out: the `<Box ref>` form.
- Names: `clicks`, `createClickCounter`, `DOUBLE_CLICK_MS`, `wordAt`, `lineAt`, `select` / `selectWord` / `selectLine` / `clearSelection`, `apply`, `scopeAt` — consistent.
