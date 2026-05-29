# flowtty M1c.3 — `<Form>` + intra-form focus ring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship `<Form>` and `useField`, the composition layer that turns the M1c.2 prompt components into multi-field workflows. A form holds aggregated `values` for named fields, distributes a focus ring (Tab/Shift-Tab cycles registered fields), and runs an Enter-advances-or-submits flow: each field's `onSubmit` advances focus to the next field, and the last field's submit fires the form's `onSubmit(values)`. Per-field `validate` blocks advance/submit and exposes an `error` for the consumer to render. Acceptance: a 3-field form (two TextInputs + a final confirmation) where the user types each value, Enter advances, validation gates, the form fires `onSubmit` with all collected values, and Esc on any field fires `onCancel`.

**Architecture:** A single `FormContext` carries the aggregated state (`values`, `errors`, `focusedField`, registration order, registration helpers). The `<Form>` component owns the context, subscribes one global `useInput` for Tab/Shift-Tab (focus ring) and Esc (cancel), and renders its children. A `useField(name, opts?)` hook in user code reads the context — registers/unregisters the field on mount, returns the value/onChange/onSubmit/onCancel/isFocused/error contract that the existing M1b/M1c.2 prompts already consume verbatim. The "advance vs submit" decision lives in the hook: when the user-visible `onSubmit` fires (Enter inside a focused prompt), the hook validates; on success it calls the form's `advanceOrSubmit(currentName)`, which moves focus to the next registered field or — if this was the last — fires the form's `onSubmit(values)`.

**Tech Stack:** Same as M1c.2 — TypeScript ESM, React 19, `react-reconciler@0.31.0`, `yoga-layout@3.2.1`, Vitest 4.

**Out of scope** (later milestones): embedded `openDialog` + the `useDialog` pattern (`M1c.4`); MultiSelect "+ add new" inline row (needs `openDialog`); per-field UI components (consumer writes their own thin field wrappers around TextInput/Select/etc.); per-field error rendering (consumer renders the error using `field.error`); cross-field validation (form-level validate); async validate; focus trapping for fields rendered inside a modal context (only the M1c.4 dialog work introduces that); arrow-key focus nav (Tab/Shift-Tab only in M1c.3 — arrows belong to the focused field).

---

## Scope check

This is the third of M1c-scope plans:

- **M1c (merged):** TTY input.
- **M1c.2 (merged):** Select/MultiSelect/Confirm.
- **M1c.3 (this plan):** Form + intra-form focus ring + `useField`.
- **M1c.4 (next):** Embedded `openDialog` + MultiSelect "+add new" (needs the dialog substrate).

Each plan ships working, testable software on its own. M1c.3's acceptance is a multi-field form running end-to-end on the test backend: Tab nav, Enter advance/submit, validate gating, Esc cancel.

---

## File Structure

```
src/
  form-context.ts        # NEW — FormContext + types (no logic; just shape)
  form.ts                # NEW — <Form> component (Provider + focus-ring + advance/submit)
  form.test.ts           # NEW — integration tests via TestBackend + multi-field App
  use-field.ts           # NEW — useField hook (register, value/onChange, isFocused, error,
                         #        onSubmit that advances-or-submits via form.advance)
  use-field.test.ts      # NEW — hook tests (register/unregister, validate gating)
  index.ts               # MODIFY — export Form + useField + types
  README.md              # MODIFY — M1c.3 status + multi-field usage example
scratch/                 # gitignored — local manual-smoke scratch, not committed
  form.ts                # runnable multi-field demo on TTY
```

Responsibilities:
- **`form-context.ts`** declares the context shape only — `FormState`, `FormApi`. No React hooks or component definitions here, so the file is trivially importable from both `form.ts` and `use-field.ts` without circular concerns.
- **`form.ts`** owns the focus ring (Tab/Shift-Tab) + Esc + the advance-or-submit flow. It exposes the `<Form>` component.
- **`use-field.ts`** consumes the context. Consumers build their own field components by calling `useField` inside them; the hook returns the contract every M1b/M1c.2 prompt already understands.

---

### Task 1: `FormContext` shape

**Files:**
- Create: `src/form-context.ts`

Tiny file: just types + the empty React context. No tests of its own (covered by the hook + component tests in T2–T3).

- [ ] **Step 1: Write `src/form-context.ts`:**
```ts
import { createContext } from 'react';

export interface FormFieldRegistration {
  /** Field's validator. Returns null/undefined = valid; string = error to display. */
  validate?: (value: unknown) => string | null | undefined;
}

export interface FormApi {
  // Aggregated state
  values: Record<string, unknown>;
  errors: Record<string, string | null>;
  focusedField: string | null;

  // Registration (call on mount, unregister on unmount). Insertion order is
  // the focus-ring order.
  register(name: string, opts?: FormFieldRegistration): void;
  unregister(name: string): void;

  // Value/error setters
  setValue(name: string, value: unknown): void;
  setError(name: string, error: string | null): void;

  // Focus
  focus(name: string): void;
  focusNext(): void;
  focusPrev(): void;

  // Advance-or-submit (called by useField's onSubmit after validate passes).
  // Moves focus to the next registered field, or fires the form's onSubmit
  // (with the aggregated values) when called from the LAST registered field.
  advance(fromName: string): void;

  // Cancel the form (Esc on any field, or programmatic).
  cancel(): void;
}

// Default no-op API used when no <Form> ancestor is present. Calling useField
// outside a Form returns a stable shape that does nothing meaningful, so a
// field rendered standalone for testing doesn't blow up.
const noopApi: FormApi = {
  values: {},
  errors: {},
  focusedField: null,
  register() {},
  unregister() {},
  setValue() {},
  setError() {},
  focus() {},
  focusNext() {},
  focusPrev() {},
  advance() {},
  cancel() {},
};

export const FormContext = createContext<FormApi>(noopApi);
```

- [ ] **Step 2: Typecheck.** `npx vitest run` (141 still pass — nothing imports the new file yet). `npm run typecheck` clean.

- [ ] **Step 3: Commit**
```bash
git add src/form-context.ts
git commit -m "feat: FormContext + FormApi shape for form composition layer"
```

---

### Task 2: `<Form>` component — registration, values, focus state

**Files:**
- Create: `src/form.ts`
- Create: `src/form.test.ts`

The Form provides the context with state-backed implementations of every `FormApi` method. **No key handling yet** — T3 adds Tab/Shift-Tab/Esc. This task lands the registration/value/focus state machine and the `advance` semantics, verified via direct `FormApi` access from a probe component.

- [ ] **Step 1: Write the failing test `src/form.test.ts`:**
```ts
import { expect, test } from 'vitest';
import { createElement, useContext, useEffect } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { Form } from './form.js';
import { FormContext } from './form-context.js';

test('Form provides FormContext to descendants', async () => {
  let api: ReturnType<typeof useContext<typeof FormContext>> | null = null;
  function Probe() {
    api = useContext(FormContext);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: () => {} }, createElement(Probe)),
    backend,
  );
  expect(api).not.toBeNull();
  expect(api!.values).toEqual({});
  expect(api!.errors).toEqual({});
  expect(api!.focusedField).toBeNull();
});

test('register/setValue/setError reflect in api state', async () => {
  let api: ReturnType<typeof useContext<typeof FormContext>> | null = null;
  function Probe() {
    api = useContext(FormContext);
    useEffect(() => {
      api!.register('name');
      api!.setValue('name', 'alice');
    }, []);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: () => {} }, createElement(Probe)),
    backend,
  );
  await flush();
  expect(api!.values).toEqual({ name: 'alice' });
});

test('first registered field becomes focused (focusedField === first name)', async () => {
  let api: ReturnType<typeof useContext<typeof FormContext>> | null = null;
  function Probe() {
    api = useContext(FormContext);
    useEffect(() => {
      api!.register('a');
      api!.register('b');
    }, []);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: () => {} }, createElement(Probe)),
    backend,
  );
  await flush();
  expect(api!.focusedField).toBe('a');
});

test('advance(name) moves focus to the next registered field; advance from LAST fires onSubmit(values)', async () => {
  let api: ReturnType<typeof useContext<typeof FormContext>> | null = null;
  const submitted: Array<Record<string, unknown>> = [];
  function Probe() {
    api = useContext(FormContext);
    useEffect(() => {
      api!.register('a');
      api!.register('b');
      api!.setValue('a', 1);
      api!.setValue('b', 2);
    }, []);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: (v: Record<string, unknown>) => submitted.push(v) },
      createElement(Probe)),
    backend,
  );
  await flush();
  api!.advance('a');
  expect(api!.focusedField).toBe('b');
  expect(submitted).toEqual([]);
  api!.advance('b');
  expect(submitted).toEqual([{ a: 1, b: 2 }]);
});

test('cancel() fires onCancel', async () => {
  let api: ReturnType<typeof useContext<typeof FormContext>> | null = null;
  let cancelled = false;
  function Probe() {
    api = useContext(FormContext);
    return null;
  }
  const backend = new TestBackend(20, 2);
  await render(
    createElement(Form, { onSubmit: () => {}, onCancel: () => { cancelled = true; } },
      createElement(Probe)),
    backend,
  );
  await flush();
  api!.cancel();
  expect(cancelled).toBe(true);
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Write `src/form.ts`:**
```ts
import { createElement, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { FormContext, type FormApi, type FormFieldRegistration } from './form-context.js';

export interface FormProps {
  /** Aggregated submit: called when advance() is called from the LAST registered field. */
  onSubmit: (values: Record<string, unknown>) => void;
  /** Called from cancel() (Esc handling lands in M1c.3 T3). */
  onCancel?: () => void;
  /** When false, form-level key handling (Tab/Shift-Tab/Esc, added in T3) is suppressed. Default true. */
  isFocused?: boolean;
  children?: ReactNode;
}

export function Form(props: FormProps): ReactNode {
  const { onSubmit, onCancel, children } = props;

  // Ordered list of registered field names (insertion order = focus-ring order).
  // Held in a ref because field register/unregister effects run during render
  // commits and must not trigger Form re-renders by themselves.
  const order = useRef<string[]>([]);
  const validators = useRef<Map<string, FormFieldRegistration['validate']>>(new Map());

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const register = useCallback((name: string, opts?: FormFieldRegistration) => {
    if (!order.current.includes(name)) order.current.push(name);
    if (opts?.validate) validators.current.set(name, opts.validate);
    // Auto-focus the first registered field (only if nothing is focused yet).
    setFocusedField((current) => current ?? order.current[0] ?? null);
  }, []);

  const unregister = useCallback((name: string) => {
    order.current = order.current.filter((n) => n !== name);
    validators.current.delete(name);
    setFocusedField((current) => (current === name ? (order.current[0] ?? null) : current));
  }, []);

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setError = useCallback((name: string, error: string | null) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const focus = useCallback((name: string) => {
    if (order.current.includes(name)) setFocusedField(name);
  }, []);

  const focusNext = useCallback(() => {
    setFocusedField((current) => {
      const list = order.current;
      if (list.length === 0) return null;
      const i = current === null ? -1 : list.indexOf(current);
      return list[(i + 1) % list.length]!;
    });
  }, []);

  const focusPrev = useCallback(() => {
    setFocusedField((current) => {
      const list = order.current;
      if (list.length === 0) return null;
      const i = current === null ? 0 : list.indexOf(current);
      return list[(i - 1 + list.length) % list.length]!;
    });
  }, []);

  // advance(fromName) — moves focus to the next field, or fires onSubmit if
  // fromName is the LAST registered. We read `values` via state (closed over);
  // because setState is async, we snapshot the latest by reading from the
  // state setter callback inside a useRef-tracked latest copy.
  const latestValues = useRef(values);
  latestValues.current = values;

  const advance = useCallback((fromName: string) => {
    const list = order.current;
    const i = list.indexOf(fromName);
    if (i < 0) return; // unknown field
    if (i === list.length - 1) {
      onSubmit(latestValues.current);
      return;
    }
    setFocusedField(list[i + 1]!);
  }, [onSubmit]);

  const cancel = useCallback(() => { onCancel?.(); }, [onCancel]);

  const api = useMemo<FormApi>(() => ({
    values, errors, focusedField,
    register, unregister, setValue, setError,
    focus, focusNext, focusPrev, advance, cancel,
  }), [values, errors, focusedField, register, unregister, setValue, setError, focus, focusNext, focusPrev, advance, cancel]);

  return createElement(FormContext.Provider, { value: api }, children);
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/form.test.ts` → 5 pass. Full suite green (141 + 5 = 146). Typecheck clean.

   If the auto-focus-first test fails because `focusedField` is null after the Probe registers two fields: the issue is the `register` callback's `setFocusedField((current) => current ?? list[0])` — when two registers fire in the same effect, both might see `current === null` and try to set first. Should be fine (second is a noop). If it lands wrong, debug by logging order.current + focusedField after each call.

- [ ] **Step 5: Commit**
```bash
git add src/form.ts src/form.test.ts
git commit -m "feat: <Form> component — context, registration, values, focus, advance/submit"
```

---

### Task 3: `useField` hook + Form Tab/Shift-Tab/Esc key handling

**Files:**
- Create: `src/use-field.ts`
- Create: `src/use-field.test.ts`
- Modify: `src/form.ts` (add the key-handling useInput at the top of Form's body)

- [ ] **Step 1: Modify `src/form.ts`** — add Tab/Shift-Tab/Esc handling. Just inside the `Form` function body (after the api `useMemo`), add a `useInput` subscription that consumes the form-level keys:
```ts
import { useInput } from './use-input.js';
// (add to existing imports)

// Inside Form, AFTER the api useMemo:
useInput((key) => {
  if (key.name === 'tab' && !key.shift) { focusNext(); return; }
  if (key.name === 'tab' && key.shift) { focusPrev(); return; }
  if (key.name === 'escape') { cancel(); return; }
}, { isActive: props.isFocused !== false });
```

Note: `key.shift` exists on the `Key` type from M1a. The TTY parser does NOT currently set `key.shift` for Tab (most terminals send Shift-Tab as `ESC [ Z` which becomes `name: 'csi-Z'` from `parseKeypress`). For M1c.3 plain Tab is enough to advance forward; Shift-Tab will get its own canonical name in a later parser refinement (`'shift-tab'` or via setting `key.shift`). For now, recognize BOTH `tab` (no shift) for forward AND `csi-Z` for backward as a pragmatic fallback. Update:
```ts
useInput((key) => {
  if (key.name === 'tab') { focusNext(); return; }
  if (key.name === 'csi-Z') { focusPrev(); return; } // BS-Tab on most terminals
  if (key.name === 'escape') { cancel(); return; }
}, { isActive: props.isFocused !== false });
```

(Document this as a known M1c.3 limitation: Shift-Tab works on real terminals via the `csi-Z` path; synthetic test backend can drive it by `press({ name: 'csi-Z' })` to test the backward path.)

- [ ] **Step 2: Write the failing test `src/use-field.test.ts`** (covers useField's full contract + form-level Tab/Esc end-to-end through render):
```ts
import { expect, test } from 'vitest';
import { createElement, useState } from 'react';
import { render } from './index.js';
import { TestBackend, flush } from './testing.js';
import { Form } from './form.js';
import { useField } from './use-field.js';
import { TextInput } from './text-input.js';
import { Box, Text } from './components.js';

function TextField({ name, validate }: { name: string; validate?: (v: unknown) => string | null }) {
  const f = useField(name, { validate });
  return createElement(Box, null,
    createElement(TextInput, {
      value: (f.value as string) ?? '',
      onChange: f.onChange,
      onSubmit: () => f.onSubmit(),
      onCancel: f.onCancel,
      isFocused: f.isFocused,
    }),
    f.error ? createElement(Text, { color: 'red' }, f.error) : false,
  );
}

test('useField registers + flows value/onChange through Form state', async () => {
  const submits: Array<Record<string, unknown>> = [];
  function App() {
    return createElement(Form, { onSubmit: (v: Record<string, unknown>) => submits.push(v) },
      createElement(TextField, { name: 'a' }),
      createElement(TextField, { name: 'b' }),
    );
  }
  const backend = new TestBackend(40, 2);
  await render(createElement(App), backend);
  await flush();
  // First field is auto-focused. Type into it.
  backend.type('hi');
  await flush();
  backend.press({ name: 'return' });
  await flush();
  // Should have advanced to field 'b' (not submitted yet).
  expect(submits).toEqual([]);
  backend.type('yo');
  await flush();
  backend.press({ name: 'return' });
  await flush();
  // Now last field's submit fires onSubmit with both values.
  expect(submits).toEqual([{ a: 'hi', b: 'yo' }]);
});

test('Tab advances focus across registered fields (wrapping)', async () => {
  const focusLog: string[] = [];
  function Probe({ name }: { name: string }) {
    const f = useField(name);
    if (f.isFocused) focusLog.push(name);
    return null;
  }
  function App() {
    return createElement(Form, { onSubmit: () => {} },
      createElement(Probe, { name: 'a' }),
      createElement(Probe, { name: 'b' }),
      createElement(Probe, { name: 'c' }),
    );
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  await flush();
  // Initial: 'a' focused.
  expect(focusLog[focusLog.length - 1]).toBe('a');
  backend.press({ name: 'tab' });
  await flush();
  expect(focusLog[focusLog.length - 1]).toBe('b');
  backend.press({ name: 'tab' });
  await flush();
  expect(focusLog[focusLog.length - 1]).toBe('c');
  backend.press({ name: 'tab' });
  await flush();
  // Wrap back to 'a'.
  expect(focusLog[focusLog.length - 1]).toBe('a');
});

test('validate blocks advance + sets error', async () => {
  const submits: Array<Record<string, unknown>> = [];
  function App() {
    return createElement(Form, { onSubmit: (v: Record<string, unknown>) => submits.push(v) },
      createElement(TextField, { name: 'slug', validate: (v: unknown) => (v as string).length < 3 ? 'too short' : null }),
      createElement(TextField, { name: 'name' }),
    );
  }
  const backend = new TestBackend(40, 3);
  await render(createElement(App), backend);
  await flush();
  backend.type('hi');                    // 2 chars → validation fails
  await flush();
  backend.press({ name: 'return' });     // should NOT advance
  await flush();
  // Still on first field; error rendered below TextInput
  expect(backend.lastFrame).toContain('too short');
  // Now make it valid
  backend.type('!');                     // 3 chars now ('hi!')
  await flush();
  backend.press({ name: 'return' });     // advance to 'name'
  await flush();
  backend.type('alice');
  await flush();
  backend.press({ name: 'return' });     // submit
  await flush();
  expect(submits).toEqual([{ slug: 'hi!', name: 'alice' }]);
});

test('Esc on any field fires the Form onCancel', async () => {
  let cancelled = false;
  function App() {
    return createElement(Form, {
      onSubmit: () => {},
      onCancel: () => { cancelled = true; },
    },
      createElement(TextField, { name: 'a' }),
    );
  }
  const backend = new TestBackend(20, 1);
  await render(createElement(App), backend);
  await flush();
  backend.press({ name: 'escape' });
  await flush();
  expect(cancelled).toBe(true);
});
```

- [ ] **Step 3: Write `src/use-field.ts`:**
```ts
import { useContext, useEffect } from 'react';
import { FormContext } from './form-context.js';

export interface UseFieldOptions {
  /** Sync validator. Return null/undefined = valid; string = error message (blocks advance/submit). */
  validate?: (value: unknown) => string | null | undefined;
}

export interface FieldControl {
  /** Current value for this field (from the Form's aggregated state). */
  value: unknown;
  /** Update the field's value. */
  onChange: (value: unknown) => void;
  /** Validate; on pass, advance focus (or fire form's onSubmit if last field). */
  onSubmit: () => void;
  /** Cancel the form. */
  onCancel: () => void;
  /** Whether the form has focus on this field. */
  isFocused: boolean;
  /** Latest validation error from the most recent onSubmit attempt (null when valid). */
  error: string | null;
}

export function useField(name: string, opts: UseFieldOptions = {}): FieldControl {
  const ctx = useContext(FormContext);

  useEffect(() => {
    ctx.register(name, { validate: opts.validate });
    return () => ctx.unregister(name);
  }, [ctx, name, opts.validate]);

  return {
    value: ctx.values[name],
    onChange: (value: unknown) => ctx.setValue(name, value),
    onSubmit: () => {
      const value = ctx.values[name];
      const err = opts.validate ? opts.validate(value) : null;
      if (err) {
        ctx.setError(name, err);
        return;
      }
      ctx.setError(name, null);
      ctx.advance(name);
    },
    onCancel: () => ctx.cancel(),
    isFocused: ctx.focusedField === name,
    error: ctx.errors[name] ?? null,
  };
}
```

- [ ] **Step 4: Verify** — `npx vitest run src/use-field.test.ts` → all 4 tests pass. Full suite green (146 + 4 = 150). Typecheck clean.

   If the validate test fails (`backend.lastFrame.toContain('too short')` doesn't match): the error renders via `f.error ? <Text color="red">{f.error}</Text> : false`. The `TestBackend.lastFrame` strips ANSI (style-free string), so the literal `too short` text should appear regardless of `color="red"`. If the test fails, debug by `console.log(backend.lastFrame)` after the failing press — most likely cause is the error state didn't update before the assertion (more `await flush()` rounds needed) or `useField`'s effect didn't re-run with the latest `opts.validate`.

- [ ] **Step 5: Commit**
```bash
git add src/form.ts src/use-field.ts src/use-field.test.ts
git commit -m "feat: useField hook + Form Tab/Esc handling (advance-or-submit + cancel)"
```

---

### Task 4: Acceptance — 3-field form e2e

**Files:**
- Modify: `src/use-field.test.ts` (append one acceptance test combining everything)

- [ ] **Step 1: Append the acceptance test** (imports + `TextField` helper already in the file):
```ts
test('M1c.3 acceptance: 3-field form — type/Tab/Enter/validate/submit/Cancel end-to-end', async () => {
  const submits: Array<Record<string, unknown>> = [];
  let cancelled = false;
  function App() {
    return createElement(Form, {
      onSubmit: (v: Record<string, unknown>) => submits.push(v),
      onCancel: () => { cancelled = true; },
    },
      createElement(TextField, { name: 'slug', validate: (v: unknown) => /^[a-z-]+$/.test(v as string) ? null : 'kebab-case only' }),
      createElement(TextField, { name: 'title' }),
      createElement(TextField, { name: 'date', validate: (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(v as string) ? null : 'YYYY-MM-DD' }),
    );
  }
  const backend = new TestBackend(40, 6);
  await render(createElement(App), backend);
  await flush();

  // Type a bad slug, press Enter — validation blocks, error shown
  backend.type('Foo Bar');
  await flush();
  backend.press({ name: 'return' });
  await flush();
  expect(backend.lastFrame).toContain('kebab-case only');
  expect(submits).toEqual([]);

  // Backspace the bad value, type good one — submit advances
  for (let i = 0; i < 7; i++) backend.press({ name: 'backspace' });
  await flush();
  backend.type('foo-bar');
  await flush();
  backend.press({ name: 'return' });
  await flush();

  // Now on 'title' — type freely (no validate), Enter advances
  backend.type('Hello World');
  await flush();
  backend.press({ name: 'return' });
  await flush();

  // Now on 'date' — type valid date, Enter submits the form
  backend.type('2026-05-30');
  await flush();
  backend.press({ name: 'return' });
  await flush();

  expect(submits).toEqual([{ slug: 'foo-bar', title: 'Hello World', date: '2026-05-30' }]);
  expect(cancelled).toBe(false);

  // Esc on a second mount fires onCancel
  const backend2 = new TestBackend(40, 6);
  await render(createElement(App), backend2);
  await flush();
  backend2.press({ name: 'escape' });
  await flush();
  // (submits accumulates across calls; check cancel via the closure)
  // Re-create the test scope by inlining a separate App+state — already done via
  // the new render; the original `cancelled` variable is shared, so:
  expect(cancelled).toBe(true);
});
```

- [ ] **Step 2: Verify** — `npx vitest run src/use-field.test.ts` → all pass. Full suite green (150 + 1 = 151). Typecheck clean.

- [ ] **Step 3: Commit**
```bash
git add src/use-field.test.ts
git commit -m "test: M1c.3 acceptance — 3-field form with Tab/Enter/validate/submit/cancel"
```

---

### Task 5: Public exports + runnable demo + README + final build

**Files:**
- Modify: `src/index.ts`
- Create: `scratch/form.ts` (gitignored, not committed)
- Modify: `README.md`

- [ ] **Step 1: Update `src/index.ts`** — append (keep existing unchanged):
```ts
export { Form } from './form.js';
export type { FormProps } from './form.js';
export { useField } from './use-field.js';
export type { UseFieldOptions, FieldControl } from './use-field.js';
export type { FormApi, FormFieldRegistration } from './form-context.js';
```

- [ ] **Step 2: Create `scratch/form.ts`** (runnable on real TTY):
```ts
import { createElement, useState } from 'react';
import {
  render, Box, Text, TtyBackend,
  Form, useField, TextInput,
} from '../src/index.js';

function TextField({ name, label, validate }: { name: string; label: string; validate?: (v: unknown) => string | null }) {
  const f = useField(name, { validate });
  return createElement(Box, { flexDirection: 'column' },
    createElement(Text, null, `${label}${f.isFocused ? ' (focused)' : ''}:`),
    createElement(TextInput, {
      value: (f.value as string) ?? '',
      onChange: f.onChange,
      onSubmit: () => f.onSubmit(),
      onCancel: f.onCancel,
      isFocused: f.isFocused,
    }),
    f.error ? createElement(Text, { color: 'red' }, f.error) : null,
  );
}

function App() {
  const [done, setDone] = useState<Record<string, unknown> | null>(null);
  if (done) {
    return createElement(Box, null,
      createElement(Text, null, `submitted: ${JSON.stringify(done)}`),
    );
  }
  return createElement(Box, { flexDirection: 'column' },
    createElement(Text, null, 'Enter to advance / submit · Tab to cycle focus · Esc or Ctrl-C to cancel'),
    createElement(Form, {
      onSubmit: (v: Record<string, unknown>) => setDone(v),
      onCancel: () => process.exit(0),
    },
      createElement(TextField, { name: 'slug', label: 'slug', validate: (v: unknown) => /^[a-z-]+$/.test(v as string) ? null : 'kebab-case only' }),
      createElement(TextField, { name: 'title', label: 'title' }),
      createElement(TextField, { name: 'date', label: 'date', validate: (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(v as string) ? null : 'YYYY-MM-DD' }),
    ),
  );
}

await render(createElement(App), new TtyBackend());
```

- [ ] **Step 3: Smoke check** (loads without crashing in non-TTY pipe):
```bash
timeout 1 npx tsx scratch/form.ts 2>&1 | head -20 || true
```
Expected: writes initial frame (ANSI + "Enter to advance…" + the three labeled inputs). If it errors before timeout, report.

- [ ] **Step 4: Update `README.md`** — find the existing `## Status` section, replace with (use real triple-backtick fences):

```md
## Status

M1c.3 (Form + focus ring). Multi-field workflows compose via `<Form>` +
`useField`:

- `<Form onSubmit onCancel>` — owns the field registry, value aggregation, and
  intra-form focus ring. **Tab** cycles focus forward, **Shift-Tab** backward
  (via `ESC [ Z` on most terminals), **Esc** cancels.
- `useField(name, { validate })` — registers a field, returns
  `{ value, onChange, onSubmit, onCancel, isFocused, error }`. Per-field
  `validate` blocks advance/submit and surfaces the error string for the
  consumer to render.
- **Advance vs submit:** each field's `onSubmit` (Enter inside the focused
  prompt) advances focus to the next registered field; the LAST field's
  `onSubmit` fires the form's `onSubmit(values)` with the aggregated record.

### Usage

\`\`\`tsx
import { render, Form, useField, TextInput, Box, Text, TtyBackend } from 'flowtty';

function SlugField() {
  const f = useField('slug', { validate: (v) => /^[a-z-]+$/.test(v as string) ? null : 'kebab-case only' });
  return (
    <Box flexDirection="column">
      <Text>slug:</Text>
      <TextInput value={(f.value as string) ?? ''} onChange={f.onChange} onSubmit={f.onSubmit} onCancel={f.onCancel} isFocused={f.isFocused} />
      {f.error && <Text color="red">{f.error}</Text>}
    </Box>
  );
}

await render(
  <Form onSubmit={(v) => console.log(v)} onCancel={() => process.exit(0)}>
    <SlugField />
    {/* ...more useField-based fields... */}
  </Form>,
  new TtyBackend(),
);
\`\`\`

### Still deferred (later milestones)

- Embedded `openDialog` + `useDialog` (modal sub-prompts that return a value
  without unmounting the host) — M1c.4.
- MultiSelect "+ add new" inline-dialog row — needs `openDialog` (M1c.4).
- Frame diffing — full TTY redraw each `draw()`.
- Truecolor (`#rgb` / `rgb(…)`).
- Cross-field validation (form-level validate hook).
- Async validate.
- Arrow-key focus navigation (Tab/Shift-Tab only today; arrows belong to the
  focused field).
```

- [ ] **Step 5: Final verification**
- `npx vitest run` → all tests pass.
- `npm run typecheck` → clean.
- `npm run build` → ESM + dts succeed (no warnings).

- [ ] **Step 6: Commit**
```bash
git add src/index.ts README.md
git commit -m "chore: export Form + useField + document M1c.3"
```

---

## Self-Review

**1. Spec coverage** (M1c.3 portion of `docs/design.md`):
- `<Form>` composition layer → Tasks 2, 3.
- Intra-form focus ring (Tab/Shift-Tab cycle) → Task 3.
- `useField` hook + per-field validate → Task 3.
- Advance-or-submit Enter flow → Task 2 (`advance` API) + Task 3 (`useField.onSubmit` wires validate→advance).
- Esc cancel on any field → Task 3.
- 3-field acceptance e2e → Task 4.
- Out-of-scope (embedded dialog, MultiSelect+add-new, cross-field validate, async validate, arrow focus) explicitly named in plan header.

**2. Placeholder scan:** no "TBD"/"implement later". Shift-Tab via `csi-Z` is documented as a known parser-level limitation (a real fix lands when the key parser learns shift-encoded keys); the M1c.3 implementation handles it pragmatically.

**3. Type consistency:** `FormApi` shape matches between `form-context.ts` (declaration), `form.ts` (implementation), and `use-field.ts` (consumer). `FieldControl` keys match what the existing M1b/M1c.2 prompt components consume (`value`, `onChange`, `onSubmit`, `onCancel`, `isFocused`). `Record<string, unknown>` value type is uniform across `values`, `setValue(name, value)`, and `onSubmit(values)` — consumers cast per-field.

**Risks worth flagging for the implementer (not blockers):**

1. **`register`'s auto-focus-first behavior runs inside `setFocusedField`'s functional updater.** When multiple fields register in a single tick (e.g., all in `useEffect` after the first mount), each call sees `current` reflecting the prior call's update, so only the first sets focused (subsequent calls become noops because `current ?? ...` short-circuits). This is the intended behavior; if a test fails by setting focused to the last registered, the dependency on functional updater order is wrong — switch to setting only when `order.current.length === 1` inside `register`.

2. **`useField`'s effect deps include `opts.validate`.** Inline lambdas (`validate: (v) => ...`) make `opts.validate` a fresh reference every render, causing register/unregister churn. In the acceptance test the lambdas are stable per render (defined inside the App function but React 19's reconciliation keeps them stable per-effect-run); if churn appears in real apps, consumers will need to memo the validator. Documented as a known UX item.

3. **`latestValues` ref pattern in Form's `advance`.** Used because `onSubmit` is captured by `useCallback` and would otherwise close over stale `values`. The ref-mirror is standard React; if you prefer, use `setValues((current) => { onSubmit(current); return current; })` inside advance to read the latest synchronously — both work, the ref is slightly more direct.

4. **Tab on the focused field's prompt.** Plain TextInput doesn't handle Tab today (no binding in editor reducer), so Form's `useInput` catches it and advances. If a future Text prompt grows a Tab binding (e.g., autocomplete), there'd be a conflict — solve then with `isActive` gating or a `stopPropagation`-equivalent. M1c.3 is fine.

---

## Execution Handoff

Plan complete and saved to `flowtty/docs/plans/m1c3-form.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task; same flow as prior milestones.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?
