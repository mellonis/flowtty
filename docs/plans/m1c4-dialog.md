# flowtty M1c.4 — `openDialog` + MultiSelect "+add new" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship an embedded-dialog substrate — `<DialogHost>` + `useDialogHost()` (`openDialog(element) → Promise<DialogResult<T>>`) + `useDialog()` (`{ done(value), cancel() }`) — so any descendant can pop a modal sub-prompt that returns a value without unmounting the host app. Then use it to land MultiSelect's `+ add new` row: when the cursor is on `+ add new` and the user presses Enter, a TextInput dialog opens; on submit, the new label flows back via an `onAddNew` callback.

**Architecture:** `<DialogHost>` wraps the app, owns `currentDialog` state, and renders the host children + the optional dialog as siblings. Key gating uses **InputContext swapping**: while a dialog is open, the host subtree gets a muted `InputSource` (no keys delivered), and the dialog subtree gets the original outer source — `useInput`'s `useEffect` deps on `source` cause subscribers to re-attach on the swap. `useDialog()` reads a small "result" context provided around the dialog element and calls `resolve(result) + setDialog(null)` atomically when the dialog calls `done`/`cancel`. Nested dialogs are out of scope (a second `openDialog` while one is open replaces the first); single dialog at a time is the minimum the MultiSelect use case needs.

**Tech Stack:** Same as M1c.3 — TypeScript ESM, React 19, `react-reconciler@0.31.0`, `yoga-layout@3.2.1`, Vitest 4.

**Out of scope** (later milestones): nested/stacked dialogs (one dialog at a time today); **true modal overlay positioning** (flowtty's stack layout has no `position: absolute` / z-index, so the dialog renders **below** the host content in the cell buffer — behaviorally modal, visually inline; real centered overlay is a layout-milestone enhancement); focus traps that survive component re-mounts; async-rendered dialog components; `<MultiSelect>` showing the cursor on `+ add new` with checkbox-style marker (it's a special row with a `+` glyph, no `[ ]` / `[x]`).

---

## Scope check

This is the fourth of M1c-scope plans:

- **M1c (merged):** TTY input.
- **M1c.2 (merged):** Select / MultiSelect / Confirm.
- **M1c.3 (merged):** Form + intra-form focus ring + useField.
- **M1c.4 (this plan):** embedded `openDialog` + MultiSelect `+ add new`.

Each plan ships working software on its own. M1c.4's acceptance is a MultiSelect with `+ add new` end-to-end: cursor to add row → Enter → TextInput dialog → type label → Enter → label appended to items list and toggled selected, host MultiSelect resumes accepting keys.

---

## File Structure

```
src/
  dialog-context.ts      # NEW — DialogHostApi, DialogResultApi, DialogResult, contexts (types + empty defaults)
  dialog-host.ts         # NEW — <DialogHost> component (state, key gating, mounts dialog children)
  use-dialog.ts          # NEW — useDialog (inside dialog) + useDialogHost (anywhere to call openDialog)
  dialog.test.ts         # NEW — openDialog acceptance (done + cancel resolution + key gating)

  multi-select.ts        # MODIFY — render optional "+ add new" row; cursor includes it; Enter on it calls onAddNew
  multi-select.test.ts   # ADD — onAddNew callback fires when user submits add-new row

  index.ts               # MODIFY — export DialogHost + useDialog + useDialogHost + types
  README.md              # MODIFY — M1c.4 status + usage (MultiSelect+add-new) + the inline-position caveat

examples/
  pick-or-add.ts         # NEW — runnable MultiSelect-with-add-new demo on TTY (manual smoke)
```

Responsibilities:
- **`dialog-context.ts`** declares two contexts (host-side `openDialog` + dialog-side `done/cancel`) and the `DialogResult<T>` type. No logic.
- **`dialog-host.ts`** owns the state machine + `InputContext` swap + render layout.
- **`use-dialog.ts`** are thin hook wrappers around `useContext`.
- **`multi-select.ts`** gains 1 prop (`onAddNew?`) + 1 special row + Enter routing for that row.

---

### Task 1: Dialog contexts + types

**Files:**
- Create: `src/dialog-context.ts`

- [ ] **Step 1: Write `src/dialog-context.ts`:**
```ts
import { createContext, type ReactNode } from 'react';

/** Result returned to the openDialog caller. */
export type DialogResult<T> =
  | { status: 'done'; value: T }
  | { status: 'cancelled' };

/** Host-side API: any descendant can call openDialog. */
export interface DialogHostApi {
  /**
   * Mount `element` as a modal dialog. Returns a promise that resolves when
   * the dialog calls done(value) (→ {status:'done',value}) or cancel()
   * (→ {status:'cancelled'}). Calling openDialog while one is already open
   * REPLACES the current dialog (stacking is out of scope for M1c.4).
   */
  openDialog<T = unknown>(element: ReactNode): Promise<DialogResult<T>>;
}

/** Dialog-side API: the dialog's own components call these to resolve. */
export interface DialogResultApi {
  done(value: unknown): void;
  cancel(): void;
}

const noopHost: DialogHostApi = {
  openDialog: () => Promise.resolve({ status: 'cancelled' } as DialogResult<unknown>),
};
const noopResult: DialogResultApi = { done() {}, cancel() {} };

export const DialogHostContext = createContext<DialogHostApi>(noopHost);
export const DialogResultContext = createContext<DialogResultApi>(noopResult);
```

- [ ] **Step 2: Verify** — `npx vitest run` (151 still pass; nothing imports yet). `npm run typecheck` clean.

- [ ] **Step 3: Commit**
```bash
git add src/dialog-context.ts
git commit -m "feat: DialogHostApi + DialogResultApi + DialogResult shape"
```

---

### Task 2: `<DialogHost>` component + key gating + `useDialog`/`useDialogHost`

**Files:**
- Create: `src/dialog-host.ts`
- Create: `src/use-dialog.ts`
- Create: `src/dialog.test.ts`

- [ ] **Step 1: Write the failing test `src/dialog.test.ts`:**
```ts
import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './index.js';
import { TestBackend, flush, flushAsync } from './testing.js';
import { Box, Text } from './components.js';
import { TextInput } from './text-input.js';
import { useInput } from './use-input.js';
import { DialogHost } from './dialog-host.js';
import { useDialog, useDialogHost } from './use-dialog.js';
import type { DialogResult } from './dialog-context.js';

function NamePromptDialog() {
  const { done, cancel } = useDialog();
  const [v, setV] = useState('');
  return createElement(Box, null,
    createElement(Text, null, 'name: '),
    createElement(TextInput, {
      value: v, onChange: setV,
      onSubmit: () => done(v),
      onCancel: () => cancel(),
    }),
  );
}

test('openDialog resolves with done(value) when dialog calls done', async () => {
  let result: DialogResult<string> | null = null;
  function App() {
    const host = useDialogHost();
    useInput((key) => {
      if (key.name === 'o') host.openDialog<string>(createElement(NamePromptDialog)).then((r) => { result = r; });
    });
    return createElement(Text, null, 'host');
  }
  const backend = new TestBackend(40, 4);
  await render(createElement(DialogHost, null, createElement(App)), backend);
  await flushAsync();
  backend.press({ name: 'o' });
  await flushAsync();
  backend.type('alice');
  await flush();
  backend.press({ name: 'return' });
  await flushAsync();
  expect(result).toEqual({ status: 'done', value: 'alice' });
});

test('openDialog resolves with cancelled when dialog calls cancel', async () => {
  let result: DialogResult<string> | null = null;
  function App() {
    const host = useDialogHost();
    useInput((key) => {
      if (key.name === 'o') host.openDialog<string>(createElement(NamePromptDialog)).then((r) => { result = r; });
    });
    return createElement(Text, null, 'host');
  }
  const backend = new TestBackend(40, 4);
  await render(createElement(DialogHost, null, createElement(App)), backend);
  await flushAsync();
  backend.press({ name: 'o' });
  await flushAsync();
  backend.press({ name: 'escape' });
  await flushAsync();
  expect(result).toEqual({ status: 'cancelled' });
});

test('while dialog is open, host useInput subscribers receive no keys (gated)', async () => {
  const hostKeys: string[] = [];
  function App() {
    const host = useDialogHost();
    useInput((key) => {
      hostKeys.push(key.name);
      if (key.name === 'o') host.openDialog<string>(createElement(NamePromptDialog));
    });
    return createElement(Text, null, 'host');
  }
  const backend = new TestBackend(40, 4);
  await render(createElement(DialogHost, null, createElement(App)), backend);
  await flushAsync();
  backend.press({ name: 'o' });  // host receives 'o', triggers openDialog
  await flushAsync();
  backend.type('x');             // dialog open: host should NOT see 'x'
  await flush();
  backend.press({ name: 'escape' });  // closes dialog
  await flushAsync();
  backend.press({ name: 'q' });  // host should see 'q' again
  await flush();
  expect(hostKeys).toEqual(['o', 'q']);   // 'x' was consumed by the dialog only
});

test('after dialog closes, host resumes receiving keys', async () => {
  const hostKeys: string[] = [];
  function App() {
    const host = useDialogHost();
    useInput((key) => {
      hostKeys.push(key.name);
      if (key.name === 'o') host.openDialog<string>(createElement(NamePromptDialog));
    });
    return createElement(Text, null, 'host');
  }
  const backend = new TestBackend(40, 4);
  await render(createElement(DialogHost, null, createElement(App)), backend);
  await flushAsync();
  backend.press({ name: 'o' });
  await flushAsync();
  backend.press({ name: 'escape' });
  await flushAsync();
  backend.press({ name: 'a' });
  backend.press({ name: 'b' });
  await flush();
  expect(hostKeys).toEqual(['o', 'a', 'b']);
});
```

- [ ] **Step 2: Run, verify FAIL** (modules missing).

- [ ] **Step 3: Write `src/dialog-host.ts`:**
```ts
import { createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { InputContext, type InputSource } from './input-context.js';
import {
  DialogHostContext,
  DialogResultContext,
  type DialogHostApi,
  type DialogResult,
  type DialogResultApi,
} from './dialog-context.js';

interface PendingDialog {
  element: ReactNode;
  resolve(result: DialogResult<unknown>): void;
}

export function DialogHost(props: { children?: ReactNode }): ReactNode {
  // Capture the outer InputSource ONCE per DialogHost mount. The InputContext
  // we install for children swaps between this outer source (host can hear
  // keys) and a muted no-op source (dialog open → host hears nothing).
  const outerSource = useContext(InputContext);
  const [dialog, setDialog] = useState<PendingDialog | null>(null);

  const mutedSource = useMemo<InputSource>(
    () => ({ subscribe: () => () => {} }),
    [],
  );

  const close = useCallback((result: DialogResult<unknown>) => {
    setDialog((current) => {
      if (current) current.resolve(result);
      return null;
    });
  }, []);

  const openDialog = useCallback(<T,>(element: ReactNode): Promise<DialogResult<T>> => {
    return new Promise<DialogResult<T>>((resolve) => {
      // If a dialog is already open, replace it (M1c.4 doesn't stack).
      setDialog((current) => {
        if (current) current.resolve({ status: 'cancelled' } as DialogResult<unknown>);
        return { element, resolve: resolve as (r: DialogResult<unknown>) => void };
      });
    });
  }, []);

  const hostApi = useMemo<DialogHostApi>(() => ({ openDialog }), [openDialog]);
  const dialogApi = useMemo<DialogResultApi>(
    () => ({
      done: (value) => close({ status: 'done', value }),
      cancel: () => close({ status: 'cancelled' }),
    }),
    [close],
  );

  // Layout: render children (host tree) and dialog (when present) as siblings.
  // Note: stack layout means the dialog renders BELOW the host content; true
  // modal overlay positioning needs absolute/z-index (later milestone).
  return createElement(
    DialogHostContext.Provider,
    { value: hostApi },
    createElement(
      InputContext.Provider,
      { value: dialog ? mutedSource : outerSource },
      props.children,
    ),
    dialog
      ? createElement(
          InputContext.Provider,
          { value: outerSource },
          createElement(DialogResultContext.Provider, { value: dialogApi }, dialog.element),
        )
      : null,
  );
}
```

- [ ] **Step 4: Write `src/use-dialog.ts`:**
```ts
import { useContext } from 'react';
import {
  DialogHostContext,
  DialogResultContext,
  type DialogHostApi,
  type DialogResultApi,
} from './dialog-context.js';

/** Inside a dialog component: get { done, cancel } to resolve the openDialog promise. */
export function useDialog(): DialogResultApi {
  return useContext(DialogResultContext);
}

/** Anywhere under a <DialogHost>: get the host's openDialog. */
export function useDialogHost(): DialogHostApi {
  return useContext(DialogHostContext);
}
```

- [ ] **Step 5: Verify** — `npx vitest run src/dialog.test.ts` → all 4 tests pass. Full suite green (151 + 4 = 155). `npm run typecheck` clean.

**If "while dialog is open, host receives no keys" fails:**
- Inspect whether `useInput`'s effect re-runs on the InputContext value swap. The hook's `useEffect` deps include `source` (the resolved context value); a swap should retrigger it.
- If host subscribers persist (still receive keys after openDialog), the mutedSource isn't being delivered: check that `DialogHost`'s outer wrapper actually switches `InputContext.Provider`'s value when `dialog !== null`.

**If "after dialog closes, host resumes" fails (host doesn't get keys after close):**
- The unsubscribe-from-muted, re-subscribe-to-outer cycle should re-attach. If subscribers are gone, the issue is most likely in `useInput.ts` where the cleanup runs on source change — verify cleanup returns the unsubscribe function for the OLD source.

Do NOT change assertions.

- [ ] **Step 6: Commit**
```bash
git add src/dialog-host.ts src/use-dialog.ts src/dialog.test.ts
git commit -m "feat: DialogHost + useDialog/useDialogHost — modal dialogs via InputContext swap"
```

---

### Task 3: MultiSelect `+ add new` row + Enter routing

**Files:**
- Modify: `src/multi-select.ts`
- Modify: `src/multi-select-reducer.ts`
- Modify: `src/multi-select.test.ts`

When `onAddNew` prop is provided, MultiSelect renders one extra row labeled `+ add new` at the **bottom** of the list. Cursor index extends to cover it. Space on the add-new row is a noop (it's not a checkbox). Enter on the add-new row calls `onAddNew()` (does NOT call `onSubmit`).

- [ ] **Step 1: Append failing tests to `src/multi-select.test.ts`** (existing imports + helpers preserved):
```ts
test('onAddNew prop adds a "+ add new" row at the bottom (after items)', async () => {
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: () => {}, onSubmit: () => {},
      onAddNew: () => {},
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  // Cursor 0 = 'a'; row 1 = '+ add new' (with cursor marker '  ' since cursor on row 0)
  expect(backend.lastFrame).toBe('▸ [ ] a\n  + add new');
});

test('Enter on "+ add new" row calls onAddNew (NOT onSubmit)', async () => {
  let addCalled = false;
  const submits: string[][] = [];
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: () => {}, onSubmit: (v) => submits.push(v),
      onAddNew: () => { addCalled = true; },
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });   // cursor → '+ add new'
  await flush();
  backend.press({ name: 'return' });
  await flush();
  expect(addCalled).toBe(true);
  expect(submits).toEqual([]);
});

test('Space on "+ add new" row is a noop', async () => {
  let toggled = false;
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: (v: string[]) => { toggled = v.length > 0; }, onSubmit: () => {},
      onAddNew: () => {},
    });
  }
  const backend = new TestBackend(20, 2);
  await render(createElement(App), backend);
  backend.press({ name: 'down' });   // cursor → '+ add new'
  await flush();
  backend.press({ name: ' ' });
  await flush();
  expect(toggled).toBe(false);
});

test('without onAddNew, the "+ add new" row is NOT rendered (back-compat)', async () => {
  function App() {
    return createElement(MultiSelect<string>, {
      items: [{ label: 'a', value: 'a' }],
      value: [], onChange: () => {}, onSubmit: () => {},
    });
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  expect(backend.lastFrame).toBe('▸ [ ] a');
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Modify `src/multi-select.ts`** to add `onAddNew?` prop + extra row + Enter routing. Read the file first to find the current shape (interface + component). Replace the relevant parts:

Update `MultiSelectProps`:
```ts
export interface MultiSelectProps<T> {
  items: SelectItem<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  onSubmit: (value: T[]) => void;
  onCancel?: () => void;
  isFocused?: boolean;
  /** When provided, a "+ add new" row appears after items; Enter on it calls this callback. */
  onAddNew?: () => void;
}
```

Update the component body. The "add new" cursor index is `items.length` (one past the last item). Reducer needs to know about the extra row OR we handle it in the component before delegating to the reducer. **Component-side handling is cleaner** because the reducer's contract stays untouched:

```ts
export function MultiSelect<T>(props: MultiSelectProps<T>): ReactNode {
  const { items, value, onChange, onSubmit, onCancel, onAddNew, isFocused = true } = props;
  const totalRows = items.length + (onAddNew ? 1 : 0);
  const [state, setState] = useState<MultiSelectState>({ cursor: 0 });
  const cursor = Math.max(0, Math.min(state.cursor, totalRows - 1));
  const onAddRow = onAddNew !== undefined && cursor === items.length;

  useInput((key) => {
    // Intercept add-new row handling BEFORE delegating to the items reducer.
    if (onAddRow) {
      if (key.name === 'return' || key.name === 'enter') { onAddNew!(); return; }
      if (key.name === ' ') return;   // Space is a noop on the add row
      // Fall through to reducer for navigation (up/down/k/j) so the cursor moves
    }
    // For navigation purposes the reducer sees a virtual items list of totalRows
    // entries (real items count + 1 for the add row). We adapt by passing a
    // padded items array — same length but the extra entry won't be looked up
    // because Space-toggle is guarded above.
    const paddedItems = onAddNew !== undefined
      ? [...items, { label: '+ add new', value: '\0__add_new__\0' as unknown as T }]
      : items;
    const action = reduce(paddedItems, { cursor }, key);
    if (action.kind === 'state') {
      setState(action.state);
    } else if (action.kind === 'toggle') {
      // Only fires for real item rows (Space on add row is guarded above).
      const toggled = items[action.index]!.value;
      const isOn = value.includes(toggled);
      const next = items
        .filter((it) => (it.value === toggled ? !isOn : value.includes(it.value)))
        .map((it) => it.value);
      onChange(next);
    } else if (action.kind === 'submit') {
      // Submit only fires when cursor is on a real item row (add row Enter is guarded above).
      if (!onAddRow) {
        const final = items.filter((it) => value.includes(it.value)).map((it) => it.value);
        onSubmit(final);
      }
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
    onAddNew !== undefined
      ? createElement(Text, { key: '__add__' },
          (cursor === items.length ? '▸ ' : '  ') + '+ add new',
        )
      : false,
  );
}
```

(Note: `multi-select-reducer.ts` does NOT need modification — the component handles the special add-new semantics before delegating to the reducer for navigation only.)

- [ ] **Step 4: Verify** — `npx vitest run src/multi-select.test.ts` → all (existing 3 + new 4 = 7) pass. Full suite green (155 + 4 = 159). `npm run typecheck` clean.

If the "+ add new row at bottom" test fails because the marker is `[ ]` style: the special row has no checkbox marker — render verifies `(cursor === items.length ? '▸ ' : '  ') + '+ add new'` without `[ ]`/`[x]`. Adjust if the test asserts the bracket-less form (it does — `'  + add new'`).

- [ ] **Step 5: Commit**
```bash
git add src/multi-select.ts src/multi-select.test.ts
git commit -m "feat: MultiSelect onAddNew + bottom row (Enter triggers add, Space noop)"
```

---

### Task 4: M1c.4 acceptance — MultiSelect + openDialog end-to-end

**Files:**
- Modify: `src/dialog.test.ts` (append the acceptance test)

The full use case: a MultiSelect with `onAddNew` whose handler uses `useDialogHost()` to open a TextInput dialog; on dialog `done(label)`, the parent state appends a new item with that label and toggles it selected; the MultiSelect re-renders with the new item.

- [ ] **Step 1: Append the failing acceptance test to `src/dialog.test.ts`** (existing imports + `NamePromptDialog` helper preserved; add MultiSelect import):
```ts
import { MultiSelect } from './multi-select.js';

test('M1c.4 acceptance: MultiSelect+add-new opens dialog, dialog submit appends and selects', async () => {
  function App() {
    const host = useDialogHost();
    const [items, setItems] = useState<{ label: string; value: string }[]>([
      { label: 'apple', value: 'apple' },
      { label: 'banana', value: 'banana' },
    ]);
    const [selected, setSelected] = useState<string[]>([]);
    return createElement(MultiSelect<string>, {
      items,
      value: selected,
      onChange: setSelected,
      onSubmit: () => {},
      onAddNew: async () => {
        const r = await host.openDialog<string>(createElement(NamePromptDialog));
        if (r.status === 'done' && r.value) {
          const newItem = { label: r.value, value: r.value };
          setItems((prev) => [...prev, newItem]);
          setSelected((prev) => [...prev, r.value]);
        }
      },
    });
  }
  const backend = new TestBackend(40, 6);
  await render(createElement(DialogHost, null, createElement(App)), backend);
  await flushAsync();

  // Cursor 0 = 'apple'; move to '+ add new' row (index 2) — press down twice
  backend.press({ name: 'down' });
  await flush();
  backend.press({ name: 'down' });
  await flush();

  // Enter on add-new → opens dialog
  backend.press({ name: 'return' });
  await flushAsync();

  // Dialog now mounted under host; host muted. Type 'cherry' into the dialog's TextInput.
  backend.type('cherry');
  await flush();
  backend.press({ name: 'return' });  // dialog calls done('cherry')
  await flushAsync();

  // Dialog closes; MultiSelect re-renders with appended 'cherry' selected.
  // Frame check: 3 items + the add-new row, cherry selected, cursor still on add-new row.
  expect(backend.lastFrame).toContain('[x] cherry');
  expect(backend.lastFrame).toContain('+ add new');
});
```

- [ ] **Step 2: Verify** — `npx vitest run src/dialog.test.ts` → all 5 tests pass. Full suite green (159 + 1 = 160). `npm run typecheck` clean.

If `[x] cherry` isn't in the frame: trace the flow.
- Did `r.status === 'done'`? Log r.
- Did `setItems` actually append? Check via probe.
- Did flushAsync after the dialog's `return` give the re-render time? Yes — flushAsync covers effect-triggered state.

Adjust `flushAsync` placements if needed; don't change semantics.

- [ ] **Step 3: Commit**
```bash
git add src/dialog.test.ts
git commit -m "test: M1c.4 acceptance — MultiSelect+add-new + openDialog end-to-end"
```

---

### Task 5: Public exports + runnable demo + README + final build

**Files:**
- Modify: `src/index.ts`
- Create: `examples/pick-or-add.ts`
- Modify: `README.md`

- [ ] **Step 1: Update `src/index.ts`** — append (keep existing unchanged):
```ts
export { DialogHost } from './dialog-host.js';
export { useDialog, useDialogHost } from './use-dialog.js';
export type {
  DialogHostApi, DialogResultApi, DialogResult,
} from './dialog-context.js';
```

- [ ] **Step 2: Create `examples/pick-or-add.ts`** (runnable on real TTY):
```ts
import { createElement, useState } from 'react';
import {
  render, Box, Text, TtyBackend,
  DialogHost, useDialogHost,
  MultiSelect, TextInput,
} from '../src/index.js';
import { useDialog } from '../src/use-dialog.js';

function NamePromptDialog() {
  const { done, cancel } = useDialog();
  const [v, setV] = useState('');
  return createElement(Box, null,
    createElement(Text, null, 'new label: '),
    createElement(TextInput, {
      value: v, onChange: setV,
      onSubmit: () => done(v),
      onCancel: () => cancel(),
    }),
  );
}

function App() {
  const host = useDialogHost();
  const [items, setItems] = useState<{ label: string; value: string }[]>([
    { label: 'apple', value: 'apple' },
    { label: 'banana', value: 'banana' },
    { label: 'cherry', value: 'cherry' },
  ]);
  const [selected, setSelected] = useState<string[]>([]);
  const [done, setDone] = useState<string[] | null>(null);

  if (done) {
    return createElement(Box, null,
      createElement(Text, null, `picked: ${done.join(', ')}`),
    );
  }
  return createElement(Box, { flexDirection: 'column' },
    createElement(Text, null, 'Space toggle · ↑↓ navigate · Enter on "+ add new" to add · Enter on item to submit · Esc/Ctrl-C exit'),
    createElement(MultiSelect<string>, {
      items, value: selected,
      onChange: setSelected,
      onSubmit: (final) => setDone(final),
      onAddNew: async () => {
        const r = await host.openDialog<string>(createElement(NamePromptDialog));
        if (r.status === 'done' && r.value) {
          const item = { label: r.value, value: r.value };
          setItems((prev) => [...prev, item]);
          setSelected((prev) => [...prev, r.value]);
        }
      },
    }),
  );
}

await render(createElement(DialogHost, null, createElement(App)), new TtyBackend());
```

- [ ] **Step 3: Smoke check** (loads without crashing):
```bash
timeout 1 npx tsx examples/pick-or-add.ts 2>&1 | head -20 || true
```
Expected: writes initial frame (ANSI + help line + 3 items + "+ add new" row). If it errors before timeout, report.

- [ ] **Step 4: Update `README.md`** — find the existing `## Status` section, replace its content with (use real triple-backtick fences):

```md
## Status

M1c.4 (embedded dialogs). Any descendant of `<DialogHost>` can pop a modal
sub-prompt and await its result without unmounting the host:

- `useDialogHost()` → `{ openDialog(element): Promise<{status:'done',value}|{status:'cancelled'}> }`
- `useDialog()` → `{ done(value), cancel() }` (called from inside a dialog component)
- `<DialogHost>` swaps the `InputContext` source while a dialog is open so the
  host subtree receives no keys; the dialog gets the outer source.

`<MultiSelect>` gained an `onAddNew?` prop: when set, a `+ add new` row
appears at the bottom; Enter on it triggers the callback (typically opens a
`<TextInput>` dialog and appends the result to the items list).

**Visual caveat:** flowtty's stack layout has no `position: absolute` / z-index,
so the dialog renders **below** the host content in the cell buffer (behaviorally
modal — keys gated + awaitable — but visually inline). A true centered overlay
needs positioning primitives, planned for a later layout milestone.

### Usage

\`\`\`tsx
import {
  render, DialogHost, useDialogHost, useDialog,
  MultiSelect, TextInput, Box, Text, TtyBackend,
} from 'flowtty';

function NameDialog() {
  const { done, cancel } = useDialog();
  const [v, setV] = useState('');
  return (
    <Box>
      <Text>new label: </Text>
      <TextInput value={v} onChange={setV} onSubmit={() => done(v)} onCancel={cancel} />
    </Box>
  );
}

function App() {
  const host = useDialogHost();
  const [items, setItems] = useState([{ label: 'apple', value: 'a' }]);
  return (
    <MultiSelect
      items={items} value={[]} onChange={() => {}} onSubmit={() => {}}
      onAddNew={async () => {
        const r = await host.openDialog<string>(<NameDialog />);
        if (r.status === 'done') setItems((p) => [...p, { label: r.value, value: r.value }]);
      }}
    />
  );
}

await render(<DialogHost><App /></DialogHost>, new TtyBackend());
\`\`\`

See `examples/pick-or-add.ts` for a runnable demo.

### Still deferred (later milestones)

- Stacked/nested dialogs (one at a time today).
- True modal overlay positioning (absolute/z-index) — dialogs render below host inline.
- Frame diffing — full TTY redraw each `draw()`.
- Truecolor (`#rgb` / `rgb(…)`).
- Async-rendered dialog components (Suspense).
- Bracketed paste, mouse, Kitty keyboard protocol, modifier-encoded arrows.
```

Leave everything ELSE in the README unchanged.

- [ ] **Step 5: Final verification + commit (authorized):**
```bash
npx vitest run        # all 160 still pass
npm run typecheck     # clean
npm run build         # ESM + dts succeed, no warnings
git add src/index.ts examples/pick-or-add.ts README.md
git commit -m "chore: export DialogHost + useDialog/useDialogHost + document M1c.4"
```

## Report:
- **Status:** DONE | BLOCKED
- Test + typecheck + build output (paste tails)
- Whether the smoke check loaded cleanly
- Commit SHA

---

## Self-Review

**1. Spec coverage** (M1c.4 portion of `docs/design.md`):
- Embedded `openDialog` + `useDialog` substrate → Tasks 1, 2.
- MultiSelect "+add new" using it → Tasks 3, 4.
- Out-of-scope items (stacked dialogs, true overlay positioning, async-rendered dialogs) named in the plan header + deferred list.

**2. Placeholder scan:** no "TBD"/"implement later". The inline-position visual caveat is documented (in plan header, code comment, and README) so users aren't surprised.

**3. Type consistency:** `DialogResult<T>`, `DialogHostApi.openDialog<T>(element)`, `DialogResultApi.{done, cancel}` are uniform across `dialog-context.ts`, `dialog-host.ts`, `use-dialog.ts`. `MultiSelectProps<T>.onAddNew?` is `() => void` — sync; consumers wanting `async` handle it themselves (the example does so).

**Risks worth flagging for the implementer (not blockers):**

1. **`outerSource` captured at DialogHost mount time (Task 2).** `useContext(InputContext)` in DialogHost reads the source ONCE per mount; if the outer source ever changes (e.g., parent re-creates the Provider with a new value), DialogHost still passes the stale one to the dialog. In practice the outer source from `render()` never changes (set once at mount), so this is fine for M1c.4. Document as a known constraint if Form-inside-DialogHost adds nested dialog hosting later.

2. **MultiSelect's padded items hack for navigation (Task 3).** The component passes `[...items, { label: '+ add new', value: '\0__add_new__\0' }]` to the reducer so navigation arithmetic works (n = totalRows). The synthetic value `'\0__add_new__\0'` is never looked up (Space on the add row is guarded; Enter triggers `onAddNew` not `onSubmit`). If a test ever asserts on `value` membership and a real item has that exact string, it'd clash — vanishingly unlikely with the null-byte sentinel, but worth noting. Alternative: extend the reducer to know about a virtual-last-row count; deferred as overkill for M1c.4.

3. **Dialog re-mounts when its element prop changes.** If a consumer calls `openDialog(<X />)` twice in a row with different elements, React unmounts/remounts. State inside the dialog is lost. Standard React behavior; mentioned in case a test surprises someone.

4. **The MultiSelect+add-new acceptance test (Task 4) uses `setItems`/`setSelected` updaters AFTER the dialog closes.** The dialog's `done()` synchronously resolves the promise; the consumer's `.then` runs the setters; React schedules a re-render. `flushAsync()` is needed for the re-render to be visible in `lastFrame`. Already in the test.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/m1c4-dialog.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task; same flow as prior milestones.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?
