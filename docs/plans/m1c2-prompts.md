# flowtty M1c.2 — Prompts (Select / MultiSelect / Confirm) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship three standalone prompt components — `<Select>` (single choice with arrow nav + filter-as-you-type), `<MultiSelect>` (Space-toggle multi-choice), and `<Confirm>` (yes/no with default) — built on the M1a `useInput` layer and using M1d styling for selection highlighting (inverse cursor row). Each is usable on its own end-to-end: render it on the test backend or a real TTY, drive keys, receive a value via `onSubmit` (or `onCancel` for Esc).

**Architecture:** Same shape as `<TextInput>` — a **pure reducer** per stateful prompt (Select: `{cursor, filter}`; MultiSelect: `{cursor}`) plus a **thin React component** that holds the reducer state via `useState`, subscribes via `useInput`, and renders `<Box>`/`<Text>` rows with M1d styling. `<Confirm>` is small enough to skip the reducer split — the key→action logic lives directly in the component. The cursor row uses `<Text inverse>` (already supported as of M1d) for highlight; checkbox marks (`[x]`/`[ ]`) and an `▸`/`  ` cursor prefix are literal characters.

**Tech Stack:** Same as M1d — TypeScript ESM, React 19, `react-reconciler@0.31.0`, `yoga-layout@3.2.1`, Vitest 4.

**Out of scope** (later milestones): the `+ add new` inline-dialog row on MultiSelect (needs M1c.3's embedded `openDialog` pattern); intra-form focus ring + `<Form>` composition layer (M1c.3); fuzzy filter matching (Select uses case-insensitive substring); generic value types (the prompts are typed `<T>` but tests use strings — exercising with non-string values is a follow-up); validate prop on Select/MultiSelect (consumer can guard `onSubmit` themselves).

---

## Scope check

This is the second of three M1c-scope plans:

- **M1c (merged):** TTY input layer (parser + `TtyBackend.onKey` + real-terminal acceptance).
- **M1c.2 (this plan):** `<Select>` / `<MultiSelect>` / `<Confirm>` prompts.
- **M1c.3 (next):** intra-form focus ring + `<Form>` + `<Form.Field>` + embedded `openDialog` (which then powers MultiSelect's `+ add new`).

Each plan ships working, testable software on its own. M1c.2's acceptance is a real terminal demo where you can pick from a Select, toggle items in a MultiSelect, and answer a Confirm — each component standalone.

---

## File Structure

```
src/
  select-reducer.ts            # NEW — pure: cursor + filter actions
  select-reducer.test.ts       # NEW — exhaustive reducer cases
  select.ts                    # NEW — React component (useInput + render)
  select.test.ts               # NEW — integration tests (mount, type filter, arrow, submit)

  multi-select-reducer.ts      # NEW — pure: cursor + selected-set toggle
  multi-select-reducer.test.ts # NEW
  multi-select.ts              # NEW — React component
  multi-select.test.ts         # NEW

  confirm.ts                   # NEW — React component (inline key handling; no reducer split)
  confirm.test.ts              # NEW

  index.ts                     # MODIFY — export Select/MultiSelect/Confirm + their Props types
  README.md                    # MODIFY — M1c.2 status + usage examples
scratch/                       # gitignored — local manual-smoke scratch, not committed
  pick.ts                      # runnable demo: pick from Select on real TTY
```

Responsibilities:
- **`select-reducer.ts` / `multi-select-reducer.ts`** are pure: no React, no I/O. Each takes `(items, state, key)` and returns an action (state change, submit-with-value, cancel, noop). Easy to unit-test thoroughly.
- **`select.ts` / `multi-select.ts` / `confirm.ts`** are thin React shells; rendering happens here, key dispatch via `useInput`.
- Cursor highlight uses `<Text inverse>` (M1d-supported) — no new styling infrastructure needed.

---

### Task 1: Select reducer — pure cursor + filter logic

**Files:**
- Create: `src/select-reducer.ts`
- Create: `src/select-reducer.test.ts`

The reducer treats the cursor as an index into the **visible** (filtered) item list, not the original. On submit, it returns the **original index** of the visible item at the cursor so the component knows which item to fire `onSubmit` with.

- [ ] **Step 1: Write the failing test `src/select-reducer.test.ts`:**
```ts
import { expect, test } from 'vitest';
import { reduce, visibleIndices, type SelectState } from './select-reducer.js';
import type { Key } from './keys.js';

function key(partial: Partial<Key> & { name: string }): Key {
  return { sequence: '', ctrl: false, meta: false, shift: false, ...partial };
}

const labels = (items: string[]) => items.map((label, i) => ({ label, value: i }));

test('visibleIndices: empty filter returns all items', () => {
  expect(visibleIndices(labels(['a', 'b', 'c']), '')).toEqual([0, 1, 2]);
});

test('visibleIndices: substring match (case-insensitive)', () => {
  expect(visibleIndices(labels(['Apple', 'banana', 'cherry']), 'an')).toEqual([1]);
  expect(visibleIndices(labels(['Apple', 'banana', 'cherry']), 'A')).toEqual([0, 1]);
});

test('down arrow advances cursor within visible items', () => {
  const items = labels(['a', 'b', 'c']);
  const s: SelectState = { cursor: 0, filter: '' };
  expect(reduce(items, s, key({ name: 'down' }))).toEqual({ kind: 'state', state: { cursor: 1, filter: '' } });
});

test('down arrow wraps from last to first', () => {
  const items = labels(['a', 'b', 'c']);
  expect(reduce(items, { cursor: 2, filter: '' }, key({ name: 'down' }))).toEqual({
    kind: 'state', state: { cursor: 0, filter: '' },
  });
});

test('up arrow goes back; wraps from first to last', () => {
  const items = labels(['a', 'b', 'c']);
  expect(reduce(items, { cursor: 1, filter: '' }, key({ name: 'up' }))).toEqual({
    kind: 'state', state: { cursor: 0, filter: '' },
  });
  expect(reduce(items, { cursor: 0, filter: '' }, key({ name: 'up' }))).toEqual({
    kind: 'state', state: { cursor: 2, filter: '' },
  });
});

test('printable char appends to filter and resets cursor to 0', () => {
  const items = labels(['apple', 'banana', 'cherry']);
  expect(reduce(items, { cursor: 2, filter: '' }, key({ name: 'b', sequence: 'b' }))).toEqual({
    kind: 'state', state: { cursor: 0, filter: 'b' },
  });
});

test('backspace removes last filter char and resets cursor', () => {
  const items = labels(['a', 'b']);
  expect(reduce(items, { cursor: 1, filter: 'xy' }, key({ name: 'backspace' }))).toEqual({
    kind: 'state', state: { cursor: 0, filter: 'x' },
  });
  // Backspace on empty filter is noop
  expect(reduce(items, { cursor: 0, filter: '' }, key({ name: 'backspace' }))).toEqual({ kind: 'noop' });
});

test('enter submits the ORIGINAL index of the visible item at the cursor', () => {
  const items = labels(['apple', 'banana', 'cherry']);
  // Filter 'an' → visible [banana] (original index 1); cursor 0 there.
  expect(reduce(items, { cursor: 0, filter: 'an' }, key({ name: 'return' }))).toEqual({
    kind: 'submit', index: 1,
  });
});

test('enter on empty visible list is noop (no item to submit)', () => {
  const items = labels(['apple', 'banana']);
  expect(reduce(items, { cursor: 0, filter: 'xyz' }, key({ name: 'return' }))).toEqual({ kind: 'noop' });
});

test('escape cancels', () => {
  const items = labels(['a']);
  expect(reduce(items, { cursor: 0, filter: '' }, key({ name: 'escape' }))).toEqual({ kind: 'cancel' });
});

test('cursor clamps to visible range when filter narrows the list', () => {
  // cursor was 2 (third item); filter narrows to one item → cursor must clamp to 0
  const items = labels(['apple', 'banana', 'cherry']);
  // Type 'b' from cursor=2: visibleIndices('b') = [1] (banana); reducer should reset cursor to 0
  expect(reduce(items, { cursor: 2, filter: '' }, key({ name: 'b', sequence: 'b' }))).toEqual({
    kind: 'state', state: { cursor: 0, filter: 'b' },
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/select-reducer.test.ts`.

- [ ] **Step 3: Write `src/select-reducer.ts`:**
```ts
import type { Key } from './keys.js';

export interface SelectItem<T> {
  label: string;
  value: T;
}

export interface SelectState {
  cursor: number;  // index into the visible (filtered) list
  filter: string;
}

export type SelectAction =
  | { kind: 'state'; state: SelectState }
  | { kind: 'submit'; index: number }  // index into the ORIGINAL items array
  | { kind: 'cancel' }
  | { kind: 'noop' };

/**
 * Indices into `items` of the items whose label contains `filter` (case-insensitive
 * substring). Empty filter → all indices.
 */
export function visibleIndices<T>(items: SelectItem<T>[], filter: string): number[] {
  if (filter === '') return items.map((_, i) => i);
  const q = filter.toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.label.toLowerCase().includes(q)) out.push(i);
  }
  return out;
}

export function reduce<T>(items: SelectItem<T>[], state: SelectState, key: Key): SelectAction {
  const visible = visibleIndices(items, state.filter);
  const n = visible.length;

  if (key.name === 'escape') return { kind: 'cancel' };

  if (key.name === 'return' || key.name === 'enter') {
    if (n === 0) return { kind: 'noop' };
    const cursor = Math.min(state.cursor, n - 1);
    return { kind: 'submit', index: visible[cursor]! };
  }

  if (key.name === 'down' || (key.name === 'j' && !key.ctrl && !key.meta)) {
    if (n === 0) return { kind: 'noop' };
    return { kind: 'state', state: { cursor: (state.cursor + 1) % n, filter: state.filter } };
  }
  if (key.name === 'up' || (key.name === 'k' && !key.ctrl && !key.meta)) {
    if (n === 0) return { kind: 'noop' };
    return { kind: 'state', state: { cursor: (state.cursor - 1 + n) % n, filter: state.filter } };
  }

  if (key.name === 'backspace') {
    if (state.filter === '') return { kind: 'noop' };
    return { kind: 'state', state: { cursor: 0, filter: state.filter.slice(0, -1) } };
  }

  // Printable single-char (no ctrl/meta) appends to filter; cursor resets to 0
  // so the user always sees the first match after typing.
  if (!key.ctrl && !key.meta && key.name.length === 1) {
    // Skip the j/k vim-nav keys when in filter mode? Decision: don't — typing
    // 'j' is rare enough that the down-arrow + j-binding overlap is acceptable.
    // If this gets annoying, we can make j/k cursor-nav only when filter==='' later.
    return { kind: 'state', state: { cursor: 0, filter: state.filter + key.name } };
  }

  return { kind: 'noop' };
}
```

**Note on the j/k overlap:** the reducer accepts `j`/`k` as down/up bindings (vim-style), but printable insertion ALSO catches them. The down/up branches run first (so `j`/`k` move cursor instead of filtering). Trade-off: you can't filter for "javascript" by typing `j` — you'd hit cursor-down. Acceptable for M1c.2; revisit if it becomes friction (e.g., make j/k arrow-bindings only when filter is empty).

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/select-reducer.test.ts` → all 11 pass. Full suite green. Typecheck clean.

- [ ] **Step 5: Commit**
```bash
git add src/select-reducer.ts src/select-reducer.test.ts
git commit -m "feat: Select reducer — cursor nav + filter-as-you-type + submit/cancel"
```

---

### Task 2: `<Select>` React component

**Files:**
- Create: `src/select.ts`
- Create: `src/select.test.ts`

- [ ] **Step 1: Write the failing test `src/select.test.ts`:**
```ts
import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { Select } from './select.js';

test('Select renders items with a cursor row marker', async () => {
  function App() {
    return createElement(Select, {
      items: [
        { label: 'apple', value: 'a' },
        { label: 'banana', value: 'b' },
      ],
      value: 'a',
      onChange: () => {},
      onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  // Default cursor 0 → first row marked with '▸', second with '  '
  expect(backend.lastFrame).toBe('▸ apple\n  banana');
});

test('down arrow moves cursor', async () => {
  function App() {
    return createElement(Select, {
      items: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }],
      value: 'a', onChange: () => {}, onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });
  await flush();
  expect(backend.lastFrame).toBe('  a\n▸ b');
});

test('typing filters and re-renders only matching items + filter row', async () => {
  function App() {
    return createElement(Select, {
      items: [
        { label: 'apple', value: 'a' },
        { label: 'banana', value: 'b' },
        { label: 'cherry', value: 'c' },
      ],
      value: 'a', onChange: () => {}, onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 4);
  await render(createElement(App), backend);
  backend.type('an');
  await flush();
  // Visible: only 'banana'; filter row at top
  expect(backend.lastFrame).toBe('filter: an\n▸ banana');
});

test('enter calls onSubmit with the highlighted value', async () => {
  const submitted: string[] = [];
  function App() {
    return createElement(Select, {
      items: [{ label: 'a', value: 'A' }, { label: 'b', value: 'B' }],
      value: 'A', onChange: () => {}, onSubmit: (v: string) => submitted.push(v),
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.press({ name: 'down' }); // cursor → 'b'
  await flush();
  backend.press({ name: 'return' });
  await flush();
  expect(submitted).toEqual(['B']);
});

test('esc calls onCancel', async () => {
  let cancelled = false;
  function App() {
    return createElement(Select, {
      items: [{ label: 'a', value: 'A' }],
      value: 'A', onChange: () => {}, onSubmit: () => {}, onCancel: () => { cancelled = true; },
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: 'escape' });
  await flush();
  expect(cancelled).toBe(true);
});

test('isFocused=false suppresses key handling', async () => {
  function App() {
    return createElement(Select, {
      items: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }],
      value: 'a', onChange: () => {}, onSubmit: () => {}, isFocused: false,
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });
  await flush();
  // Cursor didn't move (isFocused=false)
  expect(backend.lastFrame).toBe('▸ a\n  b');
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Write `src/select.ts`:**
```ts
import { createElement, useState, type ReactNode } from 'react';
import { Box, Text } from './components.js';
import { useInput } from './use-input.js';
import { reduce, visibleIndices, type SelectItem, type SelectState } from './select-reducer.js';

export interface SelectProps<T> {
  items: SelectItem<T>[];
  /** Currently-highlighted value (controlled). Consumers can ignore changes if they only care about submit. */
  value: T;
  /** Called whenever the highlight moves (arrow nav OR filter narrows the list). */
  onChange: (value: T) => void;
  /** Called on Enter with the highlighted value. */
  onSubmit: (value: T) => void;
  /** Called on Escape. */
  onCancel?: () => void;
  /** When false, the component does not handle keys. Default true. */
  isFocused?: boolean;
}

export function Select<T>(props: SelectProps<T>): ReactNode {
  const { items, value, onChange, onSubmit, onCancel, isFocused = true } = props;

  // Initial cursor: position of the controlled value in the (unfiltered) item list.
  const initialCursor = Math.max(0, items.findIndex((it) => it.value === value));
  const [state, setState] = useState<SelectState>({ cursor: initialCursor, filter: '' });

  useInput((key) => {
    const action = reduce(items, state, key);
    if (action.kind === 'state') {
      setState(action.state);
      const newVisible = visibleIndices(items, action.state.filter);
      const newCursor = Math.min(action.state.cursor, Math.max(0, newVisible.length - 1));
      const newItem = newVisible.length > 0 ? items[newVisible[newCursor]!]! : undefined;
      if (newItem !== undefined && newItem.value !== value) onChange(newItem.value);
    } else if (action.kind === 'submit') {
      onSubmit(items[action.index]!.value);
    } else if (action.kind === 'cancel') {
      onCancel?.();
    }
  }, { isActive: isFocused });

  const visible = visibleIndices(items, state.filter);
  const cursorClamped = Math.min(state.cursor, Math.max(0, visible.length - 1));

  return createElement(Box, null,
    state.filter !== '' && createElement(Text, null, `filter: ${state.filter}`),
    ...visible.map((origIdx, row) =>
      createElement(Text, { key: origIdx },
        (row === cursorClamped ? '▸ ' : '  ') + items[origIdx]!.label,
      ),
    ),
  );
}
```

**Note on render shape:** `createElement(Box, null, ...children)` accepts a heterogeneous children list including `false` / `null` (React skips them). The optional filter row only renders when `state.filter !== ''`.

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/select.test.ts`. Full suite green. Typecheck clean.

   If the filter-narrows test shows `'  banana'` instead of `'▸ banana'` (cursor not at 0): the reducer reset cursor to 0 in the printable-insertion branch — verify, then check the render uses `cursorClamped` (which clamps to 0 when visible.length is 1).

- [ ] **Step 5: Commit**
```bash
git add src/select.ts src/select.test.ts
git commit -m "feat: <Select> component — arrow nav + filter-as-you-type + submit/cancel"
```

---

### Task 3: MultiSelect reducer — pure cursor + selected-set toggle

**Files:**
- Create: `src/multi-select-reducer.ts`
- Create: `src/multi-select-reducer.test.ts`

The reducer holds only the cursor; the selected set is controlled (passed in as `value: T[]`). Space toggles the cursor item in the selected set and signals it via a `'toggle'` action; the component reconciles with `value`.

- [ ] **Step 1: Write the failing test `src/multi-select-reducer.test.ts`:**
```ts
import { expect, test } from 'vitest';
import { reduce, type MultiSelectState } from './multi-select-reducer.js';
import type { Key } from './keys.js';

function key(partial: Partial<Key> & { name: string }): Key {
  return { sequence: '', ctrl: false, meta: false, shift: false, ...partial };
}

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `i${i}`, value: i }));

test('down/up moves cursor with wrap', () => {
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'down' }))).toEqual({ kind: 'state', state: { cursor: 1 } });
  expect(reduce(items(3), { cursor: 2 }, key({ name: 'down' }))).toEqual({ kind: 'state', state: { cursor: 0 } });
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'up' }))).toEqual({ kind: 'state', state: { cursor: 2 } });
});

test('space toggles the cursor item', () => {
  expect(reduce(items(3), { cursor: 1 }, key({ name: ' ', sequence: ' ' }))).toEqual({
    kind: 'toggle', index: 1,
  });
});

test('enter submits', () => {
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'return' }))).toEqual({ kind: 'submit' });
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'enter' }))).toEqual({ kind: 'submit' });
});

test('escape cancels', () => {
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'escape' }))).toEqual({ kind: 'cancel' });
});

test('empty items list: up/down are noop, submit still fires', () => {
  expect(reduce(items(0), { cursor: 0 }, key({ name: 'down' }))).toEqual({ kind: 'noop' });
  expect(reduce(items(0), { cursor: 0 }, key({ name: 'return' }))).toEqual({ kind: 'submit' });
});

test('unhandled key is noop', () => {
  expect(reduce(items(3), { cursor: 0 }, key({ name: 'a' }))).toEqual({ kind: 'noop' });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Write `src/multi-select-reducer.ts`:**
```ts
import type { Key } from './keys.js';
import type { SelectItem } from './select-reducer.js';

export interface MultiSelectState {
  cursor: number;
}

export type MultiSelectAction =
  | { kind: 'state'; state: MultiSelectState }
  | { kind: 'toggle'; index: number }
  | { kind: 'submit' }
  | { kind: 'cancel' }
  | { kind: 'noop' };

export function reduce<T>(items: SelectItem<T>[], state: MultiSelectState, key: Key): MultiSelectAction {
  const n = items.length;

  if (key.name === 'escape') return { kind: 'cancel' };
  if (key.name === 'return' || key.name === 'enter') return { kind: 'submit' };

  if (n === 0) return { kind: 'noop' };

  if (key.name === 'down' || (key.name === 'j' && !key.ctrl && !key.meta)) {
    return { kind: 'state', state: { cursor: (state.cursor + 1) % n } };
  }
  if (key.name === 'up' || (key.name === 'k' && !key.ctrl && !key.meta)) {
    return { kind: 'state', state: { cursor: (state.cursor - 1 + n) % n } };
  }

  if (key.name === ' ') {
    return { kind: 'toggle', index: state.cursor };
  }

  return { kind: 'noop' };
}
```

- [ ] **Step 4: Verify** — 6 reducer tests pass; full suite green; typecheck clean.

- [ ] **Step 5: Commit**
```bash
git add src/multi-select-reducer.ts src/multi-select-reducer.test.ts
git commit -m "feat: MultiSelect reducer — cursor nav + Space toggle + submit/cancel"
```

---

### Task 4: `<MultiSelect>` React component

**Files:**
- Create: `src/multi-select.ts`
- Create: `src/multi-select.test.ts`

- [ ] **Step 1: Write the failing test `src/multi-select.test.ts`:**
```ts
import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { MultiSelect } from './multi-select.js';

test('renders all items with [ ] or [x] + cursor marker', async () => {
  function App() {
    return createElement(MultiSelect, {
      items: [
        { label: 'a', value: 'a' },
        { label: 'b', value: 'b' },
        { label: 'c', value: 'c' },
      ],
      value: ['b'],
      onChange: () => {},
      onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  // Cursor 0; 'b' is preselected
  expect(backend.lastFrame).toBe('▸ [ ] a\n  [x] b\n  [ ] c');
});

test('space toggles cursor item (onChange fires with updated array)', async () => {
  const captured: string[][] = [];
  function App() {
    const [v, setV] = useState<string[]>([]);
    captured.push(v);
    return createElement(MultiSelect, {
      items: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }],
      value: v, onChange: setV, onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: ' ' });
  await flush();
  expect(captured[captured.length - 1]).toEqual(['a']);
  backend.press({ name: 'down' });
  await flush();
  backend.press({ name: ' ' });
  await flush();
  expect(captured[captured.length - 1]).toEqual(['a', 'b']);
  backend.press({ name: 'up' });
  await flush();
  backend.press({ name: ' ' });
  await flush();
  expect(captured[captured.length - 1]).toEqual(['b']);
});

test('enter submits the current value array (in original item order)', async () => {
  const submitted: string[][] = [];
  function App() {
    const [v, setV] = useState<string[]>(['b']);
    return createElement(MultiSelect, {
      items: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }, { label: 'c', value: 'c' }],
      value: v, onChange: setV, onSubmit: (arr: string[]) => submitted.push(arr),
    });
  }
  const backend = new TestBackend(20, 3);
  await render(createElement(App), backend);
  backend.press({ name: ' ' }); // toggle a on
  await flush();
  backend.press({ name: 'return' });
  await flush();
  expect(submitted).toEqual([['a', 'b']]);
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Write `src/multi-select.ts`:**
```ts
import { createElement, useState, type ReactNode } from 'react';
import { Box, Text } from './components.js';
import { useInput } from './use-input.js';
import { reduce, type MultiSelectState } from './multi-select-reducer.js';
import type { SelectItem } from './select-reducer.js';

export interface MultiSelectProps<T> {
  items: SelectItem<T>[];
  /** Currently-selected values (controlled). */
  value: T[];
  /** Called whenever the selected set changes (Space toggle). */
  onChange: (value: T[]) => void;
  /** Called on Enter with the current value array (in original item order). */
  onSubmit: (value: T[]) => void;
  onCancel?: () => void;
  isFocused?: boolean;
}

export function MultiSelect<T>(props: MultiSelectProps<T>): ReactNode {
  const { items, value, onChange, onSubmit, onCancel, isFocused = true } = props;
  const [state, setState] = useState<MultiSelectState>({ cursor: 0 });
  const cursor = Math.max(0, Math.min(state.cursor, items.length - 1));

  useInput((key) => {
    const action = reduce(items, { cursor }, key);
    if (action.kind === 'state') {
      setState(action.state);
    } else if (action.kind === 'toggle') {
      const toggled = items[action.index]!.value;
      const next = value.includes(toggled)
        ? value.filter((v) => v !== toggled)
        : // Insert in original item order so onSubmit always sees deterministic order:
          items.filter((it) => value.includes(it.value) || it.value === toggled).map((it) => it.value);
      onChange(next);
    } else if (action.kind === 'submit') {
      // Re-derive in original item order (defensive — value might have been
      // mutated externally to not match item order).
      const final = items.filter((it) => value.includes(it.value)).map((it) => it.value);
      onSubmit(final);
    } else if (action.kind === 'cancel') {
      onCancel?.();
    }
  }, { isActive: isFocused });

  return createElement(Box, null,
    ...items.map((it, i) =>
      createElement(Text, { key: i },
        (i === cursor ? '▸ ' : '  ') + (value.includes(it.value) ? '[x] ' : '[ ] ') + it.label,
      ),
    ),
  );
}
```

- [ ] **Step 4: Verify** — 3 component tests pass; full suite green; typecheck clean.

- [ ] **Step 5: Commit**
```bash
git add src/multi-select.ts src/multi-select.test.ts
git commit -m "feat: <MultiSelect> component — Space toggle + Enter submit (ordered)"
```

---

### Task 5: `<Confirm>` component (no reducer split)

**Files:**
- Create: `src/confirm.ts`
- Create: `src/confirm.test.ts`

- [ ] **Step 1: Write the failing test `src/confirm.test.ts`:**
```ts
import { expect, test } from 'vitest';
import { createElement } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { Confirm } from './confirm.js';

test('renders message with default=yes hint (Y/n)', async () => {
  function App() {
    return createElement(Confirm, { message: 'continue?', onSubmit: () => {} });
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('continue? (Y/n)');
});

test('default=no renders (y/N)', async () => {
  function App() {
    return createElement(Confirm, { message: 'delete?', defaultValue: 'no', onSubmit: () => {} });
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('delete? (y/N)');
});

test('y/Y → onSubmit(true)', async () => {
  const captured: boolean[] = [];
  function App() {
    return createElement(Confirm, { message: 'ok?', onSubmit: (yes: boolean) => captured.push(yes) });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.press({ name: 'y' });
  await flush();
  expect(captured).toEqual([true]);
});

test('n/N → onSubmit(false)', async () => {
  const captured: boolean[] = [];
  function App() {
    return createElement(Confirm, { message: 'ok?', onSubmit: (yes: boolean) => captured.push(yes) });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.press({ name: 'n' });
  await flush();
  expect(captured).toEqual([false]);
});

test('Enter takes the default (yes by default, no when defaultValue=no)', async () => {
  const a: boolean[] = [];
  const b: boolean[] = [];
  function AppYes() {
    return createElement(Confirm, { message: '?', onSubmit: (yes: boolean) => a.push(yes) });
  }
  function AppNo() {
    return createElement(Confirm, { message: '?', defaultValue: 'no', onSubmit: (yes: boolean) => b.push(yes) });
  }
  const back1 = new TestBackend(10, 1);
  await render(createElement(AppYes), back1);
  back1.press({ name: 'return' });
  await flush();
  expect(a).toEqual([true]);

  const back2 = new TestBackend(10, 1);
  await render(createElement(AppNo), back2);
  back2.press({ name: 'return' });
  await flush();
  expect(b).toEqual([false]);
});

test('Esc calls onCancel', async () => {
  let cancelled = false;
  function App() {
    return createElement(Confirm, { message: '?', onSubmit: () => {}, onCancel: () => { cancelled = true; } });
  }
  const backend = new TestBackend(10, 1);
  await render(createElement(App), backend);
  backend.press({ name: 'escape' });
  await flush();
  expect(cancelled).toBe(true);
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Write `src/confirm.ts`:**
```ts
import { createElement, type ReactNode } from 'react';
import { Box, Text } from './components.js';
import { useInput } from './use-input.js';

export interface ConfirmProps {
  message: string;
  /** Default action when user presses Enter. Default 'yes'. */
  defaultValue?: 'yes' | 'no';
  /** Called with true (yes), false (no). */
  onSubmit: (yes: boolean) => void;
  onCancel?: () => void;
  isFocused?: boolean;
}

export function Confirm(props: ConfirmProps): ReactNode {
  const { message, defaultValue = 'yes', onSubmit, onCancel, isFocused = true } = props;
  const hint = defaultValue === 'yes' ? '(Y/n)' : '(y/N)';

  useInput((key) => {
    if (key.name === 'escape') { onCancel?.(); return; }
    if (key.name === 'return' || key.name === 'enter') { onSubmit(defaultValue === 'yes'); return; }
    if ((key.name === 'y' || key.name === 'Y') && !key.ctrl && !key.meta) { onSubmit(true); return; }
    if ((key.name === 'n' || key.name === 'N') && !key.ctrl && !key.meta) { onSubmit(false); return; }
  }, { isActive: isFocused });

  return createElement(Box, null, createElement(Text, null, `${message} ${hint}`));
}
```

- [ ] **Step 4: Verify** — 6 confirm tests pass; full suite green; typecheck clean.

- [ ] **Step 5: Commit**
```bash
git add src/confirm.ts src/confirm.test.ts
git commit -m "feat: <Confirm> component — y/n + default-on-Enter + Esc cancel"
```

---

### Task 6: Acceptance — picker demo (test backend + manual real-TTY scratch)

**Files:**
- Modify: `src/select.test.ts` (append one combined-prompt acceptance test)
- Create: `scratch/pick.ts` (runnable local demo — gitignored, not committed)

- [ ] **Step 1: Append the acceptance test to `src/select.test.ts`** (imports already cover everything used):
```ts
import { MultiSelect } from './multi-select.js';
import { Confirm } from './confirm.js';

test('M1c.2 acceptance: Select + MultiSelect + Confirm each fire onSubmit correctly', async () => {
  // Select
  const picks: string[] = [];
  function PickApp() {
    return createElement(Select, {
      items: [{ label: 'apple', value: 'A' }, { label: 'banana', value: 'B' }, { label: 'cherry', value: 'C' }],
      value: 'A', onChange: () => {}, onSubmit: (v: string) => picks.push(v),
    });
  }
  const pickBackend = new TestBackend(20, 4);
  await render(createElement(PickApp), pickBackend);
  pickBackend.type('an'); // filter → only 'banana'
  await flush();
  pickBackend.press({ name: 'return' });
  await flush();
  expect(picks).toEqual(['B']);

  // MultiSelect
  const checks: string[][] = [];
  function ChecksApp() {
    const [v, setV] = useState<string[]>([]);
    return createElement(MultiSelect, {
      items: [{ label: 'one', value: '1' }, { label: 'two', value: '2' }, { label: 'three', value: '3' }],
      value: v, onChange: setV, onSubmit: (arr: string[]) => checks.push(arr),
    });
  }
  const checksBackend = new TestBackend(20, 3);
  await render(createElement(ChecksApp), checksBackend);
  checksBackend.press({ name: ' ' });           // toggle 'one' on
  await flush();
  checksBackend.press({ name: 'down' });
  await flush();
  checksBackend.press({ name: 'down' });
  await flush();
  checksBackend.press({ name: ' ' });           // toggle 'three' on
  await flush();
  checksBackend.press({ name: 'return' });
  await flush();
  expect(checks).toEqual([['1', '3']]);

  // Confirm
  const confirms: boolean[] = [];
  function ConfApp() {
    return createElement(Confirm, { message: 'go?', onSubmit: (yes: boolean) => confirms.push(yes) });
  }
  const confBackend = new TestBackend(10, 1);
  await render(createElement(ConfApp), confBackend);
  confBackend.press({ name: 'y' });
  await flush();
  expect(confirms).toEqual([true]);
});
```

- [ ] **Step 2: Verify** — `npx vitest run src/select.test.ts` → all pass. Full suite green. Typecheck clean.

- [ ] **Step 3: Create `scratch/pick.ts`** (runnable on a real terminal):
```ts
import { createElement, useState } from 'react';
import { render, Box, Text, TtyBackend, Select } from '../src/index.js';

function App() {
  const [done, setDone] = useState<string | null>(null);
  if (done !== null) {
    return createElement(Box, null, createElement(Text, null, `picked: ${done}`));
  }
  return createElement(Box, null,
    createElement(Text, null, 'pick a fruit (type to filter, ↑↓ to navigate, Enter to pick, Esc/Ctrl-C to exit):'),
    createElement(Select<string>, {
      items: [
        { label: 'apple', value: 'apple' },
        { label: 'banana', value: 'banana' },
        { label: 'cherry', value: 'cherry' },
        { label: 'date', value: 'date' },
        { label: 'elderberry', value: 'elderberry' },
      ],
      value: 'apple',
      onChange: () => {},
      onSubmit: (v) => setDone(v),
      onCancel: () => process.exit(0),
    }),
  );
}

await render(createElement(App), new TtyBackend());
```

- [ ] **Step 4: Smoke check** (loads without crashing in a non-TTY pipe):
```bash
timeout 1 npx tsx scratch/pick.ts 2>&1 | head -20 || true
```
Expected: writes the initial frame (ANSI codes + "pick a fruit…" + items) and runs until timeout. If it errors before timeout, report.

The actual interactivity (type to filter, arrow nav, Enter to pick) is a human visual check.

- [ ] **Step 5: Commit**
```bash
git add src/select.test.ts
git commit -m "test: M1c.2 acceptance — Select+MultiSelect+Confirm e2e"
```

---

### Task 7: Public exports + README + final build

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Update `src/index.ts`** — append exports (keep all existing exports unchanged):
```ts
export { Select } from './select.js';
export type { SelectItem, SelectProps } from './select.js';
export { MultiSelect } from './multi-select.js';
export type { MultiSelectProps } from './multi-select.js';
export { Confirm } from './confirm.js';
export type { ConfirmProps } from './confirm.js';
```

(`SelectItem` actually lives in `select-reducer.ts`; re-export from `./select.js` to keep the public surface narrowed — add `export type { SelectItem } from './select-reducer.js';` in `src/select.ts` so the re-export path works. Adjust the index.ts import accordingly.)

- [ ] **Step 2: Update `README.md`** — find the existing `## Status` section, replace its content with (use real triple-backtick fences):

```md
## Status

M1c.2 (prompts). The framework now ships three standalone prompt components,
each built on `useInput` + the editor-reducer pattern:

- `<Select>` — single choice, arrow navigation (or `j`/`k`), case-insensitive
  filter-as-you-type, Enter to submit, Esc to cancel.
- `<MultiSelect>` — multi choice, Space to toggle the cursor item, Enter to
  submit the value array (in original item order), Esc to cancel.
- `<Confirm>` — yes/no with a default; `y`/`Y`/`n`/`N` for direct answer,
  Enter takes the default, Esc cancels.

All three accept `isFocused` for use in larger trees and work on the test
backend (synthetic keys) and the TTY backend (real terminal).

### Usage

\`\`\`tsx
import { render, Select, TtyBackend } from 'flowtty';

await render(
  <Select
    items={[{ label: 'apple', value: 'a' }, { label: 'banana', value: 'b' }]}
    value="a"
    onChange={() => {}}
    onSubmit={(v) => console.log('picked', v)}
  />,
  new TtyBackend(),
);
\`\`\`

### Still deferred (later milestones)

- `<Form>` + intra-form focus ring + `<Form.Field>` + embedded `openDialog` — M1c.3.
- MultiSelect "+ add new" inline-dialog row — needs `openDialog` (M1c.3).
- Frame diffing — full TTY redraw each `draw()`.
- Truecolor (`#rgb` / `rgb(…)`).
- Fuzzy filter matching for `<Select>` (substring only today).
- Bracketed paste, mouse, Kitty keyboard protocol, modifier-encoded arrows.
```

- [ ] **Step 3: Final verification**
- `npx vitest run` → all tests pass.
- `npm run typecheck` → clean.
- `npm run build` → ESM + dts succeed (no warnings).

- [ ] **Step 4: Commit**
```bash
git add src/index.ts README.md
git commit -m "chore: export Select/MultiSelect/Confirm + document M1c.2 prompts"
```

---

## Self-Review

**1. Spec coverage** (M1c.2 portion of `docs/design.md`):
- `<Select>` with filter-as-you-type → Tasks 1, 2.
- `<MultiSelect>` with Space toggle → Tasks 3, 4.
- `<Confirm>` → Task 5.
- End-to-end acceptance through `render()` + a real-TTY example → Task 6.
- Out-of-scope items (`+ add new`, focus ring, `<Form>`, embedded `openDialog`) named in the plan header and the deferred-list.

**2. Placeholder scan:** no "TBD" / "implement later". The j/k vim-nav overlap with filter typing is documented as an acceptable trade-off rather than as a problem to revisit immediately.

**3. Type consistency:** `SelectItem<T>` is defined in `select-reducer.ts` and reused by `multi-select-reducer.ts` (via type import). `SelectState`/`MultiSelectState` shapes match across reducer and component. `*Props` shapes match between component and exported type. The action discriminants (`'state'`/`'submit'`/`'toggle'`/`'cancel'`/`'noop'`) are consistent within each reducer.

**Risks worth flagging for the implementer (not blockers):**

1. **MultiSelect onChange order (Task 4).** The component builds `next` so that toggling an item ON inserts it in original-item-order (not append). That preserves a deterministic order across re-renders / repeated toggles. Tests assert this order — don't switch to append-only without updating tests.

2. **Select's onChange firing (Task 2).** It fires when the highlighted item *changes value* — including when filtering narrows the list and the visible[0] is a different item than before. Some apps may prefer onChange only on explicit arrow nav; if that's wanted later, gate behind a prop. M1c.2 default = fire on any highlight change.

3. **Cursor clamping in Select after filter narrows (Task 2).** The reducer resets cursor to 0 in the filter-append branch. The render uses `Math.min(state.cursor, visible.length - 1)` defensively. Together these ensure no out-of-range cursor is rendered or submitted — if a test reports a wrong item submitted after filtering, this is the seam to inspect.

4. **`<Select>` is generic (`Select<T>`).** All tests use `string` values; `<MultiSelect>` is also generic. The generic types should flow through the public exports — `export { Select }` carries the generic. If TS surfaces issues at the export site, prefer `export function Select<T>(...)` re-export over a wrapping cast.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/m1c2-prompts.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task; same flow as M0 / M1a / M1b / M1c / M1d.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?
